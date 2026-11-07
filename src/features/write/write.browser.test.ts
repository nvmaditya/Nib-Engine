// Write in a real browser, for what jsdom can't show: where things are laid out and what is painted over what.
// The app is built with Vite (in memory) and driven in the Chromium of the Playwright installed on this machine,
// as `npm run smoke` does. Playwright is not a project dependency, so these run only with `npm run test:browser`
// (which `npm run smoke` runs first), never in `npm test`. Each test starts on Home in a new browser profile,
// where Nib makes the example document, The Water Cycle.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ORIGIN = 'http://nib.test/';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.mjs': 'text/javascript',
};

interface Box { x: number; y: number; width: number; height: number }
interface PwLocator {
  first(): PwLocator;
  locator(sel: string): PwLocator;
  getByRole(role: string, o?: { name?: string | RegExp; exact?: boolean }): PwLocator;
  click(o?: { position?: { x: number; y: number } }): Promise<void>;
  waitFor(o?: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' }): Promise<void>;
  boundingBox(): Promise<Box | null>;
  scrollIntoViewIfNeeded(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
}
interface PwRoute { request(): { url(): string }; fulfill(o: { status?: number; contentType?: string; body: string | Buffer }): Promise<void>; abort(): Promise<void> }
interface PwPage extends Pick<PwLocator, 'locator' | 'getByRole'> {
  getByText(t: string): PwLocator;
  on(ev: 'pageerror', fn: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  keyboard: { press(k: string): Promise<void>; type(t: string): Promise<void> };
  screenshot(o: { clip: Box }): Promise<Buffer>;
  addStyleTag(o: { content: string }): Promise<unknown>;
  waitForFunction<A>(fn: (arg: A) => unknown, arg: A, o?: { timeout?: number }): Promise<unknown>;
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface PwContext { route(url: string, fn: (r: PwRoute) => unknown): Promise<void>; newPage(): Promise<PwPage>; close(): Promise<void> }
interface PwBrowser { newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'dark' | 'light' }): Promise<PwContext>; close(): Promise<void> }

describe('Write in Chromium, laid out for real', () => {
  const built = new Map<string, string | Uint8Array>();
  let browser: PwBrowser | undefined;
  const contexts: PwContext[] = [];
  const errors: string[] = [];

  beforeAll(async () => {
    const { build } = await import('vite');
    const out = await build({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), logLevel: 'silent', build: { write: false } });
    for (const o of (Array.isArray(out) ? out : [out]).flatMap(r => ('output' in r ? r.output : []))) {
      built.set(o.fileName, o.type === 'chunk' ? o.code : o.source);
    }
    if (!built.has('index.html')) throw new Error('the app didn’t build');
    const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<PwBrowser> } };
    browser = await chromium.launch();
  }, 180_000);
  afterAll(async () => { await browser?.close(); });

  /** A new profile at `width` px (dark theme, 1 device pixel per CSS pixel) with The Water Cycle open in Write. */
  async function openSample(width: number): Promise<PwPage> {
    const ctx = await browser!.newContext({ viewport: { width, height: width < 860 ? 844 : 860 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    contexts.push(ctx);
    await ctx.route('**/*', r => {
      const url = r.request().url();
      if (!url.startsWith(ORIGIN)) return r.abort(); // web fonts: the hands come from public/fonts
      const path = decodeURIComponent(new URL(url).pathname.slice(1)) || 'index.html';
      const body = built.get(path) ?? (existsSync(join(ROOT, 'public', path)) && !path.endsWith('/') ? readFileSync(join(ROOT, 'public', path)) : null);
      if (body === null) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ contentType: TYPES[extname(path)] ?? 'application/octet-stream', body: typeof body === 'string' ? body : Buffer.from(body) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(ORIGIN);
    await page.getByText('The Water Cycle').first().click();
    await page.getByRole('textbox', { name: 'Main text, page 1' }).waitFor({ timeout: 20_000 });
    return page;
  }
  afterAll(async () => { for (const c of contexts) await c.close().catch(() => {}); });

  test('a selected block’s outline lies under its writing: letters that reach past its left edge show over it', async () => {
    const page = await openSample(1280);
    await page.getByRole('group', { name: 'Write view' }).getByRole('button', { name: 'Outline' }).click();
    await page.locator('[data-item^="b1:"]').first().click();
    const frame = page.locator('[data-stage="outline"] .block-frame.selected[data-id="b1:0"]');
    await frame.waitFor();
    await page.waitForFunction(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-stage="outline"] .ink-layer canvas[data-id="b1:0"]');
      return !!c?.width && !!c.dataset.k;
    }, null, { timeout: 20_000 });
    const b = (await frame.boundingBox())!;
    // One pixel column wholly inside the outline's 2 px left edge, down the block: as drawn, then without the ink.
    const strip = { x: Math.ceil(b.x), y: Math.round(b.y), width: 1, height: Math.round(b.height) };
    const withInk = await page.screenshot({ clip: strip });
    await page.addStyleTag({ content: '.ink-layer { visibility: hidden !important; }' });
    const without = await page.screenshot({ clip: strip });
    expect(withInk.equals(without), 'the outline hides the ink where letters cross the block’s left edge').toBe(false);
    expect(errors).toEqual([]);
  }, 120_000);

  test.each([1280, 390])('at %i px, typing past the bottom of a typed page stays inside the page, which is A4 again once the editor is left', async width => {
    const page = await openSample(width);
    await page.getByRole('textbox', { name: 'Main text, page 1' }).click();
    await page.keyboard.press('Control+End');
    for (let k = 1; k <= 14; k++) { await page.keyboard.press('Enter'); await page.keyboard.type(`More words, line ${k}`); }
    await page.getByText('Page 2 starts here').waitFor();
    const at = await page.evaluate(() => {
      const ed = document.querySelector('[role="textbox"][aria-label="Main text, page 1"]')!;
      const card = ed.closest('.typed-page')!, caption = card.parentElement!.querySelector('figcaption');
      return { card: card.getBoundingClientRect().bottom, part: ed.closest('.typed-part')!.getBoundingClientRect().bottom, caption: caption?.getBoundingClientRect().top ?? null };
    });
    expect(at.part, 'the frozen part’s bottom').toBeLessThanOrEqual(at.card);
    if (at.caption !== null) expect(at.caption, 'the caption under the page').toBeGreaterThanOrEqual(at.card);
    // Leaving the editor ends the freeze: the lines past the page go on to page 2, and page 1 is its own size again.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.waitForFunction(() => {
      const card = document.querySelector<HTMLElement>('.typed-page[data-paper="0"]')!;
      return Math.round(card.getBoundingClientRect().height) === Math.round(parseFloat(card.style.width) * 1123 / 794);
    }, null, { timeout: 5_000 });
    expect(errors).toEqual([]);
  }, 120_000);
});
