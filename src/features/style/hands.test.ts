// Which hands the picker lists, what it says about each, and the words a hand is shown writing.
import { afterEach, expect, test } from 'vitest';
import { FONTS } from '@/engine/config.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { FontCfg } from '@/engine/types';
import { box, docOf } from '@/test/docs';
import { fontFile } from '@/test/fonts';
import { HAND_FILTERS, PANGRAM, docStart, handList, handNote, shapesNote } from './hands';

const find = (id: string) => FONTS.find(f => f.id === id)!;
const mine = (id: string): FontCfg => ({ id, name: id, family: id, weight: 400, scale: 1, group: 'mine', local: true });
afterEach(() => { for (let i = FONTS.length - 1; i >= 0; i--) if (FONTS[i].group === 'mine') FONTS.splice(i, 1); });

test('the filter chips, All first', () => {
  expect(HAND_FILTERS).toEqual([['all', 'All'], ['joined', 'Joined-up'], ['print', 'Print'], ['neat', 'Neat'], ['messy', 'Messy'], ['fun', 'Fun'], ['fav', '★ Favourites']]);
});

test('filters', () => {
  expect(handList('', 'joined', []).map(f => f.id)).toEqual(['labelle', 'dawning', 'cedarville', 'badscript', 'oooh', 'apple', 'playwrite', 'marck']);
  expect(handList('', 'messy', [])).toHaveLength(7);
  expect(handList('', 'all', [])).toHaveLength(33);
  expect(handList('', 'fav', ['caveat', 'zeyada']).map(f => f.id)).toEqual(['zeyada', 'caveat']);
});

test('search matches the name or the family, ignoring case and spaces around it', () => {
  expect(handList('  CAV ', 'all', []).map(f => f.id)).toEqual(['caveat']);
  expect(handList('playwrite', 'all', []).map(f => f.id)).toEqual(['playwrite']);
  expect(handList('cav', 'joined', [])).toEqual([]);
});

test('your own fonts come first, newest first, under All and Favourites only', () => {
  const a = mine('up-a'), b = mine('up-b');
  FONTS.push(a, b);
  expect(handList('', 'all', []).slice(0, 2).map(f => f.id)).toEqual(['up-b', 'up-a']);
  expect(handList('', 'print', []).some(f => f.group === 'mine')).toBe(false);
  expect(handList('', 'fav', ['up-a']).map(f => f.id)).toEqual(['up-a']);
});

test('your own font is found by its name, not by the family Nib gives it', () => {
  FONTS.push({ ...mine('up-a'), name: 'My hand', family: 'Nib Upload up-a' });
  expect(handList('my h', 'all', []).map(f => f.id)).toEqual(['up-a']);
  expect(handList('upload', 'all', [])).toEqual([]);
});

test('notes', async () => {
  const up: FontCfg = { ...mine('up-a'), buf: await fontFile('labelle', 'Mine.woff').arrayBuffer() }; // an uploaded font, with its file
  expect([find('labelle'), find('zeyada'), find('playwrite'), up].map(handNote)).toEqual(['joined-up', 'print, messy', 'joined-up, neat', 'your font']);
  expect(shapesNote(find('caveat'))).toBe('3 shapes per letter');
  expect(shapesNote(find('labelle'))).toBeNull();
  expect(shapesNote(up)).toBe('1 shape per letter');
  expect(shapesNote({ ...up, forms: 4 })).toBe('4 shapes per letter');
});

test('the start of the document', () => {
  expect(docStart(sampleDoc(cleanSettings(null, false)))).toBe('The water cycle is the continuous');
  expect(docStart(docOf())).toBe(PANGRAM);
  expect(docStart(docOf(box({ text: '# Only a title' })))).toBe('Only a title');
  expect(docStart(docOf(box({ text: 'a'.repeat(60) })))).toBe('a'.repeat(40));
  expect(docStart(docOf(box({ id: 'late', page: 1, text: 'Later' }), box({ id: 'first', text: 'First words' })))).toBe('First words');
});

test('the start skips margin notes, even above the text', () => {
  expect(docStart(docOf(box({ id: 'n', kind: 'note', y: 40, text: 'Check this!' }), box({ y: 300, text: 'The real start' })))).toBe('The real start');
  expect(docStart(docOf(box({ kind: 'note', text: 'Only a note' })))).toBe(PANGRAM);
});

test('the start skips headers and lines with no words, and reads blocks top to bottom, then left to right', () => {
  expect(docStart(docOf(box({ kind: 'header', text: 'Name: Aarav' }), box({ text: '---\n\n**Hello** there' })))).toBe('Hello there');
  expect(docStart(docOf(box({ id: 'r', x: 400, text: 'Right' }), box({ id: 'l', x: 112, text: 'Left' })))).toBe('Left');
  expect(docStart(docOf(box({ id: 'low', y: 300, text: 'Lower' }), box({ id: 'up', y: 110, text: '- a list' })))).toBe('Lower');
  expect(docStart(docOf(box({ text: '---\n\\newpage' })))).toBe(PANGRAM);
  expect(docStart(docOf(box({ text: 'A sentence that runs on past forty characters here' })))).toBe('A sentence that runs on past forty');
});
