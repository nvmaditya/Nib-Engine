/** Undo and redo over snapshots. A burst of changes with the same key (typing) is one step. */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;

  constructor(private limit = 100) {}

  /** Remember `snapshot` (the state before a change) so undo can return to it. */
  record(snapshot: T, key?: string, now: number = Date.now()): void {
    const burst = key !== undefined && key === this.lastKey && now - this.lastAt < 1000;
    this.lastKey = key;
    this.lastAt = now;
    if (burst) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.redoStack = [];
  }

  /** Step back: returns the earlier snapshot, and keeps `current` so redo can return to it. */
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    this.lastKey = undefined;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.lastKey = undefined;
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = undefined;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
