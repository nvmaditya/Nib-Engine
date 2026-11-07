// Pages drawn for download: the engine's own composePage → frameShot → applyLook, at the size asked,
// from a copy of the document frozen when Download was pressed. jsdom's canvas draws nothing, so the
// real pixels are checked in Chromium by render.browser.test.ts (`npm run test:browser`).
import { beforeEach, expect, test, vi } from 'vitest';
import { PAGE_W } from '@/engine/config.js';
import { applyLook, composePage, frameShot, framesOf, settings } from '@/engine/core.js';
import { layoutFor } from '@/features/doc/model';
import { flushSave, update } from '@/store/editor';
import { box, docOf, get, lines, open } from '@/test/docs';
import { encodeCanvas, freeze, renderPage } from './render';

const seen = vi.hoisted(() => [] as string[]);
vi.mock('@/engine/core.js', async orig => {
  const actual = await orig<typeof import('@/engine/core.js')>();
  return {
    ...actual,
    get settings() { return actual.settings; }, // the engine's live S, not a copy taken when the mock was made
    composePage: vi.fn(actual.composePage),
    frameShot: vi.fn(actual.frameShot),
    applyLook: vi.fn((c: HTMLCanvasElement, i: number) => { seen.push(actual.settings.look); return actual.applyLook(c, i); }),
  };
});
vi.mock('@/store/documents', () => ({ putDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await flushSave(); vi.clearAllMocks(); vi.restoreAllMocks(); seen.length = 0; });

const dims = (c: HTMLCanvasElement) => [c.width, c.height];
test('a page is drawn by the engine at the size asked', () => { open(docOf(box({ text: 'x' }))); const f = freeze(); expect(dims(renderPage(f, 0, PAGE_W * 2.2))).toEqual([1747, 2471]); expect(dims(renderPage(f, 0, 2480))).toEqual([2480, 3508]); });
test('every page goes through the camera tilt and the scan look, as downloads always have', () => {
  open(docOf(box({ text: 'x' }))); const c = renderPage(freeze(), 0, 2480);
  expect(composePage).toHaveBeenCalledWith(0, 2480);
  expect(frameShot).toHaveBeenCalledWith(vi.mocked(composePage).mock.results[0].value, 0);
  expect(applyLook).toHaveBeenCalledWith(vi.mocked(frameShot).mock.results[0].value, 0);
  expect(c).toBe(vi.mocked(applyLook).mock.results[0].value);
});
test('it draws the frozen copy, then puts the engine back on the open document', () => {
  open(docOf(box({ id: 'm', text: lines(40) }))); update(s => { s.S.look = 'scan'; }, { history: false });
  const f = freeze(); update(s => { s.S.look = 'bw'; s.doc.boxes[0].text = 'changed'; }, { history: false });
  renderPage(f, 1, 794);
  expect(seen).toEqual(['scan']);
  expect(settings).toBe(get().S);
  expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('freeze copies the settings, the document, the title and the page count', () => {
  open(docOf(box({ text: lines(40) }))); const f = freeze();
  expect(f.S).toEqual(get().S); expect(f.S).not.toBe(get().S); expect(f.doc).toEqual(get().doc); expect(f.doc).not.toBe(get().doc);
  expect([f.title, f.pages]).toEqual(['A', 2]);
});
test('encodeCanvas gives back the encoder’s bytes', async () => {
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob([Uint8Array.of(1, 2, 3)])));
  expect(await encodeCanvas(document.createElement('canvas'), 'image/jpeg', 0.9)).toEqual(Uint8Array.of(1, 2, 3));
  expect(spy).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
});
test('encodeCanvas fails when the browser can’t make the image', async () => { vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(null)); await expect(encodeCanvas(document.createElement('canvas'), 'image/png')).rejects.toThrow('encode'); });

/** Where the engine has the open document's parts: each block's parts, by page and first row. */
const partsOf = () => get().doc.boxes.map(b => framesOf(b).map(sg => [sg.box === b, sg.page, sg.idx, sg.top, sg.rows.length]));

test('drawing from the frozen copy changes nothing in the open document, its history or where the engine has it', () => {
  open(docOf(box({ id: 'm', text: lines(40) }), box({ id: 'n', kind: 'note', x: 522, w: 220, y: 400, text: 'a note' })));
  update(s => { s.S.look = 'gray'; s.S.tilt = true; }, { history: false });
  const f = freeze();
  update(s => { s.S.look = 'none'; s.S.tilt = false; s.doc.boxes[0].text = lines(10); }, { history: false });
  layoutFor(get().S, get().doc); // as the pages on screen do once the change is laid out
  const before = { state: JSON.stringify({ S: get().S, doc: get().doc, title: get().title }), version: get().version, undo: [get().canUndo, get().canRedo], parts: partsOf() };
  renderPage(f, 0, 794); renderPage(f, 1, 794);
  expect(seen).toEqual(['gray', 'gray']);
  expect(JSON.stringify({ S: get().S, doc: get().doc, title: get().title })).toBe(before.state);
  expect([get().version, [get().canUndo, get().canRedo]]).toEqual([before.version, before.undo]);
  expect(settings).toBe(get().S);
  expect(partsOf()).toEqual(before.parts);
  expect(f.doc.boxes[0]).not.toBe(get().doc.boxes[0]);
});
test('the engine goes back to the open document even when a page can’t be drawn', () => {
  open(docOf(box({ id: 'm', text: lines(40) }))); const f = freeze();
  update(s => { s.S.look = 'bw'; }, { history: false });
  vi.mocked(composePage).mockImplementationOnce(() => { throw new Error('canvas'); });
  expect(() => renderPage(f, 0, 2480)).toThrow('canvas');
  expect(settings).toBe(get().S);
  expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('a page keeps its own index, so its tilt and its scan randomness are its own', () => {
  open(docOf(box({ text: lines(40) }))); renderPage(freeze(), 1, 794);
  expect(composePage).toHaveBeenCalledWith(1, 794);
  expect(frameShot).toHaveBeenCalledWith(expect.anything(), 1);
  expect(applyLook).toHaveBeenCalledWith(expect.anything(), 1);
});
test('the canvases a page passes through are let go once it is drawn (a phone has little canvas memory)', () => {
  open(docOf(box({ text: 'x' }))); update(s => { s.S.look = 'scan'; s.S.tilt = true; }, { history: false });
  const c = renderPage(freeze(), 0, 794);
  const composed = vi.mocked(composePage).mock.results[0].value as HTMLCanvasElement, framed = vi.mocked(frameShot).mock.results[0].value as HTMLCanvasElement;
  expect([dims(composed), dims(framed), dims(c)]).toEqual([[0, 0], [0, 0], [794, 1123]]);
});
test('a page that fails to draw lets go of the canvases it had made, so trying again has their memory', () => {
  open(docOf(box({ text: 'x' }))); update(s => { s.S.look = 'scan'; s.S.tilt = true; }, { history: false });
  const f = freeze();
  vi.mocked(applyLook).mockImplementationOnce(() => { throw new Error('canvas'); }); // out of canvas memory on the scan look
  expect(() => renderPage(f, 0, 794)).toThrow('canvas');
  const composed = vi.mocked(composePage).mock.results[0].value as HTMLCanvasElement, framed = vi.mocked(frameShot).mock.results[0].value as HTMLCanvasElement;
  expect(framed).not.toBe(composed);
  expect([dims(composed), dims(framed)]).toEqual([[0, 0], [0, 0]]);
  expect(settings).toBe(get().S); // and the engine is back on the open document
});
test('…and when the tilt is what fails, the page it was given goes', () => {
  open(docOf(box({ text: 'x' }))); update(s => { s.S.look = 'scan'; s.S.tilt = true; }, { history: false });
  vi.mocked(frameShot).mockImplementationOnce(() => { throw new Error('canvas'); });
  expect(() => renderPage(freeze(), 0, 794)).toThrow('canvas');
  expect(dims(vi.mocked(composePage).mock.results[0].value as HTMLCanvasElement)).toEqual([0, 0]);
  expect(applyLook).not.toHaveBeenCalled();
});
test('…and so does a canvas a step had handed back as it was given', () => {
  open(docOf(box({ text: 'x' }))); update(s => { s.S.look = 'scan'; }, { history: false }); // no tilt: frameShot hands back the page
  vi.mocked(applyLook).mockImplementationOnce(() => { throw new Error('canvas'); });
  expect(() => renderPage(freeze(), 0, 794)).toThrow('canvas');
  const composed = vi.mocked(composePage).mock.results[0].value as HTMLCanvasElement;
  expect(vi.mocked(frameShot).mock.results[0].value).toBe(composed);
  expect(dims(composed)).toEqual([0, 0]);
});
test('a step that hands back the canvas it was given leaves it alone: that canvas is the page', () => {
  open(docOf(box({ text: 'x' }))); const c = renderPage(freeze(), 0, 794); // As written, without the tilt
  expect(vi.mocked(composePage).mock.results[0].value).toBe(c);
  expect(dims(c)).toEqual([794, 1123]);
});
