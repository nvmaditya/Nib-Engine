// Smoke run: build, serve with `vite preview`, and drive the real app in Chromium through Home, Write,
// Style and Export. Prints "smoke ok" and exits 0, or exits 1 on any failure or console error.
// Uses the Playwright that is installed on the machine (it is not a project dependency).
import { spawn, spawnSync } from 'node:child_process';
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
      await page.getByRole('textbox', { name: 'Block contents' }).waitFor();
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

    await step('Style: choose the Gel pen', async () => {
      await page.getByRole('navigation', { name: 'Stages' }).getByRole('button', { name: /Style$/ }).click();
      const gel = page.getByRole('button', { name: /^Gel pen/ });
      await gel.click();
      await page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.startsWith('Gel pen')));
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

    console.log('smoke ok');
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch(e => { console.error(`smoke failed: ${e.message}`); process.exit(1); });
