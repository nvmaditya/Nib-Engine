import { computeLayout, drawSample, fileBase, fontCfg, fontsInUse, frameRange, framesOf, loadFont, segSig, settings, settingsKey, use } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import { box, docOf, lines } from '@/test/docs';
import { realFonts } from '@/test/fonts';

// Style's samples are the engine's own drawing (Design decision 1). No font files until the last
// two tests: until then the engine measures with the canvas stub.
const S = cleanSettings(null, false), canvas = () => document.createElement('canvas');
afterAll(() => vi.unstubAllGlobals());

test('a sample is as tall as asked and as wide as its words', () => {
  const c = canvas(), w = drawSample(c, S, 'The water cycle is', 60)!;
  expect([c.height, c.width]).toEqual([60, w]);
  expect(Math.abs(drawSample(c, S, 'The water cycle is', 120)! - 2 * w)).toBeLessThanOrEqual(2);
  expect(drawSample(c, S, 'The water cycle is the continuous', 60)).toBeGreaterThan(w);
});
// The canvas stub draws nothing, so give the first canvas drawn on an ink box at known place: alpha 255 in columns 20–119, rows 10–49 of the 225 × 101 scratch canvas.
function withInk(box: { x0: number; x1: number; y0: number; y1: number }) {
  const draws: number[][] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const ctx = { measureText: (t: string) => ({ width: String(t).length * 8 }), createPattern: () => ({}), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) data[(y * w + x) * 4 + 3] = 255;
        return { width: w, height: h, data };
      },
      drawImage: (...a: number[]) => { draws.push(a.slice(1)); } };
    return new Proxy(ctx, { get: (t, k) => (k in t ? (t as never)[k] : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D;
  } as never);
  return draws;
}
test('the written ink fills the height asked: cropped to its own box and scaled to 85% of it', () => {
  const draws = withInk({ x0: 20, x1: 119, y0: 10, y1: 49 });
  const c = canvas(), w = drawSample(c, S, 'Homework', 40)!;
  vi.restoreAllMocks();
  const [sx, sy, sw, sh, dx, dy, dw, dh] = draws[draws.length - 1];
  expect([sx, sy, sw, sh]).toEqual([20, 10, 100, 40]);
  expect(c.height).toBe(40);
  expect(dh).toBeCloseTo(34, 5); // 85% of 40
  expect(dy).toBeCloseTo(3, 5); // centred
  expect(dw / dh).toBeCloseTo(100 / 40, 5); // same shape
  expect(dx).toBeGreaterThan(0); expect(w).toBe(c.width); expect(c.width).toBeGreaterThanOrEqual(Math.round(dw + 2 * dx));
});
test('drawing a sample leaves the document as the engine had it', () => {
  const doc = docOf(box({ id: 'm', text: lines(40) })); use(S, doc); const before = computeLayout().segs.map(segSig);
  drawSample(canvas(), { ...S, font: 'caveat', mess: 100, size: 40, gap: 48 }, 'Homework', 40);
  expect(settings).toBe(S); expect(fontCfg().id).toBe('labelle');
  expect(framesOf(doc.boxes[0]).map(segSig)).toEqual(before);
  expect(frameRange(doc.boxes[0], 1)[0]).toBe(lines(28).length + 1);
});
test('nothing to write draws nothing', () => expect(drawSample(canvas(), S, '   ', 60)).toBeNull());
test('a first line that isn’t words draws nothing, and leaves the document as it was', () => {
  const doc = { ...docOf(box({ id: 'm', text: lines(40) })), fileName: 'Notes' }; use(S, doc); const before = computeLayout().segs.map(segSig);
  expect(drawSample(canvas(), { ...S, size: 40 }, '---\nHomework', 60)).toBeNull();
  expect(settings).toBe(S); expect(fileBase()).toBe('Notes');
  expect(framesOf(doc.boxes[0]).map(segSig)).toEqual(before);
});
test('a real hand is drawn from its outlines', async () => { realFonts(); expect(await loadFont('caveat')).toBe(true); expect(drawSample(canvas(), { ...S, font: 'caveat' }, 'Homework', 60)).toBeGreaterThan(0); });
test('a sample that fails to draw still leaves the document as the engine had it', async () => {
  realFonts(); expect(await loadFont('labelle')).toBe(true); expect(await loadFont('caveat')).toBe(true);
  const doc = { ...docOf(box({ id: 'm', text: lines(40) })), fileName: 'Notes' }; use(S, doc);
  const before = computeLayout().segs.map(segSig), key = settingsKey();
  expect(key.endsWith('|labelle')).toBe(true); // the document's hand has its engine
  const broken = canvas();
  broken.getContext = (() => { throw new Error('no canvas'); }) as unknown as HTMLCanvasElement['getContext'];
  expect(() => drawSample(broken, { ...S, font: 'caveat', size: 40, gap: 48 }, 'Homework', 40)).toThrow('no canvas');
  expect(settings).toBe(S); expect(settingsKey()).toBe(key); // S, and ENG still La Belle Aurore's
  expect([fileBase(), fontsInUse()]).toEqual(['Notes', ['labelle']]); // doc
  expect(framesOf(doc.boxes[0]).map(segSig)).toEqual(before); // SEGS
  expect(computeLayout().segs.map(segSig)).toEqual(before);
});
