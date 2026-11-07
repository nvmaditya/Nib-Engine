import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { MEMORY_ID } from '@/app/route';
import { cleanSettings } from '@/engine/doc.js';
import { resetBoxStyle } from '@/features/doc/actions';
import { NewerDocumentError, putDoc, type DocRecord } from '@/store/documents';
import { box, docOf, rec as mkRec, open } from '@/test/docs';
import { SAVE_FAILED, closeDocument, flushSave, gesture, installFlushOnHide, openDocument, redo, renameDocument, snapshot, undo, undoTo, update, useEditor } from './editor';

const get = useEditor.getState;

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const rec = (title: string, text: string): DocRecord => ({
  id: 'd' + title, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false),
  doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text, style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Text block', color: 0 }] },
});

beforeEach(async () => {
  await flushSave();
  vi.mocked(putDoc).mockReset().mockResolvedValue(undefined);
  vi.mocked(sonner).mockClear(); vi.mocked(sonner.dismiss).mockClear();
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

test('opening and closing a document dismiss its messages', async () => {
  openDocument(rec('A', 'a'));
  expect(sonner.dismiss).toHaveBeenCalledTimes(1);
  await closeDocument();
  expect(sonner.dismiss).toHaveBeenCalledTimes(2);
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
  expect(sonner).toHaveBeenCalledWith(SAVE_FAILED, undefined);

  vi.mocked(putDoc).mockResolvedValue(undefined); // the run ends with a save that works
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
  const p = new Promise<void>((_, rj) => { reject = rj; });
  return { p, reject };
};

test('a failed save’s retry is skipped once a newer save has started', async () => {
  const written: string[] = [];
  const first = hang();
  let n = 0;
  vi.mocked(putDoc).mockImplementation(async r => {
    written.push(r.doc.boxes[0].text);
    if (++n === 1) return first.p;
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

test('a save refused because a newer Nib wrote the document says so', async () => {
  vi.mocked(putDoc).mockRejectedValue(new NewerDocumentError());
  openDocument(rec('A', 'a'));
  update(s => { s.doc.boxes[0].text = 'x'; });
  await flushSave();
  update(s => { s.doc.boxes[0].text = 'y'; });
  await flushSave();
  expect(sonner).toHaveBeenCalledTimes(1);
  expect(sonner).toHaveBeenCalledWith('This document was saved by a newer version of Nib. Reload the page to keep editing.', undefined);
  expect(putDoc).toHaveBeenCalledTimes(2); // no retry for a newer-version refusal
});
