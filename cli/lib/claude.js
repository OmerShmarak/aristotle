import { spawn } from 'child_process';
import { appendFileSync } from 'fs';

/**
 * Pure Claude Code CLI parser.
 *
 * Spawns `claude -p`, parses stream-json events, and emits normalized events
 * via opts.onEvent callback. This file knows NOTHING about Aristotle features —
 * it just translates Claude Code's stream-json format into a clean event stream.
 *
 * Normalized event types emitted:
 *
 *   { type: 'init', sessionId, model, tools, version }
 *   { type: 'text', text, parentToolUseId }
 *   { type: 'tool_start', toolName, toolUseId, parentToolUseId }
 *   { type: 'turn_end', stopReason, parentToolUseId, content }
 *       content: [{ type: 'text', text } | { type: 'tool_use', id, name, input }]
 *   { type: 'task_started', taskId, toolUseId, description, prompt }
 *   { type: 'retry', attempt, maxRetries, delayMs, error }
 *   { type: 'compact', trigger }
 *   { type: 'result', ok, sessionId, result, cost, turns, durationMs, permissionDenials }
 *   { type: 'error', message }
 */
export function runClaude(prompt, opts = {}) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', opts.permissionMode || 'auto',
    '--include-partial-messages',
  ];

  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt);
  if (opts.resume) args.push('--resume', opts.resume);
  if (opts.continueSession) args.push('--continue');
  if (opts.allowedTools) args.push('--allowedTools', opts.allowedTools.join(','));
  if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));

  const emit = opts.onEvent || (() => {});
  // eventLog is opened in append mode — caller owns lifecycle (truncation).

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let sessionId = null;
    let result = '';
    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          if (opts.eventLog) appendFileSync(opts.eventLog, new Date().toISOString() + ' ' + line + '\n');
          const events = translate(raw);
          for (const e of events) {
            emit(e);
            if (e.type === 'init') sessionId = e.sessionId;
            if (e.type === 'result') { result = e.result; sessionId = e.sessionId || sessionId; }
          }
        } catch { /* non-JSON line */ }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) emit({ type: 'error', message: text });
    });

    proc.on('close', (code) => {
      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const raw = JSON.parse(buffer);
          if (opts.eventLog) appendFileSync(opts.eventLog, new Date().toISOString() + ' ' + buffer + '\n');
          for (const e of translate(raw)) {
            emit(e);
            if (e.type === 'result') { result = e.result; sessionId = e.sessionId || sessionId; }
          }
        } catch { /* ignore */ }
      }

      if (code !== 0 && code !== null) {
        reject(new Error(`claude exited with code ${code}`));
      } else {
        resolve({ sessionId, result });
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Claude Code not installed. Run: npm install -g @anthropic-ai/claude-code'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Translate a raw Claude Code stream-json event into normalized event(s).
 * Returns an array (most raw events produce 0-1 normalized events).
 */
export function translate(raw) {
  switch (raw.type) {

    // --- system events ---
    case 'system':
      return translateSystem(raw);

    // --- streaming deltas (token-by-token, with --include-partial-messages) ---
    case 'stream_event':
      return translateStreamEvent(raw);

    // --- complete assistant message (one per turn) ---
    case 'assistant':
      return translateAssistant(raw);

    // --- final result ---
    case 'result':
      return [{
        type: 'result',
        ok: !raw.is_error,
        sessionId: raw.session_id,
        result: raw.result || '',
        cost: raw.total_cost_usd ?? null,
        turns: raw.num_turns ?? 0,
        durationMs: raw.duration_ms ?? 0,
        subtype: raw.subtype,
        permissionDenials: raw.permission_denials || [],
      }];

    // user (tool results), rate_limit_event, etc. — not needed by features
    default:
      return [];
  }
}

function translateSystem(raw) {
  switch (raw.subtype) {
    case 'init':
      return [{
        type: 'init',
        sessionId: raw.session_id,
        model: raw.model,
        tools: raw.tools || [],
        version: raw.claude_code_version,
      }];
    case 'task_started':
      return [{
        type: 'task_started',
        taskId: raw.task_id,
        toolUseId: raw.tool_use_id,
        description: raw.description || '',
        prompt: raw.prompt || '',
      }];
    case 'task_progress':
    case 'task_notification':
      return [];
    case 'api_retry':
      return [{
        type: 'retry',
        attempt: raw.attempt,
        maxRetries: raw.max_retries,
        delayMs: raw.retry_delay_ms,
        error: raw.error,
      }];
    case 'compact_boundary':
      return [{ type: 'compact', trigger: raw.compact_metadata?.trigger }];
    default:
      return [];
  }
}

function translateStreamEvent(raw) {
  const inner = raw.event;
  if (!inner) return [];
  const parent = raw.parent_tool_use_id || null;

  switch (inner.type) {
    case 'content_block_delta': {
      const delta = inner.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        return [{ type: 'text', text: delta.text, parentToolUseId: parent }];
      }
      if (delta?.type === 'input_json_delta') {
        // We don't have the tool_use_id here from the delta itself,
        // but it could be tracked via content_block_start index. Skip for now.
        return [];
      }
      return [];
    }

    case 'content_block_start': {
      const block = inner.content_block;
      if (block?.type === 'tool_use') {
        return [{
          type: 'tool_start',
          toolName: block.name,
          toolUseId: block.id,
          parentToolUseId: parent,
        }];
      }
      return [];
    }

    // content_block_stop, message_start, message_delta, message_stop, ping — no info needed
    default:
      return [];
  }
}

function translateAssistant(raw) {
  const content = raw.message?.content;
  if (!content) return [];
  const parent = raw.parent_tool_use_id || null;
  const stop = raw.message?.stop_reason;

  // Only emit turn_end for complete messages (stop_reason !== null).
  // With --include-partial-messages, partial assistant events arrive with stop_reason: null
  // for each content block — we skip those to avoid duplicates.
  if (stop === null || stop === undefined) return [];

  // Normalize content blocks
  const normalizedContent = content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    return { type: block.type };
  });

  return [{
    type: 'turn_end',
    stopReason: stop,
    parentToolUseId: parent,
    content: normalizedContent,
  }];
}

/**
 * Check that claude CLI is available.
 */
export async function checkClaude() {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let version = '';
    proc.stdout.on('data', (d) => { version += d.toString(); });
    proc.on('close', (code) => resolve(code === 0 ? version.trim() : null));
    proc.on('error', () => resolve(null));
  });
}
