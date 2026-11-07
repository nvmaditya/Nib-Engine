// Two tabs with the same document open. Each tab is its own copy of the store's modules (vi.resetModules), on the
// same storage, and they hear each other as two tabs do (BroadcastChannel).
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';

const FOLLOWED = 'Updated with changes from another tab.';
const NOT_KEPT = 'This document was changed in another tab, so your last change wasn’t kept.';
const DELETED = 'This document was deleted in another tab.';

interface Tab {
  ed: typeof import('./editor');
  docs: typeof import('./documents');
  toast: ReturnType<typeof vi.fn> & { dismiss: ReturnType<typeof vi.fn> };
  off: () => void;
  close: () => Promise<void>;
}
const tabs: Tab[] = [];

/** A tab: its own modules and its own messages. `hear: false` is a tab that misses every message from the others. */
async function openTab(hear = true): Promise<Tab> {
  vi.resetModules();
  const toast = Object.assign(vi.fn(), { dismiss: vi.fn() });
  vi.doMock('sonner', () => ({ toast }));
  const ed = await import('./editor'), docs = await import('./documents'), db = await import('./db');
  const off = hear ? ed.installDocFollow() : () => {};
  const tab: Tab = { ed, docs, toast, off, close: async () => { off(); await ed.flushSave(); await db.resetDbForTests(); } };
  tabs.push(tab);
  return tab;
}

/** Open the document in a tab as the app does: read it from storage. */
async function openIn(tab: Tab, id: string): Promise<void> {
  const rec = await tab.docs.getDoc(id);
  tab.ed.openDocument(rec!);
}

const state = (t: Tab) => t.ed.useEditor.getState();
const text = (t: Tab) => state(t).doc.boxes[0].text;
const messages = (t: Tab) => t.toast.mock.calls.map(c => c[0] as string);
const type = (t: Tab, s: string) => t.ed.update(st => { st.doc.boxes[0].text += s; }, { history: 'type:m', layout: false });

const doc = (): EngineDoc => ({ pageCount: 1, fileName: '', boxes: [
  { id: 'm', page: 0, x: 112, y: 110, w: 630, text: 'The water cycle', style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Main text', color: 0 },
] });

async function seed(a: Tab): Promise<string> {
  return (await a.docs.createDoc({ title: 'The Water Cycle', settings: cleanSettings(null, false), doc: doc() })).id;
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); location.hash = '#/'; });
afterEach(async () => { for (const t of tabs.splice(0)) await t.close(); });

test('the tester’s steps: a rename in tab A, then typing in tab B, and both are there after a reload', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(a, id); await openIn(b, id);

  a.ed.renameDocument('QA Rename A');
  await a.ed.flushSave();
  await vi.waitFor(() => expect(state(b).title).toBe('QA Rename A')); // B follows at once
  expect(messages(b)).toEqual([FOLLOWED]);

  type(b, ' typed in B');
  await b.ed.flushSave();
  const saved = (await a.docs.getDoc(id))!; // the reload reads this
  expect([saved.title, saved.doc.boxes[0].text]).toEqual(['QA Rename A', 'The water cycle typed in B']);
  await vi.waitFor(() => expect(text(a)).toBe('The water cycle typed in B')); // and A follows B
  expect(state(a).title).toBe('QA Rename A');
  expect(messages(a)).toEqual([FOLLOWED]);
  expect(state(a).saving).toBe('saved');
});

test('a tab that missed the news can’t overwrite: its save is refused, it shows the other tab’s version and says so', async () => {
  const a = await openTab(), b = await openTab(false); // B hears nothing
  const id = await seed(a);
  await openIn(a, id); await openIn(b, id);

  a.ed.renameDocument('QA Rename A');
  await a.ed.flushSave();
  type(b, ' typed in B');
  expect(state(b).canUndo).toBe(true);
  await b.ed.flushSave();

  const saved = (await a.docs.getDoc(id))!;
  expect([saved.title, saved.doc.boxes[0].text]).toEqual(['QA Rename A', 'The water cycle']);
  await vi.waitFor(() => expect(state(b).title).toBe('QA Rename A'));
  expect(text(b)).toBe('The water cycle');
  expect(messages(b)).toEqual([NOT_KEPT]);
  expect(state(b).canUndo).toBe(false); // the undo steps were for the old version
  expect(state(b).saving).toBe('saved');

  // The words it couldn't keep can be copied.
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const opts = b.toast.mock.calls.at(-1)![1] as { action: { label: string; onClick: () => void } };
  expect(opts.action.label).toBe('Copy your text');
  opts.action.onClick();
  await vi.waitFor(() => expect(messages(b).at(-1)).toBe('Copied your text.'));
  expect(writeText).toHaveBeenCalledWith('The water cycle typed in B');

  // From here B saves normally again, on top of A's version.
  type(b, ' again');
  await b.ed.flushSave();
  expect((await a.docs.getDoc(id))!.doc.boxes[0].text).toBe('The water cycle again');
  expect((await a.docs.getDoc(id))!.title).toBe('QA Rename A');
});

test('a change waiting in this tab when another tab saves first is not kept, and this tab says so', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(a, id); await openIn(b, id);

  type(b, ' mine'); // waiting for the pause in typing
  type(a, ' theirs');
  await a.ed.flushSave();
  await vi.waitFor(() => expect(text(b)).toBe('The water cycle theirs'));
  expect(messages(b)).toEqual([NOT_KEPT]);
  await b.ed.flushSave();
  expect((await a.docs.getDoc(id))!.doc.boxes[0].text).toBe('The water cycle theirs');
  expect(messages(a)).toEqual([]); // A's version stands, and nothing B did reached it
});

test('live follow: a tab with nothing waiting shows the other tab’s save in place, keeps its Write view and selection, and clears undo', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(a, id); await openIn(b, id);
  b.ed.setWriteView('outline');
  b.ed.update(s => { s.selectedId = 'm'; s.scope = 'box'; }, { save: false, layout: false });
  b.ed.update(s => { s.S.size = 40; }); // a step B can undo, saved
  await b.ed.flushSave();
  await vi.waitFor(() => expect(state(a).S.size).toBe(40));
  const tick = state(b).layoutTick;
  b.ed.toast('Did it.', b.ed.undoTo(b.ed.snapshot(), 'm')); // a message whose Undo is for this version

  type(a, ', told again');
  await a.ed.flushSave();
  await vi.waitFor(() => expect(text(b)).toBe('The water cycle, told again'));
  const s = state(b);
  expect([s.writeView, s.selectedId, s.scope, s.canUndo, s.saving]).toEqual(['outline', 'm', 'box', false, 'saved']);
  expect(s.layoutTick).toBeGreaterThan(tick);
  expect(messages(b)).toEqual(['Did it.', FOLLOWED]);
  expect(b.toast.dismiss.mock.calls).toEqual([['Did it.']]); // messages whose Undo was for the old version go, one by one
});

test('a message’s Undo from before a follow does nothing', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(a, id); await openIn(b, id);
  const back = b.ed.undoTo(b.ed.snapshot(), 'm');
  type(a, ' theirs');
  await a.ed.flushSave();
  await vi.waitFor(() => expect(text(b)).toBe('The water cycle theirs'));
  back.fn();
  expect(text(b)).toBe('The water cycle theirs');
  await b.ed.flushSave();
  expect((await a.docs.getDoc(id))!.doc.boxes[0].text).toBe('The water cycle theirs');
});

test('a document deleted in another tab is never saved back: the tab with it open goes Home and says so', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(b, id);
  location.hash = `#/d/${id}/write`;
  type(b, ' typed before the delete'); // waiting to be saved

  await a.docs.deleteDoc(id); // Home's Delete in tab A
  await vi.waitFor(() => expect(state(b).docId).toBeNull());
  expect(location.hash).toBe('#/');
  expect(messages(b)).toEqual([DELETED]);
  await b.ed.flushSave();
  expect(await a.docs.getDoc(id)).toBeUndefined();
  expect(await a.docs.listDocs()).toEqual([]);
});

test('a tab that missed the delete doesn’t bring the document back when it saves', async () => {
  const a = await openTab(), b = await openTab(false);
  const id = await seed(a);
  await openIn(b, id);
  location.hash = `#/d/${id}/write`;
  await a.docs.deleteDoc(id);
  type(b, ' typed after the delete');
  await b.ed.flushSave();
  expect(await a.docs.listDocs()).toEqual([]);
  expect(state(b).docId).toBeNull();
  expect(location.hash).toBe('#/');
  expect(messages(b)).toEqual([DELETED]);
});

test('a rename on Home in another tab shows in the tab with the document open', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(b, id);
  await a.docs.renameDoc(id, 'Essay');
  await vi.waitFor(() => expect(state(b).title).toBe('Essay'));
  type(b, ' and more');
  await b.ed.flushSave();
  const saved = (await a.docs.getDoc(id))!;
  expect([saved.title, saved.doc.boxes[0].text]).toEqual(['Essay', 'The water cycle and more']);
});

test('one tab’s saves that overlap don’t stop each other', async () => {
  const a = await openTab(), b = await openTab();
  const id = await seed(a);
  await openIn(a, id);
  type(a, ' one');
  const first = a.ed.flushSave();
  type(a, ' two');
  await a.ed.flushSave();
  await first;
  expect((await a.docs.getDoc(id))!.doc.boxes[0].text).toBe('The water cycle one two');
  expect(messages(a)).toEqual([]);
  expect(state(a).saving).toBe('saved');
  void b;
});
