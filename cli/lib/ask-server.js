// "Ask the book" server.
//
// Serves a compiled breakdown over localhost and answers questions about it
// by spawning `claude -p` (subscription auth, same plumbing as the TUI) with
// cwd = the book's SOURCE directory, so the agent decides itself what to
// load: outline.md, the chapter the selection came from, neighbours.
//
//   GET  /            → breakdown.html
//   GET  /health      → { ok, book }
//   POST /ask         → SSE stream
//        body { question, selection, chapter:{id,title} }
//        events data: {type:'text'|'status'|'error'|'done', ...}
//   POST /reset       → drop the rolling session (new conversation)
//
// One unified chat: the agent reads each message and decides whether it's a
// question (answer from the pre-loaded syllabus + at most one chapter file)
// or a change request ("fix this chapter") — in which case it edits that one
// chapter's markdown in place. The agent never builds: the server detects
// edits via an mtime scan after the turn, runs the incremental
// build-book.sh itself (~0.1s), and the client reloads.
//
// All messages share one rolling claude session (--resume), so follow-ups
// keep context ("what you suggested above"). /reset starts a fresh session.
// Requests run serially — claude -p resume is a single conversation.
//
// Security posture: binds 127.0.0.1 only, and rejects browser origins other
// than localhost/file so a random website can't drive your subscription.

import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname, basename, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { runClaude, checkClaude } from './claude.js';

export const DEFAULT_ASK_PORT = 4517;

const TURN_IDLE_MS = 4 * 60 * 1000;
const TURN_HARD_MS = 12 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

// Per-book context baked into every system prompt, read fresh per request
// (cheap: one small file + a readdir; and revisions may change it). Nothing
// is hardcoded — whatever book the server points at supplies its own
// syllabus. With the syllabus pre-loaded, most questions need zero file
// reads, and chapter-specific ones need exactly one.
const OUTLINE_CAP = 12000;

function bookContext(root) {
  let chapters = [];
  try {
    chapters = readdirSync(join(root, 'chapters')).filter((f) => f.endsWith('.md')).sort();
  } catch { /* no chapters dir */ }
  let outline = '';
  try {
    outline = readFileSync(join(root, 'outline.md'), 'utf8');
    if (outline.length > OUTLINE_CAP) outline = outline.slice(0, OUTLINE_CAP) + '\n…(outline truncated)';
  } catch { /* no outline */ }

  const listing = chapters.length
    ? `Chapter source files, in reading order (the HTML section id #ch-NN maps to the NNth file here):\n${chapters.map((f, i) => `  ${i + 1}. chapters/${f}`).join('\n')}`
    : 'No chapters/ directory found.';

  return `# This book

Your cwd is this book's source directory.
${listing}

${outline ? `# Syllabus (outline.md — already loaded for you, do NOT re-read it)\n\n${outline}` : 'There is no outline.md.'}`;
}

function systemPrompt(root) {
  return `You are the assistant living inside an aristotle breakdown — a generated HTML textbook the reader is viewing in their browser right now. They talk to you from a small side panel; each message may carry a passage they selected and the chapter it came from.

${bookContext(root)}

# Your job

Each message is one of two things — read it and decide:

**1. A question** (about the selection, a chapter, the book). Answer FAST with minimal context:
- The syllabus above plus the quoted selection are often enough — when they are, answer immediately with NO tool calls.
- When you need detail, Read exactly the one chapter file involved (map the chapter named in the request to its file using the listing above). Only reach for a second file if the question explicitly spans chapters.
- Never read the whole book for a local question.
- Answer directly, in plain prose. No preamble, no "Great question", no headers.
- Match the book's level and terminology — the reader has read up to the chapter they're asking from; don't lean on concepts from later chapters.
- If the passage is genuinely ambiguous or wrong, say so plainly.
- Keep it tight: a few sentences up to a few short paragraphs. This renders in a small side panel.

**2. A change request** ("fix this chapter", "this part is boring, punch it up", "add a concrete example here", "this explanation is wrong"). Edit the book:
- Edit ONLY the one chapter file involved — the chapter attached to the message, or the one the reader names. Map it to its file via the listing above; don't search around. Never touch other chapters or outline.md.
- Keep the chapter's role in the dependency chain (the syllabus shows it): same concepts covered, same links to previous/next chapters, stay within 2000-4000 words.
- Scope the edit to the complaint — a gripe about the opening rewrites the opening, not the chapter.
- Do NOT run build scripts or verifiers — the server detects your edits and rebuilds automatically the moment you finish. Speed matters; just edit.
- Keep existing visuals (canvas/JSXGraph/Chart.js blocks) unless the complaint is about them; do not add new ones (they can't be verified here).
- Narrate briefly while working (one short line per step) and end with one sentence summarizing what you changed.

If a message is ambiguous between the two, treat it as a question and offer the edit ("want me to rewrite it that way?").`;
}

function buildPrompt({ question, selection, chapter }) {
  const parts = [];
  if (chapter?.title) parts.push(`Chapter: ${chapter.title}${chapter.id ? ` (section #${chapter.id})` : ''}`);
  if (selection) {
    parts.push(`Selected passage:\n"""\n${selection.slice(0, 3000)}\n"""`);
  }
  parts.push(`Reader's message: ${question}`);
  return parts.join('\n\n');
}

function originAllowed(origin) {
  if (!origin || origin === 'null') return true; // same-origin fetch or file://
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { rej(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

export function startAskServer({ breakdownDir, projectRoot, port = DEFAULT_ASK_PORT, log = () => {} }) {
  const root = resolve(breakdownDir);
  const session = { id: null };
  let queue = Promise.resolve();

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!originAllowed(origin)) {
      res.writeHead(403).end('forbidden origin');
      return;
    }
    const cors = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true, book: basename(root) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/reset') {
      // New conversation: drop the rolling resume token. The next ask starts
      // a fresh claude session with a clean context window.
      session.id = null;
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true }));
      log('[ask-server] conversation reset');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/ask') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        res.writeHead(400, cors).end('bad json');
        return;
      }
      const question = String(body.question || '').trim();
      if (!question) {
        res.writeHead(400, cors).end('missing question');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...cors,
      });
      const sse = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* client gone */ } };

      // Serialize: one claude conversation, one turn at a time.
      queue = queue.then(() => handleTurn({ body, question, sse }))
        .catch((err) => sse({ type: 'error', message: err.message }))
        .finally(() => { sse({ type: 'done', rebuilt: false }); res.end(); });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(url.pathname, res, cors);
      return;
    }
    res.writeHead(405, cors).end();
  });

  async function handleTurn({ body, question, sse }) {
    const prompt = buildPrompt({
      question,
      selection: String(body.selection || ''),
      chapter: body.chapter && typeof body.chapter === 'object' ? body.chapter : null,
    });
    log(`[ask-server] ask: ${question.slice(0, 80)}`);
    const turnStartMs = Date.now();

    const opts = {
      cwd: root,
      appendSystemPrompt: systemPrompt(root),
      // One unified turn: the agent decides whether this is a question or a
      // change request. Edit/Write are scoped by prompt to one chapter; the
      // mtime scan below tells us whether anything actually changed.
      allowedTools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      permissionMode: 'auto',
      idleTimeoutMs: TURN_IDLE_MS,
      hardTimeoutMs: TURN_HARD_MS,
      onEvent: (e) => {
        if (e.type === 'text' && !e.parentToolUseId) sse({ type: 'text', text: e.text });
        // Surface tool activity so the panel can show what's happening during
        // silent stretches (reading / editing takes a while with no text).
        if (e.type === 'tool_start' && !e.parentToolUseId) sse({ type: 'tool', name: e.toolName });
        if (e.type === 'result' && !e.ok) sse({ type: 'error', message: `claude error: ${e.subtype || 'unknown'}` });
      },
    };
    if (session.id) opts.resume = session.id;

    const { sessionId } = await runClaude(prompt, opts);
    if (sessionId) session.id = sessionId;

    if (sourcesChangedSince(turnStartMs)) {
      sse({ type: 'status', message: 'Rebuilding the book…' });
      await rebuild();
      sse({ type: 'done', rebuilt: true });
      log('[ask-server] sources changed — rebuilt');
    }
  }

  // Did the agent edit the book this turn? Ground truth is the disk: any
  // chapter markdown (or outline.md) with an mtime inside the turn.
  function sourcesChangedSince(sinceMs) {
    const candidates = [];
    try {
      for (const f of readdirSync(join(root, 'chapters'))) {
        if (f.endsWith('.md')) candidates.push(join(root, 'chapters', f));
      }
    } catch { /* no chapters dir */ }
    candidates.push(join(root, 'outline.md'));
    return candidates.some((f) => {
      try { return statSync(f).mtimeMs >= sinceMs; } catch { return false; }
    });
  }

  function rebuild() {
    return new Promise((res, rej) => {
      const proc = spawn('bash', [join(projectRoot, 'build-book.sh'), root], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      proc.stderr.on('data', (c) => { err += c; });
      proc.on('close', (code) => (code === 0 ? res() : rej(new Error(`build-book.sh failed (${code}): ${err.slice(0, 400)}`))));
      proc.on('error', rej);
    });
  }

  function serveStatic(pathname, res, cors) {
    const rel = decodeURIComponent(pathname) === '/' ? '/breakdown.html' : decodeURIComponent(pathname);
    const file = resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403, cors).end('forbidden');
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, cors).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', ...cors });
    res.end(readFileSync(file));
  }

  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}/breakdown.html`;
      res({ server, port: server.address().port, url, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// `aristotle serve <breakdown-dir> [--port N] [--no-open]`
export async function runServeCli(args, projectRoot) {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? Number(args[portIdx + 1]) : DEFAULT_ASK_PORT;
  const noOpen = args.includes('--no-open');
  const dirArg = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port')[0] || '.';
  const breakdownDir = resolve(process.cwd(), dirArg);

  if (!existsSync(join(breakdownDir, 'breakdown.html'))) {
    console.error(`No breakdown.html in ${breakdownDir}`);
    console.error('Point me at a built breakdown folder (or run build-book.sh first).');
    process.exit(1);
  }
  if (!Number.isInteger(port) || port <= 0) {
    console.error('Invalid --port');
    process.exit(1);
  }
  if (!await checkClaude()) {
    console.error('Claude Code CLI not found — asks will fail. Install: npm install -g @anthropic-ai/claude-code');
  }

  const { url } = await startAskServer({ breakdownDir, projectRoot, port, log: console.log });
  console.log(`Serving ${breakdownDir}`);
  console.log(`Ask-the-book ready: ${url}`);
  console.log('Select text in the browser and hit "Ask ✦". Ctrl-C to stop.');
  if (!noOpen && process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}
