/**
 * Unit tests for:
 *   1. claude.js translate() — raw stream-json → normalized events
 *   2. tracker.js ChapterTracker — normalized events → progress tracking
 */

import { translate } from './lib/claude.js';
import { ChapterTracker } from './lib/tracker.js';

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
  const events = translate({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus', tools: ['Read'], claude_code_version: '2.1.76' });
  assert(events.length === 1 && events[0].type === 'init', 'init event');
});

test('system/task_started → task_started', () => {
  const events = translate({ type: 'system', subtype: 'task_started', task_id: 'abc', tool_use_id: 'toolu_x', description: 'Write Ch 1' });
  assert(events[0].type === 'task_started' && events[0].toolUseId === 'toolu_x', 'task_started');
});

test('system/task_notification → task_completed', () => {
  const events = translate({ type: 'system', subtype: 'task_notification', task_id: 'abc', tool_use_id: 'toolu_x', status: 'completed', summary: 'Ch 1' });
  assert(events[0].type === 'task_completed' && events[0].status === 'completed', 'task_completed');
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

test('tracks task_started', () => {
  const t = new ChapterTracker();
  t.handle({ type: 'task_started', taskId: 't1', toolUseId: 'a1', description: 'Ch 1' });
  t.handle({ type: 'task_started', taskId: 't2', toolUseId: 'a2', description: 'Ch 2' });
  assert(t.spawnedCount === 2, '2 spawned');
});

test('marks completion', () => {
  const t = new ChapterTracker();
  t.handle({ type: 'task_started', taskId: 't1', toolUseId: 'a1', description: 'Ch 1' });
  t.handle({ type: 'task_completed', taskId: 't1', toolUseId: 'a1', status: 'completed', summary: 'Ch 1' });
  assert(t.completedCount === 1, '1 completed');
});

test('ignores non-completed', () => {
  const t = new ChapterTracker();
  t.handle({ type: 'task_started', taskId: 't1', toolUseId: 'a1', description: 'Ch 1' });
  t.handle({ type: 'task_completed', taskId: 't1', toolUseId: 'a1', status: 'failed', summary: '' });
  assert(t.completedCount === 0, 'failed ignored');
});

test('onChange callback fires', () => {
  const t = new ChapterTracker();
  let changed = 0;
  t.onChange = () => changed++;
  t.handle({ type: 'task_started', taskId: 't1', toolUseId: 'a1', description: 'Ch 1' });
  t.handle({ type: 'task_completed', taskId: 't1', toolUseId: 'a1', status: 'completed', summary: '' });
  assert(changed === 2, 'onChange fired twice');
});

test('full 3-chapter flow', () => {
  const t = new ChapterTracker();
  t.handle({ type: 'task_started', taskId: 'a', toolUseId: 'ch1', description: 'Ch 1' });
  t.handle({ type: 'task_started', taskId: 'b', toolUseId: 'ch2', description: 'Ch 2' });
  t.handle({ type: 'task_started', taskId: 'c', toolUseId: 'ch3', description: 'Ch 3' });
  assert(t.spawnedCount === 3, '3 spawned');
  t.handle({ type: 'task_completed', taskId: 'b', toolUseId: 'ch2', status: 'completed', summary: '' });
  t.handle({ type: 'task_completed', taskId: 'c', toolUseId: 'ch3', status: 'completed', summary: '' });
  t.handle({ type: 'task_completed', taskId: 'a', toolUseId: 'ch1', status: 'completed', summary: '' });
  assert(t.completedCount === 3, '3 completed');
});

// ========================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
