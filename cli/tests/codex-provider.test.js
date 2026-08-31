import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexArgs, runCodex, translateCodex } from '../lib/Codex.js';
import { Engine } from '../lib/engine.js';
import { registerProvider } from '../lib/providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// Official `codex exec --json` event shapes normalize to Aristotle events.
const rawEvents = readFileSync(resolve(__dirname, 'fixtures', 'codex-turn.jsonl'), 'utf-8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));
const normalized = rawEvents.flatMap(translateCodex);
assert.deepEqual(
  normalized.map(event => event.type),
  ['init', 'tool_start', 'text', 'result'],
);
assert.equal(normalized[0].sessionId, 'thread-1');
assert.equal(normalized[1].toolName, 'Bash');
assert.equal(normalized[2].text, 'The answer is ready.');
assert.equal(normalized[3].ok, true);

const collabEvents = translateCodex({
  type: 'item.started',
  item: { id: 'agent-1', type: 'collab_tool_call', prompt: 'Write chapter one' },
});
assert.deepEqual(collabEvents.map(event => event.type), ['tool_start', 'task_started']);

// Resume uses the documented subcommand ordering and never disables safety.
  const resumeArgs = buildCodexArgs('continue', {
  resume: 'thread-1',
  appendSystemPrompt: 'SYSTEM',
});
assert.deepEqual(resumeArgs.slice(0, 4), ['exec', 'resume', '--json', '--skip-git-repo-check']);
assert.ok(resumeArgs.includes('thread-1'));
assert.match(resumeArgs.at(-1), /^SYSTEM[\s\S]*continue$/);
assert.ok(!resumeArgs.some(arg => arg.includes('dangerously-bypass')));

const initialArgs = buildCodexArgs('start', {
  cwd: '/tmp/book',
  additionalDirs: ['/tmp/aristotle'],
});
assert.ok(initialArgs.includes('workspace-write'));
assert.deepEqual(
  initialArgs.slice(initialArgs.indexOf('--add-dir'), initialArgs.indexOf('--add-dir') + 2),
  ['--add-dir', '/tmp/aristotle'],
);

// Drive the real process boundary with a deterministic fake Codex executable.
const tmp = mkdtempSync(resolve(tmpdir(), 'aristotle-codex-provider-'));
const fakeCodex = resolve(tmp, 'codex');
const argsLog = resolve(tmp, 'args.log');
writeFileSync(fakeCodex, `#!/bin/sh
printf '%s\\0' "$@" > "$ARISTOTLE_CODEX_ARGS_LOG"
printf '%s\\n' \\
  '{"type":"thread.started","thread_id":"spawned-thread"}' \\
  '{"type":"item.started","item":{"id":"tool-1","type":"file_change"}}' \\
  '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"done"}}' \\
  '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
`);
chmodSync(fakeCodex, 0o755);

const originalBin = process.env.ARISTOTLE_CODEX_BIN;
const originalArgsLog = process.env.ARISTOTLE_CODEX_ARGS_LOG;
process.env.ARISTOTLE_CODEX_BIN = fakeCodex;
process.env.ARISTOTLE_CODEX_ARGS_LOG = argsLog;

try {
  const emitted = [];
  const result = await runCodex('make the book', {
    cwd: tmp,
    appendSystemPrompt: 'SYSTEM',
    onEvent: event => emitted.push(event),
  });
  assert.equal(result.sessionId, 'spawned-thread');
  assert.equal(result.result, 'done');
  assert.deepEqual(emitted.map(event => event.type), ['init', 'tool_start', 'text', 'result']);

  const spawnedArgs = readFileSync(argsLog).toString().split('\0').filter(Boolean);
  assert.deepEqual(spawnedArgs.slice(0, 2), ['exec', '--json']);
  assert.ok(spawnedArgs.includes('workspace-write'));
  assert.ok(spawnedArgs.includes(tmp));
  assert.ok(!spawnedArgs.some(arg => arg.includes('dangerously-bypass')));

  // Switching providers keeps their session IDs separate and restores each
  // one when the user switches back.
  const runs = [];
  const fakeClaudeProvider = {
    name: 'claude-code',
    displayName: 'Claude',
    logFile: 'claude.jsonl',
    check: async () => 'claude-test',
    run: async (_prompt, opts) => {
      runs.push({ provider: 'claude-code', resume: opts.resume || null });
      return { sessionId: opts.resume || 'claude-session' };
    },
  };
  const fakeCodexProvider = {
    name: 'codex',
    displayName: 'Codex',
    logFile: 'Codex.jsonl',
    check: async () => 'codex-test',
    run: async (_prompt, opts) => {
      runs.push({ provider: 'codex', resume: opts.resume || null });
      return { sessionId: opts.resume || 'codex-session' };
    },
  };
  registerProvider(fakeClaudeProvider);
  registerProvider(fakeCodexProvider);

  const engine = new Engine(PROJECT_ROOT, tmp, null, { provider: fakeClaudeProvider });
  await engine.init();
  assert.match(engine.systemPrompt, /Claude Code subprocess/);
  await engine.send('one');
  assert.equal(engine.sessionId, 'claude-session');

  await engine.switchProvider('codex');
  assert.equal(engine.sessionId, null);
  assert.match(engine.systemPrompt, /Codex subprocess/);
  assert.match(engine.systemPrompt, /codex exec --json/);
  await engine.send('two');
  assert.equal(engine.sessionId, 'codex-session');

  const switchedBack = await engine.switchProvider('claude');
  assert.equal(switchedBack.resumed, true);
  assert.equal(engine.sessionId, 'claude-session');
  await engine.send('three');
  assert.deepEqual(runs, [
    { provider: 'claude-code', resume: null },
    { provider: 'codex', resume: null },
    { provider: 'claude-code', resume: 'claude-session' },
  ]);

  registerProvider({
    ...fakeCodexProvider,
    check: async () => null,
  });
  await assert.rejects(engine.switchProvider('codex'), /Codex is not available/);
  assert.equal(engine.provider.name, 'claude-code');
  assert.equal(engine.sessionId, 'claude-session');
} finally {
  if (originalBin === undefined) delete process.env.ARISTOTLE_CODEX_BIN;
  else process.env.ARISTOTLE_CODEX_BIN = originalBin;
  if (originalArgsLog === undefined) delete process.env.ARISTOTLE_CODEX_ARGS_LOG;
  else process.env.ARISTOTLE_CODEX_ARGS_LOG = originalArgsLog;
  rmSync(tmp, { recursive: true, force: true });
}

console.log('ok: Codex provider parses, spawns safely, resumes, and switches');
