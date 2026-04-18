/**
 * Chapter progress tracker.
 * Pure data — no stdout writes. The UI reads .spawnedCount / .completedCount.
 */
export class ChapterTracker {
  constructor() {
    this.spawned = new Map();    // toolUseId → { description, taskId, index }
    this.completed = new Set();  // toolUseIds that finished
    this._nextIndex = 0;
    this.onChange = null;        // callback when state changes
  }

  get spawnedCount() { return this.spawned.size; }
  get completedCount() { return this.completed.size; }

  handle(event) {
    switch (event.type) {
      case 'task_started':
        this._onTaskStarted(event);
        break;
      case 'task_completed':
        this._onTaskCompleted(event);
        break;
    }
  }

  _onTaskStarted(event) {
    const id = event.toolUseId;
    if (!id || this.spawned.has(id)) return;
    this._nextIndex++;
    this.spawned.set(id, {
      description: event.description,
      taskId: event.taskId,
      index: this._nextIndex,
    });
    this.onChange?.();
  }

  _onTaskCompleted(event) {
    const id = event.toolUseId;
    if (!id || this.completed.has(id)) return;
    if (!this.spawned.has(id)) return;
    if (event.status !== 'completed') return;
    this.completed.add(id);
    this.onChange?.();
  }
}
