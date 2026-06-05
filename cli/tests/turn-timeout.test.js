// Plain Node test. Run with:
//   node tests/turn-timeout.test.js
//
// Regression for the 41-hour hang (session 20260530-171604-749a): a
// chapter-writing subagent inside `claude -p` blocked forever, the parent
// process emitted no further output, and the engine — which just awaits the
// child — sat idle for ~41h until the user hit Ctrl-C. There was no time
// limit of any kind.
//
// runClaude must now bound each turn two ways:
//   1. idleTimeoutMs  — kill the process if stdout goes silent for too long
//                       (the exact failure mode here: zero output for 41h).
//   2. hardTimeoutMs  — kill the process if total runtime exceeds the cap,
//                       even while it keeps emitting (a runaway loop).
//
// Both reject with err.code === 'TIMEOUT_ERR' so the engine can surface a
// clear message instead of hanging.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const { runClaude } = await import('../lib/claude.js');

const bin = mkdtempSync(resolve(tmpdir(), 'aristotle-timeout-bin-'));
const originalPath = process.env.PATH;

function fakeClaude(script) {
  const p = resolve(bin, 'claude');
  writeFileSync(p, script);
  chmodSync(p, 0o755);
  process.env.PATH = `${bin}:${originalPath}`;
}

async function reject(promise) {
  const start = Date.now();
  try {
    await promise;
    return { err: null, elapsed: Date.now() - start };
  } catch (err) {
    return { err, elapsed: Date.now() - start };
  }
}

try {
  // --- 1. Idle watchdog: a process that emits nothing must be killed. ---
  // The fake sleeps 10s (stand-in for "forever"). With a 600ms idle limit,
  // the watchdog must fire long before the fake would have exited on its own.
  fakeClaude('#!/bin/sh\nsleep 10\n');
  {
    const { err, elapsed } = await reject(
      runClaude('hi', { idleTimeoutMs: 600, hardTimeoutMs: 0 }),
    );
    assert.ok(err, 'runClaude must reject when stdout goes silent past idleTimeoutMs');
    assert.equal(err.code, 'TIMEOUT_ERR', `expected TIMEOUT_ERR, got code=${err.code} msg=${err.message}`);
    assert.match(err.message, /timed out/i, `expected a timeout message, got: ${err.message}`);
    assert.ok(elapsed < 5000, `idle watchdog should fire promptly, took ${elapsed}ms`);
    console.log(`ok: idle watchdog killed a silent process in ${elapsed}ms`);
  }

  // --- 2. Hard cap: a process that keeps emitting must still be killed. ---
  // The fake streams a line every 100ms (so the idle timer never fires), but
  // the hard cap at 700ms must terminate it anyway.
  fakeClaude('#!/bin/sh\nwhile true; do printf \'{"type":"x"}\\n\'; sleep 0.1; done\n');
  {
    const { err, elapsed } = await reject(
      runClaude('hi', { idleTimeoutMs: 0, hardTimeoutMs: 700 }),
    );
    assert.ok(err, 'runClaude must reject when runtime exceeds hardTimeoutMs');
    assert.equal(err.code, 'TIMEOUT_ERR', `expected TIMEOUT_ERR, got code=${err.code} msg=${err.message}`);
    assert.ok(elapsed < 5000, `hard cap should fire near the limit, took ${elapsed}ms`);
    console.log(`ok: hard cap killed a chatty runaway in ${elapsed}ms`);
  }

  console.log('ok: turn timeouts bound runaway claude processes');
} finally {
  process.env.PATH = originalPath;
  rmSync(bin, { recursive: true, force: true });
}
