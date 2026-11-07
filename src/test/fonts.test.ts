import { loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import type { Settings } from '@/engine/types';
import { box, docOf, layoutOf } from './docs';
import { fontFile, paragraphs, realFonts } from './fonts';

// The real-font facts the Fit back tests rely on; La Belle Aurore at the defaults.
beforeAll(async () => { realFonts(); expect(await loadFont('labelle')).toBe(true); });
afterAll(() => vi.unstubAllGlobals());
const pages = (n: number, p: Partial<Settings> = {}) => layoutOf(docOf(box({ id: 'm', text: paragraphs(n) })), { ...cleanSettings(null, false), ...p }).pages;
test('paragraphs(7) is 2 pages up to letter size 34 and 3 from 35', () => expect([30, 34, 35, 40].map(size => pages(7, { size }))).toEqual([2, 2, 3, 3]));
test('paragraphs(8) at the smallest letters is 1 page up to line spacing 30', () => { expect(pages(8)).toBe(2); expect([30, 31].map(gap => pages(8, { size: 18, gap }))).toEqual([1, 2]); });
test('paragraphs(12) never fits on 1 page', () => expect(pages(12, { size: 18, gap: 24 })).toBe(2));

test('a font file is the same real WOFF file the engine fetches', async () => {
  const f = fontFile('caveat', 'Caveat.woff'), fetched = new Uint8Array(await (await fetch('/fonts/caveat.woff')).arrayBuffer());
  const bytes = new Uint8Array(await f.arrayBuffer());
  expect(f.name).toBe('Caveat.woff');
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOFF');
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes).toEqual(fetched);
  expect((await fetch('/fonts/nope.woff')).ok).toBe(false);
  expect(paragraphs(3).split('\n').map(l => l.split(' ').length)).toEqual([60, 60, 60]);
});
