// Plain Node test. Run with:
//   node tests/ask-conversation.test.js
//
// Unit tests for BookConversation (cli/lib/ask/conversation.js) — the
// conversational core of ask-the-book — using an injected fake `run` and
// `rebuild`, no PATH shims, no HTTP, no browser. The e2e
// (ask-book.e2e.test.js) covers the transport on top of this.
//
// What we assert:
//   1. Session rolls: turn 1 starts fresh, turn 2 resumes, reset() → fresh.
//   2. Turns are serialized: a second ask never starts before the first ends.
//   3. Edit detection: a turn that touches a chapter md triggers rebuild and
//      reports rebuilt:true; a read-only turn doesn't.
//   4. A failed turn rejects its caller but does NOT wedge the queue.
//   5. Subagent events are filtered; top-level text/tool events stream out.
//   6. The system prompt embeds THIS book's syllabus + chapter listing.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const { BookConversation } = await import('../lib/ask/conversation.js');
const { systemPrompt } = await import('../lib/ask/prompts.js');

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-askconv-'));
const bookDir = resolve(tmp, 'book');
mkdirSync(resolve(bookDir, 'chapters'), { recursive: true });

// The change detector compares mtimes against the turn start; fixture files
// written microseconds before a turn would read as "edited during it" (a
// test-only artifact — real books are written long before anyone asks).
// Backdate everything we stage.
const writeStale = (path, content) => {
  writeFileSync(path, content);
  const past = (Date.now() - 60_000) / 1000;
  utimesSync(path, past, past);
};
writeStale(resolve(bookDir, 'outline.md'), '# Unit Book from First Principles\n1. One\n2. Two\n');
writeStale(resolve(bookDir, 'chapters', '01-one.md'), '# One\n\ntext\n');
writeStale(resolve(bookDir, 'chapters', '02-two.md'), '# Two\n\ntext\n');

try {
  // --- 6. prompts embed this book's context (checked first, it's pure) ---
  {
    const sp = systemPrompt(bookDir);
    assert.ok(sp.includes('Unit Book from First Principles'), 'syllabus content embedded');
    assert.ok(sp.includes('chapters/01-one.md') && sp.includes('chapters/02-two.md'), 'chapter listing embedded');
    console.log('ok: system prompt embeds this book’s syllabus + listing');
  }

  // --- 1 + 5. session rolling, reset, event filtering ---
  {
    const calls = [];
    const conv = new BookConversation({
      bookDir,
      projectRoot: tmp,
      rebuild: async () => {},
      run: async (prompt, opts) => {
        calls.push({ prompt, opts });
        opts.onEvent({ type: 'text', text: 'top-level', parentToolUseId: null });
        opts.onEvent({ type: 'text', text: 'subagent', parentToolUseId: 'tu1' });
        opts.onEvent({ type: 'tool_start', toolName: 'Read', parentToolUseId: null });
        return { sessionId: 'sess-A' };
      },
    });

    const events = [];
    await conv.ask({ question: 'q1' }, (e) => events.push(e));
    await conv.ask({ question: 'q2' }, () => {});
    conv.reset();
    await conv.ask({ question: 'q3' }, () => {});

    assert.equal(calls[0].opts.resume, undefined, 'turn 1 starts fresh');
    assert.equal(calls[1].opts.resume, 'sess-A', 'turn 2 resumes');
    assert.equal(calls[2].opts.resume, undefined, 'turn after reset starts fresh');
    assert.deepEqual(events, [{ type: 'text', text: 'top-level' }, { type: 'tool', name: 'Read' }],
      'subagent events filtered; text + tool stream out');
    console.log('ok: session rolls across turns, reset() starts fresh, events filtered');
  }

  // --- 2. serialization ---
  {
    let active = 0;
    let maxActive = 0;
    const conv = new BookConversation({
      bookDir,
      projectRoot: tmp,
      rebuild: async () => {},
      run: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return { sessionId: 's' };
      },
    });
    await Promise.all([
      conv.ask({ question: 'a' }, () => {}),
      conv.ask({ question: 'b' }, () => {}),
      conv.ask({ question: 'c' }, () => {}),
    ]);
    assert.equal(maxActive, 1, 'turns must never overlap');
    console.log('ok: concurrent asks are serialized');
  }

  // --- 3. edit detection → rebuild ---
  {
    let rebuilds = 0;
    const conv = new BookConversation({
      bookDir,
      projectRoot: tmp,
      rebuild: async () => { rebuilds++; },
      run: async (prompt) => {
        if (prompt.includes('EDIT')) {
          writeFileSync(resolve(bookDir, 'chapters', '01-one.md'), '# One\n\nedited\n');
        }
        return { sessionId: 's' };
      },
    });
    const events = [];
    const r1 = await conv.ask({ question: 'just a question' }, () => {});
    assert.deepEqual(r1, { rebuilt: false });
    assert.equal(rebuilds, 0, 'read-only turn must not rebuild');
    const r2 = await conv.ask({ question: 'EDIT the chapter' }, (e) => events.push(e));
    assert.deepEqual(r2, { rebuilt: true });
    assert.equal(rebuilds, 1, 'edited turn must rebuild');
    assert.ok(events.some((e) => e.type === 'status' && /Rebuilding/.test(e.message)), 'rebuild is announced');
    console.log('ok: mtime scan gates the rebuild');
  }

  // --- 4. failed turn doesn't wedge the queue ---
  {
    // test 3 legitimately edited 01-one.md moments ago — backdate it so this
    // block's turns see a quiet book again.
    writeStale(resolve(bookDir, 'chapters', '01-one.md'), '# One\n\nedited\n');
    let first = true;
    const conv = new BookConversation({
      bookDir,
      projectRoot: tmp,
      rebuild: async () => {},
      run: async () => {
        if (first) { first = false; throw new Error('boom'); }
        return { sessionId: 's' };
      },
    });
    await assert.rejects(conv.ask({ question: 'fails' }, () => {}), /boom/);
    const ok = await conv.ask({ question: 'works' }, () => {});
    assert.deepEqual(ok, { rebuilt: false });
    console.log('ok: a failed turn rejects but the conversation keeps working');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
