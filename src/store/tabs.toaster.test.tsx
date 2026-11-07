// Two tabs, with this tab's messages on the real message list (sonner's Toaster), as the app shows them: a message
// said again while it is showing (a second conflict, a second follow) stays up, with its action.
// This tab is the test's own copy of the store's modules; the other tab is a second copy (vi.resetModules), on the
// same storage, and they hear each other as two tabs do (BroadcastChannel). tabs.test.ts covers the rest with sonner mocked.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { Toaster, toast as sonner } from 'sonner';
import { cleanSettings } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';
import { resetDbForTests } from './db';
import { createDoc, getDoc } from './documents';
import { COPY_LOST, FOLLOWED, NOT_KEPT, closeDocument, flushSave, installDocFollow, openDocument, update, useEditor } from './editor';

type Ed = Pick<typeof import('./editor'), 'update' | 'flushSave'>;
const type = (ed: Ed, s: string) => ed.update(st => { st.doc.boxes[0].text += s; }, { history: 'type:m', layout: false });
const text = () => useEditor.getState().doc.boxes[0].text;
const doc = (): EngineDoc => ({ pageCount: 1, fileName: '', boxes: [
  { id: 'm', page: 0, x: 112, y: 110, w: 630, text: 'The water cycle', style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Main text', color: 0 },
] });

let other: { ed: typeof import('./editor'); close: () => Promise<void> } | null = null;
let off = () => {};

/** The other tab, with the document open. */
async function otherTab(id: string) {
  vi.resetModules();
  const ed = await import('./editor'), docs = await import('./documents'), db = await import('./db');
  ed.openDocument((await docs.getDoc(id))!);
  other = { ed, close: async () => { await ed.flushSave(); await db.resetDbForTests(); } };
  return other;
}

/** The message showing `msg`, once a dismissal would have taken it down (a frame, then sonner's 200 ms exit). */
async function stillShowing(msg: string, k: number): Promise<HTMLElement> {
  await act(() => new Promise(r => setTimeout(r, 400)));
  const el = screen.queryByText(msg)?.closest('[data-sonner-toast]') ?? null;
  expect(el, `“${msg}” is showing (time ${k})`).not.toBeNull();
  expect(el).not.toHaveAttribute('data-removed', 'true');
  return el as HTMLElement;
}

beforeEach(async () => { await resetDbForTests(); globalThis.indexedDB = new IDBFactory(); location.hash = '#/'; });
afterEach(async () => {
  off(); off = () => {};
  await other?.close(); other = null;
  await closeDocument();
  act(() => { for (const t of sonner.getToasts()) sonner.dismiss(t.id); });
});

test('a second conflict in a row says so again, and its Copy gives the text lost the second time', async () => {
  const id = (await createDoc({ title: 'The Water Cycle', settings: cleanSettings(null, false), doc: doc() })).id;
  const a = await otherTab(id);
  openDocument((await getDoc(id))!); // this tab hears nothing from the other: each of its saves is refused
  render(<Toaster expand visibleToasts={3} />);
  const writeText = vi.fn(async (_: string) => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  for (const k of [1, 2]) {
    type(a.ed, ` A${k}`); await a.ed.flushSave();
    type({ update, flushSave }, ` LOST-${k}`);
    await act(() => flushSave());
    await waitFor(() => expect(text()).toBe(k === 1 ? 'The water cycle A1' : 'The water cycle A1 A2'));
    const shown = await stillShowing(NOT_KEPT, k); // the second time, the first is still showing
    expect(within(shown).getByRole('button', { name: COPY_LOST })).toBeInTheDocument();
  }
  fireEvent.click(within(await stillShowing(NOT_KEPT, 2)).getByRole('button', { name: COPY_LOST }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('The water cycle A1 LOST-2'));
});

test('a second follow in a row says “Updated with changes from another tab.” again', async () => {
  const id = (await createDoc({ title: 'The Water Cycle', settings: cleanSettings(null, false), doc: doc() })).id;
  const a = await otherTab(id);
  openDocument((await getDoc(id))!);
  off = installDocFollow();
  render(<Toaster expand visibleToasts={3} />);

  for (const k of [1, 2]) {
    type(a.ed, ` A${k}`); await a.ed.flushSave();
    await waitFor(() => expect(text()).toBe(k === 1 ? 'The water cycle A1' : 'The water cycle A1 A2'));
    await stillShowing(FOLLOWED, k);
  }
});
