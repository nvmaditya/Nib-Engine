import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { MEMORY_ID } from '@/app/route';
import { cleanSettings } from '@/engine/doc.js';
import { resetBoxStyle } from '@/features/doc/actions';
import { MissingDocumentError, NewerDocumentError, putDoc, type DocRecord } from '@/store/documents';
import { box, docOf, rec as mkRec, open } from '@/test/docs';
import { SAVE_FAILED, closeDocument, flushLayout, flushSave, gesture, installFlushOnHide, openDocument, redo, renameDocument, snapshot, toast, undo, undoTo, update, useEditor } from './editor';

const get = useEditor.getState;

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const rec = (title: string, text: string): DocRecord => ({
  id: 'd' + title, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false),
  doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text, style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Text block', color: 0 }] },
});

beforeEach(async () => {
  await flushSave();
  vi.mocked(putDoc).mockReset().mockResolvedValue(1);
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

test('opening and closing a document take down its messages, one by one', async () => {
  openDocument(rec('A', 'a'));
  toast('One'); toast('Two', { label: 'Undo', fn: () => {} });
  vi.mocked(sonner.dismiss).mockClear();
  openDocument(rec('B', 'b'));
  // Never all at once: sonner merges a message said again right after a dismiss-all into the one going away.
  expect(vi.mocked(sonner.dismiss).mock.calls).toEqual([['One'], ['Two']]);
  toast('Three');
  vi.mocked(sonner.dismiss).mockClear();
  await closeDocument();
  expect(vi.mocked(sonner.dismiss).mock.calls).toEqual([['Three']]);
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
  expect(sonner).toHaveBeenCalledWith(SAVE_FAILED, { id: SAVE_FAILED });

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

test('a gesture that ends where it began leaves no step, and Redo stays', () => {
  openDocument(rec('A', 'x')); update(s => { s.S.size = 30; }); undo(); // Redo is now available
  const g = gesture('slider:size'); g(s => { s.S.size = 31; }); g(s => { s.S.size = 30; }); g.end();
  expect(get()).toMatchObject({ canUndo: false, canRedo: true });
});

test('…but a gesture that changed something is one step', () => {
  openDocument(rec('A', 'x'));
  const g = gesture('slider:size'); g(s => { s.S.size = 31; }); g(s => { s.S.size = 32; }); g.end();
  expect(get()).toMatchObject({ canUndo: true, canRedo: false });
  undo(); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('a gesture ended after another step leaves that step alone', () => {
  openDocument(rec('A', 'x'));
  const g = gesture('slider:size'); g(s => { s.S.size = 31; });
  update(s => { s.S.size = 30; }); // another change, a step of its own, puts the size back
  g.end();
  expect(get().canUndo).toBe(true);
  undo(); expect(get().S.size).toBe(31); undo(); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('after end() the next change is a new step; a gesture that changed nothing ends quietly', () => {
  openDocument(rec('A', 'x'));
  const g = gesture('slider:size'); g.end(); expect(get().canUndo).toBe(false);
  g(s => { s.S.size = 31; }); g.end(); g(s => { s.S.size = 32; }); g.end();
  undo(); expect(get().S.size).toBe(31);
  g(s => { s.S.size = 33; }); g(s => { s.S.size = 31; }); g.end(); g.end(); // back where it began, and ended twice
  expect(get()).toMatchObject({ canUndo: true, canRedo: true });
  undo(); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
});

test('gestures that come back where they began are taken back newest first, each carrying on its own step', () => {
  openDocument(rec('A', 'x'));
  const a = gesture('slider:size'), b = gesture('slider:size');
  a(s => { s.S.size = 31; }); b(s => { s.S.size = 32; });
  expect([a.isNewest(), b.isNewest()]).toEqual([false, true]);
  b(s => { s.S.size = 31; }); b.end();
  expect([a.isNewest(), b.isNewest()]).toEqual([true, false]); expect(get().canUndo).toBe(true);
  a(s => { s.S.size = 30; }); a.end(); // into a's own step again, which now ends where it began
  expect(get()).toMatchObject({ canUndo: false, canRedo: false });
  expect(a.isNewest()).toBe(false);
});

test('a gesture whose step another change came after is not the newest, and ends as a step', () => {
  openDocument(rec('A', 'x'));
  const a = gesture('slider:size'); a(s => { s.S.size = 31; });
  update(s => { s.S.gap = 40; }); expect(a.isNewest()).toBe(false);
  a(s => { s.S.size = 30; }); a.end(); // a new step of its own, and a real change
  undo(); expect(get().S).toMatchObject({ size: 31, gap: 40 }); undo(); undo(); expect(get().S.size).toBe(30); expect(get().canUndo).toBe(false);
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
  expect(sonner).toHaveBeenCalledWith('This document was saved by a newer version of Nib. Reload the page to keep editing.', { id: 'This document was saved by a newer version of Nib. Reload the page to keep editing.' });
  expect(putDoc).toHaveBeenCalledTimes(2); // no retry for a newer-version refusal
});

test('a message can stay up longer than the default, with or without an action', () => {
  const fn = vi.fn();
  toast('Plain'); toast('With Undo', { label: 'Undo', fn }); toast('Longer', undefined, { duration: 15_000 }); toast('Both', { label: 'Share', fn }, { duration: 15_000 });
  expect(vi.mocked(sonner).mock.calls).toEqual([
    ['Plain', { id: 'Plain' }],
    ['With Undo', { id: 'With Undo', action: { label: 'Undo', onClick: fn } }],
    ['Longer', { id: 'Longer', duration: 15_000 }],
    ['Both', { id: 'Both', action: { label: 'Share', onClick: fn }, duration: 15_000 }],
  ]);
});

test('a message said again replaces the one showing, whatever its action', () => {
  toast('Same'); toast('Same'); toast('Other');
  expect(vi.mocked(sonner).mock.calls.map(c => (c[1] as { id: string }).id)).toEqual(['Same', 'Same', 'Other']);
});

test('undoing or redoing dismisses the messages that offer Undo, and only those', () => {
  openDocument(rec('A', 'a'));
  vi.mocked(sonner.dismiss).mockClear();
  update(s => { s.doc.boxes[0].text = 'a2'; });
  toast('Did it', { label: 'Undo', fn: () => {} }); toast('Ready.', { label: 'Share', fn: () => {} }); toast('Plain');
  undo();
  const down = () => vi.mocked(sonner.dismiss).mock.calls.flat();
  expect(down()).toContain('Did it'); expect(down()).not.toContain('Ready.'); expect(down()).not.toContain('Plain');
  vi.mocked(sonner.dismiss).mockClear();
  toast('Did it', { label: 'Undo', fn: () => {} });
  redo();
  expect(down()).toEqual(['Did it']);
});

test('an undo that changes nothing leaves the messages alone', () => {
  openDocument(rec('A', 'a'));
  vi.mocked(sonner.dismiss).mockClear();
  undo();
  expect(sonner.dismiss).not.toHaveBeenCalled();
});
