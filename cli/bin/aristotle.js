#!/usr/bin/env node

import { resolve, dirname } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import { App } from '../ui/App.js';
import { Engine } from '../lib/engine.js';
import { createSession } from '../lib/session.js';
import { getBannerText, printHelp } from '../lib/theme.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// --- Parse args ---
// Any positional argument is treated as an auto-send first message. No args
// → chat mode with an empty input box.
const rawArgs = process.argv.slice(2).filter(a => a !== '--debug');
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  printHelp();
  process.exit(0);
}
const topic = rawArgs.join(' ').trim() || null;

const bannerText = getBannerText();

// --- Compute breakdown output dir ---
// Start in a short, always-safe placeholder dir. Once the inner agent emits
// %%ARISTOTLE_SLUG:<name>%% and the build completes, the engine renames the
// dir to artifacts/<name>.
const placeholder = `run-${Date.now().toString(36)}`;
const breakdownDir = resolve(PROJECT_ROOT, 'artifacts', placeholder);
mkdirSync(breakdownDir, { recursive: true });

// --- Create session (for debug logs) ---
const { id: sessionId, sessionDir } = createSession({ topic: topic || '(chat)', breakdownDir });

// --- Init engine ---
const engine = new Engine(PROJECT_ROOT, breakdownDir, sessionDir);
let claudeVersion = null;
try {
  claudeVersion = await engine.init();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Backfill claude version into meta.json now that we have it.
try {
  const metaPath = resolve(sessionDir, 'meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  meta.claudeVersion = claudeVersion;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
} catch { /* non-fatal */ }

// --- Render TUI ---
const e = React.createElement;
// File tagging is scoped to the artifacts directory — that's where every
// breakdown lives, so it's the only tree the user cares about referencing.
const filesRoot = resolve(PROJECT_ROOT, 'artifacts');

render(e(App, {
  engine,
  banner: bannerText,
  topic,
  sessionId,
  filesRoot,
}), {
  exitOnCtrlC: false,
  patchConsole: true,
});
