// App state in one small external store. The drawing engine works on the same settings and
// document objects (mutated in place), so components read store.state and re-render on `version`.
import { useSyncExternalStore } from 'react';
import { loadSaved, saveSoon, cleanDoc } from './engine/doc.js';
import { use } from './engine/core.js';

const init = loadSaved();
const longest = init.doc.boxes.reduce((best, b) => (!best || b.text.length > best.text.length ? b : best), null);

export const state = {
  S:init.S,              // shared settings
  doc:init.doc,          // { pageCount, boxes, fileName }
  selectedId:longest ? longest.id : null,
  scope:'all',           // the Style panel edits every box ('all') or only the selected one ('box')
  tab:'write',
  touchedId:null,        // last box touched (shows its toolbar on touch screens)
  pendingSelect:null,    // [start, end] to select in the editor once it shows the box
  toast:null,            // { msg, action, id }
  importFile:null,       // a file dropped on the page, waiting for the import dialog
  importOpen:false,
  version:0,             // bumps on every change
  layoutTick:0,          // bumps when the pages need laying out again
  fontTick:0,            // bumps when a font file arrives
};
use(state.S, state.doc);

const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };
let layoutTimer = 0;

// Change state, then let React know. layout: 'now' (default), 'soon' (typing: wait for a pause) or false.
export function update(fn, { save = true, layout = 'now' } = {}) {
  if (fn) fn(state);
  use(state.S, state.doc);
  state.version++;
  if (layout === 'now') { clearTimeout(layoutTimer); state.layoutTick++; }
  else if (layout === 'soon') { clearTimeout(layoutTimer); layoutTimer = setTimeout(() => { state.layoutTick++; state.version++; emit(); }, 140); }
  if (save) saveSoon(state.S, state.doc);
  emit();
}
export function useStore() {
  useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state.version);
  return state;
}

export const selectedBox = () => state.doc.boxes.find(b => b.id === state.selectedId) || null;

let toastId = 0;
export function toast(msg, action) { update(s => { s.toast = { msg, action, id:++toastId }; }, { save:false, layout:false }); }

// Undo for whole-document changes: a snapshot, and an action that puts it back.
export const snapshot = () => JSON.stringify(state.doc);
export const undoTo = (snap, sel) => ({ label:'Undo', fn:() => update(s => { s.doc = cleanDoc(JSON.parse(snap)); s.selectedId = sel; }) });
