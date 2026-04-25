// Plain Node test (no PTY needed — this is a unit test of the persistence
// rule). Run with: node tests/resume-no-duplicate.test.js
//
// Reproduces the bug: resuming a session via setResume() must NOT cause the
// fresh debug session to inherit the same providerSessionId in its meta.json
// (which would surface it as a second entry in the picker).

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-resume-test-'));
process.env.HOME = tmp;

const { createSession, readMeta, updateMeta } = await import('../lib/session.js');
const { listSessions } = await import('../lib/sessions.js');
// Use the real project root so buildSystemPrompt can find BREAKDOWN.md.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const { Engine } = await import('../lib/engine.js');

try {
  // 1. An existing session that we'll resume.
  const original = createSession({ topic: 'original topic', breakdownDir: tmp });
  updateMeta(original.sessionDir, {
    provider: 'claude-code',
    providerSessionId: 'provider-original-xyz',
  });

  // 2. A fresh debug session for the new run.
  const fresh = createSession({ topic: '(resumed)', breakdownDir: tmp });
  const engine = new Engine(PROJECT_ROOT, tmp, fresh.sessionDir);
  // Simulate inheriting the original's resume token.
  engine.setResume({
    sessionId: 'provider-original-xyz',
    breakdownDir: PROJECT_ROOT,
  });
  // Simulate the save the engine does after the first turn.
  engine._persistResumeToken();

  const freshMeta = readMeta(fresh.sessionDir);
  assert.equal(
    freshMeta.providerSessionId,
    null,
    'fresh debug session must not inherit the resumed providerSessionId',
  );

  const visible = listSessions();
  const ids = visible.map(s => s.id);
  assert.ok(ids.includes(original.id), 'original session is still listed');
  assert.ok(!ids.includes(fresh.id), 'fresh debug session is NOT listed');
  assert.equal(
    visible.filter(s => s.providerSessionId === 'provider-original-xyz').length,
    1,
    'exactly one session in the picker owns the resumed token',
  );

  console.log('ok: resume does not duplicate the session');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
