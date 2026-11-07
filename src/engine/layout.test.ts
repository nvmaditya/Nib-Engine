import { hitWord, renderSegment, segSig, segTilt } from '@/engine/core.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { Box, EngineDoc, Layout, Seg } from '@/engine/types';
import { box, docOf, layoutOf, lines, words } from '@/test/docs';

// Where every part goes and what it writes, for documents whose blocks don't collide.
// Recorded before the layout rules; it must never change.
const golden = (): EngineDoc[] => [
  sampleDoc(cleanSettings(null, false)),
  docOf(box({ text: lines(40) })),
  docOf(box({ y: 1009, text: words(40) })),
  docOf(box({ text: lines(3) + '\n\\newpage\n' + lines(3) })),
  docOf(box({ text: lines(40), frames: { 1: { x: 200, y: 178, w: 400 } } })),
];
test('documents without collisions lay out as before', () => {
  expect(golden().map(d => layoutOf(d).segs.map(s => [s.box.id, s.page, s.idx, s.x, s.w, s.top, s.rows.length, segSig(s)]))).toMatchSnapshot();
});

const segOf = (L: Layout, id: string, idx = 0) => L.segs.find(s => s.box.id === id && s.idx === idx)!;
const last = (s: Seg) => s.rows.at(-1)!.ruleY;
test('rule 1: a block continues at the top of the next page', () => { const L = layoutOf(docOf(box({ id: 'm', text: lines(40) }))); expect([segOf(L, 'm').rows.length, segOf(L, 'm', 1).page, segOf(L, 'm', 1).top, segOf(L, 'm', 1).rows.length]).toEqual([28, 1, 110, 12]); expect(L.pages).toBe(2); });
test('rule 1: a continuation keeps its own place on its page', () => { const L = layoutOf(docOf(box({ id: 'm', text: lines(40), frames: { 1: { y: 178 } } }))); expect(segOf(L, 'm', 1).top).toBe(178); });
test('rule 2: a growing block pushes an overlapping block below it', () => { const d = docOf(box({ id: 'a', text: lines(10) }), box({ id: 'b', y: 178, w: 300, text: 'b' })); const L = layoutOf(d); expect([segOf(L, 'b').top, segOf(L, 'b').storedTop, segOf(L, 'b').pushed]).toEqual([450, 178, true]); expect(d.boxes[1].y).toBe(178); });
test('rule 2: no push without horizontal overlap', () => { const L = layoutOf(docOf(box({ id: 'a', w: 300, text: lines(10) }), box({ id: 'b', x: 450, y: 178, w: 200, text: 'b' }))); expect(segOf(L, 'b').top).toBe(178); });
test('rule 2: shrinking the upper block lets the lower one return', () => { const d = docOf(box({ id: 'a', text: lines(10) }), box({ id: 'b', y: 178, w: 300, text: 'b' })); layoutOf(d); d.boxes[0].text = 'a'; const L = layoutOf(d); expect([segOf(L, 'b').top, segOf(L, 'b').pushed]).toEqual([178, false]); });
test('rule 2: a pushed block that no longer fits moves to the top of the next page', () => { const L = layoutOf(docOf(box({ id: 'a', text: lines(30) }), box({ id: 'b', y: 900, w: 300, text: 'b' }))); expect([segOf(L, 'b').page, segOf(L, 'b').top, segOf(L, 'b').storedTop]).toEqual([1, 178, 900]); });
test('rule 2: pushes chain down', () => { const L = layoutOf(docOf(box({ id: 'a', text: lines(5) }), box({ id: 'b', y: 178, text: lines(3) }), box({ id: 'c', y: 314, text: 'c' }))); expect([segOf(L, 'b').top, segOf(L, 'c').top]).toEqual([280, 382]); });
test('rule 2: a lower block never pushes a higher one', () => { const L = layoutOf(docOf(box({ id: 'a', text: 'a' }), box({ id: 'b', y: 178, text: lines(20) }))); expect([segOf(L, 'a').top, segOf(L, 'b').top]).toEqual([110, 178]); });
test('rule 2: a continuation pushes a block on its page', () => { const L = layoutOf(docOf(box({ id: 'm', text: lines(40) }), box({ id: 'n', page: 1, y: 178, w: 300, text: 'n' }))); expect(segOf(L, 'n').top).toBe(518); });
test('rule 2: a block above the top line pushes a continuation', () => { const L = layoutOf(docOf(box({ id: 'm', text: lines(40) }), box({ id: 'h', page: 1, x: 446, y: 76, w: 320, text: 'Name: A\nClass: B\nDate: C' }))); expect([segOf(L, 'm', 1).top, last(segOf(L, 'm', 1))]).toEqual([178, 586]); });
test('rule 2: two full blocks in the same place both get written', () => { const L = layoutOf(docOf(box({ id: 'a', text: lines(40) }), box({ id: 'b', text: lines(40) }))); expect(L.pages).toBe(3); expect([segOf(L, 'b').page, segOf(L, 'b').top, segOf(L, 'b').rows.length, segOf(L, 'b', 1).page, segOf(L, 'b', 1).rows.length]).toEqual([1, 518, 16, 2, 24]); });
test('no two overlapping parts share a line, in any layout above', () => {
  const docs = [
    ...golden(),
    docOf(box({ id: 'm', text: lines(40) })),
    docOf(box({ id: 'm', text: lines(40), frames: { 1: { y: 178 } } })),
    docOf(box({ id: 'a', text: lines(10) }), box({ id: 'b', y: 178, w: 300, text: 'b' })),
    docOf(box({ id: 'a', w: 300, text: lines(10) }), box({ id: 'b', x: 450, y: 178, w: 200, text: 'b' })),
    docOf(box({ id: 'a', text: 'a' }), box({ id: 'b', y: 178, w: 300, text: 'b' })),
    docOf(box({ id: 'a', text: lines(30) }), box({ id: 'b', y: 900, w: 300, text: 'b' })),
    docOf(box({ id: 'a', text: lines(5) }), box({ id: 'b', y: 178, text: lines(3) }), box({ id: 'c', y: 314, text: 'c' })),
    docOf(box({ id: 'a', text: 'a' }), box({ id: 'b', y: 178, text: lines(20) })),
    docOf(box({ id: 'm', text: lines(40) }), box({ id: 'n', page: 1, y: 178, w: 300, text: 'n' })),
    docOf(box({ id: 'm', text: lines(40) }), box({ id: 'h', page: 1, x: 446, y: 76, w: 320, text: 'Name: A\nClass: B\nDate: C' })),
    docOf(box({ id: 'a', text: lines(40) }), box({ id: 'b', text: lines(40) })),
  ];
  // The lines a part writes on run from just below its top down to its last row.
  const clashes: string[] = [];
  docs.forEach((d, di) => {
    const segs = layoutOf(d).segs;
    for (const a of segs) for (const b of segs) {
      if (a === b || a.page !== b.page || !(a.x < b.x + b.w && b.x < a.x + a.w)) continue;
      if (!(last(a) <= b.top || last(b) <= a.top)) clashes.push(`doc ${di}: ${a.box.id}:${a.idx} and ${b.box.id}:${b.idx} on page ${a.page}`);
    }
  });
  expect(clashes).toEqual([]);
});
test('a margin note is smaller and tilted', () => { const L = layoutOf(docOf(box({ id: 'n', kind: 'note', text: 'n' }))); expect((L.segs[0].rows[0] as any).block.size).toBeCloseTo(22.08); const t = segTilt(L.segs[0]) * 180 / Math.PI; expect(t).toBeGreaterThanOrEqual(-3); expect(t).toBeLessThanOrEqual(-1); expect(segTilt(layoutOf(docOf(box())).segs[0])).toBe(0); });
test('a margin note is drawn turned around its centre; other blocks are not turned', () => {
  const draw = (b: Box) => {
    const sg = layoutOf(docOf(b)).segs[0], c = document.createElement('canvas'), ctx = c.getContext('2d')!, calls: unknown[][] = [];
    c.getContext = (() => new Proxy(ctx, { get: (o, k) => (k === 'translate' || k === 'rotate' ? (...a: number[]) => { calls.push([k, ...a]); } : Reflect.get(o, k)) })) as unknown as typeof c.getContext;
    renderSegment(c, sg, 1);
    return { calls, mid: [sg.x + sg.w / 2, (sg.top + sg.bottom) / 2], t: segTilt(sg) };
  };
  const n = draw(box({ kind: 'note', text: 'n' }));
  expect(n.calls.slice(0, 3)).toEqual([['translate', ...n.mid], ['rotate', n.t], ['translate', -n.mid[0], -n.mid[1]]]);
  const t = draw(box({ text: 'n' }));
  expect(t.calls).not.toContainEqual(['translate', ...t.mid]);
});
// (Word 2 on row 1 spans x 198.7–233.3: 112 + 2 × (32 × 1.08 + 8 × 1.1).)
test('a point on a word finds that word', () => { const L = layoutOf(docOf(box({ text: words(30) }))); expect(hitWord(L.segs[0], 216, 139)).toEqual({ li: 0, tok: 2 }); expect(hitWord(L.segs[0], 120, 170)).toEqual({ li: 0, tok: 14 }); expect(hitWord(L.segs[0], 2000, 139)).toEqual({ li: 0, tok: 13 }); });
test('a point on a tilted margin note finds the word drawn there', () => {
  // 14 words a row, on lines 144, 178, 212, 246. Word k of a row is centred at x = 129.28 + k × 43.36.
  const sg = layoutOf(docOf(box({ kind: 'note', text: words(56) }))).segs[0], t = segTilt(sg), cx = sg.x + sg.w / 2, cy = (sg.top + sg.bottom) / 2;
  const turned = (x: number, y: number): [number, number] => [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)];
  // The note turns anticlockwise: its left end drops into the next row's reach, its right end rises into the one above.
  expect(hitWord(sg, ...turned(129.28, 180))).toEqual({ li: 0, tok: 14 });
  expect(hitWord(sg, ...turned(693, 158))).toEqual({ li: 0, tok: 27 });
});
