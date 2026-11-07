// Restructuring, on documents laid out by the engine (8 px per character; 28 lines fill page 1).
import { expect, test } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import type { Box } from '@/engine/types';
import { box, docOf, lines, words } from '@/test/docs';
import {
  appendToBlock, deletePage, insertPage, joinBack, layoutFor, mergeIntoPrevious, moveBlockToPage, movePage, newBlock,
  removeBlock, removeBlockPart, setHeaderField, showHeaderField, splitBlock, today,
} from './model';

const S = cleanSettings(null, false);
const m = () => box({ id: 'm', name: 'Main text', text: lines(40) }); // pages 1–2

test('split makes “Main text (continued)” from page 2 on', () => { const d = docOf(m()); const n = splitBlock(S, d, 'm', 1)!; expect([n.name, n.from, n.color, n.page, n.y, n.text.split('\n')[0]]).toEqual(['Main text (continued)', 'm', 1, 1, 110, 'line29']); expect(d.boxes[0].text).toBe(lines(28)); expect(d.boxes.map(b => b.id)).toEqual(['m', n.id]); });
test('join back restores the text', () => { const d = docOf(m()); const n = splitBlock(S, d, 'm', 1)!; joinBack(S, d, n.id); expect(d.boxes).toHaveLength(1); expect(d.boxes[0].text).toBe(lines(40)); });
test('add to the end of another block', () => { const d = docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'extra' })); appendToBlock(S, d, 'n', 'm'); expect(d.boxes.map(b => b.id)).toEqual(['m']); expect(d.boxes[0].text).toBe(lines(40) + '\nextra'); });
test('removing the page 2 part', () => { const d = docOf(m()); expect(removeBlockPart(S, d, 'm', 1)).toBe('part'); expect(d.boxes[0].text).toBe(lines(28)); expect(layoutFor(S, d).pages).toBe(1); });
test('rule 3: moving a page takes its blocks, and the rest follows onto a new page', () => { const d = docOf(m()); expect(movePage(S, d, 0, 1)).toEqual({ ok: true, followed: { name: 'Main text', page: 3, added: true } }); const L = layoutFor(S, d); expect(L.pages).toBe(3); expect(L.segs.filter(s => s.page === 0)).toHaveLength(0); expect(d.boxes[0].page).toBe(1); });
test('a page that only holds a continuation can’t move', () => { const d = docOf(m()), before = JSON.stringify(d); expect(movePage(S, d, 1, 0)).toEqual({ ok: false, part: 2, name: 'Main text' }); expect(JSON.stringify(d)).toBe(before); });
test('rule 4: a continuation can’t move to another page; a start can', () => { const d = docOf(m(), box({ id: 'n', y: 600, text: 'n' })); expect(moveBlockToPage(S, d, 'm', 1, 0)).toEqual({ ok: false, part: 2, name: 'Main text' }); expect(moveBlockToPage(S, d, 'n', 0, 1)).toEqual({ ok: true }); expect([d.boxes[1].page, d.boxes[1].y]).toEqual([1, 600]); });
test('merge into the previous page', () => { const d = { ...docOf(box({ id: 'a' }), box({ id: 'b', page: 1, y: 400 })), pageCount: 2 }; expect(mergeIntoPrevious(S, d, 1)).toEqual({ ranOn: false }); expect([d.boxes[1].page, d.pageCount]).toEqual([0, 1]); const e = docOf(m(), box({ id: 'c', page: 1, y: 600 })); expect(mergeIntoPrevious(S, e, 1)).toEqual({ ranOn: true }); expect([e.boxes[1].page, e.boxes[1].y]).toEqual([0, 600]); expect(layoutFor(S, e).pages).toBe(2); });
test('delete a page and what is on it', () => { const d = docOf(m(), box({ id: 'c', page: 1, y: 600 })); deletePage(S, d, 1); expect(d.boxes.map(b => b.id)).toEqual(['m']); expect(d.boxes[0].text).toBe(lines(28)); expect(d.pageCount).toBe(1); expect(layoutFor(S, d).pages).toBe(1); });
test('insert a page', () => { const d = { ...docOf(box({ id: 'a' }), box({ id: 'b', page: 1 })), pageCount: 2 }; insertPage(S, d, 1); expect([d.boxes[1].page, d.pageCount]).toEqual([2, 3]); });
test('new blocks', () => { const d = docOf(); const t = newBlock(S, d, 'text', 0) as Box; expect([t.name, t.x, t.y, t.w]).toEqual(['Main text', 112, 110, 420]); const n = newBlock(S, d, 'note', 0) as Box; expect([n.kind, n.name, n.x, n.w]).toEqual(['note', 'Margin note', 522, 220]); const h = newBlock(S, d, 'header', 0) as Box; expect([h.page, h.x, h.y, h.w, h.text]).toEqual([0, 446, 76, 320, 'Name:\nClass:\nDate: ' + today()]); expect(newBlock(S, d, 'header', 0)).toBe('header-exists'); expect((newBlock(S, d, 'text', 0) as Box).name).toBe('Text block'); });
test('today', () => expect(today(new Date(2026, 10, 6))).toBe('6 November 2026'));

// Beyond the brief's cases.
test('a split block keeps its kind, and a later split is named once', () => {
  const d = docOf(box({ id: 'k', kind: 'note', name: 'Margin note', text: lines(40) }));
  const n = splitBlock(S, d, 'k', 1)!;
  expect([n.kind, n.name]).toEqual(['note', 'Margin note (continued)']);
  expect(splitBlock(S, d, 'k', 0)).toBeNull();
  expect(splitBlock(S, d, 'k', 5)).toBeNull();
  expect(splitBlock(S, d, 'nope', 1)).toBeNull();
});
test('a header is never split, joined or added to the end of another block', () => {
  const d = docOf(box({ id: 't', w: 300, text: 't' }), box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 1009, w: 320, fields: { name: 'A', class: 'B', date: 'C' }, text: 'Name: A\nClass: B\nDate: C' }));
  expect(layoutFor(S, d).segs.filter(s => s.box.id === 'h').length).toBe(2); // it runs onto page 2
  const before = JSON.stringify(d);
  expect(splitBlock(S, d, 'h', 1)).toBeNull();
  expect(appendToBlock(S, d, 'h', 't')).toBeNull();
  expect(appendToBlock(S, d, 't', 'h')).toBeNull();
  expect(removeBlockPart(S, d, 'h', 1)).toBeNull();
  expect(JSON.stringify(d)).toBe(before);
});
test('joining needs a block it came from; a block is never added to itself', () => {
  const d = docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'n' }));
  expect(joinBack(S, d, 'n')).toBeNull();
  expect(appendToBlock(S, d, 'm', 'm')).toBeNull();
  expect(appendToBlock(S, d, 'n', 'nope')).toBeNull();
  expect(d.boxes).toHaveLength(2);
});
test('blocks split from a joined block now come from its target; from a deleted one, from nothing', () => {
  const d = docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'n' }), box({ id: 'o', page: 1, y: 800, text: 'o', from: 'n' }));
  expect(appendToBlock(S, d, 'n', 'm')!.id).toBe('m');
  expect(d.boxes.find(b => b.id === 'o')!.from).toBe('m');
  expect(removeBlock(d, 'm')!.id).toBe('m');
  expect(d.boxes.map(b => [b.id, b.from])).toEqual([['o', undefined]]);
  expect(removeBlock(d, 'm')).toBeNull();
});
test('removing the only part, or all that is left, removes the block', () => {
  const d = docOf(box({ id: 'a', text: 'a' }), box({ id: 'b', y: 600, text: '\n'.repeat(30) + 'b' }));
  expect(removeBlockPart(S, d, 'a', 0)).toBe('block');
  expect(removeBlockPart(S, d, 'b', 1)).toBe('block'); // only blank lines were left
  expect(d.boxes).toHaveLength(0);
  expect(removeBlockPart(S, d, 'b', 0)).toBeNull();
});
test('removing a last part takes the line break before it, so no blank part is left', () => {
  const d = docOf(box({ id: 'm', text: lines(28) + '\n' })); // page 2 holds only the blank last line
  expect(layoutFor(S, d).pages).toBe(2);
  expect(removeBlockPart(S, d, 'm', 1)).toBe('part');
  expect([d.boxes[0].text, layoutFor(S, d).pages]).toEqual([lines(28), 1]);
  const e = docOf(box({ id: 'm', text: lines(27) + '\n\n' + lines(3, 'x') })); // page 1 ends with a blank line of its own
  removeBlockPart(S, e, 'm', 1);
  expect([e.boxes[0].text, layoutFor(S, e).pages]).toEqual([lines(27) + '\n', 1]);
});
test('moving a page onto an existing page reports where the rest went', () => {
  const d = { ...docOf(m()), pageCount: 3 };
  expect(movePage(S, d, 0, 1)).toEqual({ ok: true, followed: { name: 'Main text', page: 3, added: false } });
});
test('moving a page shifts the pages between', () => {
  const d = { ...docOf(box({ id: 'a' }), box({ id: 'b', page: 1 }), box({ id: 'c', page: 2 })), pageCount: 3 };
  expect(movePage(S, d, 0, 2)).toEqual({ ok: true, followed: null });
  expect(d.boxes.map(b => b.page)).toEqual([2, 0, 1]);
  expect(movePage(S, d, 2, 0)).toEqual({ ok: true, followed: null });
  expect(d.boxes.map(b => b.page)).toEqual([0, 1, 2]);
});
test('a page with a start of its own moves, and continuations on it follow their starts', () => {
  const d = docOf(m(), box({ id: 'c', page: 1, y: 600, text: 'c' }));
  expect(movePage(S, d, 1, 0)).toEqual({ ok: true, followed: null }); // c has no later part; Main text only shifted
  expect(d.boxes.map(b => b.page)).toEqual([1, 0]);
  const L = layoutFor(S, d);
  expect(L.segs.filter(s => s.box.id === 'm').map(s => s.page)).toEqual([1, 2]);
});
test('merging page 1 is not possible', () => { const d = docOf(m()); expect(mergeIntoPrevious(S, d, 0)).toBeNull(); expect(mergeIntoPrevious(S, d, 2)).toBeNull(); });
test('merging an empty page removes it, and later pages move up', () => {
  const d = { ...docOf(box({ id: 'a' }), box({ id: 'c', page: 2 })), pageCount: 3 };
  expect(mergeIntoPrevious(S, d, 1)).toEqual({ ranOn: false });
  expect([d.boxes[1].page, d.pageCount]).toEqual([1, 2]);
});
test('deleting a page in the middle of a block keeps the rest, and later parts keep their places', () => {
  const d = docOf(box({ id: 'm', text: lines(80), frames: { 1: { x: 150 }, 2: { x: 200 } } }), box({ id: 'z', page: 3, text: 'z' }));
  deletePage(S, d, 1);
  expect(d.boxes[0].text.split('\n').slice(27, 29)).toEqual(['line28', 'line57']);
  expect(d.boxes[0].frames).toEqual({ 1: { x: 200 } });
  expect(d.boxes[1].page).toBe(2);
  expect(d.pageCount).toBe(3);
});
test('deleting a page takes a block pushed onto it, not one pushed off it', () => {
  const pushed = () => docOf(box({ id: 'a', text: lines(30) }), box({ id: 'b', y: 900, w: 300, text: 'b' })); // b shows on page 2
  expect(layoutFor(S, pushed()).segs.map(s => [s.box.id, s.page])).toEqual([['a', 0], ['a', 1], ['b', 1]]);
  const d = pushed();
  deletePage(S, d, 1);
  expect(d.boxes.map(b => [b.id, b.text])).toEqual([['a', lines(28)]]);
  const e = pushed();
  deletePage(S, e, 0);
  expect(e.boxes.map(b => [b.id, b.page, b.y])).toEqual([['b', 0, 900]]);
});
test('deleting the only page leaves one empty page', () => { const d = docOf(box({ id: 'a', text: 'a' })); deletePage(S, d, 0); expect([d.boxes.length, d.pageCount]).toEqual([0, 1]); });
test('a new block takes the first free line', () => {
  const d = docOf(box({ id: 'a', text: lines(3) }));
  const t = newBlock(S, d, 'text', 0) as Box;
  expect([t.page, t.y, t.color, t.text, t.kind]).toEqual([0, 246, 1, '', 'text']);
  const later = newBlock(S, d, 'note', 2) as Box;
  expect([later.page, later.y, d.pageCount]).toEqual([2, 110, 3]);
});
test('header fields', () => {
  const d = docOf();
  const h = newBlock(S, d, 'header', 0) as Box;
  setHeaderField(h, 'name', 'Riya ');
  expect(h.text.split('\n')[0]).toBe('Name: Riya ');
  setHeaderField(h, 'class', '8\nB');
  expect(h.fields!.class).toBe('8 B');
  showHeaderField(h, 'roll', true);
  showHeaderField(h, 'subject', true);
  expect(h.text).toBe(`Name: Riya \nClass: 8 B\nSubject:\nRoll no.:\nDate: ${today()}`);
  setHeaderField(h, 'roll', '12');
  showHeaderField(h, 'roll', true);
  expect(h.fields!.roll).toBe('12');
  showHeaderField(h, 'subject', false);
  expect(h.text).toBe(`Name: Riya \nClass: 8 B\nRoll no.: 12\nDate: ${today()}`);
});

// Join back is the inverse of split (final review A, item 1).
const SHAPES: Record<string, string> = {
  'a \\newpage boundary': lines(5) + '\n\\newpage\n' + lines(5, 'b') + '\n\\newpage\n' + lines(3, 'c'),
  'blank lines around \\newpage': lines(5) + '\n\n\\newpage\n\n' + lines(5, 'b') + '\n\n\n\\newpage\n' + lines(3, 'c'),
  'a blank row at a page bottom': lines(27) + '\n\n' + lines(3, 'x'),
  'a plain overflow boundary': lines(70),
};
for (const [name, text] of Object.entries(SHAPES)) {
  test(`split then join back restores ${name}, byte for byte`, () => {
    const pages = layoutFor(S, docOf(box({ id: 'm', text }))).pages;
    expect(pages).toBeGreaterThan(1);
    for (let idx = 1; idx < pages; idx++) {
      const d = docOf(box({ id: 'm', name: 'Main text', text }));
      const nb = splitBlock(S, d, 'm', idx)!;
      joinBack(S, d, nb.id);
      expect(d.boxes).toHaveLength(1);
      expect(d.boxes[0].text).toBe(text);
      expect(layoutFor(S, d).pages).toBe(pages);
    }
  });
}
test('a mid-paragraph split stays two paragraphs when joined back', () => {
  const text = words(1500);
  const d = docOf(box({ id: 'm', text }));
  const nb = splitBlock(S, d, 'm', 1)!;
  expect(nb.fromSep).toBeUndefined();
  joinBack(S, d, nb.id);
  expect(d.boxes[0].text.split('\n')).toHaveLength(2);
});
test('add to the end of a different block still uses one line break', () => {
  const d = docOf(m(), box({ id: 'n', page: 1, y: 600, text: 'extra' }));
  const nb = splitBlock(S, d, 'm', 1)!;
  expect(nb.fromSep).toBe('\n');
  appendToBlock(S, d, nb.id, 'n');
  expect(d.boxes.find(b => b.id === 'n')!.text).toBe('extra\n' + lines(40).split('\n').slice(28).join('\n'));
});
test('the separator goes when the block it belongs to goes or is joined elsewhere', () => {
  const o = docOf(box({ id: 'm', text: SHAPES['a \\newpage boundary'] }));
  const n2 = splitBlock(S, o, 'm', 1)!;
  expect(n2.fromSep).toBe('\n\\newpage\n');
  const n3 = splitBlock(S, o, n2.id, 1)!;
  appendToBlock(S, o, n2.id, 'm'); // n2 gone: n3 now comes from m, with a separator that was for n2
  expect(o.boxes.find(b => b.id === n3.id)!.fromSep).toBeUndefined();
});

// Join back keeps the later parts' own places (item 2).
test('join back keeps the later parts’ own width, and the joined block’s own place', () => {
  const e = docOf(box({ id: 'm', text: lines(70), frames: { 2: { w: 300 } } }));
  const n2 = splitBlock(S, e, 'm', 1)!;
  expect(n2.frames).toEqual({ 1: { w: 300 } });
  joinBack(S, e, n2.id);
  expect(layoutFor(S, e).segs.map(s => s.w)).toEqual([630, 630, 300]);
  const f = docOf(m());
  const n3 = splitBlock(S, f, 'm', 1)!;
  Object.assign(n3, { x: 200, w: 400, y: 300 });
  joinBack(S, f, n3.id);
  expect(f.boxes[0].frames).toEqual({ 1: { x: 200, y: 300, w: 400 } });
  expect(layoutFor(S, f).segs.map(s => [s.x, s.w, s.top])).toEqual([[112, 630, 110], [200, 400, 300]]);
});

test('a split part pushed down by a block above keeps its own place, not the pushed one', () => {
  const h = box({ id: 'h', kind: 'header', name: 'Header', page: 1, x: 446, y: 76, w: 320, fields: { name: 'A', class: 'B', date: 'C' }, text: 'Name: A\nClass: B\nDate: C' });
  const d = docOf(m(), h);
  const part2 = layoutFor(S, d).segs.find(s => s.box.id === 'm' && s.idx === 1)!;
  expect([part2.top, part2.storedTop]).toEqual([178, 110]);
  const nb = splitBlock(S, d, 'm', 1)!;
  expect(nb.y).toBe(110);
});
