// The open document and the editor around it, in one Zustand store. The drawing engine works on the
// same settings and document objects (mutated in place), so `update` mutates them and then bumps `version`.
import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';
import { cleanDoc, cleanSettings, loadSaved } from '@/engine/doc.js';
import { clearMeasureCache, use } from '@/engine/core.js';
import type { Box, EngineDoc, Settings } from '@/engine/types';
import { putDoc, type DocRecord } from '@/store/documents';
import { History } from './history';

export interface ToastAction { label: string; fn: () => void }

export interface EditorState {
  docId: string | null;
  title: string;
  S: Settings;
  doc: EngineDoc;
  version: number;       // bumps on every change
  layoutTick: number;    // bumps when the pages need laying out again
  fontTick: number;      // bumps when a font file arrives
  selectedId: string | null;
  scope: 'all' | 'box';  // the Style panel edits every block ('all') or only the selected one ('box')
  saving: 'saved' | 'saving' | 'unsaved';
  canUndo: boolean;
  canRedo: boolean;
  importOpen: boolean;
  importFile: File | null;
  focusEditor: number;
  pendingSelect: [number, number] | null;
  touchedId: string | null;
  scrollToPage: number | null;
}

export interface UpdateOptions {
  save?: boolean;
  layout?: 'now' | 'soon' | false;
  history?: string | false;
}

const emptyDoc = (): EngineDoc => ({ pageCount: 1, boxes: [], fileName: '' });
const longestBox = (doc: EngineDoc): Box | null =>
  doc.boxes.reduce<Box | null>((best, b) => (!best || b.text.length > best.text.length ? b : best), null);

// Until a document is opened the store holds what Longhand saved on this device (or the example); nothing shows it.
const init = loadSaved();

export const useEditor = create<EditorState>(() => ({
  docId: null,
  title: 'Untitled',
  S: init.S,
  doc: init.doc,
  version: 0,
  layoutTick: 0,
  fontTick: 0,
  selectedId: longestBox(init.doc)?.id ?? null,
  scope: 'all',
  saving: 'saved',
  canUndo: false,
  canRedo: false,
  importOpen: false,
  importFile: null,
  focusEditor: 0,
  pendingSelect: null,
  touchedId: null,
  scrollToPage: null,
}));
use(init.S, init.doc);

const get = useEditor.getState;
const history = new History<string>(100);
let createdAt = 0;
let layoutTimer: ReturnType<typeof setTimeout> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savePending = false;

const historyFlags = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });
const snapshotState = () => { const s = get(); return JSON.stringify({ S: s.S, doc: s.doc }); };

async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  savePending = false;
  const s = get();
  if (s.docId === null) return;
  const id = s.docId;
  try {
    await putDoc({ id, title: s.title, createdAt, updatedAt: Date.now(), settings: s.S, doc: s.doc });
    if (get().docId === id && !savePending) useEditor.setState({ saving: 'saved' });
  } catch {
    if (get().docId === id) useEditor.setState({ saving: 'unsaved' });
  }
}

function saveSoon(): void {
  if (get().docId === null) return;
  clearTimeout(saveTimer);
  savePending = true;
  saveTimer = setTimeout(() => { void saveNow(); }, 400);
}

/** Write any change still waiting for the debounce (leaving the document, closing the tab). */
export function flushSave(): Promise<void> {
  return savePending ? saveNow() : Promise.resolve();
}

export function openDocument(rec: DocRecord): void {
  if (savePending) void saveNow(); // don't lose the last edits of the document being left
  clearTimeout(layoutTimer);
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear();
  createdAt = rec.createdAt;
  clearMeasureCache();
  use(S, doc);
  const s = get();
  useEditor.setState({
    docId: rec.id, title: rec.title, S, doc,
    version: s.version + 1, layoutTick: s.layoutTick + 1,
    selectedId: longestBox(doc)?.id ?? null, scope: 'all', saving: 'saved',
    importOpen: false, importFile: null, pendingSelect: null, touchedId: null, scrollToPage: null,
    ...historyFlags(),
  });
}

// Change state, then let React know. layout: 'now' (default), 'soon' (typing: wait for a pause) or false.
export function update(fn: ((s: EditorState) => void) | null, opts: UpdateOptions = {}): void {
  const { save = true, layout = 'now', history: hist } = opts;
  if (save && hist !== false) history.record(snapshotState(), hist ?? 'edit');
  if (fn) fn(get());
  const s = get();
  use(s.S, s.doc);
  const next: Partial<EditorState> = { version: s.version + 1, ...historyFlags() };
  if (layout === 'now') { clearTimeout(layoutTimer); next.layoutTick = s.layoutTick + 1; }
  else if (layout === 'soon') {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      const t = get();
      useEditor.setState({ layoutTick: t.layoutTick + 1, version: t.version + 1 });
    }, 140);
  }
  if (save && s.docId !== null) { next.saving = 'saving'; saveSoon(); }
  useEditor.setState(next);
}

function restore(snap: string): void {
  const o = JSON.parse(snap) as { S: unknown; doc: unknown };
  update(s => {
    s.S = cleanSettings(o.S, false);
    s.doc = cleanDoc(o.doc) ?? emptyDoc();
    if (s.selectedId && !s.doc.boxes.some(b => b.id === s.selectedId)) s.selectedId = null;
    if (!s.selectedId && s.scope === 'box') s.scope = 'all';
    clearMeasureCache();
  }, { history: false });
}

export function undo(): void {
  const snap = history.undo(snapshotState());
  if (snap !== null) restore(snap);
}
export function redo(): void {
  const snap = history.redo(snapshotState());
  if (snap !== null) restore(snap);
}

export function renameDocument(title: string): void {
  const t = title.trim() || 'Untitled';
  update(s => { s.title = t; }, { history: 'rename', layout: false });
}

export function toast(msg: string, action?: ToastAction): void {
  sonnerToast(msg, action ? { action: { label: action.label, onClick: action.fn } } : undefined);
}

// Undo for whole-document changes: a snapshot, and an action that puts it back.
export const snapshot = (): string => JSON.stringify(get().doc);
export const undoTo = (snap: string, sel: string | null): ToastAction => ({
  label: 'Undo',
  fn: () => update(s => { s.doc = cleanDoc(JSON.parse(snap)) ?? emptyDoc(); s.selectedId = sel; }, { history: 'undo-to' }),
});

export const selectedBox = (): Box | null => {
  const s = get();
  return s.doc.boxes.find(b => b.id === s.selectedId) ?? null;
};
