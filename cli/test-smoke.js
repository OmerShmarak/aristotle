/**
 * End-to-end smoke test.
 *
 * Runs one real `claude -p` turn against a throwaway breakdown dir under
 * `$ROOT/artifacts/smoke-<ts>/` (the new layout). Verifies:
 *   1. The breakdown dir actually resolves to $ROOT/artifacts/<slug>.
 *   2. The inner agent's cwd matches that dir, and it can Write a file there.
 *   3. Despite the aristotle repo's CLAUDE.md leaking via parent-walk, the
 *      agent stays in role (talks about breakdowns/chapters, not tui-test
 *      or node-pty or the Ink internals it would only mention if it had
 *      mistaken itself for an aristotle-development assistant).
 *
 * Run: npm run smoke
 */
import { Engine } from './lib/engine.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const slug = `smoke-${Date.now()}`;
const breakdownDir = resolve(PROJECT_ROOT, 'artifacts', slug);
mkdirSync(breakdownDir, { recursive: true });

console.error(`PROJECT_ROOT : ${PROJECT_ROOT}`);
console.error(`breakdownDir : ${breakdownDir}\n`);

let failures = 0;
function check(cond, msg) {
  if (cond) console.error(`  OK  ${msg}`);
  else { console.error(`  FAIL: ${msg}`); failures++; }
}

// --- Static check: path is under $ROOT/artifacts/<slug> ---
check(
  breakdownDir === resolve(PROJECT_ROOT, 'artifacts', slug),
  'breakdownDir resolves to $ROOT/artifacts/<slug>'
);

// --- Init engine & sanity-check system prompt ---
const engine = new Engine(PROJECT_ROOT, breakdownDir);
await engine.init();

const prompt = engine.systemPrompt;
check(!/\{\{PROJECT_ROOT\}\}/.test(prompt), 'system prompt has no unresolved {{PROJECT_ROOT}} tokens');
check(prompt.includes(`${PROJECT_ROOT}/build-book.sh`), 'system prompt references absolute build-book.sh path');

// --- Live probe: one claude -p turn ---
let captured = '';
engine.on('text', (ev) => { if (!ev.parentToolUseId) captured += ev.text; });
engine.on('error', (ev) => console.error('  engine error:', ev.message));

console.error('  ... sending probe prompt (one claude -p turn, ~10-20s) ...');
await engine.send(
  'SKIP your normal workflow for this single turn. Do NOT produce an outline, ' +
  'do NOT spawn Agent sub-agents, do NOT emit any %%ARISTOTLE_*%% sentinels. ' +
  'Just do these two things:\n\n' +
  '1. Use the Write tool to create a file named PROBE.txt in your current ' +
  'working directory with exactly the content "ok" (three characters, no newline).\n\n' +
  '2. Reply with EXACTLY these three lines, nothing before or after:\n' +
  'CWD: <absolute path of your cwd>\n' +
  'WROTE: <absolute path of the PROBE.txt you wrote>\n' +
  'ROLE: <one sentence starting with "I am" describing what you do in this pipeline>'
);

const text = captured.trim();
console.error('\n--- inner agent reply ---');
console.error(text);
console.error('--- /reply ---\n');

const cwdLine = text.match(/^CWD:\s*(.+)$/m)?.[1]?.trim();
const wroteLine = text.match(/^WROTE:\s*(.+)$/m)?.[1]?.trim();
const roleLine = text.match(/^ROLE:\s*(.+)$/m)?.[1]?.trim();

check(cwdLine === breakdownDir, `agent reports cwd = breakdownDir (got: ${cwdLine})`);
check(wroteLine === resolve(breakdownDir, 'PROBE.txt'), `agent reports correct PROBE.txt path (got: ${wroteLine})`);
check(existsSync(resolve(breakdownDir, 'PROBE.txt')), 'PROBE.txt exists on disk in breakdownDir');

const probeContent = existsSync(resolve(breakdownDir, 'PROBE.txt'))
  ? readFileSync(resolve(breakdownDir, 'PROBE.txt'), 'utf-8')
  : '';
check(probeContent.trim() === 'ok', `PROBE.txt content is "ok" (got: ${JSON.stringify(probeContent)})`);

check(/^I am\b/i.test(roleLine || ''), `ROLE starts with "I am" (got: ${roleLine})`);
check(
  /breakdown|chapter|textbook|student|outline/i.test(roleLine || ''),
  'ROLE mentions the aristotle domain (breakdown/chapter/textbook/student/outline)'
);

// Words that only appear in the dev-facing CLAUDE.md at the repo root. If the
// inner agent starts echoing any of these, it has drifted from its role and
// begun executing dev instructions that leaked via parent-walk.
const leakMarkers = ['tui-test', 'node-pty', 'node@22', 'npm run tui-test', 'Ink component'];
for (const marker of leakMarkers) {
  check(!text.toLowerCase().includes(marker.toLowerCase()), `reply does not leak dev-CLAUDE.md marker "${marker}"`);
}

// --- cleanup ---
try { rmSync(breakdownDir, { recursive: true, force: true }); } catch {}

console.error(`\n  ${failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`}`);
process.exit(failures > 0 ? 1 : 0);
