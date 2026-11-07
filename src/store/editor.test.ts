import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { installFocusMemory } from '@/lib/focus';
import { MEMORY_ID } from '@/app/route';
import { cleanSettings } from '@/engine/doc.js';
import { resetBoxStyle } from '@/features/doc/actions';
import { MissingDocumentError, NewerDocumentError, putDoc, type DocRecord } from '@/store/documents';
import { box, docOf, rec as mkRec, open } from '@/test/docs';
import { SAVE_FAILED, SAVE_NEWER, closeDocument, flushLayout, flushSave, gesture, installFlushOnHide, openDocument, redo, renameDocument, setReloader, snapshot, toast, undo, undoTo, update, useEditor } from './editor';

const get = useEditor.getState;

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));
// sonner's toast is a mock; a test that needs the real message list passes it through (realMessages).
vi.mock('sonner', async orig => ({ ...(await orig<typeof import('sonner')>()), toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

/** The real sonner behind the mock, and its message list on screen. */
async function realMessages() {
  const real = await vi.importActual<typeof import('sonner')>('sonner');
  vi.mocked(sonner).mockImplementation(real.toast);
  vi.mocked(sonner.dismiss).mockImplementation(real.toast.dismiss);
  render(createElement(real.Toaster, { expand: true, visibleToasts: 3 }));
  return real;
}
/** Let `ms` go by a frame at a time, with React drawing between frames as a browser does. */
const tick = (ms: number) => { for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(Math.min(16, ms - t)); }); };
/** `msg` is on screen, and not on its way out. */
const showing = (msg: string): boolean => {
  const el = screen.queryByText(msg)?.closest('[data-sonner-toast]');
  return !!el && el.getAttribute('data-removed') !== 'true';
};
type SonnerOpts = { id: string; action?: { label: string; onClick: () => void }; duration?: number };
const said = () => vi.mocked(sonner).mock.calls.map(([msg, o]) => {
  const { id, action, duration } = o as SonnerOpts;
  return { msg, id, action: action?.label, duration };
});

const rec = (title: string, text: string): DocRecord => ({
  id: 'd' + title, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false),
  doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text, style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Text block', color: 0 }] },
});

beforeEach(async () => {
  await flushSave();
  vi.mocked(putDoc).mockReset().mockResolvedValue(1);
  vi.mocked(sonner).mockReset(); vi.mocked(sonner.dismiss).mockReset();
});
afterEach(() => { vi.useRealTimers(); });

test('an edit can be undone and redone', () => {
  openDocument(rec('A', 'hello'));
  update(s => { s.doc.boxes[0].text = 'changed'; });
  undo();
  expect(useEditor.getState().doc.boxes[0].text).toBe('hello');
  redo();
  expect(useEditor.getState().doc.boxes[0].text).toBe('changed');
});

test('opening another document clears undo', () => {
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'a2'; });
  openDocument(rec('B', 'b'));
  undo();
  expect(useEditor.getState().doc.boxes[0].text).toBe('b');
  expect(useEditor.getState().canUndo).toBe(false);
});

test('saves are debounced into the repository', async () => {
  vi.useFakeTimers();
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  update(s => { s.doc.boxes[0].text = 'y'; });
  await vi.advanceTimersByTimeAsync(450);
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('y');
});

test('renaming to nothing gives Untitled', () => {
  openDocument(rec('A', 'a'));
  renameDocument('   ');
  expect(useEditor.getState().title).toBe('Untitled');
});

test('selection changes are not history steps and are not saved', async () => {
  vi.useFakeTimers();
  openDocument(rec('A', 'a'));
  update(s => { s.selectedId = null; }, { save: false, layout: false });
  await vi.advanceTimersByTimeAsync(450);
  expect(useEditor.getState().canUndo).toBe(false);
  expect(putDoc).not.toHaveBeenCalled();
});

test('a rename is a step that Undo takes back and Redo puts again', () => {
  openDocument(rec('A', 'a'));
  renameDocument('Essay');
  expect(useEditor.getState().canUndo).toBe(true);
  undo();
  expect(useEditor.getState().title).toBe('A');
  redo();
  expect(useEditor.getState().title).toBe('Essay');
});

test('closing a document writes its last edit and leaves nothing open', async () => {
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'last words'; });
  await closeDocument();
  expect(putDoc).toHaveBeenCalledTimes(1);
  expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('last words');
  const s = useEditor.getState();
  expect(s.docId).toBeNull();
  expect(s.canUndo).toBe(false);
  expect(s.saving).toBe('saved');
});

test('opening and closing a document take down its messages, one by one', async () => {
  openDocument(rec('A', 'a'));
  toast('One'); toast('Two', { label: 'Undo', fn: () => {} });
  vi.mocked(sonner.dismiss).mockClear();
  openDocument(rec('B', 'b'));
  // Never all at once: sonner merges a message said again right after a dismiss-all into the one going away.
  expect(vi.mocked(sonner.dismiss).mock.calls).toEqual([['One#0'], ['Two#0']]);
  toast('Three');
  vi.mocked(sonner.dismiss).mockClear();
  await closeDocument();
  expect(vi.mocked(sonner.dismiss).mock.calls).toEqual([['Three#0']]);
});

test('a message’s Undo does nothing once another document is open', () => {
  openDocument(rec('A', 'a'));
  const snap = snapshot();
  update(s => { s.doc.boxes[0].text = 'a2'; });
  const back = undoTo(snap, 'b1');
  openDocument(rec('B', 'b'));
  back.fn();
  expect(useEditor.getState().doc.boxes[0].text).toBe('b');
  expect(useEditor.getState().canUndo).toBe(false);

  const again = undoTo(snapshot(), 'b1'); // in the same document it still works
  update(s => { s.doc.boxes[0].text = 'b2'; });
  again.fn();
  expect(useEditor.getState().doc.boxes[0].text).toBe('b');
});

test('Undo on “matches the document again” does nothing in another document', () => {
  const styled = rec('A', 'a');
  styled.doc.boxes[0].style = { size: 40 };
  openDocument(styled);
  resetBoxStyle();
  const [msg, opts] = vi.mocked(sonner).mock.calls.at(-1)!;
  expect(msg).toBe('This block matches the document again.');
  openDocument(rec('B', 'b')); // its block has the same id, b1
  (opts?.action as unknown as { onClick: () => void }).onClick(); // the message's Undo button
  expect(useEditor.getState().doc.boxes[0].style).toEqual({});
  expect(useEditor.getState().canUndo).toBe(false);
});

test('a save that fails once is tried again and saved, with no message', async () => {
  vi.mocked(putDoc).mockRejectedValueOnce(new Error('connection closed'));
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  await flushSave();
  expect(putDoc).toHaveBeenCalledTimes(2);
  expect(useEditor.getState().saving).toBe('saved');
  expect(sonner).not.toHaveBeenCalled();
});

test('saves that keep failing show one message for the run, and Not saved', async () => {
  vi.mocked(putDoc).mockRejectedValue(new Error('disk full'));
  openDocument(rec('A', 'a'));
  for (const t of ['x', 'xy', 'xyz']) {
    update(s => { s.doc.boxes[0].text = t; }, { history: 'type' });
    await flushSave();
    expect(useEditor.getState().saving).toBe('unsaved');
  }
  expect(sonner).toHaveBeenCalledTimes(1);
  expect(said()).toEqual([{ msg: SAVE_FAILED, id: `${SAVE_FAILED}#0`, action: undefined, duration: undefined }]);

  vi.mocked(putDoc).mockResolvedValue(1); // the run ends with a save that works
  update(s => { s.doc.boxes[0].text = 'ok'; });
  await flushSave();
  expect(useEditor.getState().saving).toBe('saved');
  vi.mocked(putDoc).mockRejectedValue(new Error('disk full')); // a new run gets its own message
  update(s => { s.doc.boxes[0].text = 'again'; });
  await flushSave();
  expect(sonner).toHaveBeenCalledTimes(2);
});

test('the in-memory document is never written and says Not saved', async () => {
  vi.useFakeTimers();
  openDocument({ ...rec('M', 'm'), id: MEMORY_ID });
  expect(useEditor.getState().saving).toBe('unsaved');
  update(s => { s.doc.boxes[0].text = 'kept in memory'; });
  await vi.advanceTimersByTimeAsync(450);
  await flushSave();
  expect(putDoc).not.toHaveBeenCalled();
  expect(useEditor.getState().saving).toBe('unsaved');
  await closeDocument(); // it stays open: there is nowhere to read it back from
  expect(useEditor.getState().docId).toBe(MEMORY_ID);
});

const hang = () => {
  let reject!: (e: Error) => void;
  const p = new Promise<number>((_, rj) => { reject = rj; });
  return { p, reject };
};

test('a failed save’s retry is skipped once a newer save has started', async () => {
  const written: string[] = [];
  const first = hang();
  let n = 0;
  vi.mocked(putDoc).mockImplementation(async r => {
    written.push(r.doc.boxes[0].text);
    if (++n === 1) return first.p;
    return n;
  });
  open(docOf(box()));
  update(s => { s.doc.boxes[0].text = 'old'; });
  const f1 = flushSave();
  update(s => { s.doc.boxes[0].text = 'new'; });
  await flushSave();
  first.reject(new Error('closed'));
  await f1;
  expect(written).toEqual(['old', 'new']);
  expect(get().saving).toBe('saved');
  expect(sonner).not.toHaveBeenCalled();
});

test('save failures are reported once per document', async () => {
  vi.mocked(putDoc).mockRejectedValue(new Error('disk full'));
  openDocument(mkRec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  await flushSave();
  update(s => { s.doc.boxes[0].text = 'xy'; });
  await flushSave();
  openDocument(mkRec('B', 'b'));
  update(s => { s.doc.boxes[0].text = 'y'; });
  await flushSave();
  expect(sonner).toHaveBeenCalledTimes(2);
});

test('a failure that lands after its document was closed shows no message', async () => {
  const a = hang();
  vi.mocked(putDoc).mockImplementation(() => a.p);
  openDocument(mkRec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  const f = flushSave();
  vi.mocked(putDoc).mockRejectedValue(new Error('still failing'));
  openDocument(mkRec('B', 'b'));
  a.reject(new Error('closed'));
  await f;
  expect(sonner).not.toHaveBeenCalled();
});

test('a save refused after its document was opened again (same document, read again) leaves the open copy alone', async () => {
  const a = hang();
  vi.mocked(putDoc).mockImplementation(() => a.p);
  location.hash = '#/d/dA/write';
  openDocument(mkRec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  const f = flushSave();
  openDocument(mkRec('A', 'a')); // left and opened again before the save's answer came
  update(s => { s.selectedId = 'b1'; s.scope = 'box'; }, { save: false, layout: false });
  a.reject(new MissingDocumentError()); // the answer for the earlier copy
  await f;
  expect([get().docId, get().selectedId, get().scope]).toEqual(['dA', 'b1', 'box']);
  expect(location.hash).toBe('#/d/dA/write');
  expect(sonner).not.toHaveBeenCalled();
});

test('leaving the tab writes the waiting change at once', () => {
  const off = installFlushOnHide();
  open(docOf(box()));
  update(s => { s.doc.boxes[0].text = 'x'; });
  window.dispatchEvent(new Event('pagehide'));
  expect(putDoc).toHaveBeenCalledTimes(1);
  off();
});

test('hiding the tab writes it too', () => {
  const off = installFlushOnHide();
  open(docOf(box()));
  update(s => { s.doc.boxes[0].text = 'x'; });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  expect(putDoc).toHaveBeenCalledTimes(1);
  off();
});

test('a change waiting for a pause in typing can be laid out at once, and only once', () => {
  vi.useFakeTimers();
  open(docOf(box()));
  const t = get().layoutTick;
  update(s => { s.doc.boxes[0].text = 'x'; }, { layout: 'soon', history: 'type:b1' });
  expect(get().layoutTick).toBe(t);
  flushLayout();
  expect(get().layoutTick).toBe(t + 1);
  vi.advanceTimersByTime(500);
  flushLayout();
  expect(get().layoutTick).toBe(t + 1); // nothing was waiting any more
});

test('a gesture is one undo step however long it pauses', () => {
  vi.useFakeTimers();
  open(docOf(box()));
  const g = gesture('resize');
  g(s => { s.doc.boxes[0].w = 400; });
  vi.advanceTimersByTime(1500);
  g(s => { s.doc.boxes[0].w = 500; });
  undo();
  expect(get().doc.boxes[0].w).toBe(630);
  expect(get().canUndo).toBe(false);
});

test('updates without a key are separate steps', () => {
  open(docOf(box()));
  update(s => { s.doc.boxes[0].x = 1; });
  update(s => { s.doc.boxes[0].x = 2; });
  undo();
  expect(get().doc.boxes[0].x).toBe(1);
});

test('a save refused because a newer Nib wrote the document says so, with Reload', async () => {
  vi.mocked(putDoc).mockRejectedValue(new NewerDocumentError());
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  await flushSave();
  update(s => { s.doc.boxes[0].text = 'y'; });
  await flushSave();
  expect(said()).toEqual([{ msg: 'This document was saved by a newer version of Nib. Reload the page to keep editing.', id: `${SAVE_NEWER}#0`, action: 'Reload', duration: undefined }]);
  expect(putDoc).toHaveBeenCalledTimes(2); // no retry for a newer-version refusal
  const reloader = vi.fn();
  setReloader(reloader); // (src/app/updates.ts puts its own in place, which applies a waiting new version first)
  (vi.mocked(sonner).mock.calls[0][1] as SonnerOpts).action!.onClick();
  expect(reloader).toHaveBeenCalledTimes(1);
  setReloader(() => location.reload());
});

test('a message can stay up longer than the default, with or without an action', () => {
  const fn = vi.fn();
  toast('Plain'); toast('With Undo', { label: 'Undo', fn }); toast('Longer', undefined, { duration: 15_000 }); toast('Both', { label: 'Share', fn }, { duration: 15_000 });
  expect(said()).toEqual([
    { msg: 'Plain', id: 'Plain#0', action: undefined, duration: undefined },
    { msg: 'With Undo', id: 'With Undo#0', action: 'Undo', duration: undefined },
    { msg: 'Longer', id: 'Longer#0', action: undefined, duration: 15_000 },
    { msg: 'Both', id: 'Both#0', action: 'Share', duration: 15_000 },
  ]);
  (vi.mocked(sonner).mock.calls[1][1] as SonnerOpts).action!.onClick();
  (vi.mocked(sonner).mock.calls[3][1] as SonnerOpts).action!.onClick();
  expect(fn).toHaveBeenCalledTimes(2);
});

test('a message said again replaces the one showing, whatever its action', () => {
  toast('Same'); toast('Same'); toast('Other');
  expect(said().map(c => c.id)).toEqual(['Same#0', 'Same#0', 'Other#0']);
});

test('undoing or redoing dismisses the messages that offer Undo, and only those', () => {
  openDocument(rec('A', 'a'));
  vi.mocked(sonner.dismiss).mockClear();
  update(s => { s.doc.boxes[0].text = 'a2'; });
  toast('Did it', { label: 'Undo', fn: () => {} }); toast('Ready.', { label: 'Share', fn: () => {} }); toast('Plain');
  undo();
  const down = () => vi.mocked(sonner.dismiss).mock.calls.flat();
  expect(down()).toContain('Did it#0'); expect(down()).not.toContain('Ready.#0'); expect(down()).not.toContain('Plain#0');
  vi.mocked(sonner.dismiss).mockClear();
  toast('Did it', { label: 'Undo', fn: () => {} });
  redo();
  expect(down()).toEqual(['Did it#0']); // said again before it went: the same message
});

test('an undo that changes nothing leaves the messages alone', () => {
  openDocument(rec('A', 'a'));
  vi.mocked(sonner.dismiss).mockClear();
  undo();
  expect(sonner.dismiss).not.toHaveBeenCalled();
});

test('a message said again while the first one is leaving still shows', async () => {
  vi.useFakeTimers();
  const real = await realMessages();
  openDocument(rec('A', 'a'));
  // Taken down with its document, then said again: before, during and after sonner's frame and its 200 ms exit.
  for (const wait of [0, 10, 20, 30, 50, 100]) {
    const msg = `Said again ${wait} ms on.`;
    toast(msg); tick(100);
    expect(showing(msg)).toBe(true);
    openDocument(rec('A', 'a'));
    tick(wait); toast(msg); tick(1000);
    expect(showing(msg), msg).toBe(true);
  }
  toast('Gone by itself.', undefined, { duration: 1000 }); tick(1050); // on its way out
  toast('Gone by itself.'); tick(1000);
  expect(showing('Gone by itself.')).toBe(true);
  toast('Pressed.', { label: 'Copy', fn: () => {} }); tick(100);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' })); tick(50);
  toast('Pressed.'); tick(1000);
  expect(showing('Pressed.')).toBe(true);
  act(() => { for (const t of real.toast.getToasts()) real.toast.dismiss(t.id); vi.runOnlyPendingTimers(); });
});

test('a message’s action gives the focus back to what had it', async () => {
  vi.useFakeTimers();
  const off = installFocusMemory();
  const real = await realMessages();
  const bold = document.createElement('button'); bold.textContent = 'Bold'; document.body.append(bold);
  bold.focus();
  const fn = vi.fn();
  toast('Another message.', undefined, { duration: 10_000 }); // still showing after (sonner gives the focus back only once none is)
  toast('Y', { label: 'Undo', fn }); tick(100);
  const undoButton = screen.getByRole('button', { name: 'Undo' });
  undoButton.focus(); fireEvent.click(undoButton); // a click, as Chromium does it: the button takes the focus
  tick(1000);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(showing('Y')).toBe(false); expect(showing('Another message.')).toBe(true);
  expect(bold).toHaveFocus();
  act(() => { for (const t of real.toast.getToasts()) real.toast.dismiss(t.id); vi.runOnlyPendingTimers(); });
  off(); bold.remove();
});
