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
const rawArgs = process.argv.slice(2).filter(a => a !== '--debug');
const topic = rawArgs.join(' ').trim();

if (!topic || topic === '--help' || topic === '-h') {
  printHelp();
  process.exit(topic ? 0 : 1);
}

const bannerText = getBannerText();

// --- Compute breakdown output dir ---
// Start in a short, always-safe placeholder dir. The topic can be an
// arbitrary prose paragraph, so we never derive the dir from it up front
// (that triggers ENAMETOOLONG). The inner agent emits
// %%ARISTOTLE_SLUG:<name>%% at some point during the run; once the whole
// pipeline finishes, the engine renames this directory to that name.
const placeholder = `run-${Date.now().toString(36)}`;
const breakdownDir = resolve(PROJECT_ROOT, 'artifacts', placeholder);
mkdirSync(breakdownDir, { recursive: true });

// --- Create session (for debug logs) ---
const { id: sessionId, sessionDir } = createSession({ topic, breakdownDir });

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
render(e(App, { engine, banner: bannerText, topic, sessionId }), {
  exitOnCtrlC: false,
  patchConsole: true,
});
