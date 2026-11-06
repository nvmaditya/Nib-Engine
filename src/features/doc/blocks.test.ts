import { expect, test } from 'vitest';
import { box, docOf } from '@/test/docs';
import { BLOCK_COLORS, blockColor, continuedName, newBlockName, nextColor, pagesLabel, partLabel } from './blocks';

test('the block palette is the spec’s, in order', () => expect(BLOCK_COLORS).toEqual(['#7A4DF0', '#0B8F8A', '#D9661F', '#D6336C', '#2F6FDB', '#5C8A1E']));
test('a block’s colour', () => expect(blockColor({ color: 2 })).toBe('#D9661F'));
test('next colour', () => { expect(nextColor(docOf())).toBe(0); expect(nextColor(docOf(box({ color: 0 }), box({ color: 1 })))).toBe(2); expect(nextColor(docOf(box({ color: 5 })))).toBe(0); });
test('the first text block is Main text', () => { expect(newBlockName(docOf(), 'text')).toBe('Main text'); expect(newBlockName(docOf(box()), 'text')).toBe('Text block'); expect(newBlockName(docOf(), 'note')).toBe('Margin note'); expect(newBlockName(docOf(), 'header')).toBe('Header'); });
test('labels', () => { expect(continuedName('Main text')).toBe('Main text (continued)'); expect(continuedName('Main text (continued)')).toBe('Main text (continued)'); expect(partLabel(1, 3)).toBe('2 of 3'); expect(partLabel(0, 1)).toBe(''); expect([[], [2], [1, 2, 3], [1, 3]].map(pagesLabel)).toEqual(['Not on a page', 'Page 2', 'Pages 1–3', 'Pages 1, 3']); });
