import { spawn } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';

const KILL_GRACE_MS = 5000;

function command() {
  return process.env.ARISTOTLE_CODEX_BIN || 'codex';
}

function promptWithContext(prompt, opts) {
  const systemPrompt = opts.appendSystemPrompt || opts.systemPrompt;
  if (!systemPrompt) return prompt;
  return `${systemPrompt}\n\n---\n\n# Current user message\n\n${prompt}`;
}

/**
 * Build a Codex CLI invocation without spawning it. Kept pure so command
 * construction (especially resume ordering) can be covered deterministically.
 */
export function buildCodexArgs(prompt, opts = {}) {
  const instruction = promptWithContext(prompt, opts);

  if (opts.resume) {
    const args = ['exec', 'resume', '--json', '--skip-git-repo-check'];
    if (opts.model) args.push('--model', opts.model);
    args.push(opts.resume, instruction);
    return args;
  }

  const args = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox', opts.sandboxMode || 'workspace-write',
  ];
  if (opts.cwd) args.push('--cd', opts.cwd);
  for (const dir of opts.additionalDirs || []) args.push('--add-dir', dir);
  if (opts.model) args.push('--model', opts.model);
  args.push(instruction);
  return args;
}

/**
 * Pure Codex CLI JSONL adapter. It translates Codex events into the same
 * normalized surface as lib/claude.js and knows nothing about Aristotle.
 */
export function runCodex(prompt, opts = {}) {
  const args = buildCodexArgs(prompt, opts);
  const emit = opts.onEvent || (() => {});
  const idleTimeoutMs = opts.idleTimeoutMs ?? 0;
  const hardTimeoutMs = opts.hardTimeoutMs ?? 0;

  return new Promise((resolve, reject) => {
    const proc = spawn(command(), args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    opts.onSpawn?.(proc);

    let sessionId = null;
    let result = '';
    let buffer = '';
    let stderr = '';
    let reportedFailure = null;
    let timedOutReason = null;
    let idleTimer = null;
    let hardTimer = null;
    let killGraceTimer = null;

    const clearTimers = () => {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
      if (killGraceTimer) { clearTimeout(killGraceTimer); killGraceTimer = null; }
    };

    const signalGroup = (signal) => {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        try { proc.kill(signal); } catch { /* process already exited */ }
      }
    };

    const killForTimeout = (reason) => {
      if (timedOutReason) return;
      timedOutReason = reason;
      clearTimers();
      signalGroup('SIGTERM');
      killGraceTimer = setTimeout(() => signalGroup('SIGKILL'), KILL_GRACE_MS);
      killGraceTimer.unref?.();
    };

    const armIdle = () => {
      if (!idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => killForTimeout(`no output for ${Math.round(idleTimeoutMs / 1000)}s`),
        idleTimeoutMs,
      );
      idleTimer.unref?.();
    };

    if (hardTimeoutMs) {
      hardTimer = setTimeout(
        () => killForTimeout(`exceeded ${Math.round(hardTimeoutMs / 1000)}s time limit for this turn`),
        hardTimeoutMs,
      );
      hardTimer.unref?.();
    }
    armIdle();

    const consume = (line) => {
      if (!line.trim()) return;
      try {
        const raw = JSON.parse(line);
        if (opts.eventLog) {
          appendFileSync(opts.eventLog, `${new Date().toISOString()} ${line}\n`);
        }
        for (const event of translateCodex(raw)) {
          if (event.type === 'init') sessionId = event.sessionId || sessionId;
          if (event.type === 'text') result += event.text;
          if (event.type === 'result' && !event.ok) {
            reportedFailure = event.error || event.result || 'Codex turn failed';
          }
          emit(event);
        }
      } catch {
        // --json promises JSONL on stdout. Ignore incidental non-JSON output;
        // stderr and the exit code retain actionable process diagnostics.
      }
    };

    proc.stdout.on('data', (chunk) => {
      armIdle();
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) consume(line);
    });

    // Codex uses stderr for progress in non-interactive mode. Treat it as
    // activity, but only surface it when the process actually fails.
    proc.stderr.on('data', (chunk) => {
      armIdle();
      if (!opts.isAborted?.()) stderr = (stderr + chunk.toString()).slice(-16000);
    });

    proc.on('close', (code, signal) => {
      clearTimers();
      if (buffer.trim()) consume(buffer);

      if (timedOutReason) {
        const err = new Error(`Codex run timed out: ${timedOutReason}`);
        err.code = 'TIMEOUT_ERR';
        reject(err);
        return;
      }
      if (opts.isAborted?.() || signal === 'SIGINT') {
        const err = new Error('Codex run interrupted');
        err.code = 'ABORT_ERR';
        reject(err);
        return;
      }
      if (reportedFailure) {
        const err = new Error(reportedFailure);
        err.alreadyEmitted = true;
        reject(err);
        return;
      }
      if (code !== 0 && code !== null) {
        reject(new Error(stderr.trim() || `codex exited with code ${code}`));
        return;
      }
      resolve({ sessionId, result });
    });

    proc.on('error', (err) => {
      clearTimers();
      if (err.code === 'ENOENT') {
        const cwd = opts.cwd || process.cwd();
        if (!existsSync(cwd)) {
          reject(new Error(`Working directory does not exist: ${cwd}`));
        } else {
          reject(new Error('Codex CLI not installed. Run: npm install -g @openai/codex'));
        }
      } else {
        reject(err);
      }
    });
  });
}

/** Translate one raw Codex JSONL event into normalized provider events. */
export function translateCodex(raw) {
  if (!raw || typeof raw !== 'object') return [];

  if (raw.type === 'thread.started') {
    return [{ type: 'init', sessionId: raw.thread_id || null }];
  }

  if (raw.type === 'item.started' && isToolItem(raw.item)) {
    const events = [{
      type: 'tool_start',
      toolName: codexToolName(raw.item),
      toolUseId: raw.item.id || null,
      parentToolUseId: raw.item.parent_id || raw.parent_item_id || null,
    }];
    if (raw.item.type === 'collab_tool_call') {
      events.push({
        type: 'task_started',
        taskId: raw.item.id || null,
        toolUseId: raw.item.id || null,
        description: raw.item.prompt || raw.item.description || '',
      });
    }
    return events;
  }

  if (raw.type === 'item.completed' && raw.item?.type === 'agent_message') {
    const text = typeof raw.item.text === 'string' ? raw.item.text : '';
    return text ? [{ type: 'text', text, parentToolUseId: null }] : [];
  }

  if (raw.type === 'turn.completed') {
    return [{
      type: 'result',
      ok: true,
      result: raw.last_agent_message || raw.result || '',
      subtype: 'completed',
      usage: raw.usage || null,
    }];
  }

  if (raw.type === 'turn.failed') {
    const message = errorMessage(raw.error) || 'Codex turn failed';
    return [{
      type: 'result',
      ok: false,
      result: message,
      error: message,
      subtype: 'failed',
    }];
  }

  if (raw.type === 'error') {
    const message = errorMessage(raw.error) || raw.message || 'Codex error';
    return [{
      type: 'result',
      ok: false,
      result: message,
      error: message,
      subtype: raw.code || 'error',
    }];
  }

  return [];
}

function isToolItem(item) {
  return Boolean(item && [
    'command_execution',
    'file_change',
    'mcp_tool_call',
    'web_search_call',
    'collab_tool_call',
    'computer_call',
    'plan_update',
  ].includes(item.type));
}

function codexToolName(item) {
  if (item.name) return item.name;
  switch (item.type) {
    case 'command_execution': return 'Bash';
    case 'file_change': return 'Edit';
    case 'mcp_tool_call': return 'MCP';
    case 'web_search_call': return 'WebSearch';
    case 'collab_tool_call': return 'Agent';
    case 'computer_call': return 'Computer';
    case 'plan_update': return 'Plan';
    default: return item.type;
  }
}

function errorMessage(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string') return error.message;
  return null;
}

export function checkCodex() {
  return new Promise((resolve) => {
    const proc = spawn(command(), ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let version = '';
    proc.stdout.on('data', (chunk) => { version += chunk.toString(); });
    proc.on('close', (code) => resolve(code === 0 ? version.trim() : null));
    proc.on('error', () => resolve(null));
  });
}
