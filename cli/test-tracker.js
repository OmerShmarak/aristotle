/**
 * Unit tests for:
 *   1. claude.js translate() — raw stream-json → normalized events
 *   2. tracker.js ChapterTracker — sentinel-driven progress tracking
 */

import { translate } from './lib/claude.js';
import { ChapterTracker } from './lib/tracker.js';
import { Engine } from './lib/engine.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  console.error(`  ${name}`);
  fn();
}

// ========================================
// Part 1: translate()
// ========================================
console.error('\n— translate() —');

test('system/init → init event', () => {
  const events = translate({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus', tools: ['Read'], claude_code_version: '2.1.114' });
  assert(events.length === 1 && events[0].type === 'init', 'init event');
});

test('system/task_started → task_started', () => {
  const events = translate({ type: 'system', subtype: 'task_started', task_id: 'abc', tool_use_id: 'toolu_x', description: 'Write Ch 1' });
  assert(events[0].type === 'task_started' && events[0].toolUseId === 'toolu_x', 'task_started');
});

test('system/task_notification is ignored', () => {
  const events = translate({ type: 'system', subtype: 'task_notification', task_id: 'abc', tool_use_id: 'toolu_x', status: 'completed', summary: 'Ch 1' });
  assert(events.length === 0, 'task_notification ignored');
});

test('stream_event text_delta → text', () => {
  const events = translate({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } } });
  assert(events[0].type === 'text' && events[0].text === 'hi', 'text event');
});

test('assistant stop=null → no events', () => {
  assert(translate({ type: 'assistant', parent_tool_use_id: null, message: { stop_reason: null, content: [] } }).length === 0, 'partial skipped');
});

test('result → result event', () => {
  const events = translate({ type: 'result', subtype: 'success', is_error: false, session_id: 's1', result: 'Done', total_cost_usd: 0.05, num_turns: 3, duration_ms: 5000 });
  assert(events[0].ok === true, 'ok');
});

// ========================================
// Part 2: ChapterTracker
// ========================================
console.error('\n— ChapterTracker —');

test('setTotal stores count', () => {
  const t = new ChapterTracker();
  t.setTotal(7);
  assert(t.totalCount === 7, 'total 7');
});

test('markDone dedupes', () => {
  const t = new ChapterTracker();
  t.setTotal(7);
  t.markDone('01-intro');
  t.markDone('01-intro');
  t.markDone('02-core');
  assert(t.completedCount === 2, '2 unique chapters');
});

test('reset clears state', () => {
  const t = new ChapterTracker();
  t.setTotal(7);
  t.markDone('01-intro');
  t.reset();
  assert(t.totalCount === 0 && t.completedCount === 0, 'cleared');
});

test('ignores empty ids and non-positive totals', () => {
  const t = new ChapterTracker();
  t.setTotal(0);
  t.setTotal(-1);
  t.setTotal('nope');
  t.markDone('');
  t.markDone(null);
  assert(t.totalCount === 0 && t.completedCount === 0, 'no state change');
});

test('onChange callback fires on each change', () => {
  const t = new ChapterTracker();
  let changed = 0;
  t.onChange = () => changed++;
  t.setTotal(3);
  t.markDone('a');
  t.markDone('a'); // dedup, no fire
  t.markDone('b');
  assert(changed === 3, 'onChange fired 3 times');
});

test('full 3-chapter flow', () => {
  const t = new ChapterTracker();
  t.setTotal(3);
  t.markDone('ch1');
  t.markDone('ch2');
  t.markDone('ch3');
  assert(t.totalCount === 3 && t.completedCount === 3, '3/3 done');
});

// ========================================
// Part 3: Engine sentinel parsing
// ========================================
console.error('\n— Engine sentinels —');

// Feed synthetic text events through _handleEvent (bypassing send/init).
// Sentinels should surface as 'chapters_total' / 'chapter_done' / 'done'
// events; non-sentinel text should pass through cleanly.
function makeEngine() {
  const eng = new Engine('/tmp');
  eng.phase = 'planning';
  eng._streamBuffer = '';
  eng._donePath = null;
  return eng;
}

function collect(eng) {
  const out = { text: [], total: null, done: [], artifact: null };
  eng.on('text', (e) => out.text.push(e.text));
  eng.on('chapters_total', (e) => { out.total = e.total; });
  eng.on('chapter_done', (e) => out.done.push(e.id));
  return out;
}

test('total sentinel in single chunk', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: 'ok %%ARISTOTLE_CHAPTERS_TOTAL:7%% go\n', parentToolUseId: null });
  eng._flushStream();
  assert(out.total === 7, 'total=7');
  assert(out.text.join('').includes('ok ') && !out.text.join('').includes('%%'), 'sentinel stripped from text');
});

test('sentinel split across two chunks', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: 'pre %%ARISTOTLE_CHAPTER_', parentToolUseId: null });
  eng._handleEvent({ type: 'text', text: 'DONE:03-slug%% post', parentToolUseId: null });
  eng._flushStream();
  assert(out.done.length === 1 && out.done[0] === '03-slug', 'chapter done id extracted');
  assert(out.text.join('').replace(/\s+/g, ' ').includes('pre  post') || out.text.join('').includes('pre '), 'non-sentinel text preserved');
});

test('three chapter_done sentinels in one chunk', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: '%%ARISTOTLE_CHAPTER_DONE:1%%%%ARISTOTLE_CHAPTER_DONE:2%%%%ARISTOTLE_CHAPTER_DONE:3%%', parentToolUseId: null });
  eng._flushStream();
  assert(out.done.length === 3, '3 chapter_done events');
});

test('done sentinel sets artifact path', () => {
  const eng = makeEngine();
  collect(eng);
  eng._handleEvent({ type: 'text', text: 'All done. %%ARISTOTLE_DONE:ml/breakdown.html%%', parentToolUseId: null });
  eng._flushStream();
  assert(eng._donePath === 'ml/breakdown.html', 'done path stored');
});

test('sub-agent text is forwarded verbatim (no sentinel scanning)', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: '%%ARISTOTLE_CHAPTER_DONE:fake%%', parentToolUseId: 'toolu_sub' });
  assert(out.done.length === 0, 'sub-agent text does not trigger sentinel');
  assert(out.text.join('').includes('%%ARISTOTLE_CHAPTER_DONE:fake%%'), 'passed through as text');
});

test('sentinel split at the `%%` boundary (single % trailing chunk)', () => {
  // The 2.1.114 regression: the model streamed the DONE sentinel as
  //   "...chapters.\n\n%" + "%ARISTOTLE_DONE:breakdown.html%%"
  // The single trailing `%` must be treated as a potential partial.
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: 'Build succeeded. breakdown.html at 20K.\n\n%', parentToolUseId: null });
  eng._handleEvent({ type: 'text', text: '%ARISTOTLE_DONE:x/breakdown.html%%', parentToolUseId: null });
  eng._flushStream();
  assert(eng._donePath === 'x/breakdown.html', 'done sentinel reassembled across split %%');
  assert(!out.text.join('').includes('%%'), 'no %% leaked to display');
});

test('ordinary % in prose does not stall output', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: '50% off today. More text.', parentToolUseId: null });
  eng._flushStream();
  assert(out.text.join('') === '50% off today. More text.', 'prose flushed intact');
});

test('sentinel split into four chunks including the opening %%', () => {
  const eng = makeEngine();
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: 'prefix %', parentToolUseId: null });
  eng._handleEvent({ type: 'text', text: '%ARISTOTLE_CHAPTER', parentToolUseId: null });
  eng._handleEvent({ type: 'text', text: '_DONE:03', parentToolUseId: null });
  eng._handleEvent({ type: 'text', text: '-slug%%', parentToolUseId: null });
  eng._flushStream();
  assert(out.done.includes('03-slug'), 'reassembled across 4 chunks');
  assert(!out.text.join('').includes('ARISTOTLE'), 'no sentinel leak');
});

test('text during writing phase does not display but still parses sentinels', () => {
  const eng = makeEngine();
  eng.phase = 'writing';
  const out = collect(eng);
  eng._handleEvent({ type: 'text', text: 'chatter %%ARISTOTLE_CHAPTER_DONE:5%% more', parentToolUseId: null });
  eng._flushStream();
  assert(out.done.includes('5'), 'sentinel parsed in writing phase');
  assert(out.text.length === 0, 'no text emitted in writing phase');
});

// ========================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
