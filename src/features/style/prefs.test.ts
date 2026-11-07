import { beforeEach, expect, test, vi } from 'vitest';
import { FONTS } from '@/engine/config.js';
import { getDb } from '@/store/db';
import { setPref } from '@/store/documents';
import { fontFile } from '@/test/fonts';
import { addFontFile } from './fonts';
import { addSavedLook, loadStylePrefs, putBackSavedLook, removeSavedLook, setPreviewText, toggleFavourite, useStylePrefs } from './prefs';

vi.mock('@/store/documents', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/documents')>();
  return { ...actual, setPref: vi.fn(actual.setPref) };
});

beforeEach(async () => {
  await (await getDb()).clear('prefs');
  for (let i = FONTS.length - 1; i >= 0; i--) if (FONTS[i].group === 'mine') FONTS.splice(i, 1);
  useStylePrefs.setState({ looks: [], favourites: [], previewText: '' });
  vi.mocked(setPref).mockClear();
});

test('a saved look is kept on the device and read back', async () => { const L = await addSavedLook('  Neat blue  ', { font: 'caveat', tip: 'gel', paper: 'grid', mess: 20, gap: 40 }); expect(L).toMatchObject({ name: 'Neat blue', v: { font: 'caveat', tip: 'gel', paper: 'grid', mess: 20 } }); expect(L.v).not.toHaveProperty('gap'); useStylePrefs.setState({ looks: [] }); await loadStylePrefs(); expect(useStylePrefs.getState().looks).toEqual([L]); });
test('an unnamed look is My look; names are at most 40 characters', async () => { expect((await addSavedLook('  ', {})).name).toBe('My look'); expect((await addSavedLook('x'.repeat(50), {})).name).toBe('x'.repeat(40)); });
test('a look that can’t be saved is not kept', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); await expect(addSavedLook('A', {})).rejects.toThrow(); expect(useStylePrefs.getState().looks).toEqual([]); });
test('a removed look goes back where it was', async () => { const [a, b, c] = [await addSavedLook('A', {}), await addSavedLook('B', {}), await addSavedLook('C', {})]; const r = (await removeSavedLook(b.id))!; expect(r.index).toBe(1); await putBackSavedLook(r.look, r.index); expect(useStylePrefs.getState().looks.map(l => l.id)).toEqual([a.id, b.id, c.id]); });
test('removing a look that isn’t there does nothing', async () => { expect(await removeSavedLook('nope')).toBeNull(); });
test('favourites and the preview text are remembered', async () => { await toggleFavourite('caveat'); await toggleFavourite('zeyada'); await toggleFavourite('caveat'); await setPreviewText('Dear Nani,\nthank you ' + 'x'.repeat(100)); useStylePrefs.setState({ favourites: [], previewText: '' }); await loadStylePrefs(); expect(useStylePrefs.getState().favourites).toEqual(['zeyada']); expect(useStylePrefs.getState().previewText).toBe(('Dear Nani, thank you ' + 'x'.repeat(100)).slice(0, 80)); });
test('a favourite changes at once even when the write fails', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); await toggleFavourite('caveat'); expect(useStylePrefs.getState().favourites).toEqual(['caveat']); });
test('stored values of the wrong shape are ignored', async () => { const db = await getDb(); await db.put('prefs', 'x', 'looks'); await db.put('prefs', [1, 'caveat'], 'favourites'); await db.put('prefs', 5, 'previewText'); await loadStylePrefs(); expect(useStylePrefs.getState()).toMatchObject({ looks: [], favourites: ['caveat'], previewText: '' }); });
test('a saved look keeps an uploaded hand after a reload', async () => { const r = await addFontFile(fontFile('caveat', 'Mine.woff')) as { id: string }; await addSavedLook('Mine', { font: r.id }); vi.resetModules(); const p = await import('@/features/style/prefs'); await p.bootStyle(); expect(p.useStylePrefs.getState().looks[0].v.font).toBe(r.id); });
