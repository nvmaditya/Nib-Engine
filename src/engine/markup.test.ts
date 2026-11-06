import { parseInline, parseLine, srcOffset, use, computeLayout, splitAtFrame } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import type { Box, EngineDoc } from '@/engine/types';

const box = (o: Partial<Box> = {}): Box => ({ id: 'b1', page: 0, x: 60, y: 80, w: 500, text: '', style: {}, shuffle: 0, frames: {}, ...o });
const docOf = (...boxes: Box[]): EngineDoc => ({ pageCount: 1, boxes, fileName: '' });
const words = (n: number) => Array.from({ length: n }, (_, i) => 'ab' + (i % 10)).join(' ');
const layoutOf = (d: EngineDoc) => { use(cleanSettings({}, false), d); return computeLayout(); };

const view = (t: string) => parseInline(t).map(p => [p.text, Object.keys(p.style).join()]);
test('existing markup parses as before', () => expect(view('a **b** *c* ==d== ~~e~~ _f_ `g` [h](u)')).toEqual([['a ', ''], ['b', 'bold'], [' ', ''], ['c', 'ul'], [' ', ''], ['d', 'hl'], [' ', ''], ['e', 'strike'], [' ', ''], ['f', 'ul'], [' ', ''], ['g', ''], [' ', ''], ['h', '']]));
test('escaped characters are written as they are', () => { expect(view('2 \\* 3 \\* 4 snake\\_case a\\=\\=b')).toEqual([['2 * 3 * 4 snake_case a==b', '']]); expect(view('a\\\\b')).toEqual([['a\\b', '']]); expect(view('C:\\Users')).toEqual([['C:\\Users', '']]); });
test.each([
  ['# T', 'heading', 1, 'T'], ['### T', 'heading', 3, 'T'], ['#### T', 'text', 0, '#### T'], ['- a', 'bullet', 0, 'a'], ['    - a', 'bullet', 0, 'a'],
  ['1. a', 'number', 0, 'a'], ['12) a', 'number', 0, 'a'], ['b) a', 'number', 0, 'a'], ['> q', 'quote', 0, 'q'], ['>q', 'quote', 0, 'q'],
  ['---', 'hr', 0, ''], ['- - -', 'hr', 0, ''], ['\\newpage', 'newpage', 0, ''], ['  \\newpage  ', 'newpage', 0, ''], ['   ', 'blank', 0, ''],
  ['\\- a', 'text', 0, '\\- a'], ['1\\. a', 'text', 0, '1\\. a'], ['\\# a', 'text', 0, '\\# a'], ['\\> a', 'text', 0, '\\> a'], ['\\\\newpage', 'text', 0, '\\\\newpage'],
])('parseLine(%j) is %s', (raw, kind, level, content) => { const l = parseLine(raw); expect([l.kind, l.level, l.content]).toEqual([kind, level, content]); });
test('list depth and marker', () => { expect(parseLine('    - a').depth).toBe(2); expect(parseLine('          - a').depth).toBe(3); expect(parseLine('12) a').marker).toBe('12)'); });
test('srcOffset finds a word after the line’s marker', () => { expect(srcOffset('ab\n## Hello there', { li: 1, tok: 1 })).toBe(12); expect(srcOffset('ab\n## Hello there', { li: 1, tok: 0 })).toBe(3); });
test('escaped markers are plain text on the page', () => { const L = layoutOf(docOf(box({ text: '\\- not a list\n\\\\newpage\nafter' }))); expect(L.pages).toBe(1); expect(L.segs[0].rows).toHaveLength(3); expect((L.segs[0].rows[0] as any).block.marker).toBeNull(); });
test('a line with hundreds of marked words keeps every word', () => {
  const ws = Array.from({ length: 650 }, (_, i) => 'w' + i), line = ws.map((w, i) => (i % 2 ? `**${w}**` : `==${w}==`)).join(' ');
  expect(parseInline(line).map(p => p.text).join('')).toBe(ws.join(' '));
  const L = layoutOf(docOf(box({ text: line })));
  const laid = L.segs.flatMap(s => s.rows.flatMap(r => ((r as any).items ?? []).map((it: any) => it.tok.pieces.map((p: any) => p.text).join(''))));
  expect(laid).toEqual(ws);
});
test('a split in the middle of _underlined_ words closes and reopens the underline', () => {
  const b = box({ y: 1009, text: `${words(20)} _${words(15)}_ ${words(5)}` }); const L = layoutOf(docOf(b));
  const nb = splitAtFrame(b, L.segs.find(s => s.idx === 1)!, 'n');
  expect(b.text.endsWith('_')).toBe(true); expect(nb.text.startsWith('_')).toBe(true);
  expect(parseInline(b.text).at(-1)!.style.ul).toBe(true); expect(parseInline(nb.text)[0].style.ul).toBe(true);
});
