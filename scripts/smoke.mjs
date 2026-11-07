// Smoke run: build, serve with `vite preview`, and drive the real app in Chromium through Home, Write,
// Style and Export (reading the downloaded PDF and ZIP byte by byte). Prints "smoke ok" and exits 0, or exits 1 on any failure or console error.
// Uses the Playwright that is installed on the machine (it is not a project dependency).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;

function fail(msg) { throw new Error(msg); }

// ---- Readers for the downloaded bytes. The smoke test checks the files themselves, not what the app says about them. ----

/** The chunks of a PNG, in order: { type, length }. Fails on a bad signature or a chunk running past the end. */
function pngChunks(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('not a PNG: bad signature');
  const out = [];
  for (let at = 8; at < buf.length;) {
    if (at + 12 > buf.length) fail('a PNG chunk is cut short');
    const length = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8);
    if (at + 12 + length > buf.length) fail(`the PNG chunk ${type} runs past the end`);
    out.push({ type, length, data: buf.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

/** The markers of a JPEG as { marker, length } (length counts its own two bytes; 0 for those with none), up to and including EOI. */
function jpegMarkers(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail('not a JPEG: no SOI');
  const out = [];
  let at = 2;
  while (at < buf.length) {
    if (buf[at] !== 0xff) fail(`a JPEG marker was expected at ${at}`);
    const m = buf[at + 1];
    if (m === 0xff) { at++; continue; } // (fill byte)
    if (m === 0xd9) { out.push({ marker: m, length: 0 }); return out; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push({ marker: m, length: 0 }); at += 2; continue; }
    const length = buf.readUInt16BE(at + 2);
    out.push({ marker: m, length });
    at += 2 + length;
    if (m === 0xda) { // the scan data: skip to the next real marker (not a stuffed 00, not an RSTn)
      while (at < buf.length && !(buf[at] === 0xff && buf[at + 1] !== 0 && !(buf[at + 1] >= 0xd0 && buf[at + 1] <= 0xd7))) at++;
    }
  }
  fail('the JPEG has no EOI');
}

/** The entries of a ZIP, found the way an unzipper does: end record, central directory, local headers. */
function zipEntries(buf) {
  let end = -1;
  for (let k = buf.length - 22; k >= 0; k--) if (buf.readUInt32LE(k) === 0x06054b50) { end = k; break; }
  if (end < 0) fail('the ZIP has no end record');
  const count = buf.readUInt16LE(end + 10), dirAt = buf.readUInt32LE(end + 16), comment = buf.readUInt16LE(end + 20);
  const entries = [];
  for (let k = 0, at = dirAt; k < count; k++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) fail('a central directory entry is missing');
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), noteLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    if (buf.readUInt32LE(local) !== 0x04034b50) fail('a local header is missing');
    const lName = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20);
    const data = buf.subarray(local + 30 + lName + lExtra, local + 30 + lName + lExtra + size);
    entries.push({
      name, method, time: buf.readUInt16LE(at + 12), date: buf.readUInt16LE(at + 14), flags: buf.readUInt16LE(at + 8),
      extra: extraLen, localExtra: lExtra, localTime: buf.readUInt16LE(local + 10), localDate: buf.readUInt16LE(local + 12),
      localFlags: buf.readUInt16LE(local + 6), entryComment: noteLen, internal: buf.readUInt16LE(at + 36), external: buf.readUInt32LE(at + 38),
      crcOk: zlib.crc32(data) === buf.readUInt32LE(at + 16) && buf.readUInt32LE(local + 14) === buf.readUInt32LE(at + 16),
      data,
    });
    at += 46 + nameLen + extraLen + noteLen;
  }
  return { entries, comment };
}

/** PDF.js (the Node-friendly build), with the browser classes it only needs for drawing stubbed so it stays quiet. */
function pdfjs() {
  globalThis.DOMMatrix ??= class {};
  globalThis.Path2D ??= class {};
  return require(join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.js'));
}

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

    const exportNav = () => page.getByRole('navigation', { name: 'Stages' }).getByRole('button', { name: /Export$/ });
    const formatBtn = name => page.getByRole('group', { name: 'Format' }).getByRole('button', { name, exact: true });
    let n = 0;

    await step('Export: a PDF of every page, with no metadata', async () => {
      await exportNav().click();
      await page.locator('[data-stage="export"] .sheet').first().waitFor({ timeout: 20000 });
      n = await page.locator('[data-stage="export"] .sheet').count();
      if (n < 2) fail(`Export shows ${n} pages; the Outline steps made at least 3`);
      const button = page.getByRole('button', { name: new RegExp(`^Download PDF · ${n} pages ~[\\d.]+ (KB|MB)$`) });
      await button.waitFor({ timeout: 20000 });
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), button.click()]);
      if (download.suggestedFilename() !== 'The Water Cycle.pdf') fail(`the download is called ${download.suggestedFilename()}`);
      const bytes = readFileSync(await download.path());
      const text = bytes.toString('latin1');

      // Cut the streams out (each dictionary says its /Length), so the checks below read only the file's own structure.
      const streams = [];
      let outside = '', from = 0;
      for (const m of text.matchAll(/<<([^>]*?)\/Length (\d+) *>>\nstream\n/g)) {
        const start = m.index + m[0].length, len = +m[2];
        outside += text.slice(from, start);
        streams.push({ dict: m[1], bytes: bytes.subarray(start, start + len) });
        from = start + len;
      }
      outside += text.slice(from);
      for (const key of ['/Info', '/Producer', '/Creator', '/Author', '/Title', '/Subject', '/Keywords', '/CreationDate', '/ModDate', '/Metadata']) {
        if (outside.includes(key)) fail(`the PDF has ${key}`);
      }
      const id = /\/ID \[<([0-9A-Fa-f]{32})> <([0-9A-Fa-f]{32})>\]/.exec(outside);
      if (!id || id[1] !== id[2]) fail('the PDF trailer has no /ID [<X> <X>] with 32 hex digits');
      if (!outside.includes(`/Count ${n} `) && !outside.includes(`/Count ${n}>`)) fail(`the PDF does not say /Count ${n}`);
      const images = streams.filter(s => s.dict.includes('/Subtype /Image'));
      if (images.length !== n) fail(`the PDF holds ${images.length} images, not ${n}`);
      const ALLOWED = m => m === 0xe0 || m === 0xdb || (m >= 0xc0 && m <= 0xcf && m !== 0xc8) || m === 0xdd || m === 0xda || m === 0xd9;
      for (const [k, img] of images.entries()) {
        if (!/\/Width 1747 \/Height 2471 /.test(img.dict) || !img.dict.includes('/DCTDecode')) fail(`image ${k + 1} is not a 1747 × 2471 DCT image`);
        const marks = jpegMarkers(img.bytes);
        const bad = marks.find(x => !ALLOWED(x.marker));
        if (bad) fail(`image ${k + 1} has the JPEG marker FF${bad.marker.toString(16).toUpperCase()}`);
        const app = marks.filter(x => x.marker === 0xe0);
        if (app.length !== 1 || app[0].length !== 16) fail(`image ${k + 1} does not have exactly one bare JFIF segment`);
      }

      // What a real reader finds in it.
      const lib = pdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
      try {
        if (doc.numPages !== n) fail(`pdf.js counts ${doc.numPages} pages, not ${n}`);
        const meta = await doc.getMetadata();
        const OK = ['PDFFormatVersion', 'Language', 'EncryptFilterName', 'IsLinearized', 'IsAcroFormPresent', 'IsXFAPresent', 'IsCollectionPresent', 'IsSignaturesPresent'];
        const extra = Object.keys(meta.info || {}).filter(k => !OK.includes(k));
        if (extra.length) fail(`pdf.js reads document info: ${extra.join(', ')}`);
        if (meta.metadata !== null) fail('pdf.js reads an XMP metadata stream');
        if (doc.fingerprints[0] !== id[1].toLowerCase()) fail('pdf.js fingerprint is not the file ID');
      } finally { await doc.destroy(); }
    });

    await step('Export: a ZIP of PNGs, leaving page 1 out, with no metadata', async () => {
      await formatBtn('PNG').click();
      const zipSwitch = page.getByRole('switch', { name: 'Put the images in one ZIP' });
      await zipSwitch.waitFor({ timeout: 5000 });
      if (!(await zipSwitch.isChecked())) fail('the ZIP switch is not on by default');
      await page.getByRole('radio', { name: 'Choose pages' }).click();
      const first = page.getByRole('checkbox', { name: 'Include page 1' });
      await first.click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Include page 1"]')?.getAttribute('aria-checked') === 'false', null, { timeout: 5000 });
      const button = page.getByRole('button', { name: new RegExp(`^Download ZIP · ${n - 1} PNGs ~`) });
      await button.waitFor({ timeout: 20000 });
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()]);
      if (download.suggestedFilename() !== 'The Water Cycle.zip') fail(`the download is called ${download.suggestedFilename()}`);
      const { entries, comment } = zipEntries(readFileSync(await download.path()));
      if (comment) fail('the ZIP has an archive comment');
      const want = Array.from({ length: n - 1 }, (_, k) => `The Water Cycle-page-${k + 2}.png`);
      if (entries.map(e => e.name).join('|') !== want.join('|')) fail(`the ZIP holds ${entries.map(e => e.name).join(', ')}`);
      for (const e of entries) {
        if (e.method !== 0 || e.time !== 0 || e.date !== 0x21 || e.extra !== 0 || e.flags !== 0 || !e.crcOk) fail(`${e.name}: not a plain stored entry with a good CRC`);
        if (e.localExtra !== 0 || e.localTime !== 0 || e.localDate !== 0x21 || e.localFlags !== 0 || e.entryComment || e.internal || e.external) fail(`${e.name}: a local header or attribute carries more than it should`);
        const chunks = pngChunks(e.data);
        const OK = ['IHDR', 'PLTE', 'tRNS', 'sRGB', 'IDAT', 'IEND'];
        const bad = chunks.find(c => !OK.includes(c.type));
        if (bad) fail(`${e.name}: has a ${bad.type} chunk`);
        if (chunks[0].type !== 'IHDR' || chunks.at(-1).type !== 'IEND') fail(`${e.name}: does not start with IHDR and end with IEND`);
        const w = chunks[0].data.readUInt32BE(0), h = chunks[0].data.readUInt32BE(4);
        if (w !== 1747 || h !== 2471) fail(`${e.name} is ${w} × ${h}`);
      }
      // Put the device preferences back to their defaults.
      await page.getByRole('radio', { name: `All pages (${n})` }).click();
      await formatBtn('PDF').click();
      await page.getByRole('button', { name: new RegExp(`^Download PDF · ${n} pages`) }).waitFor({ timeout: 20000 });
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
