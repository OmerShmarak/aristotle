#!/usr/bin/env node

import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import { App } from '../ui/App.js';
import { Engine } from '../lib/engine.js';
import { createSession, sessionsDir, readMeta, updateMeta } from '../lib/session.js';
import { listSessions, loadSessionMessages } from '../lib/sessions.js';
import { getBannerText, printHelp } from '../lib/theme.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// --- Parse args ---
const argv = process.argv.slice(2).filter(a => a !== '--debug');
if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

let resumeRequested = false;
let resumeId = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-r' || a === '--resume') {
    resumeRequested = true;
    const next = argv[i + 1];
    if (next && !next.startsWith('-')) {
      resumeId = next;
      i++;
    }
  } else {
    positional.push(a);
  }
}
const topic = positional.join(' ').trim() || null;

// --- Resolve resume target up-front (so -r <id> short-circuits the picker) ---
let resumed = null;
if (resumeRequested && resumeId) {
  const meta = readMeta(sessionsDir(resumeId));
  if (!meta) {
    console.error(`Session not found: ${resumeId}`);
    process.exit(1);
  }
  if (!meta.providerSessionId) {
    console.error(`Session ${resumeId} has no provider resume token (was it ever sent?).`);
    process.exit(1);
  }
  resumed = {
    id: resumeId,
    providerSessionId: meta.providerSessionId,
    breakdownDir: meta.breakdownDir,
    messages: loadSessionMessages(resumeId),
  };
}

// --- Compute breakdown directory ---
// On a fresh run we mint a placeholder. On resume we reuse the original
// session's breakdown dir so the inner agent's cwd matches what it remembers.
let breakdownDir;
if (resumed?.breakdownDir && existsSync(resumed.breakdownDir)) {
  breakdownDir = resumed.breakdownDir;
} else {
  breakdownDir = resolve(PROJECT_ROOT, 'artifacts', `run-${Date.now().toString(36)}`);
  mkdirSync(breakdownDir, { recursive: true });
}

// --- Create session (debug logs always live in a fresh dir) ---
const { id: sessionId, sessionDir } = createSession({
  topic: topic || (resumed ? `(resumed ${resumed.id})` : '(chat)'),
  breakdownDir,
});

// --- Init engine ---
const engine = new Engine(PROJECT_ROOT, breakdownDir, sessionDir);
let claudeVersion = null;
try {
  claudeVersion = await engine.init();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (resumed) {
  engine.setResume({
    sessionId: resumed.providerSessionId,
    breakdownDir: resumed.breakdownDir,
  });
}

updateMeta(sessionDir, { claudeVersion });

// --- Render TUI ---
const e = React.createElement;
const bannerText = getBannerText();
const filesRoot = resolve(PROJECT_ROOT, 'artifacts');

render(e(App, {
  engine,
  banner: bannerText,
  topic,
  sessionId,
  filesRoot,
  initialMessages: resumed?.messages || null,
  showPicker: resumeRequested && !resumed,
  sessionsApi: { listSessions, loadSessionMessages },
}), {
  exitOnCtrlC: false,
  patchConsole: true,
});
