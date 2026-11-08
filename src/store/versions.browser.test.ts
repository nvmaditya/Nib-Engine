// The previous version of Nib and this one on the same device, as two tabs left open across a deploy. Each is
// built with Vite from its own `doc.js` and `documents.ts` (the previous one's read from git, at e8e0610: the last
// Nib with fixed header fields) and run in one Chromium profile, so the two share IndexedDB. Playwright is not a
// project dependency, so these run only with `npm run test:browser` (which `npm run smoke` runs first), never in
// `npm test`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { SAMPLE_HEAD } from '../engine/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PREVIOUS = 'e8e0610';
const PROBE = 'virtual:versions-probe';
const PROBE_CODE = `
import { cleanDoc, migrateDoc, cleanSettings } from '@/engine/doc.js';
import { use, computeLayout, exportPage, loadFont } from '@/engine/core.js';
import { DOC_SCHEMA, createDoc, getDoc, putDoc, renameDoc } from '@/store/documents';
window.probe = { cleanDoc, migrateDoc, cleanSettings, use, computeLayout, exportPage, loadFont, DOC_SCHEMA, createDoc, getDoc, putDoc, renameDoc };
`;

type Probe = Pick<typeof import('@/engine/doc.js'), 'cleanDoc' | 'migrateDoc' | 'cleanSettings'>
  & Pick<typeof import('@/engine/core.js'), 'use' | 'computeLayout' | 'exportPage' | 'loadFont'>
  & Pick<typeof import('./documents'), 'DOC_SCHEMA' | 'createDoc' | 'getDoc' | 'putDoc' | 'renameDoc'>;
type Win = { probe: Probe };
interface PwRoute { request(): { url(): string }; fulfill(o: { status?: number; contentType?: string; body: string | Buffer }): Promise<void> }
interface PwPage {
  on(ev: 'pageerror', fn: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  addScriptTag(o: { content: string; type: string }): Promise<unknown>;
  waitForFunction(fn: () => unknown): Promise<unknown>;
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface PwContext { route(url: string, fn: (r: PwRoute) => unknown): Promise<void>; newPage(): Promise<PwPage> }
interface PwBrowser { newContext(): Promise<PwContext>; close(): Promise<void> }

/** A file as the previous version had it. */
function previous(path: string): string {
  try {
    return execFileSync('git', ['show', `${PREVIOUS}:${path}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error(`needs commit ${PREVIOUS} (the last Nib with fixed header fields) in this clone`);
  }
}

/** The probe built from this version's code, or with the previous version's `doc.js` and `documents.ts` in place of these. */
async function probeBuild(old: boolean): Promise<string> {
  const swap = new Map<string, string>(old ? ['src/engine/doc.js', 'src/store/documents.ts'].map(p => [join(ROOT, p), previous(p)]) : []);
  const { build } = await import('vite');
  const out = await build({
    configFile: false, root: ROOT, logLevel: 'silent', mode: 'production', publicDir: false,
    resolve: { alias: { '@': join(ROOT, 'src') } },
    plugins: [{
      name: 'versions-probe', enforce: 'pre',
      resolveId: id => (id === PROBE ? '\0' + PROBE : null),
      load: id => (id === '\0' + PROBE ? PROBE_CODE : swap.get(id.split('?')[0]) ?? null),
    }],
    build: { write: false, minify: false, rollupOptions: { input: PROBE, output: { format: 'es', codeSplitting: false } } },
  });
  const js = (Array.isArray(out) ? out : [out]).flatMap(o => ('output' in o ? o.output : [])).find(o => o.type === 'chunk');
  if (!js || js.type !== 'chunk') throw new Error('the probe didn’t build');
  return js.code;
}

/**
 * Runs in a page: a stored document as that version reads it (getDoc's clean, then openDocument's) and draws it,
 * with the layout (each part's block given as its id), the header's text and a hash of page 1's pixels. The hash is
 * cyrb53, since http://nib.test isn't a secure context and has no crypto.subtle.
 */
const DRAW = async ({ raw, schema }: { raw: unknown; schema: number }) => {
  const p = (window as unknown as Win).probe;
  // The paper's grain and the ink's are made once per page, from Math.random: one seed gives both pages the same grain.
  let a = 7;
  Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (!(await p.loadFont('labelle'))) throw new Error('La Belle Aurore didn’t load');
  const S = p.cleanSettings(null, false), doc = p.cleanDoc(p.migrateDoc(p.cleanDoc(raw)!, schema))!;
  p.use(S, doc);
  const L = p.computeLayout();
  const c = p.exportPage(0), px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < px.length; i++) { h1 = Math.imul(h1 ^ px[i], 2654435761); h2 = Math.imul(h2 ^ px[i], 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return {
    layout: { ...L, segs: L.segs.map(s => ({ ...s, box: s.box.id })) },
    text: doc.boxes.find(b => b.kind === 'header')?.text, size: [c.width, c.height], hash: 4294967296 * (2097151 & h2) + (h1 >>> 0),
  };
};

const main = { id: 'm', kind: 'text', name: 'Main text', color: 1, page: 0, x: 112, y: 178, w: 630, text: 'The water cycle is the continuous movement of water.', style: {}, shuffle: 0, frames: {} };
const header = (fields?: Record<string, string>) => ({ id: 'h', kind: 'header', name: 'Header', color: 0, page: 0, x: 446, y: 76, w: 320, text: '', style: {}, shuffle: 0, frames: {}, ...(fields && { fields }) });
const stored = (b: object) => ({ pageCount: 1, fileName: '', boxes: [b, main] });
/** The headers earlier versions stored: schema 3's fixed-key fields, and a schema-1 text block that becomes the Header. */
const SHAPES: { name: string; raw: unknown; schema: number }[] = [
  { name: 'the example’s fields', raw: stored(header({ name: 'Aarav Mehta', class: '8-B', date: '29 October 2026' })), schema: 3 },
  { name: 'all five, with markup', raw: stored(header({ name: '2*3*4', class: 'a_b', subject: '~~x~~ ==y==', roll: '`12`', date: '[d](u) \\' })), schema: 3 },
  { name: 'an empty Name and a Roll no.', raw: stored(header({ name: '', roll: '12' })), schema: 3 },
  { name: 'no fields', raw: stored(header()), schema: 3 },
  { name: 'a schema-1 text block', raw: stored({ id: 'b2', page: 0, x: 446, y: 76, w: 320, text: SAMPLE_HEAD, style: {}, shuffle: 0, frames: {} }), schema: 1 },
];
const RIYA_OLD = { date: '1 May 2026', roll: '12', name: 'Riya', class: '8' };

describe('the previous version and this one, in one Chromium profile', () => {
  let browser: PwBrowser | undefined, old: PwPage, cur: PwPage;
  const errors: string[] = [];
  beforeAll(async () => {
    const [oldCode, curCode] = await Promise.all([probeBuild(true), probeBuild(false)]);
    const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<PwBrowser> } };
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('http://nib.test/**', r => {
      const path = new URL(r.request().url()).pathname, file = join(ROOT, 'public', path);
      if (path === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' });
      return existsSync(file) && !path.endsWith('/') ? r.fulfill({ body: readFileSync(file) }) : r.fulfill({ status: 404, body: '' });
    });
    const start = async (code: string, tag: string) => {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
      await page.goto('http://nib.test/');
      await page.addScriptTag({ content: code, type: 'module' });
      await page.waitForFunction(() => 'probe' in window);
      return page;
    };
    old = await start(oldCode, 'previous');
    cur = await start(curCode, 'this');
  }, 180_000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(() => { errors.length = 0; });

  test('a converted header draws the page the previous version drew, pixel for pixel', async () => {
    const hashes: number[] = [];
    for (const s of SHAPES) {
      const before = await old.evaluate(DRAW, s), after = await cur.evaluate(DRAW, s);
      expect(after, s.name).toEqual(before);
      expect(after.size, s.name).toEqual([1747, 2471]);
      hashes.push(after.hash);
    }
    expect(new Set(hashes).size).toBe(SHAPES.length); // every page has its own writing on it: none is blank
    expect(errors).toEqual([]);
  }, 180_000);

  test('the previous version refuses to write a schema-4 record, and leaves it as it was', async () => {
    const fields = [
      { id: 'f1', label: 'Name', value: 'Riya' }, { id: 'f2', label: 'Section', value: '8-B' },
      { id: 'f3', label: 'Registration no.', value: '12345' }, { id: 'f4', label: 'Date', value: '1 May 2026', today: true },
    ];
    const id = await cur.evaluate(async b => {
      const p = (window as unknown as Win).probe;
      const rec = await p.createDoc({ title: 'Riya’s essay', doc: p.cleanDoc({ pageCount: 1, fileName: '', boxes: [b] })! });
      await p.putDoc(rec);
      return rec.id;
    }, { ...header(), fields });
    const then = await old.evaluate(async id => {
      const p = (window as unknown as Win).probe, copy = (await p.getDoc(id))!;
      const name = (e: unknown) => (e as Error).name;
      return {
        fields: copy.doc.boxes[0].fields as unknown,
        put: await p.putDoc({ ...copy, title: 'Typed in the old tab' }).then(() => 'written', name),
        rename: await p.renameDoc(id, 'Renamed in the old tab').then(() => 'written', name),
      };
    }, id);
    expect(then).toEqual({ fields: { name: '', class: '', date: '' }, put: 'NewerDocumentError', rename: 'NewerDocumentError' });
    const now = await cur.evaluate(async id => {
      const r = (await (window as unknown as Win).probe.getDoc(id))!;
      return { title: r.title, rev: r.rev, fields: r.doc.boxes[0].fields };
    }, id);
    expect(now).toEqual({ title: 'Riya’s essay', rev: 2, fields });
    expect(errors).toEqual([]);
  }, 120_000);

  test('this version reads what the previous one wrote, fields in their old order, and writes it as schema 4', async () => {
    const first = await old.evaluate(async b => {
      const p = (window as unknown as Win).probe;
      return p.createDoc({ title: 'Week 1', doc: p.cleanDoc({ pageCount: 1, fileName: '', boxes: [b] })! });
    }, header(RIYA_OLD));
    const read = await cur.evaluate(async id => {
      const r = (await (window as unknown as Win).probe.getDoc(id))!;
      await (window as unknown as Win).probe.putDoc(r);
      const schema = await new Promise<unknown>((ok, no) => {
        const q = indexedDB.open('nib');
        q.onerror = () => no(q.error);
        q.onsuccess = () => {
          const db = q.result, g = db.transaction('documents').objectStore('documents').get(id);
          g.onsuccess = () => { db.close(); ok((g.result as { schema?: number }).schema); };
          g.onerror = () => { db.close(); no(g.error); };
        };
      });
      return { fields: r.doc.boxes[0].fields, text: r.doc.boxes[0].text, schema };
    }, first.id);
    expect(read).toEqual({
      fields: [
        { id: 'name', label: 'Name', value: 'Riya' }, { id: 'class', label: 'Class', value: '8' }, { id: 'roll', label: 'Roll no.', value: '12' },
        { id: 'date', label: 'Date', value: '1 May 2026', today: true },
      ],
      text: 'Name: Riya\nClass: 8\nRoll no.: 12\nDate: 1 May 2026', schema: 4,
    });
    const again = await old.evaluate(rec => (window as unknown as Win).probe.putDoc(rec).then(() => 'written', (e: unknown) => (e as Error).name), first);
    expect(again).toBe('NewerDocumentError');
    expect(errors).toEqual([]);
  }, 120_000);
});
