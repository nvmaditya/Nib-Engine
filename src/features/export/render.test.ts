// Pages drawn for download: the engine's own composePage → frameShot → applyLook, at the size asked,
// from a copy of the document frozen when Download was pressed. The first tests run in jsdom (whose
// canvas draws nothing); the last ones build these same modules with Vite and draw real pixels in Chromium.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PAGE_W } from '@/engine/config.js';
import { applyLook, composePage, frameShot, framesOf, settings } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { layoutFor } from '@/features/doc/model';
import type { DocRecord } from '@/store/documents';
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

/* ---------- Real pixels, in Chromium ---------- */
// jsdom's canvas draws nothing, so these build render.ts (with the store and the engine) with Vite and
// draw in the Chromium that Playwright has on this machine (as `npm run smoke` does).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE = 'virtual:render-probe';
const PROBE_CODE = `
import { freeze, renderPage } from '@/features/export/render';
import { openDocument, update } from '@/store/editor';
import { applyLook, composePage, computeLayout, exportPage, frameShot, loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
window.probe = { freeze, renderPage, openDocument, update, applyLook, composePage, computeLayout, exportPage, frameShot, loadFont, cleanSettings };
`;

interface Probe {
  freeze: typeof freeze; renderPage: typeof renderPage; openDocument: (rec: DocRecord) => void; update: typeof update;
  applyLook: typeof applyLook; composePage: typeof composePage; frameShot: typeof frameShot;
  computeLayout: () => unknown; exportPage: (i: number) => HTMLCanvasElement; loadFont: (id: string) => Promise<boolean>;
  cleanSettings: (raw: unknown, legacy: boolean) => Settings;
}
/** Measures taken in the page (defined there once, by `MEASURE`). */
interface Measure {
  /** A copy of `c` resized to w × h, smoothed at the browser's best quality: an upscale, when bigger. */
  resize(c: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement;
  /** How many bytes of the two pages' pixels differ (every byte, when their sizes differ). */
  diff(a: HTMLCanvasElement, b: HTMLCanvasElement): number;
  /** Detail finer than a Standard page's pixels can hold, on the ink: how far the page is from itself taken down to Standard size and back. */
  inkDetail(c: HTMLCanvasElement): number;
  /** How steep the ink's edges are: the mean brightness change per pixel where an edge is. */
  edgeSharpness(c: HTMLCanvasElement): number;
  /** Opens a document whose first page is filled with writing, in La Belle Aurore (its real file). */
  openWriting(S: Partial<Settings>): Promise<void>;
}
type Win = { probe: Probe; measure: Measure };
interface PwRoute { request(): { url(): string }; fulfill(o: { status?: number; contentType?: string; body: string | Buffer }): Promise<void> }
interface PwPage {
  route(url: string, fn: (r: PwRoute) => unknown): Promise<void>;
  on(ev: 'pageerror', fn: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  addScriptTag(o: { content: string; type: string }): Promise<unknown>;
  waitForFunction(fn: () => unknown): Promise<unknown>;
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface PwBrowser { newPage(): Promise<PwPage>; close(): Promise<void> }

const WRITING = Array.from({ length: 14 }, () => 'The quick brown fox jumps over the lazy dog, and writes it out again by hand.').join(' ');
// Runs in the page: the measures above, and a document to draw.
const MEASURE = (writing: string): void => {
  const w = window as unknown as Win, p = w.probe;
  const STD = [1747, 2471];
  const resize = (c: HTMLCanvasElement, wd: number, ht: number) => {
    const o = document.createElement('canvas'); o.width = wd; o.height = ht;
    const x = o.getContext('2d')!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, wd, ht);
    return o;
  };
  const data = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const lum = (c: HTMLCanvasElement) => { const d = data(c), L = new Float32Array(c.width * c.height); for (let i = 0; i < L.length; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; return L; };
  // The written lines of page 1, in page units (A4 is 794 wide): inside the text block, from its first line down.
  const region = (c: HTMLCanvasElement) => { const k = c.width / 794; return [Math.round(130 * k), Math.round(730 * k), Math.round(120 * k), Math.round(560 * k)]; };
  const INK = 150; // ink is far darker than the paper and its printed lines
  w.measure = {
    resize,
    diff(a, b) {
      if (a.width !== b.width || a.height !== b.height) return a.width * a.height * 4;
      const da = data(a), db = data(b); let n = 0;
      for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n++;
      return n;
    },
    inkDetail(c) {
      const L = lum(c), B = lum(resize(resize(c, STD[0], STD[1]), c.width, c.height)), W = c.width, [x0, x1, y0, y1] = region(c);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (L[i] < INK || B[i] < INK) { s += Math.abs(L[i] - B[i]); n++; } }
      return s / Math.max(1, n);
    },
    edgeSharpness(c) {
      const L = lum(c), W = c.width, [x0, x1, y0, y1] = region(c);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * W + x; if (Math.min(L[i - 1], L[i + 1], L[i - W], L[i + W]) >= INK) continue; // edges of the ink only
        const g = Math.hypot(L[i + 1] - L[i - 1], L[i + W] - L[i - W]) / 2; if (g > 20) { s += g; n++; }
      }
      return s / Math.max(1, n);
    },
    async openWriting(S) {
      if (!(await p.loadFont('labelle'))) throw new Error('La Belle Aurore didn’t load');
      const doc: EngineDoc = { pageCount: 1, fileName: '', boxes: [{ id: 'm', page: 0, x: 112, y: 110, w: 630, text: writing, style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Main text', color: 0 }] };
      p.openDocument({ id: 'probe', title: 'Probe', createdAt: 1, updatedAt: 1, settings: { ...p.cleanSettings(null, false), ...S }, doc });
    },
  };
};

describe('in Chromium, with real pixels', () => {
  let browser: PwBrowser | undefined, page: PwPage;
  const errors: string[] = [];
  beforeAll(async () => {
    const { build } = await import('vite');
    const out = await build({
      configFile: false, root: ROOT, logLevel: 'silent', mode: 'production', publicDir: false,
      resolve: { alias: { '@': join(ROOT, 'src') } },
      plugins: [{ name: 'render-probe', resolveId: id => (id === PROBE ? '\0' + PROBE : null), load: id => (id === '\0' + PROBE ? PROBE_CODE : null) }],
      build: { write: false, minify: false, rollupOptions: { input: PROBE, output: { format: 'es', codeSplitting: false } } },
    });
    const outputs = (Array.isArray(out) ? out : [out]).flatMap(o => ('output' in o ? o.output : []));
    const js = outputs.find(o => o.type === 'chunk');
    if (!js || js.type !== 'chunk') throw new Error('the probe didn’t build');
    const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<PwBrowser> } };
    browser = await chromium.launch();
    page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://nib.test/**', r => {
      const path = new URL(r.request().url()).pathname, file = join(ROOT, 'public', path);
      if (path === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' });
      return existsSync(file) && !path.endsWith('/') ? r.fulfill({ body: readFileSync(file) }) : r.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://nib.test/');
    await page.addScriptTag({ content: js.code, type: 'module' });
    await page.waitForFunction(() => 'probe' in window);
    await page.evaluate(MEASURE, WRITING);
  }, 120_000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(() => { errors.length = 0; });

  test('Print quality is the engine drawing 2480 pixels wide: finer ink detail and steeper edges than a Standard page scaled up', async () => {
    const r = await page.evaluate(async () => {
      const { probe: p, measure: m } = window as unknown as Win, out: { tilt: boolean; size: number[]; differ: boolean; detail: number[]; edges: number[] }[] = [];
      for (const tilt of [false, true]) {
        await m.openWriting({ tilt });
        const f = p.freeze(), std = p.renderPage(f, 0, 794 * 2.2), print = p.renderPage(f, 0, 2480), up = m.resize(std, print.width, print.height);
        out.push({ tilt, size: [print.width, print.height], differ: m.diff(print, up) > 0, detail: [m.inkDetail(print), m.inkDetail(up)], edges: [m.edgeSharpness(print), m.edgeSharpness(up)] });
      }
      return out;
    });
    for (const o of r) {
      expect(o.size).toEqual([2480, 3508]);
      expect(o.differ).toBe(true);
      expect(o.detail[0], `ink detail with tilt ${o.tilt}: print ${o.detail[0]}, Standard scaled up ${o.detail[1]}`).toBeGreaterThan(o.detail[1] * 1.5);
      expect(o.edges[0], `edges with tilt ${o.tilt}: print ${o.edges[0]}, Standard scaled up ${o.edges[1]}`).toBeGreaterThan(o.edges[1] * 1.15);
    }
    expect(errors).toEqual([]);
  }, 120_000);

  test('the pages are the engine’s own, pixel for pixel: Standard is the download every earlier version made, Print is composePage → frameShot → applyLook at 2480', async () => {
    const r = await page.evaluate(async () => {
      const { probe: p, measure: m } = window as unknown as Win, out: Record<string, number> = {};
      for (const look of ['scan', 'gray', 'bw'] as const) {
        await m.openWriting({ look, tilt: look !== 'gray', paper: look === 'bw' ? 'yellow' : 'ruled', crease: look === 'gray' });
        out[look] = m.diff(p.renderPage(p.freeze(), 0, 794 * 2.2), p.exportPage(0));
      }
      await m.openWriting({ look: 'scan', tilt: true, crease: true });
      out.print = m.diff(p.renderPage(p.freeze(), 0, 2480), p.applyLook(p.frameShot(p.composePage(0, 2480), 0), 0));
      return out;
    });
    expect(r).toEqual({ scan: 0, gray: 0, bw: 0, print: 0 });
    expect(errors).toEqual([]);
  }, 120_000);

  test('drawing the frozen copy leaves the engine drawing the open document exactly as before', async () => {
    const r = await page.evaluate(async () => {
      const { probe: p, measure: m } = window as unknown as Win;
      await m.openWriting({ look: 'bw', tilt: true });
      const f = p.freeze();
      p.update(s => { s.S.look = 'none'; s.S.tilt = false; s.doc.boxes[0].text = 'Something else, written later.'; }, { history: false, save: false });
      p.computeLayout();
      const live = p.exportPage(0), copy = p.renderPage(f, 0, 794 * 2.2);
      p.renderPage(f, 0, 2480);
      return { copyDiffers: m.diff(copy, live) > 0, after: m.diff(p.exportPage(0), live) };
    });
    expect(r).toEqual({ copyDiffers: true, after: 0 });
    expect(errors).toEqual([]);
  }, 120_000);
});
