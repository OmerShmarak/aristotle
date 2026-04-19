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

  async _replay() {
    for (const step of this._script) {
      if (step.delayMs > 0) await new Promise(r => setTimeout(r, step.delayMs));
      if (step.event === '__exit') {
        process.exit(step.payload?.code ?? 0);
      }
      this.emit(step.event, step.payload ?? {});
    }
  }
}
