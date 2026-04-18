#!/usr/bin/env node

import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import { App } from '../ui/App.js';
import { Engine } from '../lib/engine.js';

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

// --- Init engine ---
const engine = new Engine(PROJECT_ROOT);
try {
  await engine.init();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// --- Render TUI ---
const e = React.createElement;
render(e(App, { engine, banner: bannerText, topic }), {
  exitOnCtrlC: true,
  patchConsole: true,
});
