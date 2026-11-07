import { cleanDoc, cleanSettings } from '@/engine/doc.js';
import { DEFAULTS } from '@/engine/config.js';
import { frameShot, pageTilt, use } from '@/engine/core.js';

test('engine modules load in tests and clean a document', () => {
  const d = cleanDoc({ boxes: [{ text: 'a' }] })!;
  expect(d.pageCount).toBe(1);
  expect(d.boxes[0].text).toBe('a');
  expect(typeof d.boxes[0].id).toBe('string');
});
test('settings fall back to defaults', () => {
  expect(cleanSettings({ font: 'nope' }, false).font).toBe(DEFAULTS.font);
});
test('a new document is As written, without camera tilt; a stored one keeps its tilt', () => { expect(cleanSettings(null, false)).toMatchObject({ look: 'none', tilt: false }); expect(cleanSettings({ tilt: true }, false).tilt).toBe(true); });

test('pageTilt gives the angle frameShot turns each page by', () => {
  const setup = HTMLCanvasElement.prototype.getContext, turns: number[] = [];
  // The setup's context draws nothing; this one also notes every turn it is asked for.
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...a: Parameters<typeof setup>) {
    const ctx = setup.apply(this, a) as object;
    return new Proxy(ctx, { get: (t, k) => (k === 'rotate' ? (r: number) => { turns.push(r); } : Reflect.get(t, k)) });
  } as typeof setup;
  try {
    const doc = { pageCount: 6, boxes: [], fileName: '' };
    use({ ...cleanSettings(null, false), tilt: true, seed: 11 }, doc);
    const src = document.createElement('canvas'); src.width = 1747; src.height = 2471;
    const angles = [0, 1, 2, 3, 4, 5].map(i => { turns.length = 0; frameShot(src, i); expect(turns).toEqual([pageTilt(i)]); return turns[0]; });
    expect(new Set(angles).size).toBe(6); // each page its own angle
    for (const a of angles) expect(Math.abs(a) * 180 / Math.PI).toBeGreaterThanOrEqual(0.3);
    for (const a of angles) expect(Math.abs(a) * 180 / Math.PI).toBeLessThanOrEqual(0.9);
    use({ ...cleanSettings(null, false), tilt: false, seed: 11 }, doc);
    expect([0, 1, 2, 3, 4, 5].map(pageTilt)).toEqual([0, 0, 0, 0, 0, 0]);
  } finally {
    HTMLCanvasElement.prototype.getContext = setup;
  }
});
