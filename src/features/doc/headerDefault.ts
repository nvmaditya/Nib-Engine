// The fields every new header starts with: Add → Header, the Assignment template and Import's header block. They are
// the last header changed in an open document on this device (prefs `header-default`), or the built-in Name, Class
// and Date before anything is remembered. Every tab shares the stored one; each keeps a copy in memory, so a new
// header is made at once: it is read at start and when the tab is shown again or focused, and set by the tab's own
// changes, which are written about once a second. The last write wins.
import { create } from 'zustand';
import { cleanFields } from '@/engine/doc.js';
import type { HeaderField } from '@/engine/types';
import { getPref, setPref } from '@/store/documents';
import { useEditor, type EditorState } from '@/store/editor';
import { fieldsFrom, type RememberedField } from './headerFields';

export const HEADER_DEFAULT = 'header-default';

/** This tab's copy of the remembered header's fields; null: none yet (the built-in one). */
export const useHeaderDefault = create<{ fields: RememberedField[] | null }>(() => ({ fields: null }));

const WRITE_AFTER = 1000; // ms: at most one write a second

const withoutIds = (fields: HeaderField[]): RememberedField[] =>
  fields.map(({ label, value, today }) => (today ? { label, value, today } : { label, value }));

/** A stored default made safe: the fields of `{ fields }` with at least one field in it, cleaned and without ids; else null. */
export function cleanRemembered(v: unknown): RememberedField[] | null {
  const f = v && typeof v === 'object' ? (v as { fields?: unknown }).fields : undefined;
  if (!Array.isArray(f) || !f.some(e => e && typeof e === 'object' && !Array.isArray(e))) return null;
  return withoutIds(cleanFields(f));
}

let changes = 0; // counts this tab's own changes, so a read that was on its way meanwhile never undoes one
let waiting: RememberedField[] | null = null; // this tab's change not yet written
let timer: ReturnType<typeof setTimeout> | undefined;

/** Read the stored default into this tab's copy. Never rejects: a read that fails leaves the copy as it is. */
export async function loadHeaderDefault(): Promise<void> {
  const seen = changes;
  let stored: unknown;
  try { stored = await getPref(HEADER_DEFAULT); } catch { return; }
  if (changes !== seen) return;
  const fields = cleanRemembered(stored);
  if (JSON.stringify(fields) !== JSON.stringify(useHeaderDefault.getState().fields)) useHeaderDefault.setState({ fields });
}

/** Remember a header's fields: in this tab at once, and on the device once the second since the first change waiting is up. */
export function rememberHeader(fields: HeaderField[]): void {
  changes++;
  waiting = withoutIds(fields);
  useHeaderDefault.setState({ fields: waiting });
  timer ??= setTimeout(() => { void flushHeaderDefault(); }, WRITE_AFTER);
}

/** Write a waiting change now (the page is hidden or left). A write that fails is ignored: this tab keeps its copy. */
export async function flushHeaderDefault(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const fields = waiting;
  waiting = null;
  if (!fields) return;
  try { await setPref(HEADER_DEFAULT, { fields }); } catch { /* not kept on the device */ }
}

/** A new header's fields: the remembered ones (or Name, Class and Date), each date-marked one as today's date. */
export function defaultHeaderFields(now: Date = new Date()): HeaderField[] {
  return fieldsFrom(useHeaderDefault.getState().fields, now);
}

/** The open document's header fields, and them as they are remembered (without ids, as JSON); null when it has none. */
const headerOf = (s: EditorState): { fields: HeaderField[]; json: string } | null => {
  const fields = s.doc.boxes.find(b => b.kind === 'header')?.fields;
  return fields ? { fields, json: JSON.stringify(withoutIds(fields)) } : null;
};

/**
 * Remember each change to the open document's header: anything that changes it while the same document stays open
 * (typing, the field changes, Undo and Redo, an import, another tab's version shown in place). Opening or closing a
 * document only takes its header as it is, and a document without one changes nothing. A waiting change is written
 * when the page is hidden or left; the stored one is read again when the page is shown or its window is focused,
 * unless a change of this tab's is still waiting. Returns the remover.
 */
export function installHeaderMemory(): () => void {
  let seen = { docId: useEditor.getState().docId, json: headerOf(useEditor.getState())?.json ?? null };
  const off = useEditor.subscribe(s => {
    const h = headerOf(s);
    if (h && s.docId !== null && s.docId === seen.docId && h.json !== seen.json) rememberHeader(h.fields);
    seen = { docId: s.docId, json: h?.json ?? null };
  });
  const write = () => { void flushHeaderDefault(); };
  const read = () => { if (!waiting) void loadHeaderDefault(); };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') write();
    else if (document.visibilityState === 'visible') read();
  };
  window.addEventListener('pagehide', write);
  window.addEventListener('pageshow', read); // (also back from the back-forward cache)
  window.addEventListener('focus', read);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    off();
    window.removeEventListener('pagehide', write);
    window.removeEventListener('pageshow', read);
    window.removeEventListener('focus', read);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
