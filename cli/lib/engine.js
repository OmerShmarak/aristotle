import { EventEmitter } from 'events';
import { defaultProvider, getProvider } from './providers/index.js';
import { existsSync, symlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  PROBE_APPROVAL_PROMPT,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_HARD_TIMEOUT_MS,
  parseTimeoutMs,
} from './engine/constants.js';
import { appendJsonLine, resetLog } from './engine/event-log.js';
import { extractQuestions } from './engine/permission-questions.js';
import { SentinelStream } from './engine/sentinel-stream.js';
import { buildSystemPrompt } from './engine/system-prompt.js';
import { updateMeta } from './session.js';

/**
 * Aristotle engine — manages the conversation loop with a CLI provider.
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
 *   'turn_end'       { }                 — provider finished responding
 *   'done'           { artifactPath }    — from %%ARISTOTLE_DONE:<path>%%
 *   'error'          { message }
 */
export class Engine extends EventEmitter {
  /**
   * @param {string} projectRoot  - aristotle source dir (skills/, verifiers/, build-book.sh, BREAKDOWN.md)
   * @param {string} breakdownDir - where the inner agent runs (cwd) and writes chapters. Typically `<projectRoot>/artifacts/<slug>`.
   * @param {string} [sessionDir] - when provided, raw provider JSONL and every normalized Engine event are logged for debugging.
   */
  constructor(projectRoot, breakdownDir, sessionDir, options = {}) {
    super();
    this.projectRoot = projectRoot;
    this.breakdownDir = breakdownDir || projectRoot;
    this.sessionDir = sessionDir || null;
    this.provider = options.provider || defaultProvider();
    this.sessionId = null;
    this._providerSessions = new Map();
    this.systemPrompt = null;
    this.phase = 'idle';
    this._donePath = null;
    this._pendingQuestion = null;
    this._probeActive = false;
    this._savedSessionId = null;
    // Tracks tokens borrowed from prior sessions. Borrowed tokens must never
    // be re-persisted into this run's fresh debug dir, or the picker would
    // show duplicate resumable sessions.
    this._inheritedProviderSessions = new Set();
    this._activeProc = null;
    this._interruptRequested = false;
    this._providerErrorEvent = false;
    this._signalHandlers = {
      interrupt: () => this._signalActiveTurn('SIGINT', {
        alreadyRequested: this._interruptRequested,
        beforeSend: () => {
          this._interruptRequested = true;
          this.emit('status', { message: 'Interrupting...' });
        },
      }),
    };
    this._initializedProviderLogs = new Set();
    this._engineLog = sessionDir ? resolve(sessionDir, 'engine.jsonl') : null;
    resetLog(this._engineLog);
    this._displayDir = null;
    this._sentinelStream = new SentinelStream({
      onChaptersTotal: (total) => this.emit('chapters_total', { total }),
      onChapterDone: (id) => this.emit('chapter_done', { id }),
      onDonePath: (path) => { this._donePath = path; },
      onSlug: (slug) => { this._ensureSlugLink(slug); },
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
    const version = await this.provider.check();
    if (!version) {
      throw new Error(`Provider "${this.provider.name}" is not available.`);
    }
    this.systemPrompt = buildSystemPrompt(this.projectRoot, this.breakdownDir, this.provider);
    this._prepareProviderLog();
    return version;
  }

  /**
   * Send a message to the active provider (or start a new session).
   * Streams events via EventEmitter. Resolves when the provider finishes.
   */
  async send(message) {
    this._setPhase('planning');
    this._sentinelStream.reset();
    this._donePath = null;
    this._interruptRequested = false;
    this._providerErrorEvent = false;
    if (this._pendingQuestion) {
      this._pendingQuestion = null;
      this.emit('question_cleared');
    }
    if (!this._probeActive) {
      this.emit('user_message', { text: message });
    }
    this.emit('turn_start');

    const opts = {
      cwd: this.breakdownDir,
      // The book workspace is the primary writable root. The source root is
      // additionally writable so the agent can maintain PROFILE.md.
      additionalDirs: [this.projectRoot],
      onEvent: (event) => this._handleEvent(event),
      onSpawn: (proc) => { this._activeProc = proc; },
      isAborted: () => this._interruptRequested,
      permissionMode: 'auto',
      // Bound every turn so a wedged subagent can't run for hours unnoticed
      // (see DEFAULT_*_TIMEOUT_MS). Env overrides for big builds / debugging.
      idleTimeoutMs: parseTimeoutMs(process.env.ARISTOTLE_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
      hardTimeoutMs: parseTimeoutMs(process.env.ARISTOTLE_TURN_TIMEOUT_MS, DEFAULT_HARD_TIMEOUT_MS),
      // Re-inject on every turn. Provider resume behavior differs, so the
      // engine does not rely on either CLI preserving appended instructions.
    };

    if (!this._probeActive) {
      opts.appendSystemPrompt = this.systemPrompt;
    }

    const providerLog = this._providerLogPath();
    if (providerLog) opts.eventLog = providerLog;

    if (this.sessionId) {
      opts.resume = this.sessionId;
    }

    try {
      const { sessionId } = await this.provider.run(message, opts);
      if (sessionId && sessionId !== this.sessionId) {
        this.sessionId = sessionId;
        this._persistResumeToken();
      }

      // Flush any remaining buffered text (may contain a trailing sentinel)
      this._sentinelStream.flush();

      this._setPhase('idle');
      this.emit('turn_end');

      if (this._probeActive && !this._pendingQuestion) {
        this._finishProbe();
      }

      if (this._donePath) {
        // Chat mode: emit `done` every time a build lands so the TUI updates
        // its "open <path>" hint after each rebuild. Use the slug symlink if
        // one was created — same file underneath, prettier path for the user.
        const displayDir = this._displayDir || this.breakdownDir;
        const artifactPath = resolve(displayDir, this._donePath);
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
      if (err.code === 'TIMEOUT_ERR') {
        // A turn wedged (silent or runaway) and the watchdog killed it. Recover
        // to idle like an interrupt rather than leaving the TUI spinning.
        this.emit('error', {
          message: `Turn aborted — ${err.message.replace(/^(?:Claude|Codex) run timed out: /, '')}. `
            + 'Send another message to continue, or set ARISTOTLE_TURN_TIMEOUT_MS / '
            + 'ARISTOTLE_IDLE_TIMEOUT_MS to adjust the limit.',
        });
        this._setPhase('idle');
        this.emit('turn_end');
        if (this._probeActive && !this._pendingQuestion) {
          this._finishProbe();
        }
        return;
      }
      if (!err.alreadyEmitted && !this._providerErrorEvent) {
        this.emit('error', { message: err.message });
      }
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

  /** Switch future turns to another registered provider. */
  async switchProvider(name) {
    if (this.phase !== 'idle' || this._activeProc) {
      throw new Error('Wait for the current turn to finish before switching providers.');
    }

    const next = getProvider(name);
    if (next.name === this.provider.name) {
      const result = {
        changed: false,
        provider: next.name,
        displayName: next.displayName || next.name,
      };
      return result;
    }

    const version = await next.check();
    if (!version) {
      throw new Error(`${next.displayName || next.name} is not available.`);
    }

    this._providerSessions.set(this.provider.name, this.sessionId);
    this.provider = next;
    this.sessionId = this._providerSessions.get(next.name) || null;
    this.systemPrompt = buildSystemPrompt(this.projectRoot, this.breakdownDir, this.provider);
    this._prepareProviderLog();

    if (this._pendingQuestion) {
      this._pendingQuestion = null;
      this.emit('question_cleared');
    }

    this._persistProviderSelection(version);
    const result = {
      changed: true,
      provider: next.name,
      displayName: next.displayName || next.name,
      resumed: Boolean(this.sessionId),
      version,
    };
    return result;
  }

  // Resume a prior conversation. The resume token is opaque to the engine —
  // whatever the provider stored on the original run.
  setResume({ sessionId, breakdownDir, providerSessions } = {}) {
    if (providerSessions && typeof providerSessions === 'object') {
      for (const [name, token] of Object.entries(providerSessions)) {
        if (!token) continue;
        this._providerSessions.set(name, token);
        this._inheritedProviderSessions.add(name);
      }
    }
    if (sessionId) {
      this.sessionId = sessionId;
      this._providerSessions.set(this.provider.name, sessionId);
      this._inheritedProviderSessions.add(this.provider.name);
    }
    if (breakdownDir) {
      this.breakdownDir = breakdownDir;
      this.systemPrompt = buildSystemPrompt(this.projectRoot, this.breakdownDir, this.provider);
    }
  }

  _persistResumeToken() {
    this._providerSessions.set(this.provider.name, this.sessionId);
    if (!this.sessionDir) return;
    if (this._inheritedProviderSessions.has(this.provider.name)) return;
    try {
      updateMeta(this.sessionDir, {
        provider: this.provider.name,
        providerSessionId: this.sessionId,
        providerSessions: this._ownedProviderSessions(),
        breakdownDir: this.breakdownDir,
      });
    } catch { /* non-fatal */ }
  }

  _persistProviderSelection(version) {
    if (!this.sessionDir) return;
    const inherited = this._inheritedProviderSessions.has(this.provider.name);
    try {
      updateMeta(this.sessionDir, {
        provider: this.provider.name,
        providerVersion: version,
        providerSessionId: inherited ? null : this.sessionId,
        providerSessions: this._ownedProviderSessions(),
        breakdownDir: this.breakdownDir,
      });
    } catch { /* non-fatal */ }
  }

  _providerLogPath() {
    if (process.env.ARISTOTLE_EVENT_LOG) return process.env.ARISTOTLE_EVENT_LOG;
    if (!this.sessionDir) return null;
    return resolve(this.sessionDir, this.provider.logFile || `${this.provider.name}.jsonl`);
  }

  _ownedProviderSessions() {
    return Object.fromEntries(
      [...this._providerSessions]
        .filter(([name, token]) => token && !this._inheritedProviderSessions.has(name)),
    );
  }

  _prepareProviderLog() {
    const path = this._providerLogPath();
    if (!path || this._initializedProviderLogs.has(path)) return;
    resetLog(path);
    this._initializedProviderLogs.add(path);
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
    // Providers run in their own process groups (spawned detached), so signal the
    // group to also stop subagents / background bash; fall back to the leader.
    try {
      process.kill(-this._activeProc.pid, processSignal);
    } catch {
      try { this._activeProc.kill(processSignal); } catch { /* already gone */ }
    }
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
          this._providerErrorEvent = true;
          const detail = event.error || event.result || event.message || event.subtype || 'unknown';
          const label = this.provider.displayName || this.provider.name;
          this.emit('error', { message: `${label} error: ${detail}` });
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

  // Create a sibling symlink `<slug> -> run-XXX` so the artifact can be
  // opened at a topic-named path. We deliberately do NOT rename the cwd:
  // Provider resume can validate the session against the cwd it was created
  // in, and renaming the dir mid-conversation can break resume
  // permanently — even with metadata rewrites. Symlinks sidestep that.
  _ensureSlugLink(rawSlug) {
    if (this._displayDir) return;
    const sanitized = rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .split('_')
      .filter(Boolean)
      .slice(0, 3)
      .join('_');
    if (!sanitized) return;

    const parent = dirname(this.breakdownDir);
    let target = resolve(parent, sanitized);
    let i = 2;
    while (existsSync(target)) {
      target = resolve(parent, `${sanitized}_${i++}`);
    }

    try {
      symlinkSync(this.breakdownDir, target);
      this._displayDir = target;
    } catch { /* non-fatal — `open` just falls back to the run-XXX path */ }
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
    return buildSystemPrompt(this.projectRoot, this.breakdownDir, this.provider);
  }
}
