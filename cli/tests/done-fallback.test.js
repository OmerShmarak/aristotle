// Plain Node test. Run with:
//   node tests/done-fallback.test.js
//
// The %%ARISTOTLE_DONE:<path>%% sentinel is the single point of failure
// between "book built on disk" and "TUI shows the open hint". If the model
// garbles or forgets the sentinel, the user stares at an idle prompt while a
// finished breakdown.html sits on disk.
//
// The engine must recover: at turn end, if no done sentinel arrived but
// breakdown.html exists in the breakdown dir with an mtime inside this turn,
// emit `done` anyway.
//
// What we assert:
//   1. Fresh breakdown.html + no sentinel  → `done` emitted (fallback fires).
//   2. Stale breakdown.html + no sentinel  → no `done` (a build from a prior
//      turn must not re-trigger the open hint on an unrelated chat turn).
//   3. Sentinel present                    → exactly one `done` (fallback
//      must not double-emit).

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const { Engine } = await import('../lib/engine.js');

function fakeProvider(behaviour) {
  return {
    name: 'fake',
    check: async () => 'fake 1.0',
    run: async (prompt, opts) => {
      await behaviour(opts);
      return { sessionId: 'sess-fake' };
    },
  };
}

async function runTurn(breakdownDir, behaviour) {
  const engine = new Engine(PROJECT_ROOT, breakdownDir, null, {
    provider: fakeProvider(behaviour),
  });
  await engine.init();
  const dones = [];
  engine.on('done', (payload) => dones.push(payload));
  await engine.send('test message');
  return dones;
}

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-done-fallback-'));

try {
  // --- 1. Fresh artifact, no sentinel → fallback emits done. ---
  {
    const dir = resolve(tmp, 'fresh');
    mkdirSync(dir, { recursive: true });
    const dones = await runTurn(dir, async (opts) => {
      opts.onEvent({ type: 'text', text: 'Build finished! Enjoy the book.', parentToolUseId: null });
      writeFileSync(resolve(dir, 'breakdown.html'), '<html>book</html>');
    });
    assert.equal(dones.length, 1, 'fallback must emit done when a fresh breakdown.html exists');
    assert.equal(dones[0].artifactPath, resolve(dir, 'breakdown.html'));
    console.log('ok: missing sentinel recovered from fresh breakdown.html');
  }

  // --- 2. Stale artifact, no sentinel → no done. ---
  {
    const dir = resolve(tmp, 'stale');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'breakdown.html'), '<html>old book</html>');
    const past = (Date.now() - 60_000) / 1000;
    utimesSync(resolve(dir, 'breakdown.html'), past, past);
    const dones = await runTurn(dir, async (opts) => {
      opts.onEvent({ type: 'text', text: 'Just chatting, no build this turn.', parentToolUseId: null });
    });
    assert.equal(dones.length, 0, 'a stale breakdown.html must not trigger done');
    console.log('ok: stale breakdown.html does not trigger done');
  }

  // --- 3. Sentinel present → exactly one done, not two. ---
  {
    const dir = resolve(tmp, 'sentinel');
    mkdirSync(dir, { recursive: true });
    const dones = await runTurn(dir, async (opts) => {
      writeFileSync(resolve(dir, 'breakdown.html'), '<html>book</html>');
      opts.onEvent({ type: 'text', text: 'Done!\n%%ARISTOTLE_DONE:breakdown.html%%\n', parentToolUseId: null });
    });
    assert.equal(dones.length, 1, 'sentinel + fresh file must emit done exactly once');
    assert.equal(dones[0].artifactPath, resolve(dir, 'breakdown.html'));
    console.log('ok: sentinel path emits done exactly once (no fallback double-fire)');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
