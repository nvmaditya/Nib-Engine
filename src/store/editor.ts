// The open document and the editor around it, in one Zustand store. The drawing engine works on the
// same settings and document objects (mutated in place), so `update` mutates them and then bumps `version`.
import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';
import { cleanDoc, cleanSettings, loadSaved } from '@/engine/doc.js';
import { clearMeasureCache, use } from '@/engine/core.js';
import type { Box, EngineDoc, Settings } from '@/engine/types';
import { MEMORY_ID, beforeRouteChange, navigate } from '@/app/route';
import { giveFocusBack, rememberedFocus } from '@/lib/focus';
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
  importOpener: HTMLElement | null; // what Import gives the focus back to, when not what had it as it opened
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
  importOpener: null,
  scrollToPage: null,
  caret: null,
  writeView: 'write',
}));
use(init.S, init.doc);

const get = useEditor.getState;
const history = new History<string>(100);
let createdAt = 0;
let layoutTimer: ReturnType<typeof setTimeout> | undefined;
const cancelLayout = () => { clearTimeout(layoutTimer); layoutTimer = undefined; };
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savePending = false;

const historyFlags = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });
/** The settings, blocks and title, as `update` records them for undo. */
export const stateSnapshot = (): string => { const s = get(); return JSON.stringify({ S: s.S, doc: s.doc, title: s.title }); };

/** Only documents kept in IndexedDB are saved; the in-memory one (storage blocked) has nowhere to go. */
const stored = (id: string | null): id is string => id !== null && id !== MEMORY_ID;

export const SAVE_FAILED = 'Nib couldn’t save your last change.';
export const SAVE_NEWER = 'This document was saved by a newer version of Nib. Reload the page to keep editing.';
export const NOT_ON_DEVICE = 'That document isn’t on this device.';
// Another tab with the same document open (see installDocFollow).
export const FOLLOWED = 'Updated with changes from another tab.';
export const NOT_KEPT = 'This document was changed in another tab, so your last change wasn’t kept.';
/** The same for a document no longer open (closed, or another opened, while its change was written): it is named. */
export const notKeptIn = (title: string): string => `“${title}” was changed in another tab, so your last change wasn’t kept.`;
export const DELETED_ELSEWHERE = 'This document was deleted in another tab.';
export const COPY_LOST = 'Copy your text';
export const COPIED = 'Copied your text.';
export const COPY_FAILED = 'Nib couldn’t copy your text.';
let saveSeq = 0;
let failing: string | null = null; // the document whose saves are failing; one message per streak
let failingNewer = false; // the last of those failures was a newer Nib's refusal

// What storage holds of the open document. A save is written only if storage hasn't moved on since: its revision
// is still `base` (the one this tab read), or the last write was this session's own (putDoc).
let base = 0;
let baseAt = 0; // its updatedAt: a record an earlier Nib wrote has no revision (0), and only its time tells it moved on
let session = '';
let written = -1; // the revision of this session's latest write: storage still holding it means this tab has it
/** Each block's text as last written (or read): what a refused save loses is what differs from it. */
let savedText = new Map<string, string>();
/** Bumps each time a document is opened or read again, so an action made for the earlier copy does nothing. */
let opened = 0;
let followSeq = 0;
let followLost = false; // a change of this tab's was refused, or dropped, since the open copy was read
const textsOf = (doc: EngineDoc) => new Map(doc.boxes.map(b => [b.id, b.text]));
/** The blocks' text that differs from `since` (as last written or read): what a refused save loses. */
const lostText = (texts: Map<string, string>, since: Map<string, string>): string =>
  [...texts].filter(([id, t]) => t.trim() && since.get(id) !== t).map(([, t]) => t).join('\n\n');

function adopt(rec: DocRecord, doc: EngineDoc): void {
  createdAt = rec.createdAt;
  base = rec.rev ?? 0;
  baseAt = rec.updatedAt;
  session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  written = -1;
  savedText = textsOf(doc);
  opened++;
  followSeq++; // a look at storage started for the earlier copy is dropped
  followLost = false;
}

/** Refusals a second try can't change. */
const refused = (e: unknown) => e instanceof NewerDocumentError || e instanceof StaleDocumentError || e instanceof MissingDocumentError;

let writing: Promise<void> | null = null; // the save being written now (its second try too)

/** Write the open document now. While it is being written, `writing` holds it, so a reload can wait for it. */
function saveNow(): Promise<void> {
  const p = writeNow();
  writing = p;
  const done = () => { if (writing === p) writing = null; };
  p.then(done, done);
  return p;
}

async function writeNow(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  savePending = false;
  const s = get();
  if (!stored(s.docId)) return;
  const id = s.docId;
  const seq = ++saveSeq, at = opened, by = session, readAt = baseAt;
  const rec: DocRecord = { id, title: s.title, createdAt, updatedAt: Date.now(), settings: s.S, doc: s.doc, rev: base };
  const texts = textsOf(s.doc), prior = savedText;
  try {
    let rev: number;
    try { rev = await putDoc(rec, { session: by, readAt }); } catch (e) {
      if (refused(e) || seq !== saveSeq) throw e; // or a newer save has started and carries newer content: no retry
      forgetDb(); // the connection may have been closed under us: open a fresh one and try once more
      rev = await putDoc(rec, { session: by, readAt });
    }
    if (opened === at) written = rev;
    if (failing === id) failing = null;
    if (seq === saveSeq && get().docId === id) savedText = texts;
    if (seq === saveSeq && get().docId === id && !savePending) useEditor.setState({ saving: 'saved' });
  } catch (e) {
    if (get().docId !== id) { // closed (Home), or another document opened, while it was written
      // Nothing shows it now, so say so here, by the name it had when it was written.
      if (e instanceof StaleDocumentError) notKept(lostText(texts, prior), rec.title);
      return;
    }
    if (seq !== saveSeq || opened !== at) return; // superseded, or the open copy isn't the one it was made from
    if (e instanceof MissingDocumentError) { leaveDeleted(); return; } // never written back
    if (e instanceof StaleDocumentError) { void follow(id, true); return; } // the other tab's version wins
    useEditor.setState({ saving: 'unsaved' });
    failingNewer = e instanceof NewerDocumentError;
    if (failing !== id) { failing = id; if (failingNewer) toast(SAVE_NEWER, reloadAction()); else toast(SAVE_FAILED); }
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
  const read = (rec.rev ?? 0) === base && (base > 0 || rec.updatedAt === baseAt); // still the copy this tab read
  if (rec.rev === written || read) { // this tab has it already
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
  const mine = lost ? lostText(textsOf(s.doc), savedText) : '';
  clearTimeout(saveTimer); saveTimer = undefined; savePending = false; saveSeq++; // nothing of the earlier copy is written
  cancelLayout();
  dismissMessages(); // a message's Undo was for the earlier copy
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear();
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
  if (lost) notKept(mine); else toast(FOLLOWED);
}

/**
 * This tab's last change wasn't kept (another tab saved first): say so, with Copy for the words it lost. `title` names
 * a document that is no longer open; the open one is "This document".
 */
function notKept(mine: string, title?: string): void {
  toast(title === undefined ? NOT_KEPT : notKeptIn(title), mine ? { label: COPY_LOST, fn: () => copyText(mine) } : undefined);
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
 * A message can be missed (a tab that slept, or whose channel the browser closed), so a page shown again looks at
 * storage too, before its first edit; the check on every save is the guarantee. Returns the remover.
 */
export function installDocFollow(): () => void {
  const check = () => {
    const id = get().docId;
    if (!stored(id)) return;
    if (savePending) void saveNow();
    else void follow(id, false);
  };
  const off = onDocsChanged(c => {
    const id = get().docId;
    if (!stored(id) || c.id !== id) return;
    if (c.type === 'deleted') leaveDeleted();
    else if (c.type === 'saved' && !(c.by !== undefined && c.by === session)) check();
  });
  const onShow = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('pageshow', onShow); // (also back from the back-forward cache)
  return () => {
    off();
    document.removeEventListener('visibilitychange', onShow);
    window.removeEventListener('pageshow', onShow);
  };
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

/**
 * Right before the page reloads: wait for a save being written, write the change waiting for a pause in typing, and
 * try once more a change an earlier save couldn't write. With `pause`, someone still typing is let finish: the change
 * is written at the pause, as it always is, and only then does this resolve. Says what became of the open document's
 * last change: `written` (or nothing to write), `newer` (a newer Nib wrote the document, so only the new version can),
 * or `failed` (it isn't written).
 */
export async function writeBeforeReload(o: { pause?: boolean } = {}): Promise<'written' | 'newer' | 'failed'> {
  for (let tried = false; ;) {
    while (writing) await writing;
    if (o.pause && savePending) { await new Promise(r => setTimeout(r, 100)); continue; }
    const id = get().docId, failed = stored(id) && failing === id;
    if (failed ? tried : !savePending) break; // (typed while it was written: write that too)
    tried = true;
    await saveNow();
  }
  const now = get().docId;
  if (!stored(now) || failing !== now) return 'written';
  return failingNewer ? 'newer' : 'failed';
}

export function openDocument(rec: DocRecord): void {
  if (savePending) void saveNow(); // don't lose the last edits of the document being left
  cancelLayout();
  dismissMessages(); // a message's Undo belongs to the document it was shown in
  const S = cleanSettings(rec.settings, false);
  const doc = cleanDoc(rec.doc) ?? emptyDoc();
  history.clear();
  failing = null;
  adopt(rec, doc);
  clearMeasureCache();
  use(S, doc);
  const s = get();
  useEditor.setState({
    docId: rec.id, title: rec.title, S, doc,
    version: s.version + 1, layoutTick: s.layoutTick + 1,
    selectedId: longestBox(doc)?.id ?? null, scope: 'all', saving: stored(rec.id) ? 'saved' : 'unsaved',
    importOpen: false, importFile: null, importOpener: null, scrollToPage: null, caret: null, writeView: 'write',
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
  dismissMessages();
  history.clear();
  failing = null;
  followSeq++; // a look at storage for it is dropped
  useEditor.setState({
    docId: null, title: '', version: s.version + 1, selectedId: null, scope: 'all', saving: 'saved',
    importOpen: false, importFile: null, importOpener: null, scrollToPage: null, caret: null,
    ...historyFlags(),
  });
  return saved;
}

let edits = 0, gestures = 0;

/** A drag, a slider's move or a field's edit, as changes that make one undo step; `end()` closes the step. */
export interface Gesture {
  (fn: (s: EditorState) => void, opts?: Omit<UpdateOptions, 'history'>): void;
  /** The step is over: if it ended where it began, and is still the newest step in the history, it is taken back. */
  end(): void;
  /**
   * Its step is open and still the newest in the history (nothing came after it, or what came was taken back),
   * so its next change goes into that step.
   */
  isNewest(): boolean;
}

/**
 * One undo step for a whole drag or resize, however long it pauses: the first call records a step under
 * a key of its own, later calls record nothing. After `end()` the next change starts a new step.
 */
export function gesture(kind: string): Gesture {
  let key = '', start: string | null = null; // start: the state before this step's first change
  const isNewest = () => start !== null && history.newest === key;
  const g = (fn: (s: EditorState) => void, opts?: Omit<UpdateOptions, 'history'>) => {
    // Our step isn't the newest any more (another step came after it, or an undo or redo): carry on as a new step, so the drag isn't lost.
    const first = !isNewest();
    if (first) { key = kind + ':g' + ++gestures; start = stateSnapshot(); }
    update(fn, { ...opts, history: first ? key : false });
    if (first && history.newest !== key) start = null; // (a change that isn't saved records no step, so there is none to take back)
  };
  return Object.assign(g, {
    end() {
      // A step that came to nothing (moved and moved back) leaves no step; Redo is as it was before it.
      if (start !== null && history.newest === key && sameState(stateSnapshot(), start) && history.retract()) {
        useEditor.setState(historyFlags());
      }
      start = null;
    },
    isNewest,
  });
}

// Change state, then let React know. layout: 'now' (default), 'soon' (typing: wait for a pause) or false.
export function update(fn: ((s: EditorState) => void) | null, opts: UpdateOptions = {}): void {
  const { save = true, layout = 'now', history: hist } = opts;
  if (save && hist !== false) { history.record(stateSnapshot(), hist ?? 'edit:' + ++edits); }
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

/** A `stateSnapshot()` read back and cleaned, as it is put back. */
function readSnapshot(snap: string): { S: Settings; doc: EngineDoc; title: string } {
  const o = JSON.parse(snap) as { S: unknown; doc: unknown; title: string };
  return { S: cleanSettings(o.S, false), doc: cleanDoc(o.doc) ?? emptyDoc(), title: o.title };
}
/** Two snapshots hold the same state, whatever order their keys were written in. */
const sameState = (a: string, b: string): boolean => a === b || JSON.stringify(readSnapshot(a)) === JSON.stringify(readSnapshot(b));

/** Put back the settings, blocks and title of a `stateSnapshot()`, as a step under the history key `key` (or none). */
function restore(snap: string, key: string | false): void {
  const o = readSnapshot(snap);
  update(s => {
    s.title = o.title;
    s.S = o.S;
    s.doc = o.doc;
    if (s.selectedId && !s.doc.boxes.some(b => b.id === s.selectedId)) s.selectedId = null;
    if (!s.selectedId && s.scope === 'box') s.scope = 'all';
    clearMeasureCache();
  }, { history: key });
}

export function undo(): void {
  const snap = history.undo(stateSnapshot());
  if (snap !== null) { restore(snap, false); takeDownUndoMessages(); }
}
export function redo(): void {
  const snap = history.redo(stateSnapshot());
  if (snap !== null) { restore(snap, false); takeDownUndoMessages(); }
}

export function renameDocument(title: string): void {
  const t = title.trim() || 'Untitled';
  update(s => { s.title = t; }, { history: 'rename', layout: false });
}

// A message's id is its text and a generation, `${msg}#${gen}`. Said again while it shows, it is the same message,
// updated in place (its new action too) rather than a copy stacked under it. Once it is going (taken down, gone by
// itself, swiped away, its action pressed), the generation moves on, so the same text said again is a new message:
// sonner would merge it into the one on its way out (its exit takes 200 ms), and it would never show.
const gens = new Map<string, number>();
const idOf = (msg: string): string => `${msg}#${gens.get(msg) ?? 0}`;
const textOf = (id: string): string => id.slice(0, id.lastIndexOf('#'));

const messages = new Set<string>(); // the ids said since they were last taken down (some may have gone already), but no `keep` one
const undoMessages = new Set<string>(); // the ids showing an Undo, so undoing or redoing can take them down
const takingDown = new Map<string, number>(); // ids taken down whose dismissal sonner can still cancel (its frame)

/** The message with this id is going: the next time its text is said, it shows again as a new message. */
function going(id: string): void {
  const msg = textOf(id);
  if (idOf(msg) !== id) return; // (that generation is over already)
  gens.set(msg, (gens.get(msg) ?? 0) + 1);
  messages.delete(id); undoMessages.delete(id);
}

/**
 * Take a message down. sonner holds a dismissal for a frame, and saying the same id in that frame cancels it, so the
 * message stays up, with its new action. After that frame it is going. (This frame comes after sonner's.)
 */
function takeDown(id: string): void {
  sonnerToast.dismiss(id);
  const held = takingDown.get(id);
  if (held !== undefined) cancelAnimationFrame(held);
  takingDown.set(id, requestAnimationFrame(() => { takingDown.delete(id); going(id); }));
}

/** Take down every message but the `keep` ones, one by one. Never with sonner's dismiss-all, which takes the `keep` ones too. */
function dismissMessages(): void {
  for (const id of messages) takeDown(id);
  messages.clear(); undoMessages.clear();
}

const takeDownUndoMessages = (): void => { for (const id of undoMessages) takeDown(id); undoMessages.clear(); };

/**
 * A message, with an optional action. `duration` (ms) keeps it up longer than sonner's default. A `keep` message
 * (a new version is ready) stays up when a document opens or closes. Its text names it (see `idOf`), so saying the
 * same thing again replaces the message showing instead of stacking a copy. Pressing the action gives the focus back
 * to what had it before the message's button took it. `onDismiss` hears it taken down or swiped away (not gone by
 * itself, nor its action pressed).
 */
export function toast(msg: string, action?: ToastAction, o: { duration?: number; keep?: boolean; onDismiss?: () => void } = {}): void {
  const id = idOf(msg);
  const held = takingDown.get(id);
  if (held !== undefined) { cancelAnimationFrame(held); takingDown.delete(id); } // sonner cancels its dismissal too
  if (o.keep) messages.delete(id); else messages.add(id);
  if (action?.label === 'Undo') undoMessages.add(id); else undoMessages.delete(id);
  const gone = () => going(id);
  sonnerToast(msg, { // (all always given: said again while it shows, the message is updated in place)
    id,
    action: action && {
      label: action.label,
      onClick: () => {
        gone(); // sonner takes it down after this, without onDismiss
        const back = rememberedFocus();
        action.fn();
        setTimeout(() => giveFocusBack(back), 0);
      },
    },
    duration: o.duration,
    onDismiss: () => { gone(); o.onDismiss?.(); },
    onAutoClose: gone,
  });
}

/** Take a message down by its text: one said with `keep`, which opening or closing a document leaves up. */
export function takeDownMessage(msg: string): void { takeDown(idOf(msg)); }

let reloader: () => void = () => location.reload();
/** What a message's Reload does. src/app/updates.ts puts its own in place (a waiting new version first), so the store never imports it. */
export function setReloader(fn: () => void): void { reloader = fn; }
/** Reload, for a message (a document a newer Nib saved, a new version ready). */
export const reloadAction = (): ToastAction => ({ label: 'Reload', fn: () => reloader() });

/** A message's action that only runs while the document it was made in is still open. */
export function docAction(label: string, fn: () => void): ToastAction {
  const id = get().docId, at = opened; // (not once another tab's version has been read in its place)
  return { label, fn: () => { if (get().docId === id && opened === at) fn(); } };
}

// Undo for whole-document changes: a snapshot, and an action that puts it back.
export const snapshot = (): string => JSON.stringify(get().doc);
export const undoTo = (snap: string, sel: string | null): ToastAction =>
  docAction('Undo', () => update(s => { s.doc = cleanDoc(JSON.parse(snap)) ?? emptyDoc(); s.selectedId = sel; }, { history: 'undo-to' }));
/** Undo for a change to the settings and the title as well (an import): back to a `stateSnapshot()`, as one step. Nothing to put back records nothing. */
export const undoToState = (snap: string): ToastAction =>
  docAction('Undo', () => { if (!sameState(stateSnapshot(), snap)) restore(snap, 'undo-to'); });

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
