// The app icons and the social image, drawn from public/favicon.svg in Chromium and written to public/icons/.
// Run once by hand (`node scripts/icons.mjs`) and commit the PNGs: CI has no Playwright.
// Uses the Playwright that is installed on the machine (it is not a project dependency), as smoke.mjs does.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'public/icons');

const INK = '#1E2B7C';
const favicon = readFileSync(join(root, 'public/favicon.svg'), 'utf8').trim();
// The drawing without its rounded square: the ruled lines, the margin, the letter and the nib.
const drawing = favicon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<rect\b[^>]*\/>/, '');
if (drawing.includes('<rect') || !drawing.includes('<path')) throw new Error('favicon.svg is not the drawing this script expects');

/** Full bleed: an ink square, with the drawing at 80 % around the centre (inside a maskable icon's safe zone). */
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${INK}"/>`
  + `<g transform="translate(32 32) scale(0.8) translate(-32 -32)">${drawing}</g></svg>`;

const figtree = readFileSync(join(root, 'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')).toString('base64');

const page = (w, h, body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Figtree";src:url(data:font/woff2;base64,${figtree}) format("woff2");font-weight:100 900}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
svg.fill{display:block;width:${w}px;height:${h}px}
${css}</style></head><body>${body}</body></html>`;

const social = page(1200, 630, `<main>${favicon.replace('<svg ', '<svg class="logo" ')}<div><p class="mark">nib</p><p class="line">Turn text into handwritten pages.</p></div></main>`, `
main{box-sizing:border-box;width:1200px;height:630px;background:#F7F7F8;display:flex;align-items:center;justify-content:center;gap:64px;font-family:"Figtree"}
.logo{width:280px;height:280px;flex:none}
p{margin:0}
.mark{font-weight:700;font-size:200px;line-height:.9;letter-spacing:-.045em;color:#16161A}
.line{font-weight:400;font-size:44px;line-height:1.2;color:#6C6C76;margin-top:20px}`);

const fill = svg => svg.replace('<svg ', '<svg class="fill" ');
const ICONS = [
  { file: 'icon-192.png', size: [192, 192], html: page(192, 192, fill(favicon)), transparent: true },
  { file: 'icon-512.png', size: [512, 512], html: page(512, 512, fill(favicon)), transparent: true },
  { file: 'maskable-512.png', size: [512, 512], html: page(512, 512, fill(fullBleed)), transparent: false },
  { file: 'apple-touch-icon.png', size: [180, 180], html: page(180, 180, fill(fullBleed)), transparent: false },
  { file: 'social.png', size: [1200, 630], html: social, transparent: false },
];

mkdirSync(out, { recursive: true });
const { chromium } = require('playwright');
const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const [width, height] = icon.size;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const tab = await ctx.newPage();
    await tab.setContent(icon.html);
    await tab.evaluate(() => document.fonts.ready);
    if (icon.file === 'social.png' && !(await tab.evaluate(() => document.fonts.check('700 200px Figtree')))) throw new Error('Figtree did not load');
    await tab.screenshot({ path: join(out, icon.file), omitBackground: icon.transparent });
    await ctx.close();
    console.log(`public/icons/${icon.file} ${width}x${height}`);
  }
} finally {
  await browser.close();
}
