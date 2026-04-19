export const PROBE_APPROVAL_PROMPT =
  'Before doing anything else, ask me for approval to run the Bash command `pwd` by using your AskUserQuestion mechanism. After I answer, if approved, run `pwd` and report the working directory in one sentence.';

export const SENTINEL_RE = /%%ARISTOTLE_[A-Z_]+:[^%\n]*%%/g;
export const TOTAL_RE = /^%%ARISTOTLE_CHAPTERS_TOTAL:(\d+)%%$/;
export const CHAPTER_DONE_RE = /^%%ARISTOTLE_CHAPTER_DONE:([^%]+)%%$/;
export const DONE_RE = /^%%ARISTOTLE_DONE:(.+?)%%$/;
export const MAX_PARTIAL_LEN = 120;
