#!/usr/bin/env node

import { resolve, dirname } from 'path';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import { App } from '../ui/App.js';
import { Engine } from '../lib/engine.js';
import { createSession } from '../lib/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// --- Parse args ---
const rawArgs = process.argv.slice(2).filter(a => a !== '--debug');
const topic = rawArgs.join(' ').trim();

if (!topic || topic === '--help' || topic === '-h') {
  // Show help without Ink
  const { banner } = await import('../lib/theme.js');
  banner();
  const { colors } = await import('../lib/theme.js');
  console.log(colors.text('  Usage: aristotle <topic>\n'));
  console.log(colors.muted('  Examples:'));
  console.log(colors.muted('    aristotle "machine learning"'));
  console.log(colors.muted('    aristotle "quantum mechanics"'));
  console.log(colors.muted('    aristotle "music theory"\n'));
  process.exit(topic ? 0 : 1);
}

// --- Load banner text ---
let bannerText = '';
try {
  bannerText = readFileSync(resolve(__dirname, '..', 'aristotle.txt'), 'utf-8');
} catch { /* no art */ }

// --- Compute breakdown output dir ---
// Always write to PROJECT_ROOT/artifacts/<slug> so books live with the repo.
// Claude Code's parent-walk will surface aristotle's CLAUDE.md into the inner
// agent's context; the system prompt in engine.js tells it to ignore
// leaked dev-facing instructions.
const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'breakdown';
const breakdownDir = resolve(PROJECT_ROOT, 'artifacts', slug);
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
  exitOnCtrlC: true,
  patchConsole: true,
});
