// BookConversation — the conversational core of ask-the-book, HTTP-free.
//
// One instance = one reader talking to one book. It owns:
//   - the rolling provider session (--resume), so follow-ups keep context
//   - a serial turn queue (claude -p resume is a single conversation;
//     concurrent turns would race it)
//   - edit detection: after each turn, an mtime scan of the book's sources
//     says whether the agent actually changed anything
//   - the rebuild trigger when it did
//
// Transport-agnostic by construction: per-turn events go to an onEvent
// callback ({type:'text'|'tool'|'status', ...}); whether they become SSE,
// a TUI, or test assertions is the caller's business. `run` and `rebuild`
// are injected (defaulting to the real runClaude / build-book.sh) so the
// whole class unit-tests without PATH shims or a browser — same pattern as
// Engine's options.provider.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { runClaude } from '../claude.js';
import { systemPrompt, turnPrompt } from './prompts.js';

export const TURN_IDLE_MS = 4 * 60 * 1000;
export const TURN_HARD_MS = 12 * 60 * 1000;

// The agent decides per message whether it's answering or editing; the tool
// set must allow both. Edits are scoped to one chapter by prompt, and the
// mtime scan reports what really happened.
const ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write'];

export class BookConversation {
  /**
   * @param {object} opts
   * @param {string} opts.bookDir      - breakdown source dir (cwd for the agent)
   * @param {string} opts.projectRoot  - aristotle root (for build-book.sh)
   * @param {Function} [opts.run]      - (prompt, opts) => Promise<{sessionId}>, default runClaude
   * @param {Function} [opts.rebuild]  - () => Promise<void>, default runs build-book.sh
   * @param {Function} [opts.log]
   */
  constructor({ bookDir, projectRoot, run = runClaude, rebuild, log = () => {} }) {
    this.bookDir = bookDir;
    this.projectRoot = projectRoot;
    this._run = run;
    this._rebuild = rebuild || (() => runBuildScript(projectRoot, bookDir));
    this._log = log;
    this._sessionId = null;
    this._queue = Promise.resolve();
  }

  /** Drop the rolling session — the next ask starts a fresh context window. */
  reset() {
    this._sessionId = null;
    this._log('[ask] conversation reset');
  }

  /**
   * One reader message. Serialized against other asks on this conversation.
   * @param {{question: string, selection?: string, chapter?: {id, title}}} input
   * @param {(ev: object) => void} onEvent - streamed {type:'text'|'tool'|'status'} events
   * @returns {Promise<{rebuilt: boolean}>}
   */
  ask(input, onEvent) {
    const turn = this._queue.then(() => this._turn(input, onEvent));
    // The shared queue must survive a failed turn; the caller still sees the
    // rejection through the returned promise.
    this._queue = turn.then(() => {}, () => {});
    return turn;
  }

  async _turn({ question, selection, chapter }, onEvent) {
    this._log(`[ask] ${question.slice(0, 80)}`);
    const startedMs = Date.now();

    const opts = {
      cwd: this.bookDir,
      appendSystemPrompt: systemPrompt(this.bookDir),
      allowedTools: ALLOWED_TOOLS,
      permissionMode: 'auto',
      idleTimeoutMs: TURN_IDLE_MS,
      hardTimeoutMs: TURN_HARD_MS,
      onEvent: (e) => {
        if (e.parentToolUseId) return; // subagent chatter never reaches the panel
        if (e.type === 'text') onEvent({ type: 'text', text: e.text });
        // Tool activity keeps the panel honest during silent stretches.
        if (e.type === 'tool_start') onEvent({ type: 'tool', name: e.toolName });
        if (e.type === 'result' && !e.ok) onEvent({ type: 'error', message: `claude error: ${e.subtype || 'unknown'}` });
      },
    };
    if (this._sessionId) opts.resume = this._sessionId;

    const { sessionId } = await this._run(
      turnPrompt({ question, selection: String(selection || ''), chapter: chapter && typeof chapter === 'object' ? chapter : null }),
      opts,
    );
    if (sessionId) this._sessionId = sessionId;

    if (!this._sourcesChangedSince(startedMs)) return { rebuilt: false };

    onEvent({ type: 'status', message: 'Rebuilding the book…' });
    await this._rebuild();
    this._log('[ask] sources changed — rebuilt');
    return { rebuilt: true };
  }

  // Did the agent edit the book this turn? Ground truth is the disk: any
  // chapter markdown (or outline.md) with an mtime inside the turn.
  _sourcesChangedSince(sinceMs) {
    const candidates = [];
    try {
      for (const f of readdirSync(join(this.bookDir, 'chapters'))) {
        if (f.endsWith('.md')) candidates.push(join(this.bookDir, 'chapters', f));
      }
    } catch { /* no chapters dir */ }
    candidates.push(join(this.bookDir, 'outline.md'));
    return candidates.some((f) => {
      try { return statSync(f).mtimeMs >= sinceMs; } catch { return false; }
    });
  }
}

function runBuildScript(projectRoot, bookDir) {
  return new Promise((res, rej) => {
    const proc = spawn('bash', [join(projectRoot, 'build-book.sh'), bookDir], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('close', (code) => (code === 0 ? res() : rej(new Error(`build-book.sh failed (${code}): ${err.slice(0, 400)}`))));
    proc.on('error', rej);
  });
}
