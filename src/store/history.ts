/** Undo and redo over snapshots. A burst of changes with the same key (typing) is one step. */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;
  /** What the latest `record` cleared from Redo, while that step can still be taken back (see `retract`). */
  private latest: { redo: T[] } | null = null;

  constructor(private limit = 100) {}

  /** Remember `snapshot` (the state before a change) so undo can return to it. */
  record(snapshot: T, key?: string, now: number = Date.now()): void {
    const burst = key !== undefined && key === this.lastKey && now - this.lastAt < 1000;
    this.lastKey = key;
    this.lastAt = now;
    if (burst) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.latest = { redo: this.redoStack };
    this.redoStack = [];
  }

  /**
   * Take back the latest step `record` added (a change that came to nothing): its snapshot goes, and the Redo
   * steps it cleared come back. False if the history has moved since: an undo, a redo, a clear, or another record.
   */
  retract(): boolean {
    const latest = this.latest;
    if (!latest) return false;
    this.latest = null;
    this.undoStack.pop();
    this.redoStack = latest.redo;
    this.lastKey = undefined;
    return true;
  }

  /** Step back: returns the earlier snapshot, and keeps `current` so redo can return to it. */
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    this.lastKey = undefined;
    this.latest = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.lastKey = undefined;
    this.latest = null;
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = undefined;
    this.latest = null;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
