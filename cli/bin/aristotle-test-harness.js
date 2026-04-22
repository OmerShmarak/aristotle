// Test-only entry point: renders the real App with a scripted MockEngine
// instead of spawning `claude -p`. Driven by ARISTOTLE_SCRIPT (JSONL path).
// Invoked via `node <path>` (no shebang — tui-test's SWC cache layer
// prepends a hash comment and would push the shebang off line 1).

import React from 'react';
import { render } from 'ink';
import { App } from '../ui/App.js';
import { MockEngine } from '../lib/mock-engine.js';

const scriptPath = process.env.ARISTOTLE_SCRIPT;
if (!scriptPath) {
  console.error('ARISTOTLE_SCRIPT env var required (path to JSONL event script)');
  process.exit(2);
}

const topic = process.env.ARISTOTLE_TEST_TOPIC || null;
const filesRoot = process.env.ARISTOTLE_TEST_FILES_ROOT || process.cwd();

const engine = new MockEngine(scriptPath);
await engine.init();

const e = React.createElement;
render(e(App, { engine, banner: '', topic, filesRoot }), {
  exitOnCtrlC: false,
  patchConsole: true,
  // Force interactive mode. tui-test spawns us under a PTY where isTTY is
  // true, but Ink's is-in-ci detection can still demote us to batch mode
  // (writes each tree as a new line instead of live redraws), which would
  // mask animation state — the exact thing our test cares about.
  interactive: true,
});
