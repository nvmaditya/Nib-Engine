import { expect, test } from 'vitest';
import { OLD_KEY, SAMPLE_BODY, SAMPLE_HEAD } from './config.js';
import { computeLayout, parseInline, parseLine, segSig, use } from './core.js';
import { HEADER_FIELDS, HEADER_LIMITS, cleanDoc, cleanSettings, headerLabel, headerText, loadSaved, migrateDoc, sampleDoc } from './doc.js';
import type { EngineDoc } from './types';

/** The example's header, as a list. */
const EXAMPLE = [{ id: 'name', label: 'Name', value: 'Aarav Mehta' }, { id: 'class', label: 'Class', value: '8-B' }, { id: 'date', label: 'Date', value: '29 October 2026', today: true }];
const BLANKS = [{ id: 'name', label: 'Name', value: '' }, { id: 'class', label: 'Class', value: '' }, { id: 'date', label: 'Date', value: '', today: true }];

test('old blocks get kinds, default names and colours by order', () => { const d = cleanDoc({ boxes: [{ text: 'a' }, { text: 'b' }, { text: 'c', kind: 'note' }] })!; expect(d.boxes.map(b => [b.kind, b.name, b.color])).toEqual([['text', 'Text block', 0], ['text', 'Text block', 1], ['note', 'Margin note', 2]]); });
test('names and colours are cleaned', () => { const d = cleanDoc({ boxes: [{ text: 'a', name: '  ' + 'x'.repeat(70), color: 7 }, { text: 'b', color: -1 }] })!; expect(d.boxes[0].name).toBe('x'.repeat(60)); expect(d.boxes[0].color).toBe(1); expect(d.boxes[1].color).toBe(5); });
test('a header’s text is written from its fields', () => { const d = cleanDoc({ boxes: [{ text: 'stale', kind: 'header', fields: { name: 'Aarav Mehta', class: '8-B', date: '29 October 2026', bogus: 'x' } }] })!; expect(d.boxes[0].text).toBe(SAMPLE_HEAD); expect(d.boxes[0].fields).toEqual(EXAMPLE); });
test('a header without fields gets the three blanks', () => { const d = cleanDoc({ boxes: [{ text: '', kind: 'header' }] })!; expect(d.boxes[0].fields).toEqual(BLANKS); expect(d.boxes[0].text).toBe('Name:\nClass:\nDate:'); });
test('header fields keep their order; empty ones are labels to fill in', () => {
  expect(headerText([{ id: 'name', label: 'Name', value: 'n' }, { id: 'class', label: 'Class', value: 'c' }, { id: 'subject', label: 'Subject', value: 's' }, { id: 'roll', label: 'Roll no.', value: 'r' }, { id: 'date', label: 'Date', value: 'd', today: true }])).toBe('Name: n\nClass: c\nSubject: s\nRoll no.: r\nDate: d');
  expect(headerText([{ id: 'name', label: 'Name', value: '' }, { id: 'roll', label: 'Roll no.', value: '12' }])).toBe('Name:\nRoll no.: 12');
});
test('from is kept only when that block exists', () => { const d = cleanDoc({ boxes: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b', from: 'a' }, { id: 'c', text: 'c', from: 'gone' }] })!; expect(d.boxes.map(b => b.from)).toEqual([undefined, 'a', undefined]); });
test('the example has a Header and Main text', () => { const d = sampleDoc(cleanSettings(null, false)); expect(d.boxes.map(b => [b.kind, b.name, b.color])).toEqual([['header', 'Header', 0], ['text', 'Main text', 1]]); expect(d.boxes[0].text).toBe(SAMPLE_HEAD); expect(d.boxes[0].fields).toEqual(EXAMPLE); });
test('a schema-1 document gets its Header and Main text', () => { const d = migrateDoc(cleanDoc({ boxes: [{ id: 'b2', text: SAMPLE_HEAD }, { id: 'b1', text: SAMPLE_BODY }, { id: 'b3', text: 'note' }] })!, 1); expect(d.boxes.map(b => [b.kind, b.name])).toEqual([['header', 'Header'], ['text', 'Main text'], ['text', 'Text block']]); expect(d.boxes[0].fields).toEqual(EXAMPLE); });
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

test('only the first header-like block becomes the Header', () => {
  const d = migrateDoc(cleanDoc({ boxes: [
    { id: 'low', page: 1, y: 100, text: 'Name: A\nClass: 8' }, { id: 'b', page: 0, y: 300, text: 'Name: B\nClass: 9' }, { id: 'top', page: 0, y: 120, text: 'Name: C\nClass: 7' },
  ] })!, 1);
  expect(d.boxes.map(b => [b.id, b.kind])).toEqual([['low', 'text'], ['b', 'text'], ['top', 'header']]);
  expect(d.boxes[1].text).toBe('Name: B\nClass: 9');
});
test('header values are escaped so they show as typed', () => {
  expect(headerText([{ id: 'name', label: 'Name', value: '2*3*4' }, { id: 'roll', label: 'Roll no.', value: 'a_b~~c`d=e\\f' }])).toBe('Name: 2\\*3\\*4\nRoll no.: a\\_b\\~\\~c\\`d\\=e\\\\f');
  expect(headerText([{ id: 'class', label: 'Class', value: '8-B' }, { id: 'date', label: 'Date', value: '29 October 2026', today: true }])).toBe('Class: 8-B\nDate: 29 October 2026');
});
test('an old header keeps the text it showed', () => {
  const b = migrateDoc(cleanDoc({ boxes: [{ text: 'Name: a\\*b\nClass: 2*3' }] })!, 1).boxes[0];
  expect(b.fields).toEqual([{ id: 'name', label: 'Name', value: 'a*b' }, { id: 'class', label: 'Class', value: '2*3' }]);
  expect(b.text).toBe('Name: a\\*b\nClass: 2\\*3');
});
test('the oldest Longhand save is migrated too', () => {
  localStorage.clear();
  localStorage.setItem(OLD_KEY, JSON.stringify({ text: 'a short note', s: {} }));
  try { expect(loadSaved().doc.boxes.map(b => [b.kind, b.name, b.text])).toEqual([['text', 'Main text', 'a short note']]); } finally { localStorage.clear(); }
});

test('fromSep checking does not backtrack on a long near-miss', () => {
  const t = performance.now();
  const d = cleanDoc({ boxes: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b', from: 'a', fromSep: '  \\newpage\n'.repeat(40) + 'x' }] });
  expect(performance.now() - t).toBeLessThan(50);
  expect(d!.boxes[1].fromSep).toBeUndefined();
  expect(cleanDoc({ boxes: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b', from: 'a', fromSep: '  \\newpage\n'.repeat(3) }] })!.boxes[1].fromSep).toBe('  \\newpage\n'.repeat(3));
});

// ---- Schema 4: a header's fields are a list. Older headers convert to the same text, so they draw the same pages. ----

// e8e0610's header text, verbatim: what every earlier Nib wrote for an object-shaped header.
const ESC = (v: string) => v.replace(/[\\*_~=`\[]/g, '\\$&');
function oldText(f: Record<string, unknown> | undefined): string {
  const o: Record<string, string> = {};
  if (f && typeof f === 'object') for (const [k] of HEADER_FIELDS) if (typeof f[k] === 'string') o[k] = (f[k] as string).replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  const g = Object.keys(o).length ? o : { name: '', class: '', date: '' };
  return HEADER_FIELDS.filter(([k]) => typeof g[k] === 'string').map(([k, l]) => (g[k] ? `${l}: ${ESC(g[k])}` : `${l}:`)).join('\n');
}
const head = (fields: unknown) => cleanDoc({ boxes: [{ id: 'h', text: 'stale', kind: 'header', fields }] })!.boxes[0];
/** Every subset of the five keys, with values and with empty values, and the odd ones. */
const OLD_SHAPES: (Record<string, unknown> | undefined)[] = [
  ...Array.from({ length: 64 }, (_, n) => Object.fromEntries(HEADER_FIELDS.filter((_, i) => n & (1 << i)).map(([k]) => [k, n & 32 ? '' : `v ${k} 2*3_a`]))),
  { name: 'Aarav Mehta', class: '8-B', date: '29 October 2026', bogus: 'x' }, { name: '2*3*4', roll: 'a_b~~c`d=e\\f' },
  { name: ' Asha\r\nK ', class: 'x'.repeat(90), subject: 5 }, undefined,
];

test('every old shape converts to the text the previous version wrote', () => {
  for (const f of OLD_SHAPES) expect(head(f).text).toBe(oldText(f));
});
test('an old header’s fields become a list in the old order: ids are the keys, and Date is marked as today', () => {
  expect(head({ date: 'd', subject: 's', name: 'n', class: 'c', roll: 'r' }).fields).toEqual([
    { id: 'name', label: 'Name', value: 'n' }, { id: 'class', label: 'Class', value: 'c' }, { id: 'subject', label: 'Subject', value: 's' },
    { id: 'roll', label: 'Roll no.', value: 'r' }, { id: 'date', label: 'Date', value: 'd', today: true }]);
  for (const f of [undefined, {}, [], 'junk', { bogus: 'x' }]) expect(head(f).fields).toEqual([
    { id: 'name', label: 'Name', value: '' }, { id: 'class', label: 'Class', value: '' }, { id: 'date', label: 'Date', value: '', today: true }]);
});
test('converted documents lay out exactly as before', () => {
  const S = cleanSettings(null, false), main = { id: 'm', page: 0, x: 112, y: 178, w: 630, text: 'Hello there', style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Main text', color: 1 };
  const sig = (d: EngineDoc) => { use(S, d); return computeLayout().segs.map(s => [s.box.id, s.page, s.idx, s.x, s.w, s.top, s.rows.length, segSig(s)]); };
  for (const f of OLD_SHAPES) {
    const converted = cleanDoc({ boxes: [{ id: 'h', kind: 'header', name: 'Header', page: 0, x: 446, y: 76, w: 320, text: '', fields: f }, main] })!;
    const before = structuredClone(converted);
    Object.assign(before.boxes[0], { fields: f, text: oldText(f) }); // the box as the previous version had it and drew it
    expect(sig(converted)).toEqual(sig(before));
  }
});
test('a list is cleaned: one-line labels of at most 30 (empty is Field), one-line values of at most 80, at most 12, unique ids, today only when true', () => {
  const f = head([
    { id: 'a', label: '  Section\nA ', value: ' 8\r\nB ' }, { id: 'a', label: '', value: 5 }, { label: 'L'.repeat(40) }, 'junk', null,
    { id: 'd', label: 'Due', value: '1 May', today: 'yes' }, { id: 'e', label: 'Date', value: '', today: true },
    ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, label: 'X' + i, value: '' })),
  ]).fields!;
  expect(f).toHaveLength(12);
  expect(f.slice(0, 5)).toEqual([{ id: 'a', label: 'Section A', value: '8 B' }, { id: 'f2', label: 'Field', value: '' }, { id: 'f3', label: 'L'.repeat(30), value: '' },
    { id: 'd', label: 'Due', value: '1 May' }, { id: 'e', label: 'Date', value: '', today: true }]);
});
test('a cleaned list is kept as it is', () => { const d = cleanDoc({ boxes: [{ text: '', kind: 'header', fields: [{ id: 'q', label: 'Teacher', value: 'Ms Rao' }, { id: 'w', label: 'Due', value: '', today: true }] }] })!; expect(cleanDoc(JSON.parse(JSON.stringify(d)))).toEqual(d); expect(d.boxes[0].text).toBe('Teacher: Ms Rao\nDue:'); });
test('a label that starts like a heading, a list, a note or a page break is written as typed', () => {
  for (const label of ['# Notes', '## Part', '- Name', '+ x', '1. Roll', '12) Part', 'a) Part', '> Quote', '2*3', 'a_b_', '\\newpage', '---']) {
    const L = parseLine(headerText([{ id: 'x', label, value: '' }]));
    expect([label, L.kind]).toEqual([label, 'text']);
    expect(parseInline(L.content).map(p => p.text).join('')).toBe(label + ':');
  }
  expect(headerText([{ id: 'x', label: 'Roll no.', value: '1. a' }])).toBe('Roll no.: 1. a');
});
test('the header limits, and a label made one line', () => {
  expect(HEADER_LIMITS).toEqual({ fields: 12, label: 30, value: 80 });
  expect([headerLabel(' Reg.\r\n\nno. '), headerLabel('  '), headerLabel(5), headerLabel(' ' + 'a'.repeat(29) + ' b')]).toEqual(['Reg. no.', 'Field', 'Field', 'a'.repeat(29)]);
});
