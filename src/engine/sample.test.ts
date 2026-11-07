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
