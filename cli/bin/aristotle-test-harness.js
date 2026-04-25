// Test-only entry point: renders the real App with a scripted MockEngine
// instead of spawning `claude -p`. Driven by ARISTOTLE_SCRIPT (JSONL path).
// Invoked via `node <path>` (no shebang — tui-test's SWC cache layer
// prepends a hash comment and would push the shebang off line 1).

import React from 'react';
import { readFileSync } from 'fs';
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

// Optional resume-picker fixtures so tests can exercise the SessionPicker
// without touching the real ~/.aristotle directory.
const showPicker = process.env.ARISTOTLE_TEST_SHOW_PICKER === '1';
const sessionsFile = process.env.ARISTOTLE_TEST_SESSIONS_FILE;
const messagesFile = process.env.ARISTOTLE_TEST_INITIAL_MESSAGES_FILE;
const fakeSessions = sessionsFile ? JSON.parse(readFileSync(sessionsFile, 'utf-8')) : [];
const initialMessages = messagesFile ? JSON.parse(readFileSync(messagesFile, 'utf-8')) : null;

const sessionsApi = {
  listSessions: () => fakeSessions,
  loadSessionMessages: (id) => {
    const found = fakeSessions.find(s => s.id === id);
    return found?.messages || [];
  },
};

const e = React.createElement;
render(e(App, {
  engine,
  banner: '',
  topic,
  filesRoot,
  showPicker,
  initialMessages,
  sessionsApi,
}), {
  exitOnCtrlC: false,
  patchConsole: true,
  // Force interactive mode. tui-test spawns us under a PTY where isTTY is
  // true, but Ink's is-in-ci detection can still demote us to batch mode
  // (writes each tree as a new line instead of live redraws), which would
  // mask animation state — the exact thing our test cares about.
  interactive: true,
});
