import { EventEmitter } from 'events';
import { runClaude, checkClaude } from './claude.js';
import { resolve } from 'path';
import { PROBE_APPROVAL_PROMPT } from './engine/constants.js';
import { appendJsonLine, resetLog } from './engine/event-log.js';
import { extractQuestions } from './engine/permission-questions.js';
import { SentinelStream } from './engine/sentinel-stream.js';
import { buildSystemPrompt } from './engine/system-prompt.js';

/**
 * Aristotle engine — manages the conversation loop with Claude.
 *
 * Emits:
 *   'text'           { text, parentToolUseId }
 *   'tool_start'     { toolName, toolUseId, parentToolUseId }
 *   'chapters_total' { total }           — from %%ARISTOTLE_CHAPTERS_TOTAL:N%%
 *   'chapter_done'   { id }              — from %%ARISTOTLE_CHAPTER_DONE:<id>%%
 *   'phase'          { phase }           — 'planning' | 'writing' | 'idle'
 *   'status'         { message }         — status line text
 *   'question'       { question, options, header, multiSelect } — pending AskUserQuestion
 *   'question_cleared' { }
 *   'turn_start'     { }                 — new user send begins
 *   'turn_end'       { }                 — Claude finished responding
 *   'done'           { artifactPath }    — from %%ARISTOTLE_DONE:<path>%%
 *   'error'          { message }
 */
export class Engine extends EventEmitter {
  /**
   * @param {string} projectRoot  - aristotle source dir (skills/, verifiers/, build-book.sh, BREAKDOWN.md)
   * @param {string} breakdownDir - where the inner agent runs (cwd) and writes chapters. Typically `<projectRoot>/artifacts/<slug>`. The inner agent WILL see aristotle's CLAUDE.md via parent-walk; the briefing below tells it to ignore dev-facing leakage.
   * @param {string} [sessionDir] - when provided, raw claude stream-json is written to <sessionDir>/claude.jsonl and every Engine event is mirrored to <sessionDir>/engine.jsonl for later debugging.
   */
  constructor(projectRoot, breakdownDir, sessionDir) {
    super();
    this.projectRoot = projectRoot;
    this.breakdownDir = breakdownDir || projectRoot;
    this.sessionDir = sessionDir || null;
    this.sessionId = null;
    this.systemPrompt = null;
    this.phase = 'idle';
    this._isDone = false;
    this._donePath = null;
    this._pendingQuestion = null;
    this._probeActive = false;
    this._savedSessionId = null;
    this._activeProc = null;
    this._interruptRequested = false;
    this._signalHandlers = {
      interrupt: () => this._signalActiveTurn('SIGINT', {
        alreadyRequested: this._interruptRequested,
        beforeSend: () => {
          this._interruptRequested = true;
          this.emit('status', { message: 'Interrupting...' });
        },
      }),
    };
    this._claudeLog = sessionDir ? resolve(sessionDir, 'claude.jsonl') : null;
    this._engineLog = sessionDir ? resolve(sessionDir, 'engine.jsonl') : null;
    resetLog(this._engineLog);
    this._sentinelStream = new SentinelStream({
      onChaptersTotal: (total) => this.emit('chapters_total', { total }),
      onChapterDone: (id) => this.emit('chapter_done', { id }),
      onDonePath: (path) => { this._donePath = path; },
      onText: (text) => this.emit('text', { text, parentToolUseId: null }),
      shouldEmitText: () => this.phase !== 'writing',
    });
    Object.defineProperty(this, '_streamBuffer', {
      configurable: true,
      enumerable: false,
      get: () => this._sentinelStream.buffer,
      set: (value) => { this._sentinelStream.buffer = value; },
    });
  }

  // Tap every event into engine.jsonl before forwarding to listeners. Having
  // one file with the exact sequence the UI saw is the single most useful
  // artefact when debugging a weird run — you can reconstruct what the TUI
  // rendered from this alone.
  emit(eventName, payload) {
    appendJsonLine(this._engineLog, {
      t: new Date().toISOString(),
      event: eventName,
      payload: payload ?? null,
    });
    return super.emit(eventName, payload);
  }

  async init() {
    const version = await checkClaude();
    if (!version) {
      throw new Error('Claude Code is not installed. Run: npm install -g @anthropic-ai/claude-code');
    }
    this.systemPrompt = buildSystemPrompt(this.projectRoot, this.breakdownDir);
    // ARISTOTLE_EVENT_LOG overrides the session-dir path. Keeps legacy ad-hoc
    // debugging (`ARISTOTLE_EVENT_LOG=/tmp/foo.jsonl aristotle ...`) working.
    if (process.env.ARISTOTLE_EVENT_LOG) {
      this._claudeLog = process.env.ARISTOTLE_EVENT_LOG;
    }
    resetLog(this._claudeLog);
    return version;
  }

  /**
   * Send a message to Claude (or start a new session).
   * Streams events via EventEmitter. Resolves when Claude finishes the turn.
   */
  async send(message) {
    this._setPhase('planning');
    this._sentinelStream.reset();
    this._donePath = null;
    this._interruptRequested = false;
    if (this._pendingQuestion) {
      this._pendingQuestion = null;
      this.emit('question_cleared');
    }
    this.emit('turn_start');

    const opts = {
      cwd: this.breakdownDir,
      onEvent: (event) => this._handleEvent(event),
      onSpawn: (proc) => { this._activeProc = proc; },
      isAborted: () => this._interruptRequested,
      permissionMode: 'auto',
      // Re-inject on every turn. Claude Code's `--resume` does NOT preserve
      // `--append-system-prompt` from the original invocation — verified
      // empirically: a pirate-persona system prompt on turn 1 was gone on
      // the first --resume. Without this, every turn past the first runs
      // with no BREAKDOWN.md, no operating-environment briefing, no
      // absolute paths to aristotle's source — the model falls back to
      // default "helpful assistant" behavior mid-pipeline.
    };

    if (!this._probeActive) {
      opts.appendSystemPrompt = this.systemPrompt;
    }

    if (this._claudeLog) {
      opts.eventLog = this._claudeLog;
    }

    if (this.sessionId) {
      opts.resume = this.sessionId;
    }

    try {
      const { sessionId } = await runClaude(message, opts);
      this.sessionId = sessionId;

      // Flush any remaining buffered text (may contain a trailing sentinel)
      this._sentinelStream.flush();

      this._setPhase('idle');
      this.emit('turn_end');

      if (this._probeActive && !this._pendingQuestion) {
        this._finishProbe();
      }

      if (!this._isDone && this._donePath) {
        this._isDone = true;
        const artifactPath = resolve(this.breakdownDir, this._donePath);
        this.emit('done', { artifactPath });
      }
    } catch (err) {
      if (err.code === 'ABORT_ERR') {
        this.emit('interrupted', { message: 'Interrupted current turn.' });
        this._setPhase('idle');
        this.emit('turn_end');
        if (this._probeActive && !this._pendingQuestion) {
          this._finishProbe();
        }
        return;
      }
      this.emit('error', { message: err.message });
      this._setPhase('idle');
      this.emit('turn_end');
      if (this._probeActive && !this._pendingQuestion) {
        this._finishProbe();
      }
    } finally {
      this._activeProc = null;
      this._interruptRequested = false;
    }
  }

  async probeApproval() {
    if (this._probeActive) return;
    this._savedSessionId = this.sessionId;
    this.sessionId = null;
    this._probeActive = true;
    this.emit('status', { message: 'Starting approval probe...' });
    return this.send(PROBE_APPROVAL_PROMPT);
  }

  signal(name) {
    return this._signalHandlers[name]?.() ?? false;
  }

  interrupt() {
    return this.signal('interrupt');
  }

  _signalActiveTurn(processSignal, { alreadyRequested = false, beforeSend } = {}) {
    if (!this._activeProc || this.phase === 'idle') return false;
    if (alreadyRequested) return false;
    beforeSend?.();
    this._activeProc.kill(processSignal);
    return true;
  }

  _handleEvent(event) {
    switch (event.type) {
      case 'text':
        if (!event.parentToolUseId) {
          this._sentinelStream.process(event.text);
        } else {
          this.emit('text', event);
        }
        break;

      case 'tool_start':
        if (!event.parentToolUseId) {
          this.emit('status', { message: 'Designing the breakdown...' });
        }
        this.emit('tool_start', event);
        break;

      case 'task_started':
        // Keep this bootstrap signal even though chapter progress is now
        // sentinel-driven. It lets the UI enter writing mode before the
        // chapters_total sentinel necessarily arrives.
        if (this.phase !== 'writing') this._setPhase('writing');
        break;

      case 'retry':
        this.emit('status', { message: `Retrying... attempt ${event.attempt}/${event.maxRetries}` });
        break;

      case 'result':
        this._handlePermissionDenials(event.permissionDenials || []);
        if (!event.ok) {
          this.emit('error', { message: `Error: ${event.subtype || 'unknown'}` });
        }
        break;
    }
  }

  _handlePermissionDenials(permissionDenials) {
    for (const question of extractQuestions(permissionDenials)) {
      this._pendingQuestion = question;
      this.emit('question', this._pendingQuestion);
    }
  }

  _finishProbe() {
    this._probeActive = false;
    this.sessionId = this._savedSessionId;
    this._savedSessionId = null;
  }

  _processStream(text) {
    return this._sentinelStream.process(text);
  }

  _flushStream() {
    this._sentinelStream.flush();
  }

  _setPhase(phase) {
    if (this.phase !== phase) {
      this.phase = phase;
      this.emit('phase', { phase });
    }
  }

  _buildSystemPrompt() {
    return buildSystemPrompt(this.projectRoot, this.breakdownDir);
  }
}
