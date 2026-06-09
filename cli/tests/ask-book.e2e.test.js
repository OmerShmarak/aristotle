// Plain Node test. Run with:
//   node tests/ask-book.e2e.test.js
//
// End-to-end for "ask the book" through a REAL browser (puppeteer), with a
// fake `claude` shim on PATH so it's deterministic and free:
//
//   build-book.sh (real)  →  breakdown.html with the injected widget
//   ask-server (real)     →  serves the book, spawns "claude" per ask
//   fake claude (shim)    →  echoes the prompt back as stream-json; for
//                            revise requests it actually edits chapter 1's
//                            markdown, so the server's rebuild is observable
//   puppeteer (real)      →  selects text, clicks the chip, types a
//                            question, asserts the streamed answer; then
//                            files a complaint, waits through the rebuild
//                            reload, asserts the revised content rendered
//
// What this proves: widget injection, selection→chip→panel UX, SSE
// streaming into the DOM, prompt plumbing (selection + chapter + question
// all reach claude), the revise→edit→rebuild→reload loop, and the
// post-reload toast. What it doesn't prove: answer quality (that's the live
// run's job).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
// puppeteer lives in the ROOT package (verifiers use it), not in cli/.
const puppeteer = createRequire(resolve(PROJECT_ROOT, 'package.json'))('puppeteer');

const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-askbook-'));
const bookDir = resolve(tmp, 'book');
const binDir = resolve(tmp, 'bin');

// --- 1. Fixture book ---
mkdirSync(resolve(bookDir, 'chapters'), { recursive: true });
writeFileSync(resolve(bookDir, 'outline.md'), '# Test Book from First Principles\n');
writeFileSync(resolve(bookDir, 'chapters', '01-vectors.md'),
  '# Vectors as arrows\n\nA vector is an arrow with a length and a direction, nothing more.\n\nThe zero vector is the arrow that goes nowhere at all.\n');
writeFileSync(resolve(bookDir, 'chapters', '02-matrices.md'),
  '# Matrices as machines\n\nEvery matrix is a machine that eats a vector and spits out a vector.\n');

const build = spawnSync('bash', [resolve(PROJECT_ROOT, 'build-book.sh'), bookDir], { encoding: 'utf8' });
assert.equal(build.status, 0, `build-book.sh failed: ${build.stderr}`);
assert.ok(readFileSync(resolve(bookDir, 'breakdown.html'), 'utf8').includes('data-aristotle-ask'),
  'widget must be injected into breakdown.html');
console.log('ok: build-book.sh injects the ask widget');

// --- 2. Fake claude shim ---
mkdirSync(binDir, { recursive: true });
writeFileSync(resolve(binDir, 'claude'), `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake-claude 0.0"); process.exit(0); }
const p = args[args.indexOf("-p") + 1] || "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "fake-sess-1" });
const isRevise = p.includes("Reader's complaint:");
if (isRevise) {
  const file = "chapters/" + fs.readdirSync("chapters").filter((f) => f.startsWith("01"))[0];
  fs.appendFileSync(file, "\\n\\nREVISED-BY-FAKE-CLAUDE marker paragraph.\\n");
}
const answer = (isRevise ? "Edited the chapter. " : "") + "ANSWER[" + p.replace(/\\s+/g, " ") + "]";
for (const chunk of [answer.slice(0, 25), answer.slice(25)]) {
  out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: chunk } }, parent_tool_use_id: null });
}
out({ type: "result", is_error: false, session_id: "fake-sess-1", result: answer });
`);
chmodSync(resolve(binDir, 'claude'), 0o755);
process.env.PATH = `${binDir}:${process.env.PATH}`;

// --- 3. Server + browser ---
const { startAskServer } = await import('../lib/ask-server.js');
const srv = await startAskServer({ breakdownDir: bookDir, projectRoot: PROJECT_ROOT, port: 0 });

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(srv.url, { waitUntil: 'load' });

  // health endpoint
  const health = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
  assert.equal(health.ok, true);
  console.log('ok: server serves the book and /health');

  await page.waitForSelector('.arq-launcher');

  // --- ask flow: select a sentence in chapter 1 → chip → question → answer ---
  await page.evaluate(() => {
    const p = document.querySelector('#ch-01 p');
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForSelector('.arq-chip', { visible: true });
  console.log('ok: selection shows the Ask chip');

  await page.click('.arq-chip');
  await page.waitForSelector('.arq-panel', { visible: true });
  await page.type('.arq-ta', 'What is a vector, really?');
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    () => document.querySelector('.arq-panel').innerText.includes('ANSWER['),
    { timeout: 15000 },
  );
  const panelText = await page.$eval('.arq-panel', (n) => n.innerText);
  assert.ok(panelText.includes('Question: What is a vector, really?'), 'question must reach claude');
  assert.ok(panelText.includes('arrow with a length and a direction'), 'selection must reach claude');
  assert.ok(panelText.includes('Chapter 1: Vectors as arrows'), 'chapter attribution must reach claude');
  console.log('ok: ask streams an answer carrying selection + chapter + question');

  // --- revise flow: complaint → fake claude edits md → rebuild → reload ---
  const navigation = page.waitForNavigation({ timeout: 30000 });
  await page.type('.arq-ta', 'This chapter is boring, add a marker.');
  await page.click('.arq-fix');
  await navigation;

  await page.waitForSelector('.arq-toast');
  const body = await page.$eval('body', (n) => n.innerText);
  assert.ok(body.includes('REVISED-BY-FAKE-CLAUDE'), 'revised chapter content must render after reload');
  assert.ok(
    readFileSync(resolve(bookDir, 'chapters', '01-vectors.md'), 'utf8').includes('REVISED-BY-FAKE-CLAUDE'),
    'chapter markdown must be edited on disk',
  );
  console.log('ok: revise edits the chapter, rebuilds, reloads, and shows the toast');
} finally {
  await browser.close();
  await srv.close();
  rmSync(tmp, { recursive: true, force: true });
}
