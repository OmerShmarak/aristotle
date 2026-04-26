// Plain Node test. Run with:
//   node tests/claude-enoent-distinguishes-cwd.test.js
//
// `child_process.spawn` returns ENOENT both when the executable is missing
// and when the cwd doesn't exist. The old handler always blamed the binary,
// so a stale breakdownDir surfaced as "Claude Code not installed." This
// asserts that a missing cwd produces an accurate error instead.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const { runClaude } = await import('../lib/claude.js');

const bogusCwd = resolve(tmpdir(), 'aristotle-definitely-does-not-exist-' + Date.now());

let err;
try {
  await runClaude('hi', { cwd: bogusCwd });
} catch (e) {
  err = e;
}

assert.ok(err, 'runClaude must reject when cwd does not exist');
assert.match(
  err.message,
  /Working directory does not exist/,
  `expected cwd-specific error, got: ${err.message}`,
);
assert.doesNotMatch(
  err.message,
  /not installed/,
  'must not blame the binary when the real problem is a missing cwd',
);

console.log('ok: missing cwd produces a cwd-specific error');
