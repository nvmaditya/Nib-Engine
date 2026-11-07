// Thumbnails of page 1: the engine's own composePage, kept on the device in `prefs`, drawn one at a time.
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { composePage, computeLayout, framesOf, photoLoaded, settings } from '@/engine/core.js';
import { getDb } from '@/store/db';
import { closeDocument } from '@/store/editor';
import { getPref, setPref } from '@/store/documents';
import { box, docOf, fontsLoad, get, lines, open } from '@/test/docs';

vi.mock('@/engine/core.js', async orig => {
  const actual = await orig<typeof import('@/engine/core.js')>();
  return {
    ...actual,
    get settings() { return actual.settings; },
    composePage: vi.fn(actual.composePage),
    computeLayout: vi.fn(actual.computeLayout),
    photoLoaded: vi.fn(async () => true),
  };
});
vi.mock('@/store/documents', async orig => {
  const actual = await orig<typeof import('@/store/documents')>();
  return { ...actual, setPref: vi.fn(actual.setPref) };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

import { clearThumbMemory, dataUrl, drawThumb, forgetThumb, handsOf, peekThumb, thumbFor, thumbSig } from './thumbs';

const actual = await vi.importActual<typeof import('@/engine/core.js')>('@/engine/core.js');
const S = cleanSettings(null, false), two = () => docOf(box({ id: 'm', text: lines(40) }));

beforeEach(async () => {
  clearThumbMemory(); await (await getDb()).clear('prefs'); fontsLoad();
  vi.mocked(composePage).mockReset().mockImplementation(actual.composePage);
  vi.mocked(computeLayout).mockReset().mockImplementation(actual.computeLayout);
  vi.mocked(setPref).mockReset().mockImplementation((await vi.importActual<typeof import('@/store/documents')>('@/store/documents')).setPref);
});
afterEach(() => { vi.unstubAllGlobals(); });

test('page 1 is drawn by the engine, at the size asked, with the page count', () => {
  const { canvas, pages } = drawThumb(S, two(), 156);
  expect(composePage).toHaveBeenCalledWith(0, 156); expect([canvas.width, canvas.height, pages]).toEqual([156, 221, 2]);
});
test('drawing one leaves the engine on the open document, laid out', () => {
  open(docOf(box({ id: 'o', text: 'open' }))); drawThumb(S, two(), 156);
  expect(settings).toBe(get().S); expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('the engine is put back even when drawing fails', () => {
  open(docOf(box({ id: 'o', text: 'open' })));
  vi.mocked(composePage).mockImplementationOnce(() => { throw new Error('canvas'); });
  expect(() => drawThumb(S, two(), 156)).toThrow('canvas');
  expect(settings).toBe(get().S); expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('on Home, with no document open, it isn’t laid out again for nothing', async () => {
  open(docOf(box())); await closeDocument(); vi.mocked(computeLayout).mockClear();
  drawThumb(S, two(), 156); expect(computeLayout).toHaveBeenCalledTimes(1); expect(settings).toBe(get().S);
});
test('a thumbnail is kept on the device, and drawn again only when page 1’s document changes', async () => {
  const d = two();
  expect(await thumbFor('doc:x', S, d, 156)).toEqual({ url: expect.stringMatching(/^data:image\/jpeg;base64,/), pages: 2 });
  // (fake-indexeddb clones in another realm, so `any(Uint8Array)` can't match what it hands back: check the bytes.)
  const kept = await getPref<{ sig: string; jpeg: Uint8Array; pages: number }>('thumb:doc:x');
  expect({ ...kept, jpeg: undefined }).toEqual({ sig: thumbSig(S, d, 156), jpeg: undefined, pages: 2 });
  expect([ArrayBuffer.isView(kept!.jpeg), kept!.jpeg.length > 0, [kept!.jpeg[0], kept!.jpeg[1]]]).toEqual([true, true, [0xff, 0xd8]]);
  await thumbFor('doc:x', S, d, 156); clearThumbMemory(); await thumbFor('doc:x', S, structuredClone(d), 156);
  expect(composePage).toHaveBeenCalledTimes(1);
  await thumbFor('doc:x', { ...S, ink: 'red' }, d, 156); expect(composePage).toHaveBeenCalledTimes(2);
});
test('it waits for the hands, and with a hand that can’t be fetched there is none and nothing is kept', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
  const Z = { ...S, font: 'zeyada' };
  expect(await thumbFor('doc:y', Z, two(), 156)).toBeNull(); expect(composePage).not.toHaveBeenCalled(); expect(await getPref('thumb:doc:y')).toBeUndefined();
  fontsLoad(); expect(await thumbFor('doc:y', Z, two(), 156)).not.toBeNull(); // tried again next time
});
test('it does not draw before the document’s fonts are loaded', async () => {
  let release!: () => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { release = () => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); })));
  const p = thumbFor('doc:slow', { ...S, font: 'kalam' }, two(), 156);
  await new Promise(r => setTimeout(r, 20)); expect(composePage).not.toHaveBeenCalled();
  release(); expect(await p).not.toBeNull(); expect(composePage).toHaveBeenCalledTimes(1);
});
test('a block’s own hand counts too', () => expect(handsOf(S, docOf(box({ style: { font: 'caveat' } }), box({ id: 'b2', style: { font: 'caveat' } })))).toEqual(['labelle', 'caveat']));
test('storage that won’t keep it still shows it', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); expect(await thumbFor('doc:z', S, two(), 156)).not.toBeNull(); });
test('a stored value of the wrong shape is ignored', async () => {
  await setPref('thumb:doc:v', { nonsense: true }); expect(await thumbFor('doc:v', S, two(), 156)).not.toBeNull(); expect(composePage).toHaveBeenCalledTimes(1);
});
test('forgetThumb takes it off the device', async () => { const d = two(); await thumbFor('doc:w', S, d, 156); await forgetThumb('doc:w'); expect([await getPref('thumb:doc:w'), peekThumb('doc:w', thumbSig(S, d, 156))]).toEqual([undefined, null]); });
test('one at a time: the second is drawn after the first is kept', async () => {
  const events: string[] = [];
  vi.mocked(composePage).mockImplementation((i, px) => { events.push('draw'); return actual.composePage(i, px); }); vi.mocked(setPref).mockImplementation(async k => { await new Promise(r => setTimeout(r, 10)); events.push('keep ' + k); }); // storage takes a moment
  await Promise.all([thumbFor('doc:a', S, two(), 156), thumbFor('doc:b', S, two(), 156)]);
  expect(events).toEqual(['draw', 'keep thumb:doc:a', 'draw', 'keep thumb:doc:b']);
});
test('a tile that no longer wants its picture isn’t drawn', async () => {
  expect(await thumbFor('doc:n', S, two(), 156, () => false)).toBeNull(); expect(composePage).not.toHaveBeenCalled();
});
test('the canvas is released once encoded, and also when encoding fails', async () => {
  const made: HTMLCanvasElement[] = [];
  vi.mocked(composePage).mockImplementation((i, px) => { const c = actual.composePage(i, px); made.push(c); return c; });
  await thumbFor('doc:r1', S, two(), 156); expect([made[0].width, made[0].height]).toEqual([0, 0]);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce(cb => cb(null));
  expect(await thumbFor('doc:r2', S, two(), 156)).toBeNull(); expect([made[1].width, made[1].height]).toEqual([0, 0]);
  vi.restoreAllMocks();
});
test('the signature follows what page 1 is drawn from, not the title', () => {
  const d = two(); expect(thumbSig(S, d, 156)).toMatch(/^[0-9a-f]{8}$/);
  expect(thumbSig(S, d, 156)).toBe(thumbSig(S, structuredClone(d), 156)); expect(thumbSig(S, d, 360)).not.toBe(thumbSig(S, d, 156));
  expect(thumbSig(S, { ...d, boxes: [{ ...d.boxes[0], text: 'x' }] }, 156)).not.toBe(thumbSig(S, d, 156));
});
test('dataUrl encodes bytes of any length', () => {
  const big = new Uint8Array(70000).map((_, i) => i % 256);
  expect(dataUrl(new Uint8Array([104, 105]), 'text/plain')).toBe('data:text/plain;base64,aGk=');
  expect(atob(dataUrl(big, 'x/y').split(',')[1]).length).toBe(70000);
});
test('Photo paper waits for the engine’s own photo: with it not loaded there is no thumbnail and nothing is kept', async () => {
  const P = { ...S, paper: 'photo' };
  vi.mocked(photoLoaded).mockResolvedValueOnce(false);
  expect(await thumbFor('doc:ph', P, two(), 156)).toBeNull(); expect(composePage).not.toHaveBeenCalled(); expect(await getPref('thumb:doc:ph')).toBeUndefined();
  expect(await thumbFor('doc:ph', P, two(), 156)).not.toBeNull(); expect(photoLoaded).toHaveBeenCalledTimes(2); // tried again later
});
test('a hung fetch gives up after 10 s, and doesn’t hold up the next thumbnail', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const a = thumbFor('doc:hang', { ...S, font: 'patrick' }, two(), 156);
    await vi.advanceTimersByTimeAsync(9000); expect(composePage).not.toHaveBeenCalled();
    fontsLoad(); const b = thumbFor('doc:next', S, two(), 156);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await a).toBeNull(); expect(await b).not.toBeNull(); expect(composePage).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
