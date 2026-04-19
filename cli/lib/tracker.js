/**
 * Chapter progress tracker.
 * Pure data — no stdout writes. The UI reads .totalCount / .completedCount.
 *
 * Driven by sentinel tokens emitted by the outer Claude agent:
 *   %%ARISTOTLE_CHAPTERS_TOTAL:N%%          sets total
 *   %%ARISTOTLE_CHAPTER_DONE:<chapter-id>%% marks one chapter finalized
 *
 * This decouples progress from the underlying task/Agent tool events, so the
 * outer agent is free to spawn arbitrary sub-agents per chapter (write, refine,
 * verify) without inflating the bar — it only reports "done" when a chapter
 * is truly final.
 */
export class ChapterTracker {
  constructor() {
    this.total = 0;
    this.done = new Set();
    this.onChange = null;
  }

  get totalCount() { return this.total; }
  get completedCount() { return this.done.size; }

  reset() {
    if (this.total === 0 && this.done.size === 0) return;
    this.total = 0;
    this.done.clear();
    this.onChange?.();
  }

  setTotal(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return;
    if (num === this.total) return;
    this.total = num;
    this.onChange?.();
  }

  markDone(id) {
    if (!id) return;
    const key = String(id).trim();
    if (!key || this.done.has(key)) return;
    this.done.add(key);
    this.onChange?.();
  }
}
