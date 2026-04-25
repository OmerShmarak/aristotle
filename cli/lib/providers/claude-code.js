// Claude Code provider — wraps the stream-json CLI parser in the standard
// provider shape: { name, run, check }. Engine talks to providers only
// through this interface, so adding a new provider (e.g. Codex) is a single
// file that implements the same surface.

import { runClaude, checkClaude } from '../claude.js';

export const claudeCodeProvider = {
  name: 'claude-code',
  run: runClaude,
  check: checkClaude,
};
