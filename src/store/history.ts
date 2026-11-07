/** Undo and redo over snapshots. A burst of changes with the same key (typing) is one step. */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;
  /**
   * The steps `record` added since the last undo, redo or clear, newest last, while they can still be taken back
   * (see `retract`): each one's key, and what it cleared from Redo. Never more than Undo holds.
   */
  private recent: { key: string | undefined; redo: T[] }[] = [];

  constructor(private limit = 100) {}

  /** Remember `snapshot` (the state before a change) so undo can return to it. */
  record(snapshot: T, key?: string, now: number = Date.now()): void {
    const burst = key !== undefined && key === this.lastKey && now - this.lastAt < 1000;
    this.lastKey = key;
    this.lastAt = now;
    if (burst) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.recent.push({ key, redo: this.redoStack });
    if (this.recent.length > this.undoStack.length) this.recent.splice(0, this.recent.length - this.undoStack.length);
    this.redoStack = [];
  }

  /**
   * Take back the newest step `record` added (a change that came to nothing): its snapshot goes, and the Redo
   * steps it cleared come back. Again, the one before it, and so on. False once an undo, a redo or a clear has
   * come since, or there is none.
   */
  retract(): boolean {
    const step = this.recent.pop();
    if (!step) return false;
    this.undoStack.pop();
    this.redoStack = step.redo;
    this.lastKey = undefined;
    return true;
  }

  /** The key of the newest step, while `retract` can still take it back. */
  get newest(): string | undefined { return this.recent.at(-1)?.key; }

  /** Step back: returns the earlier snapshot, and keeps `current` so redo can return to it. */
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    this.lastKey = undefined;
    this.recent = [];
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.lastKey = undefined;
    this.recent = [];
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = undefined;
    this.recent = [];
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
