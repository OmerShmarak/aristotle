// "Ask the book" HTTP server — the transport shell around BookConversation.
//
// Serves a compiled breakdown over localhost and bridges the browser widget
// (book-assets/ask-widget.js) to a claude -p conversation about the book.
// All conversation logic — prompts, rolling session, serialization, edit
// detection, rebuild — lives in ask/conversation.js; this file only does
// HTTP: routing, CORS, SSE encoding, static files, CLI.
//
//   GET  /            → breakdown.html
//   GET  /health      → { ok, book }   (the widget mounts only if this answers)
//   POST /ask         → SSE stream
//        body { question, selection, chapter:{id,title} }
//        events data: {type:'text'|'tool'|'status'|'error'|'done', ...}
//        done carries rebuilt:true when the agent edited the book and it
//        was recompiled — the widget reloads the page on that.
//   POST /reset       → new conversation (clean context window)
//
// Security posture: binds 127.0.0.1 only, and rejects browser origins other
// than localhost/file so a random website can't drive your subscription.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname, basename, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { checkClaude } from './claude.js';
import { BookConversation } from './ask/conversation.js';

export const DEFAULT_ASK_PORT = 4517;

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
  const conversation = new BookConversation({ bookDir: root, projectRoot, log });

  const server = createServer((req, res) => {
    // An async handler that throws (bad URL encoding, anything unexpected)
    // becomes an unhandled rejection and kills the process — answer 500
    // instead; a broken request must never take the book server down.
    handleRequest(req, res).catch((err) => {
      log(`[ask-server] request error: ${err.message}`);
      try { res.writeHead(500).end('internal error'); } catch { /* headers sent */ }
    });
  });

  async function handleRequest(req, res) {
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
      conversation.reset();
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true }));
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

      conversation.ask({ question, selection: body.selection, chapter: body.chapter }, sse)
        .then(({ rebuilt }) => sse({ type: 'done', rebuilt }))
        .catch((err) => {
          sse({ type: 'error', message: err.message });
          sse({ type: 'done', rebuilt: false });
        })
        .finally(() => res.end());
      return;
    }

    if (req.method === 'GET') {
      serveStatic(url.pathname, res, cors);
      return;
    }
    res.writeHead(405, cors).end();
  }

  function serveStatic(pathname, res, cors) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400, cors).end('bad path encoding');
      return;
    }
    if (rel === '/') rel = '/breakdown.html';
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
