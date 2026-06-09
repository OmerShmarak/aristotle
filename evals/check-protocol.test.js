// Plain Node test. Run with:
//   node evals/check-protocol.test.js
//
// The checker is the trustworthy core of the eval harness — these fixtures
// prove it catches each protocol-violation class BREAKDOWN.md forbids, and
// stays quiet on a clean run. No tokens spent: fixtures are synthetic
// transcripts in evals/fixtures/.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTranscript } from './check-protocol.js';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name) => readFileSync(resolve(fixtures, name), 'utf8');
const rules = (report) => new Set(report.violations.map((v) => v.rule));

// --- Clean full run: zero violations, zero warnings. ---
{
  const report = checkTranscript(load('good-full-run.jsonl'), { through: 'done' });
  assert.deepEqual(report.violations, [], `clean run must pass, got: ${JSON.stringify(report.violations)}`);
  assert.deepEqual(report.warnings, [], `clean run must have no warnings, got: ${JSON.stringify(report.warnings)}`);
  assert.deepEqual(report.runs.map((r) => r.role), ['diagnosis', 'outline', 'execution']);
  console.log('ok: clean full run passes with correct turn classification');
}

// --- Subagent prose must not pollute top-level checks. ---
{
  const report = checkTranscript(load('good-full-run.jsonl'), { through: 'done' });
  assert.ok(!rules(report).has('diagnosis-teaching-prose'),
    'subagent chapter prose (parent_tool_use_id set) must be excluded from teaching checks');
  console.log('ok: subagent prose excluded from top-level checks');
}

// --- Clean outline-only run passes in outline mode. ---
{
  const report = checkTranscript(load('good-outline-only.jsonl'), { through: 'outline' });
  assert.deepEqual(report.violations, [], `outline-only run must pass, got: ${JSON.stringify(report.violations)}`);
  console.log('ok: clean outline-only run passes in outline mode');
}

// --- Serial-spawning transcript: every violation class is caught. ---
{
  const report = checkTranscript(load('bad-serial.jsonl'), { through: 'done' });
  const got = rules(report);
  for (const expected of [
    'diagnosis-teaching-prose', // "# The Roadmap" + "Part 1:" lecture in diagnosis
    'outline-no-approval-ask',  // outline says "Starting now." instead of asking
    'total-after-agents',       // CHAPTERS_TOTAL emitted after first Agent spawn
    'serial-spawning',          // one Agent per message instead of all in one
    'sentinel-not-own-line',    // TOTAL shares a line with prose
    'chapter-done-mismatch',    // 2 of 3 chapters marked done
    'done-missing',             // no %%ARISTOTLE_DONE%%
    'build-script-missing',     // build-book.sh never invoked
  ]) {
    assert.ok(got.has(expected), `expected violation "${expected}", got: ${[...got].join(', ')}`);
  }
  assert.ok(report.warnings.some((w) => w.rule === 'slug-missing'), 'missing slug should warn');
  console.log('ok: serial/lecture transcript trips all expected rules');
}

// --- Eager transcript: skipping the approval gate is caught. ---
{
  const report = checkTranscript(load('bad-eager.jsonl'), { through: 'done' });
  const got = rules(report);
  assert.ok(got.has('outline-missing'), `expected outline-missing, got: ${[...got].join(', ')}`);
  assert.ok(got.has('agents-before-approval'), `expected agents-before-approval, got: ${[...got].join(', ')}`);
  console.log('ok: approval-gate skip is caught');
}

// --- Outline mode flags any agent spawn at all. ---
{
  const report = checkTranscript(load('bad-eager.jsonl'), { through: 'outline' });
  assert.ok(rules(report).has('agents-before-approval'),
    'outline mode must flag agent spawns');
  console.log('ok: outline mode flags agent spawns');
}
