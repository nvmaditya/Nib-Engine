// Things people do to the document: each is one undo step, and restructuring says what it did with an Undo.
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { EngineDoc } from '@/engine/types';
import { box, docOf, fieldsOf, get, lastToast, lastToastAction, lines, open } from '@/test/docs';
import { flushSave, redo, snapshot, undo } from '@/store/editor';
import {
  addBlock, addField, addPageAt, addTextBlockAt, addToEndOf, deleteBlock, deletePageAt, joinBackBlock, mergeIntoPreviousPage,
  moveBlockTo, moveField, movePageTo, removeField, removePart, renameBlock, renameField, resetBoxStyle, select, setField, setV, shuffleBox, splitAt,
} from './actions';
import { useHeaderDefault } from './headerDefault';
import { layoutFor, today } from './model';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); useHeaderDefault.setState({ fields: null }); });

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

test.each([
  [() => splitAt('m', 1), 'Split “Main text”: from page 2 on, it’s a block of its own.'],
  [() => removePart('m', 1), 'Removed the page 2 part of “Main text”. The text after it moves up.'],
  [() => movePageTo(0, 1), 'Moved page 1 to position 2. The rest of “Main text” followed it onto a new page 3.'],
  [() => movePageTo(1, 0), 'Part 2 of Main text always follows the part before it. Split it off first to move it on its own.'],
  [() => moveBlockTo('m', 1, 0), 'Part 2 of Main text always follows the part before it. Split it off first to move it on its own.'],
  [() => deleteBlock('m'), 'Deleted “Main text”.'],
  [() => deletePageAt(1), 'Deleted page 2 and everything on it.'],
  [() => addPageAt(), 'Added a blank page.'],
  [() => addBlock('note', 0), 'Added a margin note. Page 1 has no free line, so it starts on page 2.'], // Main text fills page 1
])('message %#', (run, msg) => { open(docOf(m())); run(); expect(lastToast()).toBe(msg); });

const withN = (from?: string) => (): EngineDoc => docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'extra', from }));
/** A narrower Main text runs onto page 2, and n sits beside it there, with room beside Main text on page 1. */
const beside = (): EngineDoc => docOf(box({ id: 'm', name: 'Main text', w: 300, text: lines(40) }), box({ id: 'n', page: 1, x: 450, y: 600, w: 290, text: 'extra' }));
const restructuring: [string, () => EngineDoc, () => void][] = [
  ['splitAt', long, () => splitAt('m', 1)],
  ['joinBackBlock', withN('m'), () => joinBackBlock('n')],
  ['addToEndOf', withN(), () => addToEndOf('n', 'm')],
  ['removePart', long, () => removePart('m', 1)],
  ['removePart (the whole block)', withN(), () => removePart('n', 0)],
  ['deleteBlock', long, () => deleteBlock('m')],
  ['movePageTo', long, () => movePageTo(0, 1)],
  ['moveBlockTo', withN(), () => moveBlockTo('n', 0, 0)],
  ['mergeIntoPreviousPage', beside, () => mergeIntoPreviousPage(1)],
  ['deletePageAt', withN(), () => deletePageAt(1)],
  ['addPageAt', long, () => addPageAt()],
  ['addPageAt(0)', long, () => addPageAt(0)],
  ['addPageAt after a page whose text runs on', long, () => addPageAt(1)],
  ['addPageAt beside a continuation', beside, () => addPageAt(1)],
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
  open(beside());
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
  expect(vi.mocked(sonner).mock.calls.every(c => !(c[1] as { action?: unknown }).action)).toBe(true); // no Undo on a refusal
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
  setField('m', 'name', 'x'); // not a header
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
test('merging a page that shows only a pushed block moves that block up, where the page before has room', () => {
  open(docOf(box({ id: 'a', y: 700, text: lines(11) }), box({ id: 'b', y: 900, w: 300, text: 'b' }))); // b is pushed onto page 2
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Merged page 2 into page 1.');
  expect(where()).toEqual([['a', 0, 700], ['b', 0, 110]]);
  expect(get().canUndo).toBe(true);
});

test('a page that only holds a continuation can’t be merged either', () => {
  open(long());
  const before = json();
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Part 2 of Main text always follows the part before it. Split it off first to move it on its own.');
  expect((vi.mocked(sonner).mock.calls.at(-1)![1] as { action?: unknown }).action).toBeUndefined();
  expect([json(), get().canUndo]).toEqual([before, false]);
});

// A page's own blocks are the parts it shows; a full page and a block that lands elsewhere say so.
const R4_PART2 = 'Part 2 of Main text always follows the part before it. Split it off first to move it on its own.';
const pushedOff = () => docOf(box({ id: 'a', name: 'Main text', text: lines(70) }), box({ id: 'n', page: 1, y: 900, w: 300, text: 'n' }));
test('a page showing only a later part can’t be merged or moved, though a block stored on it was pushed off', () => {
  open(pushedOff()); // page 2 shows only Main text part 2; n is stored there but shows on page 3
  const before = json();
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe(R4_PART2);
  movePageTo(1, 0);
  expect(lastToast()).toBe(R4_PART2);
  expect([json(), get().canUndo]).toEqual([before, false]);
});
test('merging into a full page records nothing and says the page is full', () => {
  open({ ...docOf(box({ id: 'a', text: lines(28) }), box({ id: 'n', y: 900, w: 300, text: 'n' })), pageCount: 2 });
  const before = json();
  mergeIntoPreviousPage(1);
  expect(lastToast()).toBe('Page 1 is full, so nothing on page 2 fits on it.');
  expect((vi.mocked(sonner).mock.calls.at(-1)![1] as { action?: unknown }).action).toBeUndefined();
  expect([json(), get().canUndo]).toEqual([before, false]);
});
test('a margin note added to a full page says where it went', () => {
  open(docOf(box({ id: 'a', text: lines(28) })));
  addBlock('note', 0);
  expect(lastToast()).toBe('Added a margin note. Page 1 has no free line, so it starts on page 2.');
  addBlock('text', 0);
  expect(lastToast()).toBe('Added a text block. Page 1 has no free line, so it starts on page 2.');
  undo();
  undo();
  expect([get().doc.boxes.length, get().canUndo]).toEqual([1, false]);
});
test('a block added where there is a free line says only what it added', () => {
  open(docOf(box({ id: 'a', text: lines(3) })));
  addBlock('note', 0);
  expect(lastToast()).toBe('Added a margin note.');
  addBlock('text', 0);
  expect(lastToast()).toBe('Added a text block.');
  addBlock('header', 0);
  expect(lastToast()).toBe('Added a header block.');
});
// Add a page after this one: the new page is always blank, after whatever this page's text runs on to.
/** The parts each page shows, as block id + part index. */
const shown = () => {
  const L = layoutFor(get().S, get().doc);
  return Array.from({ length: L.pages }, (_, p) => L.segs.filter(s => s.page === p).map(s => s.box.id + s.idx));
};
test('a page added after a page whose text runs on is blank, after the run-on, and says so', () => {
  open(long());
  expect(addPageAt(1)).toBe(2);
  expect(lastToast()).toBe('Added a blank page.');
  expect(shown()).toEqual([['m0'], ['m1'], []]);
});
test('a page added where a block sits beside a continuation is really blank; Undo and Redo are one step each', () => {
  open(beside());
  const before = json();
  expect(addPageAt(1)).toBe(2);
  expect(lastToast()).toBe('Added a blank page.');
  expect(shown()).toEqual([['m0'], ['m1', 'n0'], []]);
  const after = json();
  undo();
  expect([json(), get().canUndo]).toEqual([before, false]);
  redo();
  expect(json()).toBe(after);
});
test('Add page at the end, and a page before the first, are blank too', () => {
  open(beside());
  expect(addPageAt()).toBe(2);
  expect(addPageAt(0)).toBe(0);
  expect(shown()).toEqual([[], ['m0'], ['m1', 'n0'], []]);
});

test('a header added from a later page goes to the top of page 1, and says only that', () => {
  open({ ...docOf(box({ id: 'a', text: lines(28) })), pageCount: 3 });
  addBlock('header', 2); // Add → Header with page 3 on screen
  expect(lastToast()).toBe('Added a header block.');
  expect(get().doc.boxes[1].page).toBe(0);
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

test('header fields: typing is one step per field', () => {
  open(long());
  addBlock('header', 0);
  const h = get().doc.boxes[1].id;
  const head = () => get().doc.boxes.find(b => b.id === h)!;
  const nameId = head().fields!.find(f => f.label === 'Name')!.id;
  setField(h, nameId, 'R');
  setField(h, nameId, 'Riya');
  expect(head().text).toBe(`Name: Riya\nClass:\nDate: ${today()}`);
  undo();
  expect(head().fields!.find(f => f.id === nameId)!.value).toBe('');
  expect(head().text).toBe(`Name:\nClass:\nDate: ${today()}`);
  setField('m', 'name', 'x'); // not a header
  expect(get().doc.boxes[0].fields).toBeUndefined();
});

/* ---------- A header's fields: add, rename, remove and move, one undo step each ---------- */

const hdr = (fields = fieldsOf({ name: '', class: '', date: 'd' })) =>
  box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, fields, text: '' });
const withHeader = (fields?: Parameters<typeof hdr>[0]): EngineDoc => docOf(hdr(fields), box({ id: 'm', name: 'Main text', y: 178, text: 'words' }));
const head = () => get().doc.boxes.find(b => b.id === 'h')!;
const twelve = () => Array.from({ length: 12 }, (_, i) => ({ id: 'f' + (i + 1), label: 'L' + (i + 1), value: '' }));

test('adding, renaming, removing and moving a field are one undo step each, and Redo is exact', () => {
  open(withHeader());
  const snaps = [JSON.parse(snapshot())];
  const take = () => snaps.push(JSON.parse(snapshot()));
  const id = addField('h', { label: 'Registration no.' })!; take();
  addField('h', { label: 'Teacher' }); take(); // a second add straight after: a step of its own
  setField('h', id, '1'); setField('h', id, '12'); take(); // typing: one step
  renameField('h', 'class', 'Section'); take();
  renameField('h', 'class', 'Group'); take(); // a second rename straight after: a step of its own
  moveField('h', id, 0); take();
  moveField('h', id, 1); take();
  removeField('h', 'class'); take();
  expect(snaps).toHaveLength(9);
  expect(head().text).toBe('Name:\nRegistration no.: 12\nDate: d\nTeacher:');
  expect(head().fields!.map(f => f.label)).toEqual(['Name', 'Registration no.', 'Date', 'Teacher']);
  for (let i = snaps.length - 2; i >= 0; i--) { undo(); expect(JSON.parse(snapshot()), `undo to ${i}`).toEqual(snaps[i]); }
  expect(get().canUndo).toBe(false);
  for (let i = 1; i < snaps.length; i++) { redo(); expect(JSON.parse(snapshot()), `redo to ${i}`).toEqual(snaps[i]); }
  expect(get().canRedo).toBe(false);
});

test('Remove says Removed “Section”. with Undo, which puts the field back where it was', () => {
  open(withHeader());
  renameField('h', 'class', 'Section');
  const before = JSON.parse(snapshot());
  removeField('h', 'class');
  expect(head().text).toBe('Name:\nDate: d');
  expect(lastToast()).toBe('Removed “Section”.');
  const undoIt = lastToastAction()!;
  expect(vi.mocked(sonner).mock.calls.at(-1)![1]?.action).toMatchObject({ label: 'Undo' });
  undoIt();
  expect(JSON.parse(snapshot())).toEqual(before);
  expect(head().fields!.map(f => [f.id, f.label])).toEqual([['name', 'Name'], ['class', 'Section'], ['date', 'Date']]);
  expect(head().text).toBe('Name:\nSection:\nDate: d');
});

test('a field change that changes nothing records nothing', () => {
  const nothing = (doc: EngineDoc, run: () => void, name: string) => {
    open(doc);
    const before = json(), said = toasts();
    run();
    expect([json(), get().canUndo, toasts()], name).toEqual([before, false, said]);
  };
  nothing(withHeader(), () => renameField('h', 'class', ' Class '), 'the same label');
  nothing(withHeader(), () => moveField('h', 'class', 1), 'to its own row');
  nothing(withHeader(), () => moveField('h', 'class', 3), 'past the end');
  nothing(withHeader(fieldsOf({ name: 'A' })), () => removeField('h', 'name'), 'the only field');
  nothing(withHeader(twelve()), () => addField('h', { label: 'One more' }), 'at 12');
  nothing(withHeader(), () => { renameField('h', 'gone', 'X'); moveField('h', 'gone', 0); removeField('h', 'gone'); }, 'an unknown field');
  nothing(withHeader(), () => { addField('m', { label: 'X' }); renameField('m', 'name', 'X'); moveField('m', 'name', 0); removeField('m', 'name'); }, 'a block that isn’t a header');
  nothing(withHeader(), () => { addField('nope', { label: 'X' }); removeField('nope', 'name'); }, 'a block that isn’t there');
});

test('addField gives the new field’s id, and null at 12', () => {
  open(withHeader());
  const id = addField('h', { label: 'Date', today: true });
  expect(head().fields!.at(-1)).toEqual({ id, label: 'Date', value: today(), today: true });
  expect(id).toMatch(/^b/); // a uid(), not one of the f1…fN a new header's fields have
  open(withHeader(twelve()));
  expect(addField('h', { label: 'One more' })).toBeNull();
});

test('Add → Header starts from the remembered default, its date-marked fields as today', () => {
  useHeaderDefault.setState({ fields: [{ label: 'Name', value: 'Asha' }, { label: 'Section', value: 'B' }, { label: 'Due', value: '1 May 2026', today: true }] });
  open(long());
  addBlock('header', 0);
  const h = get().doc.boxes.find(b => b.kind === 'header')!;
  expect(h.text).toBe(`Name: Asha\nSection: B\nDue: ${today()}`);
  expect(h.fields!.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
});
