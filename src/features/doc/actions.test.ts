// Things people do to the document: each is one undo step, and restructuring says what it did with an Undo.
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { EngineDoc } from '@/engine/types';
import { box, docOf, get, lastToast, lines, open } from '@/test/docs';
import { flushSave, redo, undo } from '@/store/editor';
import {
  addBlock, addPageAt, addTextBlockAt, addToEndOf, deleteBlock, deletePageAt, joinBackBlock, mergeIntoPreviousPage,
  moveBlockTo, movePageTo, removePart, renameBlock, resetBoxStyle, select, setField, setV, showField, shuffleBox, splitAt, writeOut,
} from './actions';
import { layoutFor, today } from './model';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

const m = () => box({ id: 'm', name: 'Main text', text: lines(40) }); // pages 1–2
const long = (): EngineDoc => docOf(m());
const json = () => JSON.stringify(get().doc);
const pages = () => layoutFor(get().S, get().doc).pages;
const toasts = () => vi.mocked(sonner).mock.calls.length;
/** Press the Undo on the last message. */
const clickUndo = () => (vi.mocked(sonner).mock.calls.at(-1)![1] as unknown as { action: { onClick: () => void } }).action.onClick();

test('removing part 2 removes only that page’s text', () => {
  open(long());
  removePart('m', 1);
  expect(get().doc.boxes[0].text).toBe(lines(28));
  expect(lastToast()).toBe('Removed the page 2 part of “Main text”. The text after it moves up.');
  expect(pages()).toBe(1);
});

test('deleting page 2 of a two-page block leaves one page', () => {
  open(long());
  deletePageAt(1);
  expect([get().doc.boxes[0].text, get().doc.pageCount, pages()]).toEqual([lines(28), 1, 1]);
});

test('removing a blank last part is a change of its own', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(28) + '\n' })));
  expect(pages()).toBe(2);
  removePart('m', 1);
  expect([get().doc.boxes[0].text, pages(), get().canUndo]).toEqual([lines(28), 1, true]);
  expect(lastToast()).toBe('Removed the page 2 part of “Main text”. The text after it moves up.');
});

test('splitting at page 2 makes a block that starts at line29', () => {
  open(long());
  splitAt('m', 1);
  const [a, b] = get().doc.boxes;
  expect(a.text).toBe(lines(28));
  expect(b.text.split('\n')[0]).toBe('line29');
  expect([b.page, b.y]).toEqual([1, 110]);
  expect(get().selectedId).toBe(b.id);
});

test('deleting a page moves the later pages up', () => {
  const doc = docOf(box({ id: 'm', page: 2, text: 'x' }));
  doc.pageCount = 3;
  open(doc);
  deletePageAt(1);
  expect(get().doc.pageCount).toBe(2);
  expect(get().doc.boxes[0].page).toBe(1);
  deletePageAt(1);
  expect([get().doc.pageCount, get().doc.boxes.length]).toEqual([1, 0]);
});

test('writeOut replaces the pages or adds after the last page', () => {
  open(docOf(box({ text: 'old' })));
  writeOut('# T', 'replace', 'f.pdf', 1);
  expect(get().doc.boxes).toHaveLength(1);
  expect(get().doc.fileName).toBe('f.pdf');
  writeOut('more', 'append', undefined, 1);
  expect(get().doc.boxes[1].page).toBe(1);
  expect(get().doc.pageCount).toBe(2);
});

test('setV writes only the selected block’s style when the scope is the block', () => {
  open(docOf(box()));
  expect(get().S.size).toBe(30);
  get().scope = 'box';
  setV({ size: 40 });
  expect(get().doc.boxes[0].style).toEqual({ size: 40 });
  expect(get().S.size).toBe(30);
});

const styled = (): EngineDoc => docOf(box({ id: 'm', text: lines(40), style: { size: 40 } }));
const threePages = (): EngineDoc => ({ ...long(), pageCount: 3 });
const cases: [string, () => EngineDoc, () => void][] = [
  ['removePart', long, () => removePart('m', 1)],
  ['splitAt', long, () => splitAt('m', 1)],
  ['deleteBlock', long, () => deleteBlock('m')],
  ['deletePageAt', threePages, () => deletePageAt(2)],
  ['writeOut', long, () => { writeOut('# T', 'replace', 'f.pdf', 1); }],
  ['setV', long, () => setV({ size: 40 })],
  ['resetBoxStyle', styled, () => resetBoxStyle()],
  ['shuffleBox', long, () => shuffleBox('m')],
];
test.each(cases)('%s is exactly one undo step', (_name, doc, run) => {
  open(doc());
  const before = JSON.stringify(get().doc);
  const S0 = JSON.stringify(get().S);
  run();
  expect(get().canUndo).toBe(true);
  undo();
  expect(JSON.stringify(get().doc)).toBe(before);
  expect(JSON.stringify(get().S)).toBe(S0);
  expect(get().canUndo).toBe(false);
});

test('a split-off block is a continued text block that remembers where it came from', () => {
  open(long());
  splitAt('m', 1);
  const [a, b] = get().doc.boxes;
  expect([b.kind, b.name, b.color, b.from]).toEqual(['text', 'Main text (continued)', 1, a.id]);
});

test('imports name the block Main text when replacing, else by the document', () => {
  open(long());
  writeOut('# T', 'replace', 'f.pdf', 1);
  expect(get().doc.boxes.map(b => b.name)).toEqual(['Main text']);
  writeOut('more', 'append', undefined, 1);
  expect(get().doc.boxes.map(b => [b.name, b.color])).toEqual([['Main text', 0], ['Text block', 1]]);
});

test.each([
  [() => splitAt('m', 1), 'Split “Main text”: from page 2 on, it’s a block of its own.'],
  [() => removePart('m', 1), 'Removed the page 2 part of “Main text”. The text after it moves up.'],
  [() => movePageTo(0, 1), 'Moved page 1 to position 2. The rest of “Main text” followed it onto a new page 3.'],
  [() => movePageTo(1, 0), 'Part 2 of Main text always follows the part before it. Split it off first to move it on its own.'],
  [() => moveBlockTo('m', 1, 0), 'Part 2 of Main text always follows the part before it. Split it off first to move it on its own.'],
  [() => deleteBlock('m'), 'Deleted “Main text”.'],
  [() => deletePageAt(1), 'Deleted page 2 and everything on it.'],
  [() => addPageAt(), 'Added a blank page.'],
  [() => addBlock('note', 0), 'Added a margin note.'],
])('message %#', (run, msg) => { open(docOf(m())); run(); expect(lastToast()).toBe(msg); });

const withN = (from?: string) => (): EngineDoc => docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'extra', from }));
const restructuring: [string, () => EngineDoc, () => void][] = [
  ['splitAt', long, () => splitAt('m', 1)],
  ['joinBackBlock', withN('m'), () => joinBackBlock('n')],
  ['addToEndOf', withN(), () => addToEndOf('n', 'm')],
  ['removePart', long, () => removePart('m', 1)],
  ['removePart (the whole block)', withN(), () => removePart('n', 0)],
  ['deleteBlock', long, () => deleteBlock('m')],
  ['movePageTo', long, () => movePageTo(0, 1)],
  ['moveBlockTo', withN(), () => moveBlockTo('n', 0, 0)],
  ['mergeIntoPreviousPage', withN(), () => mergeIntoPreviousPage(1)],
  ['deletePageAt', withN(), () => deletePageAt(1)],
  ['addPageAt', long, () => addPageAt()],
  ['addPageAt(0)', long, () => addPageAt(0)],
  ['addBlock text', long, () => addBlock('text', 0)],
  ['addBlock note', long, () => addBlock('note', 1)],
  ['addBlock header', long, () => addBlock('header', 0)],
  ['addTextBlockAt', long, () => addTextBlockAt(1, 300, 700)],
];
test('every restructuring action is one undo step, and its message’s Undo puts it back', () => {
  for (const [name, doc, run] of restructuring) {
    open(doc());
    const before = json();
    run();
    expect(json(), name).not.toBe(before);
    expect(get().canUndo, name).toBe(true);
    undo();
    expect(json(), name).toBe(before);
    expect(get().canUndo, name).toBe(false);
    redo();
    expect(json(), name).not.toBe(before);
    clickUndo();
    expect(json(), name).toBe(before);
  }
});

test('Join back and Add to the end of say what they did', () => {
  open(withN()());
  splitAt('m', 1);
  const c = get().doc.boxes[1];
  joinBackBlock(c.id);
  expect(lastToast()).toBe('Joined “Main text (continued)” back into “Main text”.');
  expect(get().selectedId).toBe('m');
  addToEndOf('n', 'm');
  expect(lastToast()).toBe('Added “Text block” to the end of “Main text”.');
  expect(get().doc.boxes.map(b => b.id)).toEqual(['m']);
  expect(get().doc.boxes[0].text).toBe(lines(40) + '\nextra');
});

test('merge mentions text that runs on', () => {
  open(docOf(m(), box({ id: 'c', page: 1, y: 600 })));
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Merged page 2 into page 1. Text that runs on from it still continues on the next page.');
  open({ ...docOf(box({ id: 'a' }), box({ id: 'b', page: 1, y: 400 })), pageCount: 2 });
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Merged page 2 into page 1.');
});

test('a second header is refused', () => {
  open(long());
  addBlock('header', 0);
  expect(lastToast()).toBe('Added a header block.');
  addBlock('header', 0);
  expect(lastToast()).toBe('This document already has a header block.');
  undo();
  expect(get().doc.boxes.map(b => b.kind)).toEqual(['text']);
  expect(get().canUndo).toBe(false);
});

test('a refused move changes nothing and is not an undo step', () => {
  open(long());
  const before = json();
  movePageTo(1, 0);
  moveBlockTo('m', 1, 0);
  expect(json()).toBe(before);
  expect(get().canUndo).toBe(false);
  expect(vi.mocked(sonner).mock.calls.every(c => c[1] === undefined)).toBe(true); // no Undo on a refusal
});

test('moves say where things went', () => {
  open(threePages());
  movePageTo(0, 1);
  expect(lastToast()).toBe('Moved page 1 to position 2. The rest of “Main text” followed it onto page 3.');
  open({ ...docOf(box({ id: 'a' }), box({ id: 'b', page: 1 })), pageCount: 2 });
  movePageTo(1, 0);
  expect(lastToast()).toBe('Moved page 2 to position 1.');
  open(withN()());
  moveBlockTo('n', 0, 0);
  expect(lastToast()).toBe('Moved “Text block” to page 1.');
  expect([get().doc.boxes[1].page, get().doc.boxes[1].y]).toEqual([0, 600]);
});

test('actions that would change nothing record nothing and say nothing', () => {
  open(withN()());
  const before = json();
  movePageTo(0, 0); movePageTo(0, 5); moveBlockTo('n', 0, 1); moveBlockTo('gone', 0, 0);
  mergeIntoPreviousPage(0); mergeIntoPreviousPage(2); deletePageAt(2); deletePageAt(-1);
  splitAt('n', 1); splitAt('gone', 1); joinBackBlock('n'); addToEndOf('n', 'n'); addToEndOf('n', 'gone');
  removePart('m', 2); deleteBlock('gone'); renameBlock('m', '   '); renameBlock('m', 'Main text');
  expect(json()).toBe(before);
  expect(get().canUndo).toBe(false);
  expect(toasts()).toBe(0);
});

test('repeating an action, or one with nothing to act on, records nothing and says nothing', () => {
  open(withN()());
  deleteBlock('n'); removePart('m', 1);
  const after = json();
  vi.mocked(sonner).mockClear();
  deleteBlock('n'); removePart('n', 0); removePart('m', 1); deletePageAt(1); joinBackBlock('n');
  expect(json()).toBe(after);
  expect(toasts()).toBe(0);
  undo(); undo(); undo();
  expect(get().canUndo).toBe(false); // only the two real changes were steps
  open(docOf()); // one empty page
  deletePageAt(0); deletePageAt(0); mergeIntoPreviousPage(1); movePageTo(0, 1);
  open(long());
  const text = json();
  setField('m', 'name', 'x'); showField('m', 'roll', true); // not a header
  expect(json()).toBe(text);
  expect(get().canUndo).toBe(false);
  expect(toasts()).toBe(0);
});

// A page that only shows a block pushed onto it from the page before: that block starts there.
const pushedPage = () => docOf(box({ id: 'a', text: lines(28) }), box({ id: 'b', y: 900, w: 300, text: 'b' }));
const where = () => get().doc.boxes.map(b => [b.id, b.page, b.y]);
test('moving a page that shows only a pushed block moves that block', () => {
  open(pushedPage());
  expect(layoutFor(get().S, get().doc).segs.map(s => [s.box.id, s.page])).toEqual([['a', 0], ['b', 1]]);
  movePageTo(1, 0);
  expect(lastToast()).toBe('Moved page 2 to position 1.');
  expect(where()).toEqual([['a', 1, 110], ['b', 0, 110]]);
  expect(get().canUndo).toBe(true);
});
test('moving the page before a pushed-only page says so rightly', () => {
  open(pushedPage());
  movePageTo(0, 1);
  expect(lastToast()).toBe('Moved page 1 to position 2.');
  expect(layoutFor(get().S, get().doc).segs.map(s => [s.box.id, s.page])).toEqual([['a', 1], ['b', 0]]);
});
test('merging a page that shows only a pushed block moves that block up', () => {
  open(pushedPage());
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Merged page 2 into page 1.');
  expect(where()).toEqual([['a', 0, 110], ['b', 0, 110]]);
});

test('a page that only holds a continuation can’t be merged either', () => {
  open(long());
  const before = json();
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Part 2 of Main text always follows the part before it. Split it off first to move it on its own.');
  expect(vi.mocked(sonner).mock.calls.at(-1)![1]).toBeUndefined();
  expect([json(), get().canUndo]).toEqual([before, false]);
});

test('Split from the rest on the first part splits where page 2 begins', () => {
  open(long());
  splitAt('m', 0);
  expect(get().doc.boxes.map(b => b.text.split('\n')[0])).toEqual(['line1', 'line29']);
  expect(lastToast()).toBe('Split “Main text”: from page 2 on, it’s a block of its own.');
});

test('new blocks are selected; removing a block clears a selection on it', () => {
  open(long());
  get().scope = 'box';
  addBlock('note', 2);
  const note = get().doc.boxes[1];
  expect([get().selectedId, note.kind, note.page, note.y, get().doc.pageCount]).toEqual([note.id, 'note', 2, 110, 3]);
  addTextBlockAt(0, 300, 700);
  const t = get().doc.boxes[2];
  expect([get().selectedId, t.page, t.x, t.y, t.name]).toEqual([t.id, 0, 300, 688, 'Text block']);
  expect(lastToast()).toBe('Added a text block.');
  removePart(t.id, 0); // its only part
  expect(lastToast()).toBe('Deleted “Text block”.');
  expect([get().selectedId, get().scope]).toEqual([null, 'all']);
  select(note.id);
  deletePageAt(2);
  expect(get().selectedId).toBeNull();
  select('m');
  deleteBlock(note.id); // already gone: nothing happens
  expect(get().selectedId).toBe('m');
  splitAt('m', 1);
  const c = get().doc.boxes[1];
  expect(get().selectedId).toBe(c.id);
  select('m');
  deleteBlock(c.id); // another block was selected: it stays selected
  expect(get().selectedId).toBe('m');
  deleteBlock('m');
  expect(get().selectedId).toBeNull();
});

test('a text block added on a later page makes that page exist', () => {
  open(long());
  addTextBlockAt(3, 112, 110);
  expect([get().doc.boxes[1].page, get().doc.pageCount]).toEqual([3, 4]);
});

test('renaming a block', () => {
  open(long());
  renameBlock('m', '  Essay  ');
  expect(get().doc.boxes[0].name).toBe('Essay');
  renameBlock('m', '');
  expect(get().doc.boxes[0].name).toBe('Essay');
  undo();
  expect(get().doc.boxes[0].name).toBe('Main text');
  expect(get().canUndo).toBe(false);
});

test('header fields: typing is one step per field, and fields can be shown and hidden', () => {
  open(long());
  addBlock('header', 0);
  const h = get().doc.boxes[1].id;
  const head = () => get().doc.boxes.find(b => b.id === h)!;
  setField(h, 'name', 'R');
  setField(h, 'name', 'Riya');
  expect(head().text).toBe(`Name: Riya\nClass:\nDate: ${today()}`);
  undo();
  expect(head().fields!.name).toBe('');
  showField(h, 'subject', true);
  expect(head().text).toBe(`Name:\nClass:\nSubject:\nDate: ${today()}`);
  showField(h, 'subject', false);
  expect(head().fields!.subject).toBeUndefined();
  undo();
  expect(head().fields!.subject).toBe('');
  setField('m', 'name', 'x'); // not a header
  expect(get().doc.boxes[0].fields).toBeUndefined();
});
