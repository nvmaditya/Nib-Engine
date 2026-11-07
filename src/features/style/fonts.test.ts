import { beforeEach, expect, test, vi } from 'vitest';
import { FONTS } from '@/engine/config.js';
import { engineFor, fontReady } from '@/engine/core.js';
import { getDb } from '@/store/db';
import { setPref } from '@/store/documents';
import { fontFile } from '@/test/fonts';
import { addFontFile, FONT_KEY_PREFIX, fontId, handReadable, loadUploadedFonts, storedFontIds } from './fonts';
import { handNote, shapesNote } from './hands';

vi.mock('@/store/documents', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/documents')>();
  return { ...actual, setPref: vi.fn(actual.setPref) };
});
// Counts the font files the engine reads the outlines of.
const parsed = vi.hoisted(() => ({ n: 0 }));
vi.mock('opentype.js', async importOriginal => {
  const real = ((await importOriginal()) as { default: { parse: (b: ArrayBuffer) => unknown } }).default;
  return { default: { ...real, parse: (b: ArrayBuffer) => { parsed.n++; return real.parse(b); } } };
});

beforeEach(async () => {
  await (await getDb()).clear('prefs');
  for (let i = FONTS.length - 1; i >= 0; i--) if (FONTS[i].group === 'mine') FONTS.splice(i, 1);
  vi.mocked(setPref).mockClear();
});

test('an uploaded font is drawn from its own outlines and is back after a reload', async () => {
  const r = await addFontFile(fontFile('caveat', 'My hand.woff'));
  expect(r).toMatchObject({ ok: true, name: 'My hand', forms: 3, kept: true, existed: false });
  const id = (r as { id: string }).id; expect(id).toMatch(/^up-[0-9a-z]+-[0-9a-z]+$/);
  expect(FONTS.find(f => f.id === id)).toMatchObject({ family: 'Nib Upload ' + id, local: true, group: 'mine', forms: 3 });
  expect(engineFor(FONTS.find(f => f.id === id)!)).not.toBeNull(); expect(fontReady(id)).toBe(true);
  vi.resetModules(); // a fresh page: new engine and FONTS, new connection; IndexedDB keeps what was written
  const [fonts, config, core, docjs] = await Promise.all([import('@/features/style/fonts'), import('@/engine/config.js'), import('@/engine/core.js'), import('@/engine/doc.js')]);
  expect(docjs.cleanSettings({ font: id }, false).font).toBe('labelle');
  expect(await fonts.loadUploadedFonts()).toBe(1);
  expect(core.engineFor(config.FONTS.find(f => f.id === id)!)).not.toBeNull();
  expect(docjs.cleanSettings({ font: id }, false).font).toBe(id);
});
test('at start-up a stored font is a hand without its outlines being read; they are read the first time it is drawn', async () => {
  const r = await addFontFile(fontFile('caveat', 'Mine.woff')) as { id: string };
  vi.resetModules(); // a fresh page
  const [fonts, config, core] = await Promise.all([import('@/features/style/fonts'), import('@/engine/config.js'), import('@/engine/core.js')]);
  parsed.n = 0;
  expect(await fonts.loadUploadedFonts()).toBe(1);
  expect(parsed.n).toBe(0);
  expect(core.fontReady(r.id)).toBe(true); // its file is here: nothing to wait for
  expect(core.engineFor(config.FONTS.find(f => f.id === r.id)!)).not.toBeNull();
  expect(parsed.n).toBe(1);
});
test('only TTF, OTF and WOFF files are taken', async () => { for (const n of ['hand.woff2', 'hand.txt', 'hand']) expect(await addFontFile(new File([new Uint8Array(16)], n))).toEqual({ ok: false, reason: 'type' }); });
test('the extension is checked without regard to case', async () => { expect(await addFontFile(fontFile('caveat', 'HAND.WOFF'))).toMatchObject({ ok: true, name: 'HAND' }); });
test('a file the engine can’t read is refused and not kept', async () => { const n = FONTS.length; expect(await addFontFile(new File([new Uint8Array(64)], 'broken.ttf'))).toEqual({ ok: false, reason: 'unreadable' }); expect(FONTS.length).toBe(n); expect(await storedFontIds()).toEqual([]); });
test('the same file twice is one font', async () => { const a = await addFontFile(fontFile('caveat', 'A.woff')) as { id: string }; expect(await addFontFile(fontFile('caveat', 'B.woff'))).toMatchObject({ ok: true, id: a.id, name: 'A', existed: true }); expect(FONTS.filter(f => f.group === 'mine')).toHaveLength(1); expect(await storedFontIds()).toEqual([a.id]); });
test('a font that can’t be stored still works until the page is closed', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); const r = await addFontFile(fontFile('caveat', 'A.woff')) as { id: string }; expect(r).toMatchObject({ ok: true, kept: false }); expect(fontReady(r.id)).toBe(true); expect(await storedFontIds()).toEqual([]); });
test('adding again a font that couldn’t be kept tries to keep it again, and says how that went', async () => {
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  const a = await addFontFile(fontFile('caveat', 'A.woff')) as { id: string };
  expect(a).toMatchObject({ ok: true, kept: false });
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  expect(await addFontFile(fontFile('caveat', 'B.woff'))).toMatchObject({ ok: true, id: a.id, name: 'A', kept: false, existed: false });
  expect(await storedFontIds()).toEqual([]);
  expect(await addFontFile(fontFile('caveat', 'B.woff'))).toMatchObject({ ok: true, id: a.id, name: 'A', forms: 3, kept: true, existed: false });
  expect(await storedFontIds()).toEqual([a.id]);
  expect(await addFontFile(fontFile('caveat', 'B.woff'))).toMatchObject({ ok: true, kept: true, existed: true });
  expect(FONTS.filter(f => f.group === 'mine')).toHaveLength(1);
});
test('a hand without letter alternates has one shape per letter', async () => { expect(await addFontFile(fontFile('labelle', 'L.woff'))).toMatchObject({ forms: 1 }); expect(FONTS.at(-1)!.forms).toBeUndefined(); });
test('an empty name becomes Your font and a long one is cut to 40 characters', async () => {
  expect(await addFontFile(fontFile('labelle', '.woff'))).toMatchObject({ name: 'Your font' });
  expect(await addFontFile(fontFile('caveat', 'y'.repeat(60) + '.woff'))).toMatchObject({ name: 'y'.repeat(40) });
});
test('a font another tab stored after this page started is registered the next time, once', async () => {
  await addFontFile(fontFile('caveat', 'Mine.woff'));
  const buf = await fontFile('kalam', 'Theirs.woff').arrayBuffer(), id = fontId(buf);
  await (await getDb()).put('prefs', { id, name: 'Theirs', buf, forms: 1, addedAt: Date.now() }, FONT_KEY_PREFIX + id);
  expect(FONTS.some(f => f.id === id)).toBe(false);
  expect(await loadUploadedFonts()).toBe(1);
  expect(FONTS.find(f => f.id === id)).toMatchObject({ name: 'Theirs', group: 'mine' });
  expect(await loadUploadedFonts()).toBe(0);
});
test('a broken stored record is skipped', async () => { await (await getDb()).put('prefs', { id: 'up-x', name: 'X', buf: new ArrayBuffer(8), forms: 1, addedAt: 1 }, 'font:up-x'); expect(await loadUploadedFonts()).toBe(0); expect(FONTS.some(f => f.id === 'up-x')).toBe(false); });
test('a stored font that is signed but can’t be read is marked', async () => {
  const buf = new Uint8Array(256);
  buf.set([0x77, 0x4f, 0x46, 0x46]); // `wOFF`, then nothing a font has
  for (let i = 4; i < buf.length; i++) buf[i] = (i * 37) % 251;
  const id = fontId(buf.buffer);
  await (await getDb()).put('prefs', { id, name: 'Broken', buf: buf.buffer, forms: 1, addedAt: 1 }, FONT_KEY_PREFIX + id);
  expect(await loadUploadedFonts()).toBe(1);
  const cfg = FONTS.find(f => f.id === id)!;
  parsed.n = 0;
  expect(handReadable(cfg)).toBe(false);
  expect(handReadable(cfg)).toBe(false);
  expect(parsed.n).toBe(1); // read once, then remembered
  expect(handNote(cfg)).toBe('your font, which can’t be read on this device');
  expect(shapesNote(cfg)).toBeNull();
});
test('a stored font that can be read, and every built-in hand, are not', async () => {
  const r = await addFontFile(fontFile('caveat', 'Mine.woff')) as { id: string };
  const cfg = FONTS.find(f => f.id === r.id)!;
  expect(handReadable(cfg)).toBe(true);
  expect([handNote(cfg), shapesNote(cfg)]).toEqual(['your font', '3 shapes per letter']);
  parsed.n = 0;
  expect(FONTS.filter(f => f.group !== 'mine').every(handReadable)).toBe(true);
  expect(parsed.n).toBe(0); // a built-in hand's file isn't read for this
});
