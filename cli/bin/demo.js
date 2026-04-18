#!/usr/bin/env node
/**
 * Demo mode — runs the TUI with a mock engine that emits fake text.
 * Usage: node cli/bin/demo.js [--chunky | --smooth]
 *
 * --chunky: simulates how claude actually sends tokens (bursty, uneven)
 * --smooth: simulates the smoothed output (for comparison)
 */

import React from 'react';
import { render } from 'ink';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { App } from '../ui/App.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_TEXT = `Let me figure out where you're starting from. I have a few quick questions:

**Background** — pick the closest:
  (a) No science/math background
  (b) Basic math and science
  (c) Technical (engineer, developer, etc.)
  (d) Domain expert in a related field

**How you learn best** — pick all that apply:
  (a) First-principles reasoning — need to know *why* before *what*
  (b) Examples and analogies first, theory after
  (c) Visual — diagrams and charts help a lot
  (d) Dense and fast — don't over-explain

What's your pick?`;

// Simulate bursty token delivery (how Claude actually sends them)
function* chunkyTokens(text) {
  let i = 0;
  while (i < text.length) {
    // Random chunk size: 1-15 chars, with random pauses
    const size = 1 + Math.floor(Math.random() * 14);
    yield { chunk: text.slice(i, i + size), delay: 30 + Math.random() * 200 };
    i += size;
  }
}

class MockEngine extends EventEmitter {
  constructor() {
    super();
    this.sessionId = 'demo-session';
    this.phase = 'idle';
  }

  async init() { return '2.1.76 (demo)'; }

  async send(message) {
    this.emit('phase', { phase: 'planning' });
    this.emit('status', { message: 'Designing the breakdown...' });

    // Simulate thinking delay
    await sleep(1500);

    // Stream text in bursty chunks (like real Claude)
    for (const { chunk, delay } of chunkyTokens(SAMPLE_TEXT)) {
      this.emit('text', { text: chunk, parentToolUseId: null });
      await sleep(delay);
    }

    this.emit('turn_end');
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Load banner
let bannerText = '';
try {
  bannerText = readFileSync(resolve(__dirname, '..', 'aristotle.txt'), 'utf-8');
} catch {}

const engine = new MockEngine();
const e = React.createElement;
render(e(App, { engine, banner: bannerText, topic: 'demo mode' }), {
  exitOnCtrlC: true,
  patchConsole: true,
});
