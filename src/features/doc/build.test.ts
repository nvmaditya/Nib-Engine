// Building documents from an import (and, later, the templates). The canvas stub's geometry: gap 34, top 110, left 112, right 742.
import { expect, test } from 'vitest';
import { frameRange, settings } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import type { Box, EngineDoc, Layout } from '@/engine/types';
import { STYLE_LOOKS } from '@/features/style/looks';
import type { SavedLook } from '@/features/style/prefs';
import { box, docOf, get, layoutOf, lines, open } from '@/test/docs';
import { geomFor, headerBlock, importInto, newDocument, withLook } from './build';
import { newBlock } from './model';

const S = cleanSettings(null, false), journal = STYLE_LOOKS.find(l => l.id === 'journal')!;
const partsOf = (L: Layout, id: string) => L.segs.filter(s => s.box.id === id).map(s => [s.page, s.idx]);
const append = (doc: EngineDoc, text = 'x', look: SavedLook | null = null) => importInto(S, doc, text, { where: 'append', look, header: null });

test('a new document is one main block, from the top line of page 1', () => {
  expect(newDocument(S, 'Hello', null)).toEqual({ pageCount: 1, fileName: '', boxes: [expect.objectContaining({ kind: 'text', name: 'Main text', color: 0, page: 0, x: 112, y: 76, w: 630, text: 'Hello', style: {}, frames: {}, shuffle: 0 })] });
});

test('with a header, Name, Class and Date sit at the top right of page 1 and the main block starts on the line below them', () => {
  const d = newDocument(S, 'Hello', { name: 'Asha', class: '8-B', date: '7 November 2026' });
  expect(d.boxes.map(b => [b.kind, b.name, b.color, b.page, b.x, b.y, b.w])).toEqual([['header', 'Header', 0, 0, 446, 76, 320], ['text', 'Main text', 1, 0, 112, 178, 630]]);
  expect([d.boxes[0].fields, d.boxes[0].text]).toEqual([{ name: 'Asha', class: '8-B', date: '7 November 2026' }, 'Name: Asha\nClass: 8-B\nDate: 7 November 2026']);
  expect(layoutOf(d, S).segs.some(s => s.pushed)).toBe(false);
});

test('a header’s values are one line each, of at most 80 characters', () => {
  const h = headerBlock(docOf(), S, { name: 'Asha\nK', class: 'x'.repeat(90), date: '' });
  expect([h.fields, h.text]).toEqual([{ name: 'Asha K', class: 'x'.repeat(80), date: '' }, `Name: Asha K\nClass: ${'x'.repeat(80)}\nDate:`]);
});

test('a long import is one block that flows page by page, nothing pushed', () => {
  const d = newDocument(S, lines(600), { name: '', class: '', date: 'x' }), L = layoutOf(d, S), main = partsOf(L, d.boxes[1].id);
  expect(main.length).toBeGreaterThan(15); expect(main).toEqual(main.map((_, i) => [i, i])); expect(L.segs.some(s => s.pushed)).toBe(false);
});

test('a look comes with an import, paper and all, and the settings given are left alone', () => {
  const before = structuredClone(S);
  expect(withLook(S, journal)).toMatchObject({ font: 'caveat', tip: 'felt', ink: 'purple', paper: 'yellow', mess: 45 });
  expect(S).toEqual(before); expect(withLook(S, null)).toBe(S);
});

test('the builders measure with the settings given, and leave the engine on the open document', () => {
  open(docOf(box({ id: 'o', text: 'open' })));
  const letter = withLook(S, STYLE_LOOKS.find(l => l.id === 'letter')!);
  expect([geomFor(letter).left, geomFor(S).left]).toEqual([74, 112]);
  expect(settings).toBe(get().S);
  expect(newDocument(letter, 'Dear', null).boxes[0]).toMatchObject({ x: 74, w: 668 });
  importInto(S, docOf(box({ id: 'm', text: 'a' })), 'x', { where: 'append', look: journal, header: null });
  expect(settings).toBe(get().S);
});

const withHeader = () => docOf(
  box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, fields: { name: 'A', class: 'B', subject: 'Maths', date: 'C' }, text: 'Name: A\nClass: B\nSubject: Maths\nDate: C' }),
  box({ id: 'm', name: 'Main text', color: 1, y: 212, text: lines(40) }), box({ id: 'n', kind: 'note', name: 'Margin note', color: 2, page: 1, x: 520, w: 220, text: 'note' }));

test('Replace: the file’s text becomes the main text, and the header stays only if asked for, with the fields given', () => {
  const d = { ...withHeader(), fileName: 'week 1' }, given = JSON.stringify(d);
  const r = importInto(S, d, 'New', { where: 'replace', look: null, header: { name: 'Asha', class: 'B', subject: 'Maths', date: 'C' } });
  expect(r.doc.boxes.map(b => [b.id === 'h', b.kind, b.name])).toEqual([[true, 'header', 'Header'], [false, 'text', 'Main text']]);
  expect(r.doc.boxes[0].fields).toEqual({ name: 'Asha', class: 'B', subject: 'Maths', date: 'C' });
  expect(r.doc.boxes[1]).toMatchObject({ y: 76 + 4 * 34, text: 'New', color: 1 });
  expect([r.doc.pageCount, r.doc.fileName, r.firstPage, r.joined, r.target]).toEqual([1, 'week 1', 0, false, r.doc.boxes[1]]);
  expect(importInto(S, d, 'New', { where: 'replace', look: null, header: null }).doc.boxes.map(b => [b.kind, b.y])).toEqual([['text', 76]]);
  expect(JSON.stringify(d)).toBe(given);
});

test('Replace with a header in a document that has none puts a new one at the top right of page 1', () => {
  const r = importInto(S, docOf(box({ id: 'm', text: 'old' })), 'New', { where: 'replace', look: null, header: { name: 'Asha', class: '', date: 'C' } });
  expect(r.doc.boxes.map(b => [b.kind, b.color, b.page, b.x, b.y, b.w])).toEqual([['header', 0, 0, 446, 76, 320], ['text', 1, 0, 112, 178, 630]]);
});

test('Add after the last page carries on the text block that ends there, from the top of a new page', () => {
  const d = docOf(box({ id: 'm', name: 'Main text', text: lines(40) })), r = append(d, 'New\nmore');
  expect([r.joined, r.target.id, r.firstPage, r.doc.boxes.length, r.target.text]).toEqual([true, 'm', 2, 1, lines(40) + '\n\\newpage\nNew\nmore']);
  const L = layoutOf(r.doc, S);
  expect(partsOf(L, 'm')).toEqual([[0, 0], [1, 1], [2, 2]]); expect(r.target.text.slice(frameRange(r.target, 2)[0])).toBe('New\nmore');
  expect(L.segs.some(s => s.pushed)).toBe(false); expect(d.boxes[0].text).toBe(lines(40));
});

test('…the block whose writing ends lowest on the last page', () => expect(append(docOf(box({ id: 'a', name: 'Main text', w: 300, text: lines(5) }), box({ id: 'b', name: 'Text block', color: 1, x: 440, w: 300, text: lines(12) }))).target.id).toBe('b'));

test('…trailing blank lines and page breaks of its own leave no empty page', () => {
  expect(append(docOf(box({ id: 'm', text: 'abc\n\n' }))).target.text).toBe('abc\n\\newpage\nx');
  const r = append(docOf(box({ id: 'm', text: 'abc\n\\newpage\n' }))); expect([r.target.text, r.firstPage]).toEqual(['abc\n\\newpage\nx', 1]);
});

test('…from the top line of that page, whatever place a part that is gone had', () => {
  const r = append(docOf(box({ id: 'm', name: 'Main text', text: lines(40) + '\n\n', frames: { 1: { x: 140 }, 2: { x: 300, y: 500, w: 200 } } })));
  const L = layoutOf(r.doc, S), part = (i: number) => L.segs.find(s => s.box.id === 'm' && s.idx === i)!;
  expect([part(2).page, part(2).x, part(2).top, part(2).w]).toEqual([2, 112, 110, 630]);
  expect(part(1).x).toBe(140);
});

test('…an empty main block just takes the text, where it is', () => { const r = append(docOf(box({ id: 'm', name: 'Main text', text: '' }))); expect([r.target.id, r.target.text, r.firstPage, r.joined]).toEqual(['m', 'x', 0, true]); });

test('when no text block ends on the last page, the text is a new block on a new page after it', () => {
  const r = append(docOf(box({ id: 'm', name: 'Main text', text: 'short' }), box({ id: 'n', kind: 'note', name: 'Margin note', color: 1, page: 1, x: 520, w: 220, text: 'note' })));
  expect([r.joined, r.firstPage, r.doc.pageCount]).toEqual([false, 2, 3]);
  expect(r.target).toMatchObject({ kind: 'text', name: 'Text block', color: 2, page: 2, x: 112, y: 76, w: 630, text: 'x' });
});

test('…or on the last page itself when that page is blank', () => { const r = append({ ...docOf(box({ id: 'm', name: 'Main text', text: 'short' })), pageCount: 2 }); expect([r.target.page, r.firstPage, r.doc.pageCount]).toEqual([1, 1, 2]); });

test('…and never onto a page where something else is written, when only blank lines ran onto it', () => {
  const d = docOf(box({ id: 'm', name: 'Main text', text: 'abc' + '\n'.repeat(40) }), box({ id: 'n', kind: 'note', name: 'Margin note', color: 1, page: 1, x: 520, w: 220, text: 'note' }));
  const pushed = (L: Layout) => L.segs.filter(s => s.pushed).map(s => [s.box.id, s.idx]), before = pushed(layoutOf(d, S)); // the note, by Main text's blank lines
  const r = append(d), L = layoutOf(r.doc, S);
  expect([r.joined, r.firstPage, r.target.page, r.doc.boxes[0].text]).toEqual([false, 2, 2, 'abc' + '\n'.repeat(40)]);
  expect(pushed(L)).toEqual(before);
});

test('…and only the block it carries on loses its blank end', () => {
  const r = append(docOf(box({ id: 'a', name: 'Main text', w: 300, text: lines(5) + '\n\n' }), box({ id: 'b', name: 'Text block', color: 1, x: 440, w: 300, text: lines(6) })));
  expect([r.target.id, r.doc.boxes.map(b => b.text)]).toEqual(['b', [lines(5) + '\n\n', lines(6) + '\n\\newpage\nx']]);
  expect(layoutOf(r.doc, S).segs.some(s => s.pushed)).toBe(false);
});

test('…an empty block below a header beside it starts on the line under the header, and pushes nothing', () => {
  const d = newDocument(S, '', null), h = newBlock(S, d, 'header', 0) as Box;
  const r = append(d, lines(600)), L = layoutOf(r.doc, S), main = r.doc.boxes[0], m = partsOf(L, main.id);
  expect([r.target.id, r.joined, r.firstPage, main.y]).toEqual([main.id, true, 0, 76 + 3 * 34]);
  expect(partsOf(L, h.id)).toEqual([[0, 0]]); expect(m.length).toBeGreaterThan(15); expect(m).toEqual(m.map((_, i) => [i, i]));
  expect(L.segs.some(s => s.pushed)).toBe(false);
});

test('…but with a margin note beside or below it, the text is a block of its own after it, and the note stays where it was', () => {
  const d = newDocument(S, '', null), n = newBlock(S, d, 'note', 0) as Box;
  const at = (L: Layout) => L.segs.filter(s => s.box.id === n.id).map(s => [s.page, s.x, s.top]), before = at(layoutOf(d, S));
  const r = append(d, lines(600)), L = layoutOf(r.doc, S);
  expect([r.joined, r.firstPage, r.target.page, r.doc.boxes[0].text]).toEqual([false, 1, 1, '']);
  expect(at(L)).toEqual(before); expect(L.segs.some(s => s.pushed)).toBe(false);
});

test('Add after the last page takes no header, and brings the look', () => { const r = importInto(S, docOf(box({ id: 'm', text: 'a' })), 'x', { where: 'append', look: journal, header: { name: 'A', class: '', date: '' } }); expect([r.doc.boxes.map(b => b.kind), r.S.font]).toEqual([['text'], 'caveat']); });

test('a long import added after the last page pushes nothing', () => { const d = withHeader(); d.boxes.pop(); /* not the margin note, which Main text's page 2 part already pushes */ const r = append(d, lines(600)); const L = layoutOf(r.doc, r.S); expect(L.segs.some(s => s.pushed)).toBe(false); const m = partsOf(L, 'm'); expect(m).toEqual(m.map((_, i) => [i, i])); });
