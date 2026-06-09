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
//        body { mode: 'ask'|'revise', question, selection, chapter:{id,title} }
//        events data: {type:'text'|'status'|'error'|'done', ...}
//
// Two modes:
//   ask    — read-only tools (Read/Grep/Glob). Streamed prose answer.
//   revise — the reader's complaint goes to an agent allowed to Edit/Write
//            exactly one chapter's markdown. The agent does NOT build;
//            the server runs the incremental build-book.sh afterwards
//            (~0.1s) and the client reloads. One chapter per request.
//
// All asks share one rolling claude session (--resume), so follow-ups keep
// context ("what you suggested above"). Requests run serially — claude -p
// resume is a single conversation.
//
// Security posture: binds 127.0.0.1 only, and rejects browser origins other
// than localhost/file so a random website can't drive your subscription.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname, basename, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { runClaude, checkClaude } from './claude.js';

export const DEFAULT_ASK_PORT = 4517;

const ASK_IDLE_MS = 3 * 60 * 1000;
const ASK_HARD_MS = 6 * 60 * 1000;
const REVISE_IDLE_MS = 4 * 60 * 1000;
const REVISE_HARD_MS = 12 * 60 * 1000;

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

function askSystemPrompt() {
  return `You are the "ask the book" assistant behind an aristotle breakdown — a generated HTML textbook the reader is viewing in their browser right now.

Your cwd is the book's source directory: outline.md is the master plan, chapters/*.md (NN-slug.md, ordered) are the chapter sources.

The reader selected a passage and asked a question about it. Decide yourself what context you need — usually the chapter the passage came from (Grep a distinctive phrase from the selection to find the file), sometimes the outline or a neighbouring chapter. Load only what you need; don't read the whole book for a local question.

Answer rules:
- Answer directly, in plain prose. No preamble, no "Great question", no headers.
- Match the book's level and terminology. The reader has read up to the chapter they're asking from — don't lean on concepts from later chapters.
- If the passage is genuinely ambiguous or wrong, say so plainly.
- Keep it tight: a few sentences up to a few short paragraphs. This renders in a small side panel.`;
}

function reviseSystemPrompt() {
  return `You are the revision assistant behind an aristotle breakdown — a generated HTML textbook. The reader just complained about a chapter and wants it fixed fast.

Your cwd is the book's source directory: outline.md is the master plan, chapters/*.md (NN-slug.md, ordered) are the chapter sources.

Your job: edit that ONE chapter's markdown file in place to address the complaint, then stop.

Hard rules:
- Edit ONLY the chapter named in the request. Find its file in chapters/ by number/title. Do not touch other chapters, outline.md, or anything else.
- Keep the chapter's role in the dependency chain: same concepts covered, same links to previous/next chapters, stay within 2000-4000 words.
- Do NOT run build scripts or verifiers — the server rebuilds automatically the moment you finish. Speed matters; just edit.
- Keep existing visuals (canvas/JSXGraph/Chart.js blocks) unless the complaint is about them; do not add new ones (they can't be verified here).
- While working, narrate briefly (one short line per step). End with one sentence summarizing what you changed.`;
}

function buildPrompt({ mode, question, selection, chapter }) {
  const parts = [];
  if (chapter?.title) parts.push(`Chapter: ${chapter.title}${chapter.id ? ` (section #${chapter.id})` : ''}`);
  if (selection) {
    parts.push(`Selected passage:\n"""\n${selection.slice(0, 3000)}\n"""`);
  }
  parts.push(mode === 'revise' ? `Reader's complaint: ${question}` : `Question: ${question}`);
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

    if (req.method === 'POST' && url.pathname === '/ask') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        res.writeHead(400, cors).end('bad json');
        return;
      }
      const mode = body.mode === 'revise' ? 'revise' : 'ask';
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
      queue = queue.then(() => handleTurn({ mode, body, question, sse }))
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

  async function handleTurn({ mode, body, question, sse }) {
    const prompt = buildPrompt({
      mode,
      question,
      selection: String(body.selection || ''),
      chapter: body.chapter && typeof body.chapter === 'object' ? body.chapter : null,
    });
    log(`[ask-server] ${mode}: ${question.slice(0, 80)}`);

    const opts = {
      cwd: root,
      appendSystemPrompt: mode === 'revise' ? reviseSystemPrompt() : askSystemPrompt(),
      allowedTools: mode === 'revise'
        ? ['Read', 'Grep', 'Glob', 'Edit', 'Write']
        : ['Read', 'Grep', 'Glob'],
      permissionMode: 'auto',
      idleTimeoutMs: mode === 'revise' ? REVISE_IDLE_MS : ASK_IDLE_MS,
      hardTimeoutMs: mode === 'revise' ? REVISE_HARD_MS : ASK_HARD_MS,
      onEvent: (e) => {
        if (e.type === 'text' && !e.parentToolUseId) sse({ type: 'text', text: e.text });
        if (e.type === 'result' && !e.ok) sse({ type: 'error', message: `claude error: ${e.subtype || 'unknown'}` });
      },
    };
    if (session.id) opts.resume = session.id;

    const { sessionId } = await runClaude(prompt, opts);
    if (sessionId) session.id = sessionId;

    if (mode === 'revise') {
      sse({ type: 'status', message: 'Rebuilding the book…' });
      await rebuild();
      sse({ type: 'done', rebuilt: true });
      log('[ask-server] rebuilt after revision');
    }
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
