import { expect, test } from 'vitest';
import { box, docOf, layoutOf, lines, words } from '@/test/docs';
import { firstDiff, frozenRanges, partRanges, replaceLines, sliceLines } from './slices';

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
