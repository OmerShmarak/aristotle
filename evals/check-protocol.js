// Protocol checker for BREAKDOWN.md.
//
// Takes a claude.jsonl transcript (raw stream-json, optionally ISO-prefixed —
// the format both ~/.aristotle/sessions/<id>/claude.jsonl and the eval runner
// produce) and asserts the conversation obeyed the Aristotle protocol:
// diagnosis asks instead of teaches, the outline asks for approval, chapter
// agents spawn in parallel after approval, sentinels are well-formed and
// correctly ordered.
//
// Usage:
//   node evals/check-protocol.js <claude.jsonl> [--through outline|done] [--json]
//
// Exit 0 = protocol respected (warnings allowed). Exit 1 = violations.
//
// The checks are heuristics over assistant text — they catch the failure
// modes BREAKDOWN.md explicitly forbids (its "What you must NEVER do" list),
// not every conceivable misbehaviour. Keep them blunt and low-false-positive:
// a flaky eval is worse than a narrow one.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  SENTINEL_RE,
  TOTAL_RE,
  CHAPTER_DONE_RE,
  DONE_RE,
  SLUG_RE,
} from '../cli/lib/engine/constants.js';

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T\S+\s+/;

// Diagnosis turns are calibration questions plus, at most, a boundary
// summary ("you're solid on X, Y — starting at Z"). Real sessions run
// 300-450 words there legitimately; a model that pivoted into chat-teacher
// mode produces far more. So: soft cap warns, hard cap fails.
const DIAGNOSIS_WARN_WORDS = 350;
const DIAGNOSIS_MAX_WORDS = 800;

// Chat-teacher tells in a diagnosis turn (BREAKDOWN.md bans these verbatim).
const TEACHING_TELLS = [
  /^#{1,6}\s/m, // markdown section headers
  /\b(?:Part|Layer|Step)\s+\d+\s*:/, // "Part 1:", "Layer 2:" roadmap-lecturing
  /\bLet's start with\b/i,
];

export function parseTranscript(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed.replace(ISO_PREFIX, '')));
    } catch { /* non-JSON line — skip */ }
  }
  return events;
}

// Group events into "runs" — one per `claude -p` invocation (i.e. one per
// user turn), delimited by system:init. Subagent chatter (parent_tool_use_id
// set) is excluded.
//
// Real transcripts (--include-partial-messages) deliver one assistant event
// PER CONTENT BLOCK, all sharing message.id and all with stop_reason null —
// so a message is reconstructed by concatenating blocks across events with
// the same id. Identical blocks are deduped to also tolerate formats that
// re-deliver the full message at the end.
export function splitRuns(events) {
  const runs = [];
  let current = null;
  const startRun = () => {
    current = { messages: [], byId: new Map() };
    runs.push(current);
  };
  for (const e of events) {
    if (e.type === 'system' && e.subtype === 'init') {
      startRun();
      continue;
    }
    if (e.type !== 'assistant' || e.parent_tool_use_id) continue;
    if (!current) startRun();
    const id = e.message?.id || `anon-${runs.length}-${current.messages.length}`;
    let msg = current.byId.get(id);
    if (!msg) {
      msg = { content: [], seen: new Set() };
      current.byId.set(id, msg);
      current.messages.push(msg);
    }
    for (const block of e.message?.content || []) {
      const key = JSON.stringify(block);
      if (msg.seen.has(key)) continue;
      msg.seen.add(key);
      msg.content.push(block);
    }
  }
  return runs
    .map(({ messages }) => ({ messages: messages.map(({ content }) => ({ content })) }))
    .filter((r) => r.messages.length > 0);
}

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
const runText = (run) => run.messages.map(textOf).join('\n');
const isAgentBlock = (b) => b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task');
const agentCount = (msg) => msg.content.filter(isAgentBlock).length;
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

function sentinelsIn(text) {
  return [...text.matchAll(SENTINEL_RE)].map((m) => m[0]);
}

function classifyRuns(runs) {
  const isExecution = (run) =>
    run.messages.some((m) => agentCount(m) > 0)
    || sentinelsIn(runText(run)).some((t) => TOTAL_RE.test(t));

  const firstExecIdx = runs.findIndex(isExecution);

  // Any pre-execution run presenting a numbered chapter list (3+ items) is
  // an outline turn — there can be several (revisions after user feedback).
  // Pre-execution runs before/between them are diagnosis.
  const numberedItems = (text) => (text.match(/^\s*\d+[.)]\s/gm) || []).length;
  const preExecEnd = firstExecIdx === -1 ? runs.length : firstExecIdx;

  return runs.map((run, i) => {
    let role = 'chat';
    if (isExecution(run)) role = 'execution';
    else if (i < preExecEnd && numberedItems(runText(run)) >= 3) role = 'outline';
    else if (i < preExecEnd) role = 'diagnosis';
    return { ...run, role };
  });
}

export function checkTranscript(text, { through = 'done' } = {}) {
  const runs = classifyRuns(splitRuns(parseTranscript(text)));
  const violations = [];
  const warnings = [];
  const fail = (rule, message) => violations.push({ rule, message });
  const warn = (rule, message) => warnings.push({ rule, message });

  const outlineRuns = runs.filter((r) => r.role === 'outline');
  const execRuns = runs.filter((r) => r.role === 'execution');
  const firstExecIdx = runs.findIndex((r) => r.role === 'execution');

  // --- Diagnosis: calibrate, don't teach ---
  for (const [i, run] of runs.entries()) {
    if (run.role !== 'diagnosis') continue;
    const t = runText(run);
    const words = wordCount(t);
    if (words > DIAGNOSIS_MAX_WORDS) {
      fail('diagnosis-teaching-prose', `run ${i + 1}: diagnosis turn is ${words} words (max ${DIAGNOSIS_MAX_WORDS}) — reads like a lecture, not calibration questions`);
    } else if (words > DIAGNOSIS_WARN_WORDS) {
      warn('diagnosis-long', `run ${i + 1}: diagnosis turn is ${words} words — longer than calibration usually needs`);
    }
    for (const tell of TEACHING_TELLS) {
      if (tell.test(t)) {
        fail('diagnosis-teaching-prose', `run ${i + 1}: diagnosis turn matches teaching tell ${tell}`);
        break;
      }
    }
    if (!t.includes('?')) {
      warn('diagnosis-no-question', `run ${i + 1}: diagnosis turn asks no question`);
    }
  }

  // --- Outline: numbered chapters + explicit approval ask ---
  // Several outline turns can exist (revisions after feedback); only the
  // final one must ask for approval.
  if (outlineRuns.length === 0) {
    fail('outline-missing', 'no outline turn found (a numbered chapter list of 3+ items before execution)');
  } else {
    const t = runText(outlineRuns[outlineRuns.length - 1]);
    if (!/approv/i.test(t) || !t.includes('?')) {
      fail('outline-no-approval-ask', 'final outline turn does not explicitly ask for approval');
    }
  }

  // --- No execution before approval ---
  if (through === 'outline') {
    if (execRuns.length > 0) {
      fail('agents-before-approval', 'chapter agents were spawned in an outline-only eval — the model skipped the approval gate');
    }
  } else if (firstExecIdx !== -1) {
    const outlineIdx = runs.findIndex((r) => r.role === 'outline');
    if (outlineIdx === -1 || outlineIdx >= firstExecIdx) {
      fail('agents-before-approval', 'execution started before any outline was presented for approval');
    }
  }

  // --- No execution sentinels during diagnosis/outline ---
  for (const [i, run] of runs.entries()) {
    if (run.role !== 'diagnosis' && run.role !== 'outline') continue;
    for (const token of sentinelsIn(runText(run))) {
      if (TOTAL_RE.test(token) || CHAPTER_DONE_RE.test(token) || DONE_RE.test(token)) {
        fail('premature-sentinel', `run ${i + 1} (${run.role}): emitted ${token} before approval`);
      }
    }
  }

  // --- Sentinels must sit on their own line ---
  for (const [i, run] of runs.entries()) {
    for (const line of runText(run).split('\n')) {
      const tokens = sentinelsIn(line);
      if (tokens.length === 1 && line.trim() === tokens[0]) continue;
      for (const token of tokens) {
        if (line.trim() !== token) {
          fail('sentinel-not-own-line', `run ${i + 1}: sentinel shares a line with other text: ${JSON.stringify(line.trim().slice(0, 100))}`);
        }
      }
    }
  }

  // --- Slug ---
  {
    const slugs = runs.flatMap((r) => sentinelsIn(runText(r)))
      .map((t) => t.match(SLUG_RE)).filter(Boolean).map((m) => m[1].trim());
    if (slugs.length === 0) warn('slug-missing', 'no %%ARISTOTLE_SLUG%% emitted');
    if (slugs.length > 1) warn('slug-duplicate', `slug emitted ${slugs.length} times: ${slugs.join(', ')}`);
    for (const slug of slugs) {
      if (!/^[a-z0-9]+(?:_[a-z0-9]+){0,2}$/.test(slug)) {
        fail('slug-invalid', `slug "${slug}" violates format (max 3 words, [a-z0-9_])`);
      }
    }
  }

  // --- Execution: ordering, parallelism, completeness ---
  if (through === 'done') {
    if (execRuns.length === 0) {
      fail('execution-missing', 'no execution turn found (expected with --through done)');
    } else {
      // Structural checks apply to the FIRST execution run — the approved
      // build. Later execution runs (chat-mode rebuilds, single-chapter
      // edits) legitimately re-emit DONE without a fresh TOTAL.
      const build = execRuns[0];
      const buildTokens = sentinelsIn(runText(build));
      const totalToken = buildTokens.map((t) => t.match(TOTAL_RE)).find(Boolean);
      const total = totalToken ? Number(totalToken[1]) : null;

      if (total == null) {
        fail('total-missing', 'no %%ARISTOTLE_CHAPTERS_TOTAL%% emitted during execution');
      }

      // CHAPTERS_TOTAL must precede the first Agent block (content-block order).
      let sawTotal = false;
      let totalAfterAgents = false;
      outer: for (const msg of build.messages) {
        for (const block of msg.content) {
          if (block.type === 'text' && sentinelsIn(block.text).some((t) => TOTAL_RE.test(t))) sawTotal = true;
          if (isAgentBlock(block) && !sawTotal) { totalAfterAgents = true; break outer; }
        }
      }
      if (total != null && totalAfterAgents) {
        fail('total-after-agents', '%%ARISTOTLE_CHAPTERS_TOTAL%% appeared after chapter agents had already been spawned');
      }

      // Parallel spawning: all N chapter agents in ONE assistant message.
      const maxInOneMessage = Math.max(0, ...build.messages.map(agentCount));
      if (total != null && total >= 2 && maxInOneMessage < total) {
        fail('serial-spawning', `chapter agents spread across messages (max ${maxInOneMessage} in one message, expected all ${total}) — they run sequentially, not in parallel`);
      }

      // Every chapter finalized exactly once.
      const doneIds = buildTokens.map((t) => t.match(CHAPTER_DONE_RE)).filter(Boolean).map((m) => m[1].trim());
      const unique = new Set(doneIds);
      if (doneIds.length !== unique.size) {
        fail('chapter-done-duplicate', `duplicate %%ARISTOTLE_CHAPTER_DONE%% ids: ${doneIds.join(', ')}`);
      }
      if (total != null && unique.size !== total) {
        fail('chapter-done-mismatch', `${unique.size} chapters marked done, expected ${total}`);
      }

      // build-book.sh actually ran.
      const ranBuild = build.messages.some((m) => m.content.some(
        (b) => b.type === 'tool_use' && b.name === 'Bash' && String(b.input?.command || '').includes('build-book.sh'),
      ));
      if (!ranBuild) {
        fail('build-script-missing', 'no Bash tool_use invoking build-book.sh found during execution');
      }

      // DONE present, and the very last line of the build run's final message.
      const doneToken = buildTokens.find((t) => DONE_RE.test(t));
      if (!doneToken) {
        fail('done-missing', 'no %%ARISTOTLE_DONE%% emitted');
      } else {
        const lastText = textOf(build.messages[build.messages.length - 1]).trim();
        if (!lastText.endsWith(doneToken)) {
          fail('done-not-last', '%%ARISTOTLE_DONE%% is not the last line of the final execution message');
        }
      }
    }
  }

  const summary = runs.map((r, i) => ({
    run: i + 1,
    role: r.role,
    words: wordCount(runText(r)),
    agentBlocks: r.messages.reduce((n, m) => n + agentCount(m), 0),
    sentinels: sentinelsIn(runText(r)),
  }));

  return { runs: summary, violations, warnings, ok: violations.length === 0 };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const through = args.includes('--through') ? args[args.indexOf('--through') + 1] : 'done';
  const asJson = args.includes('--json');
  if (!file || !['outline', 'done'].includes(through)) {
    console.error('Usage: node evals/check-protocol.js <claude.jsonl> [--through outline|done] [--json]');
    process.exit(2);
  }

  const report = checkTranscript(readFileSync(file, 'utf8'), { through });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const r of report.runs) {
      const sentinels = r.sentinels.length ? `  [${r.sentinels.join(' ')}]` : '';
      console.log(`run ${r.run}: ${r.role} — ${r.words} words, ${r.agentBlocks} agent blocks${sentinels}`);
    }
    for (const w of report.warnings) console.log(`⚠ ${w.rule}: ${w.message}`);
    for (const v of report.violations) console.log(`✗ ${v.rule}: ${v.message}`);
    console.log(report.ok
      ? `PASS — protocol respected (${report.warnings.length} warning(s))`
      : `FAIL — ${report.violations.length} violation(s)`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
