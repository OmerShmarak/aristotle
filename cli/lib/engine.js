import { EventEmitter } from 'events';
import { runClaude, checkClaude } from './claude.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Aristotle engine — manages the conversation loop with Claude.
 *
 * Emits:
 *   'text'          { text, parentToolUseId }
 *   'tool_start'    { toolName, toolUseId, parentToolUseId }
 *   'task_started'  { taskId, toolUseId, description }
 *   'task_completed' { taskId, toolUseId, status, summary }
 *   'phase'         { phase }    — 'planning' | 'writing' | 'idle'
 *   'status'        { message }  — status line text
 *   'turn_end'      { }         — Claude finished responding, user can type
 *   'done'          { sessionId }
 *   'error'         { message }
 */
const DONE_RE = /%%ARISTOTLE_DONE:(.+?)%%/;

export class Engine extends EventEmitter {
  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
    this.sessionId = null;
    this.systemPrompt = null;
    this.phase = 'idle';
    this._isDone = false;
    this._textBuffer = '';
  }

  async init() {
    const version = await checkClaude();
    if (!version) {
      throw new Error('Claude Code is not installed. Run: npm install -g @anthropic-ai/claude-code');
    }
    this.systemPrompt = this._buildSystemPrompt();
    return version;
  }

  /**
   * Send a message to Claude (or start a new session).
   * Streams events via EventEmitter. Resolves when Claude finishes the turn.
   */
  async send(message) {
    this._setPhase('planning');

    const opts = {
      cwd: this.projectRoot,
      onEvent: (event) => this._handleEvent(event),
    };

    if (this.sessionId) {
      opts.resume = this.sessionId;
    } else {
      opts.appendSystemPrompt = this.systemPrompt;
    }

    try {
      const { sessionId } = await runClaude(message, opts);
      this.sessionId = sessionId;
      this._setPhase('idle');
      this.emit('turn_end');

      // Check if the sentinel token appeared during this turn
      const match = this._textBuffer.match(DONE_RE);
      if (!this._isDone && match) {
        this._isDone = true;
        const artifactPath = resolve(this.projectRoot, match[1]);
        this.emit('done', { artifactPath });
      }
      this._textBuffer = '';
    } catch (err) {
      this.emit('error', { message: err.message });
      this._setPhase('idle');
      this.emit('turn_end');
    }
  }

  _handleEvent(event) {
    // Forward relevant events
    switch (event.type) {
      case 'text':
        // Suppress top-level text during writing phase — it's just Claude
        // saying "Chapter 1 done, 9 more..." which the progress bar handles.
        if (this.phase === 'writing' && !event.parentToolUseId) break;

        // Buffer top-level text to detect the sentinel token
        if (!event.parentToolUseId) {
          this._textBuffer += event.text;
        }

        // Strip sentinel token from displayed text
        if (event.text.includes('%%ARISTOTLE_DONE')) {
          const cleaned = event.text.replace(DONE_RE, '').trim();
          if (cleaned) this.emit('text', { ...event, text: cleaned });
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
        if (this.phase !== 'writing') {
          this._setPhase('writing');
        }
        this.emit('task_started', event);
        break;

      case 'task_completed':
        this.emit('task_completed', event);
        break;

      case 'retry':
        this.emit('status', { message: `Retrying... attempt ${event.attempt}/${event.maxRetries}` });
        break;

      case 'result':
        if (!event.ok) {
          this.emit('error', { message: `Error: ${event.subtype || 'unknown'}` });
        }
        break;
    }
  }

  _setPhase(phase) {
    if (this.phase !== phase) {
      this.phase = phase;
      this.emit('phase', { phase });
    }
  }

  _buildSystemPrompt() {
    const parts = [];

    const breakdownPath = resolve(this.projectRoot, 'BREAKDOWN.md');
    if (existsSync(breakdownPath)) {
      parts.push(readFileSync(breakdownPath, 'utf-8'));
    } else {
      throw new Error('BREAKDOWN.md not found!');
    }

    const profilePath = resolve(this.projectRoot, 'PROFILE.md');
    if (existsSync(profilePath)) {
      parts.push('\n---\n\n# Current Student Profile\n\n' + readFileSync(profilePath, 'utf-8'));
    } else {
      parts.push('\n---\n\nNo PROFILE.md exists yet. Interview the student before starting the breakdown.');
    }

    return parts.join('\n');
  }
}
