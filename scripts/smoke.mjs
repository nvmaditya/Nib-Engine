// Smoke run: build, serve with `vite preview`, and drive the real app in Chromium through Home, Write,
// Style and Export. Prints "smoke ok" and exits 0, or exits 1 on any failure or console error.
// Uses the Playwright that is installed on the machine (it is not a project dependency).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;

function fail(msg) { throw new Error(msg); }

async function waitForServer(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  fail(`the preview server did not start at ${url}`);
}

async function main() {
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (built.status !== 0) fail('the build failed');

  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(BASE);
    const { chromium } = require('playwright');
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    const step = async (name, fn) => {
      try { await fn(); } catch (e) { fail(`${name}: ${e.message.split('\n')[0]}`); }
      if (errors.length) fail(`${name}: console error: ${errors.join(' | ')}`);
      console.log(`  ✓ ${name}`);
    };

    await step('Home lists The Water Cycle', async () => {
      await page.goto(BASE);
      await page.getByText('The Water Cycle').waitFor({ timeout: 15000 });
    });

    await step('the document opens and its first page is drawn in handwriting', async () => {
      await page.getByText('The Water Cycle').click();
      await page.getByRole('textbox', { name: 'Main text, page 1' }).waitFor();
      // The paper is painted and, once the font file arrives (fontTick), the ink canvases get writing.
      await page.waitForFunction(() => {
        const painted = c => {
          if (!c || !c.width) return false;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) return true;
          return false;
        };
        const sheet = document.querySelector('.sheet');
        return !!sheet && painted(sheet.querySelector('.paper-bg')) && [...sheet.querySelectorAll('.ink-layer canvas')].some(painted);
      }, null, { timeout: 20000 });
    });

    await step('Write: Outline, a page break in Main text', async () => {
      await page.getByRole('group', { name: 'Write view' }).getByRole('button', { name: 'Outline' }).click();
      const list = page.getByRole('region', { name: 'Outline' });
      await list.locator('[data-item^="b1:"]').first().click();
      const editor = page.getByRole('textbox', { name: 'Main text, all pages' });
      await editor.getByText('Why it matters').click();
      await page.keyboard.press('Home');
      await page.getByRole('button', { name: 'Page break' }).click();
      await page.getByText('Page 2 starts here').waitFor({ timeout: 5000 });
      await list.getByRole('heading', { name: 'Page 2' }).waitFor({ timeout: 5000 });
    });

    await step('Outline: dragging Page 1 moves the rest of Main text onto a new page 3', async () => {
      const list = page.getByRole('region', { name: 'Outline' });
      const grip = list.getByRole('img', { name: 'Drag to move page 1' });
      const gb = await grip.boundingBox();
      const sb = await list.locator('[data-drop-page="1"]').boundingBox();
      if (!gb || !sb) fail('the page grip or the Page 2 section has no box');
      const gx = gb.x + gb.width / 2, gy = gb.y + gb.height / 2;
      await page.mouse.move(gx, gy);
      await page.mouse.down();
      await page.mouse.move(gx + 4, gy + 4, { steps: 2 });
      await page.mouse.move(gx + 40, gy + 40, { steps: 6 });
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.85, { steps: 10 });
      await page.mouse.up();
      await page.getByText('Moved page 1 to position 2. The rest of “Main text” followed it onto a new page 3.').waitFor({ timeout: 5000 });
      await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Outline"] [data-drop-page]').length === 3);
      await list.locator('[data-drop-page="0"]').getByText('Drop a block here').waitFor({ timeout: 5000 });
    });

    // (Pages comes before Join back: joining puts the continuation's text back without a page break, so page 3 goes.)
    await step('Pages: clicking the page 3 part of Main text focuses its typed editor', async () => {
      await page.getByRole('group', { name: 'Write view' }).getByRole('button', { name: 'Pages' }).click();
      const row = page.locator('main[aria-label="Pages"] [data-drop-page="2"]');
      await row.scrollIntoViewIfNeeded();
      const canvas = row.locator('.ink-layer canvas[data-id="b1:1"]');
      await canvas.waitFor({ timeout: 10000 });
      await canvas.scrollIntoViewIfNeeded();
      const b = await canvas.boundingBox();
      if (!b) fail('the page 3 ink canvas has no box');
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForFunction(() => document.activeElement?.closest('[role="textbox"]')?.getAttribute('aria-label') === 'Main text, page 3', null, { timeout: 5000 });
    });

    await step('Outline: Split here, then Join back', async () => {
      await page.getByRole('group', { name: 'Write view' }).getByRole('button', { name: 'Outline' }).click();
      await page.getByText('Page 3 starts here').waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Split here' }).click();
      await page.getByText('Split “Main text”: from page 3 on, it’s a block of its own.').waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Join back' }).click();
      await page.getByText('Joined “Main text (continued)” back into “Main text”.').waitFor({ timeout: 5000 });
      const left = await page.getByRole('region', { name: 'Outline' }).locator('[data-item]').evaluateAll(
        els => els.filter(e => (e.getAttribute('aria-label') || '').startsWith('Main text (continued)')).length);
      if (left) fail('the list still has an item named Main text (continued)');
    });

    const styleNav = () => page.getByRole('navigation', { name: 'Stages' }).getByRole('button', { name: /Style$/ });
    const painted = () => page.waitForFunction(() => {
      const ok = c => {
        if (!c || !c.width) return false;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) return true;
        return false;
      };
      return [...document.querySelectorAll('[data-stage="style"] .sheet .ink-layer canvas')].some(ok);
    }, null, { timeout: 20000 });

    await step('Style: the Journal look', async () => {
      await styleNav().click();
      const journal = page.getByRole('button', { name: 'Journal', exact: true });
      await journal.click();
      await page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.startsWith('Journal')));
      await page.getByText('Caveat · print, neat · 3 shapes per letter').waitFor({ timeout: 10000 });
    });

    await step('Style: Patrick Hand from the handwriting picker', async () => {
      await page.getByRole('button', { name: 'Change handwriting' }).click();
      const dialog = page.getByRole('dialog', { name: 'Handwriting' });
      await dialog.getByRole('searchbox', { name: 'Search handwriting' }).fill('patrick');
      const row = dialog.getByRole('button', { name: 'Patrick Hand · print, neat' });
      await row.click();
      await page.waitForFunction(() => document.querySelector('[data-hand="patrick"]')?.getAttribute('aria-pressed') === 'true');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 5000 });
      await page.getByText('Patrick Hand · print, neat').waitFor({ timeout: 5000 });
    });

    await step('Style: choose the Gel pen', async () => {
      const gel = page.getByRole('button', { name: /^Gel pen/ });
      await gel.click();
      await page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.startsWith('Gel pen')));
    });

    await step('Style: bigger writing adds a page, and Fit back takes it away', async () => {
      const sheets = () => page.locator('[data-stage="style"] .sheet').count();
      const n = await sheets();
      await page.getByRole('slider', { name: 'Letter size' }).focus();
      await page.keyboard.press('End');
      await page.getByRole('slider', { name: 'Line spacing' }).focus();
      await page.keyboard.press('End');
      const status = page.getByRole('status').filter({ hasText: /^Now \d+ pages? \(was \d+\)/ });
      await page.waitForFunction(([want]) => {
        const t = [...document.querySelectorAll('[role="status"]')].map(e => e.textContent).find(x => /^Now \d+ pages? \(was \d+\)/.test(x));
        const m = t && /^Now (\d+) pages?/.exec(t);
        return !!m && +m[1] > want;
      }, [n], { timeout: 20000 });
      const text = await status.first().textContent();
      if (!new RegExp(`^Now \\d+ pages \\(was ${n}\\)`).test(text)) fail(`the notice says "${text}", not Now N pages (was ${n})`);
      await page.getByRole('button', { name: `Fit back to ${n} ${n === 1 ? 'page' : 'pages'}` }).click();
      await page.getByText(new RegExp(`^Back to ${n} ${n === 1 ? 'page' : 'pages'}\\.`)).waitFor({ timeout: 20000 });
      await page.waitForFunction(c => document.querySelectorAll('[data-stage="style"] .sheet').length === c, n, { timeout: 20000 });
    });

    await step('Export: Download PDF gives a .pdf file', async () => {
      await page.getByRole('navigation', { name: 'Stages' }).getByRole('button', { name: /Export$/ }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.getByRole('button', { name: 'Download PDF' }).click(),
      ]);
      const name = download.suggestedFilename();
      if (!name.endsWith('.pdf')) fail(`the download is called ${name}`);
    });

    await step('Ctrl+Z on the page undoes without an error', async () => {
      await page.keyboard.press('Control+z');
      await page.getByRole('button', { name: 'Redo' }).and(page.locator(':enabled')).waitFor({ timeout: 5000 });
      await page.waitForTimeout(500); // let the pages redraw
    });

    await step('Style: an uploaded font is still there after a reload', async () => {
      await styleNav().click();
      await page.getByRole('button', { name: 'Change handwriting' }).click();
      const dialog = page.getByRole('dialog', { name: 'Handwriting' });
      // (A copy of a built-in file is a font of its own: uploads are told apart from built-ins by id.)
      await dialog.getByLabel('Use your own font').setInputFiles({ name: 'My hand.woff', mimeType: 'font/woff', buffer: readFileSync(join(root, 'public/fonts/caveat.woff')) });
      await page.getByText('Added “My hand” with 3 shapes per letter. It’s in Your fonts on this device.').waitFor({ timeout: 15000 });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 5000 });
      await page.getByText('Saved', { exact: true }).waitFor({ timeout: 10000 });
      await page.reload();
      await page.getByRole('textbox', { name: /^Main text/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
      await styleNav().click();
      await page.getByText('My hand · your font · 3 shapes per letter').waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Change handwriting' }).click();
      const first = page.getByRole('dialog', { name: 'Handwriting' }).getByRole('list', { name: 'Handwriting' }).getByRole('listitem').first().locator('[data-hand]');
      if ((await first.getAttribute('aria-pressed')) !== 'true' || !(await first.textContent()).includes('My hand · your font')) fail('the first row is not the pressed My hand');
      await page.keyboard.press('Escape');
      // (Page 1 was dragged to position 2 earlier and is empty now, so any page of Style may be the one that has writing.)
      await painted();
    });

    console.log('smoke ok');
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch(e => { console.error(`smoke failed: ${e.message}`); process.exit(1); });
