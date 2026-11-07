// The open document and the editor around it, in one Zustand store. The drawing engine works on the
// same settings and document objects (mutated in place), so `update` mutates them and then bumps `version`.
import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';
import { cleanDoc, cleanSettings, loadSaved } from '@/engine/doc.js';
import { clearMeasureCache, use } from '@/engine/core.js';
import type { Box, EngineDoc, Settings } from '@/engine/types';
import { MEMORY_ID, beforeRouteChange, navigate } from '@/app/route';
import { loadUploadedFonts } from '@/features/style/fonts';
import { MissingDocumentError, NewerDocumentError, StaleDocumentError, getDoc, onDocsChanged, putDoc, type DocRecord } from '@/store/documents';
import { forgetDb } from './db';
import { History } from './history';

export interface ToastAction { label: string; fn: () => void }

/** A request to put the caret at a markup offset of a block; the editor showing that offset takes it. */
export interface CaretRequest { boxId: string; offset: number; n: number }

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
  scrollToPage: number | null;
  caret: CaretRequest | null;
  writeView: 'write' | 'outline'; // the Write view shown last; the Write stage button goes back to it
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
  scrollToPage: null,
  caret: null,
  writeView: 'write',
}));
use(init.S, init.doc);

const get = useEditor.getState;
const history = new History<string>(100);
let createdAt = 0;
/** Counts every change to the undo history (a step recorded, undone, redone or cleared), so a gesture can tell something else happened mid-drag. */
let historyTick = 0;
let layoutTimer: ReturnType<typeof setTimeout> | undefined;
const cancelLayout = () => { clearTimeout(layoutTimer); layoutTimer = undefined; };
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savePending = false;

const historyFlags = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });
const snapshotState = () => { const s = get(); return JSON.stringify({ S: s.S, doc: s.doc, title: s.title }); };

/** Only documents kept in IndexedDB are saved; the in-memory one (storage blocked) has nowhere to go. */
const stored = (id: string | null): id is string => id !== null && id !== MEMORY_ID;

export const SAVE_FAILED = 'Nib couldn’t save your last change.';
export const SAVE_NEWER = 'This document was saved by a newer version of Nib. Reload the page to keep editing.';
export const NOT_ON_DEVICE = 'That document isn’t on this device.';
// Another tab with the same document open (see installDocFollow).
export const FOLLOWED = 'Updated with changes from another tab.';
export const NOT_KEPT = 'This document was changed in another tab, so your last change wasn’t kept.';
export const DELETED_ELSEWHERE = 'This document was deleted in another tab.';
export const COPY_LOST = 'Copy your text';
export const COPIED = 'Copied your text.';
export const COPY_FAILED = 'Nib couldn’t copy your text.';
let saveSeq = 0;
let failing: string | null = null; // the document whose saves are failing; one message per streak

// What storage holds of the open document. A save is written only if storage hasn't moved on since: its revision
// is still `base` (the one this tab read), or the last write was this session's own (putDoc).
let base = 0;
let session = '';
/** Each block's text as last written (or read): what a refused save loses is what differs from it. */
let savedText = new Map<string, string>();
/** Bumps each time a document is opened or read again, so an action made for the earlier copy does nothing. */
let opened = 0;
let followSeq = 0;
let followLost = false; // a change of this tab's was refused, or dropped, since the open copy was read
const textsOf = (doc: EngineDoc) => new Map(doc.boxes.map(b => [b.id, b.text]));

function adopt(rec: DocRecord, doc: EngineDoc): void {
  createdAt = rec.createdAt;
  base = rec.rev ?? 0;
  session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  savedText = textsOf(doc);
  opened++;
  followSeq++; // a look at storage started for the earlier copy is dropped
  followLost = false;
}

/** Refusals a second try can't change. */
const refused = (e: unknown) => e instanceof NewerDocumentError || e instanceof StaleDocumentError || e instanceof MissingDocumentError;

async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  savePending = false;
  const s = get();
  if (!stored(s.docId)) return;
  const id = s.docId;
  const seq = ++saveSeq;
  const rec: DocRecord = { id, title: s.title, createdAt, updatedAt: Date.now(), settings: s.S, doc: s.doc, rev: base, savedBy: session };
  const texts = textsOf(s.doc);
  try {
    try { await putDoc(rec); } catch (e) {
      if (refused(e) || seq !== saveSeq) throw e; // or a newer save has started and carries newer content: no retry
      forgetDb(); // the connection may have been closed under us: open a fresh one and try once more
      await putDoc(rec);
    }
    if (failing === id) failing = null;
    if (seq === saveSeq && get().docId === id) savedText = texts;
    if (seq === saveSeq && get().docId === id && !savePending) useEditor.setState({ saving: 'saved' });
  } catch (e) {
    if (seq !== saveSeq || get().docId !== id) return; // superseded, or its document is closed
    if (e instanceof MissingDocumentError) { leaveDeleted(); return; } // never written back
    if (e instanceof StaleDocumentError) { void follow(id, true); return; } // the other tab's version wins
    useEditor.setState({ saving: 'unsaved' });
    if (failing !== id) { failing = id; toast(e instanceof NewerDocumentError ? SAVE_NEWER : SAVE_FAILED); }
  }
}

/**
 * Read the open document again because another tab saved it (`lost`: this tab's last change was refused for it),
 * and show that version in place. Nothing happens if this tab already has what storage holds.
 */
async function follow(id: string, lost: boolean): Promise<void> {
  followLost ||= lost;
  const n = ++followSeq;
  let rec: DocRecord | undefined;
  try {
    await loadUploadedFonts(); // a hand another tab added is registered before the document is read, so it is kept
    rec = await getDoc(id);
  } catch {
    if (n === followSeq && followLost && get().docId === id) useEditor.setState({ saving: 'unsaved' });
    return; // it can't be read now; the next save is still checked
  }
  if (n !== followSeq || get().docId !== id) return; // a later look is on its way, or the document was closed
  if (!rec) { leaveDeleted(); return; }
  if ((rec.savedBy !== undefined && rec.savedBy === session) || (rec.rev ?? 0) === base) { // this tab has it already
    if (followLost) { followLost = false; saveSoon(); }
    return;
  }
  const lostNow = followLost || savePending; // a change typed while it was read is lost too
  followLost = false;
  readAgain(rec, lostNow);
}

/** Show the stored version of the open document in place: the stage, Write view and selection stay; undo starts again. */
function readAgain(rec: DocRecord, lost: boolean): void {
  const s = get();
  const mine = lost ? s.doc.boxes.filter(b => b.text.trim() && savedText.get(b.id) !== b.text).map(b => b.text).join('\n\n') : '';
  clearTimeout(saveTimer); saveTimer = undefined; savePending = false; saveSeq++; // nothing of the earlier copy is written
  cancelLayout();
  sonnerToast.dismiss(); // a message's Undo was for the earlier copy
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear(); historyTick++;
  failing = null;
  adopt(rec, doc);
  clearMeasureCache();
  use(S, doc);
  const keep = s.selectedId !== null && doc.boxes.some(b => b.id === s.selectedId);
  useEditor.setState({
    title: rec.title, S, doc, version: s.version + 1, layoutTick: s.layoutTick + 1,
    selectedId: keep ? s.selectedId : longestBox(doc)?.id ?? null, scope: keep ? s.scope : 'all',
    saving: 'saved', caret: null, ...historyFlags(),
  });
  toast(lost ? NOT_KEPT : FOLLOWED, mine ? { label: COPY_LOST, fn: () => copyText(mine) } : undefined);
}

function copyText(text: string): void {
  Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => toast(COPIED), () => toast(COPY_FAILED));
}

/** The open document was deleted in another tab: write nothing (that would bring it back), go Home and say so. */
function leaveDeleted(): void {
  clearTimeout(saveTimer); saveTimer = undefined; savePending = false; saveSeq++;
  void closeDocument();
  navigate({ name: 'home' });
  toast(DELETED_ELSEWHERE);
}

/**
 * Follow other tabs' saves, renames and deletes of the open document. With nothing waiting to be saved, this tab
 * reads their version and shows it in place. With a change waiting, it saves now, and the save's check decides: it
 * is refused if their write came first, and this tab then shows their version and says its change wasn't kept.
 * A message can be missed; the check on every save is the guarantee. Returns the remover.
 */
export function installDocFollow(): () => void {
  return onDocsChanged(c => {
    const id = get().docId;
    if (!stored(id) || c.id !== id) return;
    if (c.type === 'deleted') leaveDeleted();
    else if (c.type === 'saved' && !(c.by !== undefined && c.by === session)) {
      if (savePending) void saveNow();
      else void follow(id, false);
    }
  });
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
  cancelLayout();
  sonnerToast.dismiss(); // a message's Undo belongs to the document it was shown in
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear(); historyTick++;
  failing = null;
  adopt(rec, doc);
  clearMeasureCache();
  use(S, doc);
  const s = get();
  useEditor.setState({
    docId: rec.id, title: rec.title, S, doc,
    version: s.version + 1, layoutTick: s.layoutTick + 1,
    selectedId: longestBox(doc)?.id ?? null, scope: 'all', saving: stored(rec.id) ? 'saved' : 'unsaved',
    importOpen: false, importFile: null, scrollToPage: null, caret: null, writeView: 'write',
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
  cancelLayout();
  sonnerToast.dismiss();
  history.clear(); historyTick++;
  failing = null;
  followSeq++; // a look at storage for it is dropped
  useEditor.setState({
    docId: null, title: '', version: s.version + 1, selectedId: null, scope: 'all', saving: 'saved',
    importOpen: false, importFile: null, scrollToPage: null, caret: null,
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
  let key = '', seen = -1;
  return (fn, opts) => {
    // Another step (or an undo or redo) since our last change: carry on as a new step, so the drag isn't lost.
    const first = seen !== historyTick;
    if (first) key = kind + ':g' + ++gestures;
    update(fn, { ...opts, history: first ? key : false });
    seen = historyTick;
  };
}

// Change state, then let React know. layout: 'now' (default), 'soon' (typing: wait for a pause) or false.
export function update(fn: ((s: EditorState) => void) | null, opts: UpdateOptions = {}): void {
  const { save = true, layout = 'now', history: hist } = opts;
  if (save && hist !== false) { history.record(snapshotState(), hist ?? 'edit:' + ++edits); historyTick++; }
  if (fn) fn(get());
  const s = get();
  use(s.S, s.doc);
  const next: Partial<EditorState> = { version: s.version + 1, ...historyFlags() };
  if (layout === 'now') { cancelLayout(); next.layoutTick = s.layoutTick + 1; }
  else if (layout === 'soon') {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(flushLayout, 140);
  }
  if (save && stored(s.docId)) { next.saving = 'saving'; saveSoon(); }
  useEditor.setState(next);
}

/**
 * Lay out now a change still waiting for a pause in typing. The route runs this before the app hears
 * that the address changed, so the stage shown next starts from the pages as they are (Style takes the
 * page count it compares with from them).
 */
export function flushLayout(): void {
  if (layoutTimer === undefined) return;
  cancelLayout();
  const t = get();
  useEditor.setState({ layoutTick: t.layoutTick + 1, version: t.version + 1 });
}
beforeRouteChange(flushLayout);

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
  if (snap !== null) { historyTick++; restore(snap); takeDownUndoMessages(); }
}
export function redo(): void {
  const snap = history.redo(snapshotState());
  if (snap !== null) { historyTick++; restore(snap); takeDownUndoMessages(); }
}

export function renameDocument(title: string): void {
  const t = title.trim() || 'Untitled';
  update(s => { s.title = t; }, { history: 'rename', layout: false });
}

const undoMessages = new Set<string>(); // the messages showing an Undo, so undoing or redoing can take them down
const takeDownUndoMessages = (): void => { for (const id of undoMessages) sonnerToast.dismiss(id); undoMessages.clear(); };

/**
 * A message, with an optional action. `duration` (ms) keeps it up longer than sonner's default. The text
 * is its id, so saying the same thing again replaces the message showing instead of stacking a copy.
 */
export function toast(msg: string, action?: ToastAction, o: { duration?: number } = {}): void {
  if (action?.label === 'Undo') undoMessages.add(msg); else undoMessages.delete(msg);
  sonnerToast(msg, {
    id: msg,
    ...(action && { action: { label: action.label, onClick: action.fn } }),
    ...(o.duration !== undefined && { duration: o.duration }),
  });
}

/** A message's action that only runs while the document it was made in is still open. */
export function docAction(label: string, fn: () => void): ToastAction {
  const id = get().docId, at = opened; // (not once another tab's version has been read in its place)
  return { label, fn: () => { if (get().docId === id && opened === at) fn(); } };
}

// Undo for whole-document changes: a snapshot, and an action that puts it back.
export const snapshot = (): string => JSON.stringify(get().doc);
export const undoTo = (snap: string, sel: string | null): ToastAction =>
  docAction('Undo', () => update(s => { s.doc = cleanDoc(JSON.parse(snap)) ?? emptyDoc(); s.selectedId = sel; }, { history: 'undo-to' }));

let caretSeq = 0;
/** Ask for the caret at a markup offset of a block (a clicked word, the change an undo made). Also selects the block. */
export function placeCaret(boxId: string, offset: number): void {
  update(s => { s.caret = { boxId, offset, n: ++caretSeq }; s.selectedId = boxId; }, { save: false, layout: false });
}
/** An editor has placed the caret for request n: clear it, unless a newer request has come since. */
export function consumeCaret(n: number): void {
  if (get().caret?.n === n) useEditor.setState({ caret: null });
}

/** The Pages or Outline view is on screen (only the Stages nav reads this, so nothing else redraws). */
export function setWriteView(v: 'write' | 'outline'): void {
  if (get().writeView !== v) useEditor.setState({ writeView: v });
}

export const selectedBox = (): Box | null => {
  const s = get();
  return s.doc.boxes.find(b => b.id === s.selectedId) ?? null;
};
