// Pages drawn for download, in real pixels. jsdom's canvas draws nothing, so these build render.ts (with
// the store and the engine) with Vite and draw in the Chromium of the Playwright installed on this
// machine, as `npm run smoke` does. Playwright is not a project dependency, so these run only with
// `npm run test:browser` (which `npm run smoke` runs first), never in `npm test`.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { applyLook, composePage, frameShot } from '@/engine/core.js';
import type { EngineDoc, Settings } from '@/engine/types';
import type { DocRecord } from '@/store/documents';
import type { update } from '@/store/editor';
import type { freeze, renderPage } from './render';

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
      expect(o.edges[0], `edges with tilt ${o.tilt}: print ${o.edges[0]}, Standard scaled up ${o.edges[1]}`).toBeGreaterThan(o.edges[1] * 1.25);
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
