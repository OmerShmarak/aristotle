/**
 * TUI observability test — actually runs aristotle under a PTY, captures
 * every stdout chunk with a timestamp, and scans for static windows.
 *
 * Ink redraws its live area on every state change (typically multiple times
 * per second whenever a spinner or progress bar is active). So any gap >1s
 * in stdout output means NOTHING was animating — the display was static.
 * That's the "50 seconds of nothing" bug the user sees.
 */
import pty from 'node-pty';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, appendFileSync, rmSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const BIN = resolve(__dirname, 'bin/aristotle.js');
const TOPIC = process.argv[2] || 'coin flips';
const STDOUT_LOG = `/tmp/aristotle-tui-${Date.now()}.log`;
const JSON_LOG = STDOUT_LOG + '.chunks.jsonl';
const STATIC_GAP_MS = 1200; // gap longer than this = static window

writeFileSync(STDOUT_LOG, '');
writeFileSync(JSON_LOG, '');

const startedAt = Date.now();
function ts() { return ((Date.now() - startedAt) / 1000).toFixed(2).padStart(7) + 's'; }
function log(...a) { process.stderr.write(`[${ts()}] ` + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); }

log(`topic: ${TOPIC}`);
log(`stdout log: ${STDOUT_LOG}`);
log(`chunk log:  ${JSON_LOG}`);

// Spawn aristotle under a PTY so Ink renders like a real terminal.
const term = pty.spawn(process.execPath, [BIN, TOPIC], {
  name: 'xterm-256color',
  cols: 120,
  rows: 40,
  cwd: '/tmp',
  env: { ...process.env, FORCE_COLOR: '1' },
});

let chunks = [];
let lastChunkAt = Date.now();
let sawDoneHint = false;
let sawError = false;

term.onData((data) => {
  const now = Date.now();
  const gap = now - lastChunkAt;
  const stripped = data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[()][0-9A-Za-z]/g, '');
  chunks.push({ t: now - startedAt, gap, bytes: data.length, textLen: stripped.length, preview: stripped.slice(0, 120) });
  appendFileSync(STDOUT_LOG, data);
  appendFileSync(JSON_LOG, JSON.stringify({ t: now - startedAt, gap, bytes: data.length, preview: stripped.slice(0, 120) }) + '\n');
  lastChunkAt = now;
  if (/Book ready|open .*breakdown\.html|%%ARISTOTLE_DONE/i.test(stripped)) sawDoneHint = true;
  if (/error|exception/i.test(stripped)) sawError = true;
});

let exited = false;
term.onExit(({ exitCode, signal }) => {
  exited = true;
  log(`pty exited (code=${exitCode}, signal=${signal})`);
});

// Scripted input: wait for prompt, send, wait, repeat.
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitForText(needle, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`pty exited while waiting for: ${description}`);
    // Scan all chunk previews for the needle (accumulate).
    const all = chunks.map(c => c.preview).join(' ');
    if (needle instanceof RegExp ? needle.test(all) : all.includes(needle)) return;
    await sleep(250);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for: ${description}`);
}

function send(text) {
  log(`→ send: ${JSON.stringify(text)}`);
  term.write(text + '\r');
}

try {
  // Turn 1: topic is already the CLI arg. App auto-sends "I want to learn about: <topic>".
  // Wait for diagnosis questions to appear.
  await waitForText(/question|know|diagnos|calibrat/i, 45_000, 'diagnosis questions');
  log('  diagnosis rendered');

  // Turn 2: admit ignorance.
  await sleep(1500);
  send("I don't know any of the answers");

  // Wait for the outline + approval ask.
  await waitForText(/outline|chapter|approve|sound good|sound right/i, 90_000, 'outline with approval ask');
  log('  outline rendered');

  // Turn 3: approval. THIS is the moment the user complained about —
  // the 50s dead time after "ok".
  await sleep(1500);
  send('ok');

  // Wait for completion (or timeout). While waiting, keep capturing.
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline && !exited && !sawDoneHint) {
    await sleep(2000);
  }
  log(`completion: exited=${exited} sawDoneHint=${sawDoneHint}`);
} catch (err) {
  log(`FAIL during script: ${err.message}`);
} finally {
  await sleep(1000);
  if (!exited) term.kill();
  await sleep(500);
}

// --- Analyze ---
log('\n— chunk analysis —');
log(`total chunks: ${chunks.length}`);
const totalDur = chunks.length ? chunks[chunks.length - 1].t : 0;
log(`total duration: ${(totalDur / 1000).toFixed(1)}s`);

// Find gaps exceeding STATIC_GAP_MS.
const gaps = chunks
  .map((c, i) => ({ ...c, prev: i > 0 ? chunks[i - 1] : null }))
  .filter(c => c.gap > STATIC_GAP_MS);

log(`static windows (gap > ${STATIC_GAP_MS}ms): ${gaps.length}`);
gaps.slice(0, 20).forEach(g => {
  const at = (g.t / 1000).toFixed(2) + 's';
  log(`  @ ${at}  gap=${(g.gap / 1000).toFixed(2)}s  next="${g.preview.trim().slice(0, 80).replace(/\n/g, ' ⏎ ')}"`);
});

const longest = gaps.reduce((m, g) => g.gap > m.gap ? g : m, { gap: 0 });
log(`longest static window: ${(longest.gap / 1000).toFixed(2)}s @ ${(longest.t / 1000).toFixed(2)}s`);

// Pass/fail
const MAX_ALLOWED_GAP_S = 2.0;
const fail = gaps.filter(g => g.gap > MAX_ALLOWED_GAP_S * 1000);
if (fail.length === 0) {
  log(`\n  ✅ PASS — no static window > ${MAX_ALLOWED_GAP_S}s`);
  process.exit(0);
} else {
  log(`\n  🔴 FAIL — ${fail.length} windows exceeded ${MAX_ALLOWED_GAP_S}s of static display`);
  log(`  artifacts: ${STDOUT_LOG}, ${JSON_LOG}`);
  process.exit(2);
}
