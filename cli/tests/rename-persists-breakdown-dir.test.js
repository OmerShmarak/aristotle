// Plain Node test (no PTY needed). Run with:
//   node tests/rename-persists-breakdown-dir.test.js
//
// Reproduces the bug: when the engine renames its breakdownDir to a
// topic-derived slug (e.g. /artifacts/run-xyz -> /artifacts/caro_lbj_prep),
// the change must be persisted to meta.json. Otherwise, resuming the session
// later hands the stale path to `claude -p`'s cwd and the spawn fails with
// ENOENT — surfaced (misleadingly) as "Claude Code not installed."

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-rename-test-'));
process.env.HOME = tmp;

const { createSession, readMeta } = await import('../lib/session.js');
const { Engine } = await import('../lib/engine.js');

try {
  // A real artifact dir under a tmp parent — this is what gets renamed.
  const artifactsParent = resolve(tmp, 'artifacts');
  const breakdownDir = resolve(artifactsParent, 'run-abcdef');
  mkdirSync(breakdownDir, { recursive: true });

  const { sessionDir } = createSession({ topic: 'test', breakdownDir });
  const engine = new Engine(PROJECT_ROOT, breakdownDir, sessionDir);
  engine.sessionId = 'provider-session-xyz';

  const renamed = engine._renameBreakdownDir('Robert Caro LBJ Prep');

  assert.ok(
    renamed && renamed !== breakdownDir,
    'rename should produce a new path',
  );
  assert.ok(existsSync(renamed), 'new breakdownDir must exist on disk');
  assert.ok(!existsSync(breakdownDir), 'old breakdownDir should be gone');

  const meta = readMeta(sessionDir);
  assert.equal(
    meta.breakdownDir,
    renamed,
    'meta.json must reflect the renamed breakdownDir so resume picks the right cwd',
  );

  console.log('ok: rename persists breakdownDir to meta.json');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
