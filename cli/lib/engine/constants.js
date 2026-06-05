export const PROBE_APPROVAL_PROMPT =
  'Before doing anything else, ask me for approval to run the Bash command `pwd` by using your AskUserQuestion mechanism. After I answer, if approved, run `pwd` and report the working directory in one sentence.';

export const SENTINEL_RE = /%%ARISTOTLE_[A-Z_]+:[^%\n]*%%/g;
export const TOTAL_RE = /^%%ARISTOTLE_CHAPTERS_TOTAL:(\d+)%%$/;
export const CHAPTER_DONE_RE = /^%%ARISTOTLE_CHAPTER_DONE:([^%]+)%%$/;
export const DONE_RE = /^%%ARISTOTLE_DONE:(.+?)%%$/;
export const SLUG_RE = /^%%ARISTOTLE_SLUG:([^%]+)%%$/;
export const MAX_PARTIAL_LEN = 120;

// Per-turn watchdog limits for the inner `claude -p` process. Until these
// existed, a single turn was unbounded: in session 20260530-171604-749a a
// chapter-writing subagent wedged and the turn ran 41 hours, emitting nothing,
// until the user hit Ctrl-C ($114 of wasted compute).
//
//   IDLE — kill the turn if the process produces no output for this long.
//          Targets the exact failure mode: total silence from a hung subagent.
//   HARD — kill the turn if it runs longer than this regardless of activity.
//          Backstop against a runaway loop that keeps emitting but never ends.
//
// Both are generous (a real book build is many parallel chapter agents) and
// overridable via env for unusually large builds or debugging. Set to 0 (or
// "off") to disable a limit entirely.
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of silence
export const DEFAULT_HARD_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes per turn

// Parse a millisecond timeout from an env var. Empty/undefined → fallback;
// "0"/"off"/"none" → 0 (disabled); a positive integer → that value; anything
// else → fallback (don't silently disable the safety net on a typo).
export function parseTimeoutMs(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const trimmed = String(raw).trim().toLowerCase();
  if (trimmed === '0' || trimmed === 'off' || trimmed === 'none') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
