// Plain Node test. Run with:
//   node tests/slug-symlink.test.js
//
// When the inner agent emits `%%ARISTOTLE_SLUG:<name>%%`, the engine creates
// a sibling SYMLINK at `<parent>/<name>` pointing at the run-XXX dir. It
// must NOT rename the actual directory: renaming breaks `claude -p
// --resume <id>` permanently, because Claude Code's session lookup
// validates the conversation against the cwd it was created in.
//
// What we assert:
//   1. breakdownDir is unchanged after the slug arrives.
//   2. A symlink at <parent>/<slug> exists and points at breakdownDir.
//   3. The artifact path emitted on `done` is rooted under the symlink
//      (so the TUI shows `open .../artifacts/<slug>/breakdown.html`).
//   4. meta.json's breakdownDir is unchanged (still run-XXX).

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-slug-test-'));
process.env.HOME = tmp;

const { createSession, readMeta } = await import('../lib/session.js');
const { Engine } = await import('../lib/engine.js');

try {
  const breakdownDir = resolve(tmp, 'artifacts', 'run-abcdef');
  mkdirSync(breakdownDir, { recursive: true });
  writeFileSync(resolve(breakdownDir, 'breakdown.html'), '<html></html>');

  const { sessionDir } = createSession({ topic: 'test', breakdownDir });
  const engine = new Engine(PROJECT_ROOT, breakdownDir, sessionDir);

  // Drive the slug callback the way SentinelStream does.
  engine._ensureSlugLink('Robert Caro LBJ Prep');

  // 1. breakdownDir is untouched.
  assert.equal(engine.breakdownDir, breakdownDir, 'breakdownDir must NOT change');
  assert.ok(existsSync(breakdownDir), 'run-XXX dir must still exist');

  // 2. Symlink exists at <parent>/<sanitized-slug>.
  const expected = resolve(dirname(breakdownDir), 'robert_caro_lbj');
  assert.ok(existsSync(expected), `symlink should exist at ${expected}`);
  assert.equal(readlinkSync(expected), breakdownDir, 'symlink target must be run-XXX');

  // 3. _displayDir is the slug path (used to format artifactPath in send()).
  assert.equal(engine._displayDir, expected, '_displayDir should be the symlink path');

  // 4. meta.json reflects the original breakdownDir, not the slug.
  const meta = readMeta(sessionDir);
  assert.equal(meta.breakdownDir, breakdownDir, 'meta.json must still point at run-XXX');

  // 5. Reading through the symlink finds the artifact.
  assert.ok(existsSync(resolve(expected, 'breakdown.html')), 'artifact reachable via symlink');

  // 6. A second slug emit is a no-op (we don't create a second symlink).
  engine._ensureSlugLink('different name');
  assert.equal(engine._displayDir, expected, 'second slug emit should be ignored');

  console.log('ok: slug creates sibling symlink without renaming run dir');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
