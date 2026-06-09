// Live eval runner for BREAKDOWN.md.
//
// Replays scripted student scenarios through real `claude -p` (same plumbing
// as the product: cli/lib/claude.js + the engine's system prompt builder),
// records the transcript, then runs check-protocol.js over it.
//
// Usage:
//   node evals/run-evals.js [scenario ...] [--through outline|done]
//
//   --through outline  (default) topic + scripted replies only. Cheap: a few
//                      short turns per scenario, no chapter agents spawned.
//                      Checks diagnosis/outline behaviour + that no agents
//                      fire before approval.
//   --through done     also sends the approval reply and waits for the full
//                      build. EXPENSIVE: spawns one agent per chapter and
//                      writes a real book under evals/runs/. Use one scenario
//                      at a time, after prompt changes you don't trust.
//
// This spends real subscription usage — it is NOT part of the test suite.
// Run it when BREAKDOWN.md (or the engine briefing) changes.
//
// Note: the system prompt includes the real PROFILE.md, exactly like a real
// run. Scenario replies state the student's background explicitly so the
// outline calibration being checked doesn't hinge on profile contents.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaude, checkClaude } from '../cli/lib/claude.js';
import { buildSystemPrompt } from '../cli/lib/engine/system-prompt.js';
import { checkTranscript } from './check-protocol.js';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(EVALS_DIR, '..');
const SCENARIOS_DIR = resolve(EVALS_DIR, 'scenarios');
const RUNS_DIR = resolve(EVALS_DIR, 'runs');

const TURN_IDLE_MS = 5 * 60 * 1000;
const OUTLINE_TURN_HARD_MS = 10 * 60 * 1000;
const BUILD_TURN_HARD_MS = 45 * 60 * 1000;

function loadScenarios(names) {
  const all = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.json'));
  const wanted = names.length
    ? all.filter((f) => names.includes(basename(f, '.json')))
    : all;
  const missing = names.filter((n) => !wanted.includes(`${n}.json`));
  if (missing.length) {
    throw new Error(`unknown scenario(s): ${missing.join(', ')} (have: ${all.map((f) => basename(f, '.json')).join(', ')})`);
  }
  return wanted.map((f) => JSON.parse(readFileSync(resolve(SCENARIOS_DIR, f), 'utf8')));
}

async function runScenario(scenario, { through, stamp }) {
  const runDir = resolve(RUNS_DIR, `${stamp}-${scenario.name}`);
  const artifactDir = resolve(runDir, 'artifact');
  mkdirSync(artifactDir, { recursive: true });
  const transcript = resolve(runDir, 'claude.jsonl');

  const systemPrompt = buildSystemPrompt(PROJECT_ROOT, artifactDir);
  const messages = [scenario.topic, ...(scenario.replies || [])];
  if (through === 'done') messages.push(scenario.approval || 'Approved.');

  let sessionId = null;
  for (const [i, message] of messages.entries()) {
    const isBuildTurn = through === 'done' && i === messages.length - 1;
    process.stdout.write(`  turn ${i + 1}/${messages.length}: ${JSON.stringify(message.slice(0, 60))}... `);
    const started = Date.now();
    const opts = {
      cwd: artifactDir,
      appendSystemPrompt: systemPrompt,
      eventLog: transcript,
      permissionMode: 'auto',
      idleTimeoutMs: TURN_IDLE_MS,
      hardTimeoutMs: isBuildTurn ? BUILD_TURN_HARD_MS : OUTLINE_TURN_HARD_MS,
      onEvent: (e) => {
        if (e.type === 'result' && !e.ok) {
          console.error(`\n  claude error: ${e.subtype || 'unknown'}`);
        }
      },
    };
    if (sessionId) opts.resume = sessionId;
    const { sessionId: sid } = await runClaude(message, opts);
    sessionId = sid || sessionId;
    console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  }

  const report = checkTranscript(readFileSync(transcript, 'utf8'), { through });
  writeFileSync(resolve(runDir, 'report.json'), JSON.stringify({ scenario: scenario.name, through, ...report }, null, 2));
  return { runDir, report };
}

async function main() {
  const args = process.argv.slice(2);
  const through = args.includes('--through') ? args[args.indexOf('--through') + 1] : 'outline';
  const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--through');
  if (!['outline', 'done'].includes(through)) {
    console.error('Usage: node evals/run-evals.js [scenario ...] [--through outline|done]');
    process.exit(2);
  }

  if (!await checkClaude()) {
    console.error('claude CLI not available — cannot run live evals.');
    process.exit(2);
  }

  const scenarios = loadScenarios(names);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  console.log(`Running ${scenarios.length} scenario(s) --through ${through}\n`);

  let failed = 0;
  for (const scenario of scenarios) {
    console.log(`▸ ${scenario.name} — ${scenario.description}`);
    try {
      const { runDir, report } = await runScenario(scenario, { through, stamp });
      for (const r of report.runs) {
        console.log(`    run ${r.run}: ${r.role} — ${r.words} words, ${r.agentBlocks} agent blocks`);
      }
      for (const w of report.warnings) console.log(`    ⚠ ${w.rule}: ${w.message}`);
      for (const v of report.violations) console.log(`    ✗ ${v.rule}: ${v.message}`);
      console.log(`  ${report.ok ? 'PASS' : 'FAIL'} — transcript: ${runDir}/claude.jsonl\n`);
      if (!report.ok) failed++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
      failed++;
    }
  }

  console.log(failed === 0
    ? `All ${scenarios.length} scenario(s) passed.`
    : `${failed}/${scenarios.length} scenario(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
