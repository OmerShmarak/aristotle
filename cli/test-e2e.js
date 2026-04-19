/**
 * Headless end-to-end run.
 *
 * Drives the Engine through a full breakdown generation with auto-replies,
 * so we can verify that:
 *   - The outer agent actually spawns chapter Agents (doesn't announce-and-stop)
 *   - %%ARISTOTLE_CHAPTERS_TOTAL%% and %%ARISTOTLE_CHAPTER_DONE%% sentinels fire
 *   - build-book.sh runs and breakdown.html materializes
 *   - 'done' event fires with the correct artifact path
 *
 * The TUI layer is a pure projection of these engine events, so verifying
 * the events + the on-disk artifact covers everything except Ink rendering.
 */
import { Engine } from './lib/engine.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const TOPIC = 'prime numbers';
const BREAKDOWN_DIR = resolve('/tmp', `aristotle-e2e-${Date.now()}`);
const EVENT_LOG = `${BREAKDOWN_DIR}.jsonl`;

rmSync(BREAKDOWN_DIR, { recursive: true, force: true });
mkdirSync(BREAKDOWN_DIR, { recursive: true });
process.env.ARISTOTLE_EVENT_LOG = EVENT_LOG;

const startedAt = Date.now();
const log = (...args) => {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(6) + 's';
  process.stderr.write(`[${elapsed}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n');
};

log(`topic         : ${TOPIC}`);
log(`breakdown dir : ${BREAKDOWN_DIR}`);
log(`event log     : ${EVENT_LOG}`);

const engine = new Engine(PROJECT_ROOT, BREAKDOWN_DIR);
await engine.init();

const events = {
  text: '',
  chaptersTotal: null,
  chaptersDone: [],
  phases: [],
  done: null,
  errors: [],
};

engine.on('text', (e) => { if (!e.parentToolUseId) events.text += e.text; });
engine.on('chapters_total', (e) => { events.chaptersTotal = e.total; log(`  ← chapters_total: ${e.total}`); });
engine.on('chapter_done', (e) => { events.chaptersDone.push(e.id); log(`  ← chapter_done: ${e.id} (${events.chaptersDone.length}/${events.chaptersTotal})`); });
engine.on('phase', (e) => { events.phases.push(e.phase); log(`  ← phase: ${e.phase}`); });
engine.on('done', (e) => { events.done = e; log(`  ← done: ${e.artifactPath}`); });
engine.on('error', (e) => { events.errors.push(e.message); log(`  ← error: ${e.message}`); });

async function sendAndWait(msg, label) {
  log(`\n  → [${label}] ${msg.slice(0, 120)}${msg.length > 120 ? '…' : ''}`);
  const textLenBefore = events.text.length;
  await engine.send(msg);
  const reply = events.text.slice(textLenBefore);
  log(`  reply (${reply.length} chars): ${reply.slice(0, 300).replace(/\n/g, ' ')}${reply.length > 300 ? '…' : ''}`);
  return reply;
}

// --- Turn 1: bypass the interview; demand a minimal breakdown immediately ---
const t1 = await sendAndWait(
  `I want to learn about: ${TOPIC}\n\n` +
  `Override defaults for this session: I am a technical adult with basic math. ` +
  `Skip the knowledge-diagnosis interview. Skip the PROFILE.md interview. ` +
  `Generate a MINIMAL outline of exactly 2 short chapters (~500-800 words each, not 2000+) ` +
  `for pipeline validation purposes. Then ask me to approve the outline before spawning.`,
  'turn 1'
);

if (events.done) {
  log('\n  unexpected early done');
  process.exit(1);
}

// --- Turn 2: approve and let it rip ---
const t2 = await sendAndWait(
  `Approved. Proceed now, in this one response. Sentinel protocol (emit all three — the progress bar depends on them):\n` +
  `  1) First, emit on its own line: %%ARISTOTLE_CHAPTERS_TOTAL:2%%\n` +
  `  2) Spawn both chapter agents in parallel in this SAME response (Agent tool, subagent_type=general-purpose). ` +
  `Each chapter must be markdown at chapters/NN-slug.md (NOT html). Keep each 500-800 words. Skip diagrams and visual verification for this pipeline test.\n` +
  `  3) As each chapter file is finalized, emit on its own line: %%ARISTOTLE_CHAPTER_DONE:<slug>%% (e.g. %%ARISTOTLE_CHAPTER_DONE:01-what-is-a-prime%%)\n` +
  `  4) After both chapters are done and their sentinels emitted, run: ${PROJECT_ROOT}/build-book.sh .\n` +
  `  5) Then emit on its own final line: %%ARISTOTLE_DONE:breakdown.html%%`,
  'turn 2'
);

// --- Verify ---
log('\n— verification —\n');
let fails = 0;
function check(cond, msg) {
  if (cond) log(`  OK  ${msg}`);
  else { log(`  FAIL ${msg}`); fails++; }
}

check(events.chaptersTotal === 2, `chapters_total === 2 (got ${events.chaptersTotal})`);
check(events.chaptersDone.length >= 2, `chapter_done fired ≥2 times (got ${events.chaptersDone.length})`);
check(events.done !== null, `done event fired`);
check(events.errors.length === 0, `no engine errors (got ${events.errors.length})`);
check(events.phases.includes('writing'), `entered writing phase`);

const chaptersDir = resolve(BREAKDOWN_DIR, 'chapters');
check(existsSync(chaptersDir), `chapters/ dir exists`);
if (existsSync(chaptersDir)) {
  const chapters = readdirSync(chaptersDir).filter(f => f.endsWith('.md'));
  check(chapters.length >= 2, `at least 2 chapter files written (got ${chapters.length}: ${chapters.join(', ')})`);
}

const artifactPath = events.done?.artifactPath;
check(artifactPath && existsSync(artifactPath), `breakdown.html exists at ${artifactPath}`);

// Keep artifacts on failure so I can inspect
if (fails > 0) {
  log(`\n  ${fails} failure(s) — artifacts kept at ${BREAKDOWN_DIR}, log at ${EVENT_LOG}`);
  process.exit(1);
}
log(`\n  E2E OK`);
log(`  artifacts: ${BREAKDOWN_DIR}`);
log(`  event log: ${EVENT_LOG}`);
process.exit(0);
