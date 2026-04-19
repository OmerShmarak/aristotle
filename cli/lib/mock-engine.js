import { EventEmitter } from 'events';
import { readFileSync } from 'fs';

/**
 * MockEngine — drop-in replacement for Engine in tui-test runs.
 *
 * Reads a JSONL script from ARISTOTLE_SCRIPT. Each line is:
 *   { "delayMs": <number>, "event": <name>, "payload": <object> }
 *
 * When the App calls .send() (which it does once on mount with the topic),
 * we kick off the replay. After all scripted events, we stay alive so the
 * TUI can be observed during "pauses" encoded in the script.
 *
 * Special event name "__exit" terminates the process with a given exit code
 * after the delay (useful for self-cleaning test runs).
 */
export class MockEngine extends EventEmitter {
  constructor(scriptPath) {
    super();
    this.scriptPath = scriptPath;
    this._started = false;
    this._interrupted = false;
    this._sleepTimer = null;
    this._sleepResolve = null;
    this._signalHandlers = {
      interrupt: () => this._interruptReplay(),
    };
  }

  async init() {
    this._script = readFileSync(this.scriptPath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => JSON.parse(l));
    return 'mock';
  }

  send(_message) {
    if (this._started) return;
    this._started = true;
    this._replay();
  }

  probeApproval() {
    if (this._started) return;
    this._started = true;
    this._replay();
  }

  signal(name) {
    return this._signalHandlers[name]?.() ?? false;
  }

  interrupt() {
    return this.signal('interrupt');
  }

  _interruptReplay() {
    if (!this._started || this._interrupted) return false;
    this._interrupted = true;
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
    if (this._sleepResolve) {
      this._sleepResolve();
      this._sleepResolve = null;
    }
    this.emit('status', { message: 'Interrupting...' });
    this.emit('interrupted', { message: 'Interrupted current turn.' });
    this.emit('phase', { phase: 'idle' });
    this.emit('turn_end', {});
    return true;
  }

  async _replay() {
    for (const step of this._script) {
      if (this._interrupted) return;
      if (step.delayMs > 0) {
        await new Promise((resolve) => {
          this._sleepResolve = resolve;
          this._sleepTimer = setTimeout(() => {
            this._sleepTimer = null;
            this._sleepResolve = null;
            resolve();
          }, step.delayMs);
        });
      }
      if (this._interrupted) return;
      if (step.event === '__exit') {
        process.exit(step.payload?.code ?? 0);
      }
      this.emit(step.event, step.payload ?? {});
    }
  }
}
