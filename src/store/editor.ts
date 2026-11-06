// The open document and the editor around it, in one Zustand store. The drawing engine works on the
// same settings and document objects (mutated in place), so `update` mutates them and then bumps `version`.
import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';
import { cleanDoc, cleanSettings, loadSaved } from '@/engine/doc.js';
import { clearMeasureCache, use } from '@/engine/core.js';
import type { Box, EngineDoc, Settings } from '@/engine/types';
import { MEMORY_ID } from '@/app/route';
import { putDoc, type DocRecord } from '@/store/documents';
import { forgetDb } from './db';
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
const snapshotState = () => { const s = get(); return JSON.stringify({ S: s.S, doc: s.doc, title: s.title }); };

/** Only documents kept in IndexedDB are saved; the in-memory one (storage blocked) has nowhere to go. */
const stored = (id: string | null): id is string => id !== null && id !== MEMORY_ID;

export const SAVE_FAILED = 'Nib couldn’t save your last change.';
let saveSeq = 0;
let failing: string | null = null; // the document whose saves are failing; one message per streak

async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  savePending = false;
  const s = get();
  if (!stored(s.docId)) return;
  const id = s.docId;
  const seq = ++saveSeq;
  const rec: DocRecord = { id, title: s.title, createdAt, updatedAt: Date.now(), settings: s.S, doc: s.doc };
  try {
    try { await putDoc(rec); } catch (e) {
      if (seq !== saveSeq) throw e; // a newer save has started and carries newer content: no retry
      forgetDb(); // the connection may have been closed under us: open a fresh one and try once more
      await putDoc(rec);
    }
    if (failing === id) failing = null;
    if (seq === saveSeq && get().docId === id && !savePending) useEditor.setState({ saving: 'saved' });
  } catch {
    if (seq !== saveSeq || get().docId !== id) return; // superseded, or its document is closed
    useEditor.setState({ saving: 'unsaved' });
    if (failing !== id) { failing = id; toast(SAVE_FAILED); }
  }
}

function saveSoon(): void {
  if (!stored(get().docId)) return;
  clearTimeout(saveTimer);
  savePending = true;
  saveTimer = setTimeout(() => { void saveNow(); }, 400);
}

/** Write a waiting change when the page is left or hidden (the tab may never come back). Returns the remover. */
export function installFlushOnHide(): () => void {
  const onHide = () => { void flushSave(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Write any change still waiting for the debounce (leaving the document, closing the tab). */
export function flushSave(): Promise<void> {
  return savePending ? saveNow() : Promise.resolve();
}

export function openDocument(rec: DocRecord): void {
  if (savePending) void saveNow(); // don't lose the last edits of the document being left
  clearTimeout(layoutTimer);
  sonnerToast.dismiss(); // a message's Undo belongs to the document it was shown in
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear();
  failing = null;
  createdAt = rec.createdAt;
  clearMeasureCache();
  use(S, doc);
  const s = get();
  useEditor.setState({
    docId: rec.id, title: rec.title, S, doc,
    version: s.version + 1, layoutTick: s.layoutTick + 1,
    selectedId: longestBox(doc)?.id ?? null, scope: 'all', saving: stored(rec.id) ? 'saved' : 'unsaved',
    importOpen: false, importFile: null, pendingSelect: null, touchedId: null, scrollToPage: null,
    ...historyFlags(),
  });
}

/**
 * Leave the open document (Home does this), so opening it again reads it back from storage and picks
 * up anything Home changed. Resolves once its last edit is written. The in-memory document stays open:
 * there is nowhere to read it back from.
 */
export function closeDocument(): Promise<void> {
  const s = get();
  if (s.docId === null || s.docId === MEMORY_ID) return Promise.resolve();
  const saved = flushSave(); // takes what to write now, before the state below changes
  clearTimeout(layoutTimer);
  layoutTimer = undefined;
  sonnerToast.dismiss();
  history.clear();
  failing = null;
  useEditor.setState({
    docId: null, title: '', version: s.version + 1, selectedId: null, scope: 'all', saving: 'saved',
    importOpen: false, importFile: null, pendingSelect: null, touchedId: null, scrollToPage: null,
    ...historyFlags(),
  });
  return saved;
}

let edits = 0, gestures = 0;

/**
 * One undo step for a whole drag or resize, however long it pauses: the first call records a step under
 * a key of its own, later calls record nothing.
 */
export function gesture(kind: string): (fn: (s: EditorState) => void, opts?: Omit<UpdateOptions, 'history'>) => void {
  const key = kind + ':g' + ++gestures;
  let first = true;
  return (fn, opts) => {
    update(fn, { ...opts, history: first ? key : false });
    first = false;
  };
}

// Change state, then let React know. layout: 'now' (default), 'soon' (typing: wait for a pause) or false.
export function update(fn: ((s: EditorState) => void) | null, opts: UpdateOptions = {}): void {
  const { save = true, layout = 'now', history: hist } = opts;
  if (save && hist !== false) history.record(snapshotState(), hist ?? 'edit:' + ++edits);
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
  if (save && stored(s.docId)) { next.saving = 'saving'; saveSoon(); }
  useEditor.setState(next);
}

function restore(snap: string): void {
  const o = JSON.parse(snap) as { S: unknown; doc: unknown; title: string };
  update(s => {
    s.title = o.title;
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

/** A message's action that only runs while the document it was made in is still open. */
export function docAction(label: string, fn: () => void): ToastAction {
  const id = get().docId;
  return { label, fn: () => { if (get().docId === id) fn(); } };
}

// Undo for whole-document changes: a snapshot, and an action that puts it back.
export const snapshot = (): string => JSON.stringify(get().doc);
export const undoTo = (snap: string, sel: string | null): ToastAction =>
  docAction('Undo', () => update(s => { s.doc = cleanDoc(JSON.parse(snap)) ?? emptyDoc(); s.selectedId = sel; }, { history: 'undo-to' }));

export const selectedBox = (): Box | null => {
  const s = get();
  return s.doc.boxes.find(b => b.id === s.selectedId) ?? null;
};
