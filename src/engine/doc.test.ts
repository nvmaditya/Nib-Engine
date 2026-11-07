import { expect, test } from 'vitest';
import { SAMPLE_BODY, SAMPLE_HEAD } from './config.js';
import { cleanDoc, cleanSettings, headerText, migrateDoc, sampleDoc } from './doc.js';

test('old blocks get kinds, default names and colours by order', () => { const d = cleanDoc({ boxes: [{ text: 'a' }, { text: 'b' }, { text: 'c', kind: 'note' }] })!; expect(d.boxes.map(b => [b.kind, b.name, b.color])).toEqual([['text', 'Text block', 0], ['text', 'Text block', 1], ['note', 'Margin note', 2]]); });
test('names and colours are cleaned', () => { const d = cleanDoc({ boxes: [{ text: 'a', name: '  ' + 'x'.repeat(70), color: 7 }, { text: 'b', color: -1 }] })!; expect(d.boxes[0].name).toBe('x'.repeat(60)); expect(d.boxes[0].color).toBe(1); expect(d.boxes[1].color).toBe(5); });
test('a header’s text is written from its fields', () => { const d = cleanDoc({ boxes: [{ text: 'stale', kind: 'header', fields: { name: 'Aarav Mehta', class: '8-B', date: '29 October 2026', bogus: 'x' } }] })!; expect(d.boxes[0].text).toBe(SAMPLE_HEAD); expect(d.boxes[0].fields).toEqual({ name: 'Aarav Mehta', class: '8-B', date: '29 October 2026' }); });
test('a header without fields gets the three blanks', () => { const d = cleanDoc({ boxes: [{ text: '', kind: 'header' }] })!; expect(d.boxes[0].fields).toEqual({ name: '', class: '', date: '' }); expect(d.boxes[0].text).toBe('Name:\nClass:\nDate:'); });
test('header fields keep their order; empty ones are labels to fill in', () => { expect(headerText({ date: 'd', subject: 's', name: 'n', class: 'c', roll: 'r' })).toBe('Name: n\nClass: c\nSubject: s\nRoll no.: r\nDate: d'); expect(headerText({ name: '', roll: '12' })).toBe('Name:\nRoll no.: 12'); });
test('from is kept only when that block exists', () => { const d = cleanDoc({ boxes: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b', from: 'a' }, { id: 'c', text: 'c', from: 'gone' }] })!; expect(d.boxes.map(b => b.from)).toEqual([undefined, 'a', undefined]); });
test('the example has a Header and Main text', () => { const d = sampleDoc(cleanSettings(null, false)); expect(d.boxes.map(b => [b.kind, b.name, b.color])).toEqual([['header', 'Header', 0], ['text', 'Main text', 1]]); expect(d.boxes[0].text).toBe(SAMPLE_HEAD); });
test('a schema-1 document gets its Header and Main text', () => { const d = migrateDoc(cleanDoc({ boxes: [{ id: 'b2', text: SAMPLE_HEAD }, { id: 'b1', text: SAMPLE_BODY }, { id: 'b3', text: 'note' }] })!, 1); expect(d.boxes.map(b => [b.kind, b.name])).toEqual([['header', 'Header'], ['text', 'Main text'], ['text', 'Text block']]); expect(d.boxes[0].fields).toEqual({ name: 'Aarav Mehta', class: '8-B', date: '29 October 2026' }); });
test('a block that only partly looks like a header stays text', () => { expect(migrateDoc(cleanDoc({ boxes: [{ text: 'Name: A\nhello' }] })!, 1).boxes[0].kind).toBe('text'); });
test('schema-2 documents are not migrated', () => { const d = cleanDoc({ boxes: [{ text: SAMPLE_HEAD }] })!; expect(migrateDoc(d, 2).boxes[0].kind).toBe('text'); });
test('blocks that only look like headers keep their exact text', () => {
  for (const text of ['Name: A\nName: B', 'Name: ' + 'x'.repeat(81) + '\nClass: 8', 'Name: A\n  Class: 8']) {
    const b = migrateDoc(cleanDoc({ boxes: [{ text }] })!, 1).boxes[0];
    expect([b.kind, b.text]).toEqual(['text', text]);
  }
});
test('migration keeps position, style and frames', () => {
  const keep = { page: 2, x: 130, y: 220, w: 280, style: { size: 30 }, shuffle: 5, frames: { 1: { x: 140 } } };
  const d = migrateDoc(cleanDoc({ boxes: [{ id: 'h', text: SAMPLE_HEAD, ...keep }, { id: 't', text: 'plain', ...keep }] })!, 1);
  expect(d.boxes.map(b => [b.kind, b.page, b.x, b.y, b.w, b.style, b.shuffle, b.frames])).toEqual([
    ['header', 2, 130, 220, 280, { size: 30 }, 5, { 1: { x: 140 } }],
    ['text', 2, 130, 220, 280, { size: 30 }, 5, { 1: { x: 140 } }],
  ]);
});
test('colour must be a number', () => { const d = cleanDoc({ boxes: [{ text: 'a', color: '' }, { text: 'b', color: true }, { text: 'c', color: '3' }] })!; expect(d.boxes.map(b => b.color)).toEqual([0, 1, 2]); });

test('fromSep is kept only with a from, and only as blank space and \\newpage lines', () => {
  const d = cleanDoc({ boxes: [
    { id: 'a', text: 'a' }, { id: 'b', text: 'b', from: 'a', fromSep: '\n\\newpage\n\n' }, { id: 'c', text: 'c', from: 'a', fromSep: 'x' },
    { id: 'd', text: 'd', fromSep: '\n' }, { id: 'e', text: 'e', from: 'gone', fromSep: '\n' }, { id: 'f', text: 'f', from: 'a', fromSep: 5 },
  ] })!;
  expect(d.boxes.map(b => b.fromSep)).toEqual([undefined, '\n\\newpage\n\n', undefined, undefined, undefined, undefined]);
});
