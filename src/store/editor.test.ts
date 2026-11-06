import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { putDoc, type DocRecord } from '@/store/documents';
import { flushSave, openDocument, redo, renameDocument, undo, update, useEditor } from './editor';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));

const rec = (title: string, text: string): DocRecord => ({
  id: 'd' + title, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false),
  doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text, style: {}, shuffle: 0, frames: {} }] },
});

beforeEach(async () => { await flushSave(); vi.mocked(putDoc).mockClear(); });
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
