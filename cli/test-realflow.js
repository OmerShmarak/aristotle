/**
 * Reproduce the real-usage flow: just send "I want to learn about: <topic>"
 * exactly like bin/aristotle.js → App.js does, no overrides at all.
 * Then observe what the model does in turn 1 — this should be diagnosis,
 * not content streaming. If it starts writing chapters in-terminal, that's
 * the bug the user is seeing.
 */
import { Engine } from './lib/engine.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const TOPIC = process.argv[2] || 'the battle of stalingrad';
const BREAKDOWN_DIR = resolve('/tmp', `aristotle-realflow-${Date.now()}`);
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

let turnText = '';
let sawWritingPhase = false;
let sawChaptersTotal = null;
let sawChapterDone = [];
let sawDone = false;
let toolCalls = [];
let agentSpawnTimes = []; // timestamps of top-level Agent tool_starts

engine.on('text', (e) => { if (!e.parentToolUseId) turnText += e.text; });
engine.on('phase', (e) => { log(`← phase: ${e.phase}`); if (e.phase === 'writing') sawWritingPhase = true; });
engine.on('chapters_total', (e) => { sawChaptersTotal = e.total; log(`← chapters_total: ${e.total}`); });
engine.on('chapter_done', (e) => { sawChapterDone.push(e.id); log(`← chapter_done: ${e.id}`); });
engine.on('tool_start', (e) => {
  if (!e.parentToolUseId) {
    toolCalls.push(e.toolName);
    if (e.toolName === 'Agent' || e.toolName === 'Task') agentSpawnTimes.push(Date.now());
    log(`← tool: ${e.toolName}`);
  }
});
engine.on('done', (e) => { sawDone = true; log(`← done: ${e.artifactPath}`); });
engine.on('error', (e) => log(`← error: ${e.message}`));

function classify(text) {
  // Content-dump markers — what the bug looks like.
  const hasLayerHeaders = /##\s+Layer\s+\d/i.test(text);
  const hasPunchline = /punchline first|unpack each layer|below I unpack|now watch the choices|let me unpack/i.test(text);
  const hasLongProse = /(?:^|\n)##\s+[A-Z][^\n]{0,80}\n[^\n]{400,}/s.test(text); // a section with 400+ chars of body
  // Outline markers — a correct outline response has "**N. Title**" or
  // "**Label N — Title**" headings where the number lives INSIDE the bold.
  // Diagnosis questions use "N. **Topic** — ..." with the number OUTSIDE
  // the bold, so the regex distinguishes them.
  const chapterEntries = (text.match(/^\s*\*\*\s*(?:(?:Chapter|Stage|Part|Section|Module|Unit|Step)\s+)?\d+\s*[.:\-—–][^*\n]{3,160}\*\*/gmi) || []).length;
  const hasChapterList = chapterEntries >= 2;
  const hasOutlineStructure = /##\s*Philosophy|##\s*Roadmap|dependency chain|chapter sequence|proposed (outline|breakdown|curriculum)|the curriculum I propose|here('s| is) my (outline|breakdown|proposed|curriculum)|my proposed/i.test(text);
  const hasApprovalAsk = /review this|approve|approved\?|ready to write|shall I proceed|sound (right|good)|sound fine|want me to adjust|look(s| ) right|make sense|any changes/i.test(text);
  // Terminal-teaching markers — model giving content instead of outline.
  const teachingCues = /I'll (keep driving|walk you through|build this in layers|cover)|let me (teach|walk you|explain|unpack)|I'll go deeper|you can stop me/i.test(text);
  // Word-count self-nomination (shouldn't happen per BREAKDOWN.md, model should default 2000-4000).
  const proposesShortChapters = /\b([1-9]\d{0,2}|1\d{3})\s*[-–—]\s*\d+\s*words\b/.test(text) &&
                                !/[23]000\s*[-–—]\s*[34]000\s*words/.test(text);

  const questionCount = (text.match(/\?/g) || []).length;
  const looksLikeContent = text.length > 2500 && (hasLayerHeaders || hasPunchline || teachingCues || hasLongProse);
  const looksLikeOutline = (hasChapterList || hasOutlineStructure) && hasApprovalAsk && !looksLikeContent;
  const looksLikeDiagnosis = questionCount >= 2 && text.length < 1800 && !hasChapterList && !looksLikeContent;
  return { chapterEntries, questionCount, hasLayerHeaders, hasPunchline, hasLongProse, hasChapterList, hasOutlineStructure, hasApprovalAsk, teachingCues, proposesShortChapters, looksLikeContent, looksLikeOutline, looksLikeDiagnosis };
}

async function turn(label, message) {
  turnText = '';
  toolCalls = [];
  agentSpawnTimes = [];
  log(`\n→ [${label}] ${message.slice(0, 140).replace(/\n/g, ' ')}${message.length > 140 ? '…' : ''}`);
  const before = Date.now();
  await engine.send(message);
  const durationSec = (Date.now() - before) / 1000;
  const c = classify(turnText);
  log(`← [${label}] ${durationSec.toFixed(1)}s, ${turnText.length} chars, tools=${JSON.stringify(toolCalls)}`);
  log(`   classify: ${JSON.stringify(c)}`);
  log(`   preview: ${turnText.slice(0, 400).replace(/\n/g, ' ⏎ ')}${turnText.length > 400 ? '…' : ''}`);
  return { text: turnText, classify: c, durationSec };
}

// Turn 1: exactly what App.js sends
const t1 = await turn('turn 1', `I want to learn about: ${TOPIC}`);

// Turn 2: the failure case — student admits no prior knowledge
const t2 = await turn('turn 2', `I don't have a good history or geopolitics background. I don't know any of the answers to your questions.`);

// Turn 3: the APPROVAL step — this is where the real bug lives. Model is
// supposed to emit CHAPTERS_TOTAL sentinel + fire parallel Agent tool_use
// blocks. The observed bug: model writes "# Chapter 0" heading and teaches
// the chapter inline in the terminal instead.
const t3 = await turn('turn 3', `sounds cool. go ahead and write all the chapters.`);

// --- Verdict ---
log('\n— verdict —');
let failures = 0;
function check(cond, msg) { if (cond) log(`  OK  ${msg}`); else { log(`  FAIL ${msg}`); failures++; } }

check(t1.classify.looksLikeDiagnosis, `turn 1 is diagnosis (${t1.classify.questionCount} questions, ${t1.text.length} chars)`);
check(!t2.classify.looksLikeContent, `turn 2 is NOT a content dump`);
check(t2.classify.looksLikeOutline, `turn 2 IS an outline with approval ask`);
check(!t2.classify.proposesShortChapters, `turn 2 does not propose chapter lengths below 2000 words`);

// Turn 3 (approval → spawn) assertions
const t3HasChapterHeader = /^#\s+Chapter\s+\d/mi.test(t3.text) || /^##?\s+(Chapter|Ch\.?)\s*\d/mi.test(t3.text);
const agentCount = agentSpawnTimes.length;
const agentEmitSpan = agentSpawnTimes.length >= 2
  ? (agentSpawnTimes[agentSpawnTimes.length - 1] - agentSpawnTimes[0]) / 1000
  : 0;
const turn3DurationSec = t3.durationSec || 0;
check(sawChaptersTotal !== null, `turn 3 emitted CHAPTERS_TOTAL sentinel (got ${sawChaptersTotal})`);
check(agentCount >= 2, `turn 3 fired Agent tool calls (count=${agentCount})`);
check(agentEmitSpan < 120, `turn 3 Agent prompts emit fast: first→last span ${agentEmitSpan.toFixed(1)}s (target <120s — long Agent prompts here will blow the e2e budget)`);
check(!t3HasChapterHeader, `turn 3 did NOT write "# Chapter N" headings inline`);
check(!t3.classify.looksLikeContent, `turn 3 is NOT a content dump in the terminal`);
check(sawDone, `done sentinel fired`);
// Budget scales with chapter count — the user's "10 min max" target is
// realistic for a ~6-chapter typical breakdown. 12 chapters is deep-topic
// territory so we allow ~50s/chapter as the parallel ceiling.
const budgetSec = Math.max(600, (sawChaptersTotal || 6) * 60);
check(turn3DurationSec < budgetSec, `turn 3 total duration ${turn3DurationSec.toFixed(0)}s under ${budgetSec}s budget (${sawChaptersTotal} chapters × 60s/chapter ceiling)`);

log(`\n  ${failures === 0 ? '✅ PASS' : `🔴 FAIL (${failures})`}  — event log: ${EVENT_LOG}`);
process.exit(failures > 0 ? 2 : 0);
