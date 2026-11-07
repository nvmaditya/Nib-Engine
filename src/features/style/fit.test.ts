// Fit back: the largest letter size, then the largest line spacing, at which the document takes no
// more pages than it did. Worked out with the hands' real metrics (La Belle Aurore's file), so the
// page counts are the ones the person sees.
import { act } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { FONTS, LIMITS } from '@/engine/config.js';
import { framesOf, loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { setV, styleBox } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import { flushSave, undo, update } from '@/store/editor';
import { box, docOf, get, lastToast, lastToastAction, lines, open } from '@/test/docs';
import { paragraphs, realFonts } from '@/test/fonts';
import { fitBack, fitPlan, pagesWord } from './fit';

vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeAll(async () => { realFonts(); expect(await loadFont('labelle')).toBe(true); });
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => { await flushSave(); vi.mocked(sonner).mockClear(); });

const para = (n: number): EngineDoc => docOf(box({ id: 'm', name: 'Main text', text: paragraphs(n) }));
const S = cleanSettings(null, false);

test('a page count is said in words', () => expect([pagesWord(1), pagesWord(2), pagesWord(3)]).toEqual(['1 page', '2 pages', '3 pages']));

test('Fit back lowers the letter size until the document fits again', () => expect(fitPlan({ ...S, size: 36 }, para(7), null, 2)).toEqual({ size: 34, gap: 34, pages: 2 }));
test('then the line spacing, once the letters are as small as they go', () => expect(fitPlan(S, para(8), null, 1)).toEqual({ size: 18, gap: 30, pages: 1 }));
test('it says when nothing fits', () => expect(fitPlan(S, para(12), null, 1)).toBeNull());
test('in Only a block, it lowers that block’s letter size', () => { const d = para(7); d.boxes[0].style = { size: 36 }; expect(fitPlan(S, d, 'm', 2)).toEqual({ size: 34, gap: 34, pages: 2 }); });
test('working it out changes nothing and leaves the engine on the document', () => {
  const S2 = { ...S, size: 36 }, d = para(7), before = JSON.stringify([S2, d]);
  fitPlan(S2, d, null, 2);
  expect(JSON.stringify([S2, d])).toBe(before);
  expect(framesOf(d.boxes[0])).toHaveLength(3);
});

test('fitBack is one undo step and says what it changed', () => {
  open(para(7));
  setV({ size: 36 });
  expect(fitBack(2)).toBe(true);
  expect(get().S.size).toBe(34);
  expect(lastToast()).toBe('Back to 2 pages. Letter size is now 34.');
  undo();
  expect(get().S.size).toBe(36);
});
test('…and the line spacing, when that changed too', () => {
  open(para(8));
  fitBack(1);
  expect([get().S.size, get().S.gap]).toEqual([18, 30]);
  expect(lastToast()).toBe('Back to 1 page. Letter size is now 18 and line spacing 30.');
});
test('the message’s Undo puts back what it changed', () => {
  open(para(8));
  fitBack(1);
  act(() => lastToastAction()!());
  expect([get().S.size, get().S.gap]).toEqual([30, 34]);
  expect(get().canUndo).toBe(true); // as a step of its own
  undo();
  expect([get().S.size, get().S.gap]).toEqual([18, 30]);
});
test('in Only a block, Fit back gives the block its own size, and Undo takes it away again', () => {
  open(para(7));
  setV({ size: 36 });
  styleBox('m');
  expect(fitBack(2)).toBe(true);
  expect([get().doc.boxes[0].style, get().S.size]).toEqual([{ size: 34 }, 36]);
  act(() => lastToastAction()!());
  expect(get().doc.boxes[0].style).toEqual({});
});
test('in Only a block that has its own size, Undo puts that size back', () => {
  open(para(7));
  styleBox('m');
  setV({ size: 36, ink: 'red' });
  expect(get().doc.boxes[0].style).toEqual({ size: 36, ink: 'red' });
  expect(fitBack(2)).toBe(true);
  expect([get().doc.boxes[0].style, get().S.size]).toEqual([{ size: 34, ink: 'red' }, 30]);
  expect(lastToast()).toBe('Back to 2 pages. Letter size is now 34.');
  act(() => lastToastAction()!());
  expect(get().doc.boxes[0].style).toEqual({ size: 36, ink: 'red' });
});
test('when nothing fits, nothing changes', () => {
  open(para(12));
  expect(fitBack(1)).toBe(false);
  expect(lastToast()).toBe('This doesn’t fit on 1 page, even with the smallest letter size and line spacing.');
  expect(get().canUndo).toBe(false);
});
test('Fit back does nothing while a hand is still arriving', () => {
  open(para(7));
  update(s => { s.S.font = 'zeyada'; s.S.size = 36; }, { history: false });
  expect(fitBack(2)).toBe(false);
  expect([get().S.size, get().canUndo, lastToast()]).toEqual([36, false, undefined]);
});

// The bisection relies on this: going down a letter size (or a line) never adds a page. It is checked
// here on every built-in hand's real file, with headings, a list, short lines, long paragraphs, a
// second block pushed down by the first, and a margin note, for the whole document and for one block.
// (It comes last: it loads every hand, and the test above needs one that hasn't arrived.)
test('page count never rises as the letters get smaller or the lines closer, in any hand', async () => {
  for (const f of FONTS) expect(await loadFont(f.id)).toBe(true);
  const mixed = (): EngineDoc => docOf(
    box({ id: 'm', name: 'Main text', text: '# A heading\n\n' + paragraphs(2) + '\n\n## Smaller heading\n- a list item long enough to wrap onto a second line of the page\n- a short one\n' + lines(12) + '\n' + paragraphs(2) }),
    box({ id: 'b', name: 'Text block 2', y: 600, w: 420, text: paragraphs(1) }),
    box({ id: 'n', name: 'Margin note', kind: 'note', x: 522, w: 220, y: 400, text: paragraphs(1) }),
  );
  const rises: string[] = [];
  const check = (what: string, values: number[], pagesAt: (v: number) => number) => {
    let prev = 0;
    for (const v of values) { const p = pagesAt(v); if (p < prev) rises.push(`${what} ${v - 1} → ${v}: ${prev} → ${p} pages`); prev = p; }
  };
  const range = ([a, b]: readonly [number, number] | number[]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (const f of FONTS) {
    const at = (p: Partial<Settings>, own?: number): number => {
      const d = mixed();
      if (own !== undefined) d.boxes[0].style = { size: own };
      return layoutFor({ ...S, font: f.id, ...p }, d).pages;
    };
    check(`${f.id} letter size`, range(LIMITS.size), size => at({ size }));
    check(`${f.id} line spacing`, range(LIMITS.gap), gap => at({ size: LIMITS.size[0], gap }));
    if (f.id === 'labelle' || f.conn) check(`${f.id} the block’s letter size`, range(LIMITS.size), size => at({ size: 30 }, size));
  }
  expect(rises).toEqual([]);
  // (and the document is long enough for that to mean something)
  expect([layoutFor({ ...S, size: LIMITS.size[0] }, mixed()).pages, layoutFor({ ...S, size: LIMITS.size[1] }, mixed()).pages]).toEqual([2, 4]);
});
