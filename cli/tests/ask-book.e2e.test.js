// Plain Node test. Run with:
//   node tests/ask-book.e2e.test.js
//
// End-to-end for "ask the book" through a REAL browser (puppeteer), with a
// fake `claude` shim on PATH so it's deterministic and free.
//
// Covered:
//   - build-book.sh injects the widget; --no-ask-widget omits it (Kobo/EPUB
//     export builds stay clean)
//   - the widget mounts ONLY after /health answers (zero footprint without
//     a server)
//   - selection → chip → panel; question + selection + chapter reach claude
//   - the system prompt carries the book's own syllabus + chapter listing
//     (dynamic per book, nothing hardcoded)
//   - rolling --resume across messages; "+ New" resets the conversation
//   - spinner/activity row appears while working, shows tool activity
//   - a change request (shim edits the chapter md) → server detects the
//     edit via mtime → rebuilds → page reloads → toast + revised content

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
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
const argsLog = resolve(bookDir, 'args.log');

const buildBook = (...flags) =>
  spawnSync('bash', [resolve(PROJECT_ROOT, 'build-book.sh'), bookDir, ...flags], { encoding: 'utf8' });

// --- 1. Fixture book + widget injection / omission ---
mkdirSync(resolve(bookDir, 'chapters'), { recursive: true });
writeFileSync(resolve(bookDir, 'outline.md'),
  '# Test Book from First Principles\n\n## Roadmap\nvectors → matrices\n\n1. Vectors as arrows\n2. Matrices as machines\n');
writeFileSync(resolve(bookDir, 'chapters', '01-vectors.md'),
  '# Vectors as arrows\n\nA vector is an arrow with a length and a direction, nothing more.\n\nThe zero vector is the arrow that goes nowhere at all.\n');
writeFileSync(resolve(bookDir, 'chapters', '02-matrices.md'),
  '# Matrices as machines\n\nEvery matrix is a machine that eats a vector and spits out a vector.\n');

assert.equal(buildBook('--no-ask-widget').status, 0);
assert.ok(!readFileSync(resolve(bookDir, 'breakdown.html'), 'utf8').includes('data-aristotle-ask'),
  '--no-ask-widget build must contain no widget (clean export for Kobo/EPUB)');
assert.equal(buildBook().status, 0);
assert.ok(readFileSync(resolve(bookDir, 'breakdown.html'), 'utf8').includes('data-aristotle-ask'),
  'default build must inject the widget');
console.log('ok: widget injected by default, omitted with --no-ask-widget');

// --- 2. Fake claude shim ---
mkdirSync(binDir, { recursive: true });
writeFileSync(resolve(binDir, 'claude'), `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake-claude 0.0"); process.exit(0); }
fs.appendFileSync("args.log", JSON.stringify(args) + "\\n");
const p = args[args.indexOf("-p") + 1] || "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "fake-sess-1" });
const isRevise = p.includes("REVISE_PLEASE");
if (isRevise) {
  out({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", id: "tu1", name: "Edit" } }, parent_tool_use_id: null });
}
setTimeout(() => {
  if (isRevise) {
    const file = "chapters/" + fs.readdirSync("chapters").filter((f) => f.startsWith("01"))[0];
    fs.appendFileSync(file, "\\n\\nREVISED-BY-FAKE-CLAUDE marker paragraph.\\n");
  }
  const answer = (isRevise ? "Edited the chapter. " : "") + "ANSWER[" + p.replace(/\\s+/g, " ") + "]";
  for (const chunk of [answer.slice(0, 25), answer.slice(25)]) {
    out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: chunk } }, parent_tool_use_id: null });
  }
  out({ type: "result", is_error: false, session_id: "fake-sess-1", result: answer });
}, isRevise ? 800 : 0);
`);
chmodSync(resolve(binDir, 'claude'), 0o755);
process.env.PATH = `${binDir}:${process.env.PATH}`;

// --- 3. Server + browser ---
const { startAskServer } = await import('../lib/ask-server.js');
const srv = await startAskServer({ breakdownDir: bookDir, projectRoot: PROJECT_ROOT, port: 0 });

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();

  // gate (negative): without a reachable server the widget must mount nothing.
  // Skipped if something real is listening on the widget's file:// fallback port.
  const fallbackBusy = await fetch('http://127.0.0.1:4517/health').then(() => true, () => false);
  if (!fallbackBusy) {
    await page.goto('file://' + resolve(bookDir, 'breakdown.html'), { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 3200));
    assert.equal(await page.$('.arq-launcher'), null, 'no server → no widget UI');
    console.log('ok: widget mounts nothing without a server (export-safe)');
  } else {
    console.log('skip: port 4517 busy, negative gating check skipped');
  }

  await page.goto(srv.url, { waitUntil: 'load' });
  await page.waitForSelector('.arq-launcher', { timeout: 8000 });
  console.log('ok: widget mounts once /health answers');

  const sendAndAwaitAnswer = async (text) => {
    await page.type('.arq-ta', text);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (q) => Array.from(document.querySelectorAll('.arq-a')).some(
        (a) => !a.classList.contains('arq-streaming') && a.innerText.includes(q)),
      { timeout: 15000 }, text,
    );
  };

  // --- ask flow ---
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
  await page.click('.arq-chip');
  await page.waitForSelector('.arq-panel', { visible: true });
  await sendAndAwaitAnswer('What is a vector, really?');

  const panelText = await page.$eval('.arq-panel', (n) => n.innerText);
  assert.ok(panelText.includes("Reader's message: What is a vector, really?"), 'question must reach claude');
  assert.ok(panelText.includes('arrow with a length and a direction'), 'selection must reach claude');
  assert.ok(panelText.includes('Chapter 1: Vectors as arrows'), 'chapter attribution must reach claude');
  assert.ok(panelText.includes('re: Chapter 1: Vectors as arrows'), 'panel must show which chapter the message is about');
  console.log('ok: unified chat carries selection + chapter + question');

  // dynamic book context in the system prompt
  const firstArgs = JSON.parse(readFileSync(argsLog, 'utf8').trim().split('\n')[0]);
  const sysPrompt = firstArgs[firstArgs.indexOf('--append-system-prompt') + 1];
  assert.ok(sysPrompt.includes('# Syllabus'), 'system prompt must embed the syllabus');
  assert.ok(sysPrompt.includes('Test Book from First Principles'), 'syllabus content must come from THIS book');
  assert.ok(sysPrompt.includes('chapters/01-vectors.md') && sysPrompt.includes('chapters/02-matrices.md'),
    'system prompt must list the chapter files');
  assert.ok(!firstArgs.includes('--resume'), 'first message starts a fresh session');
  console.log('ok: system prompt auto-loads this book’s syllabus + chapter listing');

  // --- rolling session, then "+ New" resets it ---
  await sendAndAwaitAnswer('Follow-up: and the zero vector?');
  const argsLines = () => readFileSync(argsLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(argsLines()[1].includes('--resume'), 'second message must resume the session');

  await page.click('.arq-new');
  await page.waitForFunction(() => document.querySelector('.arq-log').innerText.includes('New conversation'));
  assert.ok(!(await page.$eval('.arq-log', (n) => n.innerText)).includes('ANSWER['), 'New chat must clear the log');
  await sendAndAwaitAnswer('Fresh start question?');
  assert.ok(!argsLines()[2].includes('--resume'), 'message after + New must NOT resume');
  console.log('ok: rolling --resume across messages, + New resets the conversation');

  // --- change request: spinner → tool activity → rebuild → reload → toast ---
  const navigation = page.waitForNavigation({ timeout: 30000 });
  await page.type('.arq-ta', 'REVISE_PLEASE this chapter is boring, punch it up');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.arq-spin', { timeout: 3000 });
  await page.waitForFunction(
    () => document.querySelector('.arq-busy')?.innerText.includes('Editing the chapter'),
    { timeout: 5000 },
  );
  console.log('ok: spinner + live tool activity visible while the agent works');
  await navigation;

  await page.waitForSelector('.arq-toast');
  assert.ok((await page.$eval('body', (n) => n.innerText)).includes('REVISED-BY-FAKE-CLAUDE'),
    'revised chapter content must render after reload');
  assert.ok(readFileSync(resolve(bookDir, 'chapters', '01-vectors.md'), 'utf8').includes('REVISED-BY-FAKE-CLAUDE'),
    'chapter markdown must be edited on disk');
  console.log('ok: change request edits the chapter, server detects + rebuilds, page reloads with toast');
} finally {
  await browser.close();
  await srv.close();
  rmSync(tmp, { recursive: true, force: true });
}
