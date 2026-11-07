import { expect, test } from 'vitest';
import { box, docOf, layoutOf, lines, words } from '@/test/docs';
import { fromMarkup } from './markup';
import { posAt } from './positions';
import { nibSchema } from './schema';
import { firstDiff, frozenRanges, joinLines, partRanges, replaceLines, sliceLines } from './slices';

test('parts are whole lines', () => { const b = box({ id: 'm', text: lines(40) }); expect(partRanges(b, layoutOf(docOf(b)).segs)).toEqual([{ first: 0, end: 28 }, { first: 28, end: 40 }]); });
test('a part with no line of its own is empty', () => { const b = box({ y: 1009, text: words(40) }); expect(partRanges(b, layoutOf(docOf(b)).segs)).toEqual([{ first: 0, end: 1 }, { first: 1, end: 1 }]); });
test('freezing the focused part shifts the rest', () => expect(frozenRanges([{ first: 0, end: 28 }, { first: 28, end: 40 }], 0, 29)).toEqual([{ first: 0, end: 29 }, { first: 29, end: 41 }]));
test('line helpers', () => { expect(replaceLines('a\nb\nc', { first: 1, end: 2 }, 'x\ny')).toBe('a\nx\ny\nc'); expect(sliceLines('a\nb\nc', { first: 1, end: 3 })).toBe('b\nc'); expect(firstDiff('abc', 'abXc')).toBe(2); });

test('a block that is not laid out is one part of every line', () => expect(partRanges(box({ text: 'a\nb' }), [])).toEqual([{ first: 0, end: 2 }]));
test('line helpers at the edges', () => {
  expect(sliceLines('a\nb', null)).toBe('a\nb');
  expect(sliceLines('a\nb', { first: 1, end: 1 })).toBe('');
  expect(replaceLines('a\nb', { first: 0, end: 2 }, 'z')).toBe('z');
  expect(firstDiff('ab', 'ab')).toBe(2);
  expect(firstDiff('ab', 'abc')).toBe(2);
});

test('joining two lines: the first keeps its kind and takes the words of the second', () => {
  expect(joinLines('a\nb\nc', 0)).toEqual({ text: 'ab\nc', offset: 1 });
  expect(joinLines('x\n## Head\n- item', 1)).toEqual({ text: 'x\n## Headitem', offset: 9 });
  expect(joinLines('- one\n> two', 0)).toEqual({ text: '- onetwo', offset: 5 });
  expect(joinLines('# T\n', 0)).toEqual({ text: '# T', offset: 3 });
  // an empty first line gives way to the second; a page break or rule on either side goes
  expect(joinLines('\n- item', 0)).toEqual({ text: '- item', offset: 0 });
  expect(joinLines('text\n\\newpage\nmore', 0)).toEqual({ text: 'text\nmore', offset: 4 });
  expect(joinLines('text\n---', 0)).toEqual({ text: 'text', offset: 4 });
  expect(joinLines('a\n\\newpage\ntext', 1)).toEqual({ text: 'a\ntext', offset: 2 });
  // the words keep their marks; the caret goes between the two lines' words
  const j = joinLines('**bold**\n_under_ line', 0)!, pm = nibSchema.nodeFromJSON(fromMarkup(j.text));
  expect(pm.textContent).toBe('boldunder line');
  expect(pm.textBetween(1, posAt(pm, j.text, j.offset))).toBe('bold');
  expect(pm.firstChild!.child(0).marks.map(m => m.type.name)).toEqual(['bold']);
  expect(pm.firstChild!.child(1).marks.map(m => m.type.name)).toEqual(['underline']);
  // a numbered list keeps counting
  expect(joinLines('1. a\n2. b\n3. c', 0)).toEqual({ text: '1. ab\n2. c', offset: 4 });
  expect(joinLines('a\nb', 1)).toBeNull();
});
