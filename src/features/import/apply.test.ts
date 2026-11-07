// Writing an import out: into the open document as one undo step, or as a new document made only now.
import { act } from '@testing-library/react';
import { toast as sonner } from 'sonner';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { parseHash } from '@/app/route';
import type { ImportPlace } from '@/features/doc/build';
import { STYLE_LOOKS } from '@/features/style/looks';
import { createDoc, getDoc } from '@/store/documents';
import { flushSave, openDocument, redo, undo } from '@/store/editor';
import { box, docOf, fontsLoad, get, lastToast, lastToastAction, lines, open, rec } from '@/test/docs';
import { importAsNewDocument, importIntoOpenDocument, type ImportRequest } from './apply';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));
vi.mock('@/store/documents', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/documents')>();
  return { ...actual, createDoc: vi.fn(actual.createDoc) };
});

fontsLoad();
beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });
afterAll(async () => { await flushSave(); vi.unstubAllGlobals(); });

const journal = STYLE_LOOKS.find(l => l.id === 'journal')!;
const req = (p: Partial<ImportPlace> = {}, text = '# Essay\nHello'): ImportRequest => ({ text, name: 'Essay', place: { where: 'replace', look: null, header: null, ...p } });

test('into the open document: one undo step, which puts back the settings, the blocks and the title', () => {
  openDocument(rec('Untitled', docOf(box({ id: 'm', text: 'old' })))); const before = JSON.stringify({ S: get().S, doc: get().doc });
  importIntoOpenDocument(req({ look: journal }));
  expect([get().title, get().S.font, get().doc.boxes.map(b => b.text), get().selectedId]).toEqual(['Essay', 'caveat', ['# Essay\nHello'], get().doc.boxes[0].id]);
  undo(); expect(JSON.stringify({ S: get().S, doc: get().doc })).toBe(before); expect([get().title, get().canUndo]).toEqual(['Untitled', false]);
});

test('a document with a name keeps it', () => { openDocument(rec('Week 1', docOf(box()))); importIntoOpenDocument(req()); expect(get().title).toBe('Week 1'); });

test('the message says what happened, and its Undo puts it all back', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); importIntoOpenDocument(req({ where: 'append', look: journal }));
  expect([lastToast(), get().scrollToPage]).toEqual(['Added after the last page, carrying on “Main text”.', 2]);
  act(() => lastToastAction()!()); expect([get().doc.boxes[0].text, get().S.font]).toEqual([lines(40), 'labelle']);
  importIntoOpenDocument(req()); expect(lastToast()).toBe('Written out. Each page’s part can be moved, resized, edited or split off on its own.');
});

test('…and names a block of its own', () => { open({ ...docOf(box({ id: 'm', name: 'Main text', text: 'a' })), pageCount: 2 }); importIntoOpenDocument(req({ where: 'append' })); expect(lastToast()).toBe('Added after the last page as “Text block”.'); });

test('the message’s Undo puts back the title too, as one step, and lets go of a block that’s gone', () => {
  openDocument(rec('Untitled', docOf(box({ id: 'm', text: 'old' }))));
  importIntoOpenDocument(req({ look: journal }));
  const undoIt = lastToastAction()!;
  act(() => undoIt());
  expect([get().title, get().S.font, get().doc.boxes.map(b => b.id), get().selectedId, get().scope]).toEqual(['Untitled', 'labelle', ['m'], null, 'all']);
  expect([get().canUndo, get().canRedo]).toEqual([true, false]);
  undo(); expect([get().title, get().doc.boxes.map(b => b.text)]).toEqual(['Essay', ['# Essay\nHello']]);
});

test('…and when the import was already undone, it records nothing', () => {
  open(docOf(box({ id: 'm', text: 'old' }))); importIntoOpenDocument(req());
  const undoIt = lastToastAction()!;
  undo(); expect([get().canUndo, get().canRedo]).toEqual([false, true]);
  act(() => undoIt()); expect([get().canUndo, get().canRedo, get().doc.boxes[0].text]).toEqual([false, true, 'old']);
});

test('…however its blocks were written: two imports, Ctrl+Z, then the second one’s Undo records nothing and keeps Redo', () => {
  open(docOf(box({ id: 'm', text: 'old' }))); importIntoOpenDocument(req()); importIntoOpenDocument(req({}, 'second'));
  const undoSecond = lastToastAction()!;
  undo(); expect([get().canUndo, get().canRedo, get().doc.boxes.map(b => b.text)]).toEqual([true, true, ['# Essay\nHello']]);
  act(() => undoSecond()); expect([get().canUndo, get().canRedo]).toEqual([true, true]);
  redo(); expect(get().doc.boxes.map(b => b.text)).toEqual(['second']);
});

test('as a new document: opened on Write, named after the file, with its look and header, and nothing to undo', async () => {
  location.hash = '#/'; const notes = STYLE_LOOKS.find(l => l.id === 'notes')!;
  expect(await importAsNewDocument(req({ look: notes, header: { name: 'Asha', class: '', date: '7 November 2026' } }))).toBe(true);
  expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' });
  expect([get().title, get().S.font, get().S.paper, get().doc.boxes.map(b => b.kind), get().canUndo]).toEqual(['Essay', 'patrick', 'ruled', ['header', 'text'], false]);
  expect((await getDoc(get().docId!))?.doc.boxes[1].text).toBe('# Essay\nHello'); expect(lastToast()).toBe('Written out. Each page’s part can be moved, resized, edited or split off on its own.');
});

test('a file with no name of its own makes an Untitled document', async () => { await importAsNewDocument({ ...req(), name: '' }); expect(get().title).toBe('Untitled'); });

test('when this device can’t store documents, it says so and nothing opens', async () => {
  location.hash = '#/'; vi.mocked(createDoc).mockRejectedValueOnce(new Error('blocked'));
  expect(await importAsNewDocument(req())).toBe(false); expect([lastToast(), location.hash]).toEqual(['Nib can’t create documents on this device right now.', '#/']);
});
