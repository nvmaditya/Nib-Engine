import { beforeEach, expect, test, vi } from 'vitest';
import { FONTS } from '@/engine/config.js';
import { getDb } from '@/store/db';
import { getPref, setPref } from '@/store/documents';
import { fontFile } from '@/test/fonts';
import { addFontFile } from './fonts';
import { addSavedLook, loadStylePrefs, putBackSavedLook, refreshStylePrefsOnShow, removeSavedLook, setPreviewText, toggleFavourite, useStylePrefs } from './prefs';

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
test('a look never holds the As drawn pen, saved or stored', async () => {
  expect((await addSavedLook('A', { tip: 'font', ink: 'red' })).v).toEqual({ ink: 'red' });
  await setPref('looks', [{ id: 'look-b', name: 'B', v: { tip: 'font', ink: 'black' } }]);
  await loadStylePrefs();
  expect(useStylePrefs.getState().looks[0].v).toEqual({ ink: 'black' });
});
test('an unnamed look is My look; names are at most 40 characters', async () => { expect((await addSavedLook('  ', {})).name).toBe('My look'); expect((await addSavedLook('x'.repeat(50), {})).name).toBe('x'.repeat(40)); });
test('a look that can’t be saved is not kept', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); await expect(addSavedLook('A', {})).rejects.toThrow(); expect(useStylePrefs.getState().looks).toEqual([]); });
test('a removed look goes back where it was', async () => { const [a, b, c] = [await addSavedLook('A', {}), await addSavedLook('B', {}), await addSavedLook('C', {})]; const r = (await removeSavedLook(b.id))!; expect(r.index).toBe(1); await putBackSavedLook(r.look, r.index); expect(useStylePrefs.getState().looks.map(l => l.id)).toEqual([a.id, b.id, c.id]); });
test('removing a look that isn’t there does nothing', async () => { expect(await removeSavedLook('nope')).toBeNull(); });
test('a removed look says it was kept', async () => { const a = await addSavedLook('A', {}); expect(await removeSavedLook(a.id)).toEqual({ look: a, index: 0, kept: true }); });
test('a removal the device can’t store still takes the look off, and says it wasn’t kept', async () => {
  const a = await addSavedLook('A', {}), b = await addSavedLook('B', {});
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  expect(await removeSavedLook(a.id)).toEqual({ look: a, index: 0, kept: false });
  expect(useStylePrefs.getState().looks).toEqual([b]);
  expect(((await getPref('looks')) as { name: string }[]).map(l => l.name)).toEqual(['A', 'B']); // still stored, so it may come back
});
test('favourites and the preview text are remembered', async () => { await toggleFavourite('caveat'); await toggleFavourite('zeyada'); await toggleFavourite('caveat'); await setPreviewText('Dear Nani,\nthank you ' + 'x'.repeat(100)); useStylePrefs.setState({ favourites: [], previewText: '' }); await loadStylePrefs(); expect(useStylePrefs.getState().favourites).toEqual(['zeyada']); expect(useStylePrefs.getState().previewText).toBe(('Dear Nani, thank you ' + 'x'.repeat(100)).slice(0, 80)); });
test('a favourite changes at once even when the write fails', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); await toggleFavourite('caveat'); expect(useStylePrefs.getState().favourites).toEqual(['caveat']); });
test('stored values of the wrong shape are ignored', async () => { const db = await getDb(); await db.put('prefs', 'x', 'looks'); await db.put('prefs', [1, 'caveat'], 'favourites'); await db.put('prefs', 5, 'previewText'); await loadStylePrefs(); expect(useStylePrefs.getState()).toMatchObject({ looks: [], favourites: ['caveat'], previewText: '' }); });
test('a saved look keeps an uploaded hand after a reload', async () => { const r = await addFontFile(fontFile('caveat', 'Mine.woff')) as { id: string }; await addSavedLook('Mine', { font: r.id }); vi.resetModules(); const p = await import('@/features/style/prefs'); await p.bootStyle(); expect(p.useStylePrefs.getState().looks[0].v.font).toBe(r.id); });

// Two tabs share the device's looks and favourites. Each change is made to what is stored now, so
// a change another tab made since this one read them is kept, and this tab's list shows it too.
const storedLooks = async () => ((await getPref('looks')) as { name: string }[]).map(l => l.name);
test('a look saved in another tab is kept when this tab saves one', async () => {
  await loadStylePrefs();
  const here = useStylePrefs.getState().looks;
  await addSavedLook('From A', { font: 'caveat' }); // the other tab
  useStylePrefs.setState({ looks: here }); // this tab still shows what it read
  await addSavedLook('From B', { font: 'zeyada' });
  expect(await storedLooks()).toEqual(['From A', 'From B']);
  expect(useStylePrefs.getState().looks.map(l => l.name)).toEqual(['From A', 'From B']);
});
test('removing a look, and putting it back, keep one another tab saved', async () => {
  const x = await addSavedLook('X', {});
  const here = useStylePrefs.getState().looks;
  await addSavedLook('Y', {}); // the other tab
  useStylePrefs.setState({ looks: here });
  const r = (await removeSavedLook(x.id))!;
  expect(await storedLooks()).toEqual(['Y']);
  await putBackSavedLook(r.look, r.index);
  expect(await storedLooks()).toEqual(['X', 'Y']);
  expect(useStylePrefs.getState().looks.map(l => l.name)).toEqual(['X', 'Y']);
});
test('a look another tab saved, with a hand this page doesn’t have, keeps its hand when this tab saves one', async () => {
  await setPref('looks', [{ id: 'look-a', name: 'Theirs', v: { font: 'up-1abc-2de', tip: 'gel' } }]);
  await loadStylePrefs();
  await addSavedLook('Mine', { tip: 'ball' });
  expect(((await getPref('looks')) as { v: object }[])[0].v).toEqual({ font: 'up-1abc-2de', tip: 'gel' });
});
test('a favourite another tab starred is kept when this tab stars one, and when it unstars another', async () => {
  await toggleFavourite('gloria');
  await setPref('favourites', ['gloria', 'caveat']); // the other tab
  await toggleFavourite('zeyada');
  expect(await getPref('favourites')).toEqual(['gloria', 'caveat', 'zeyada']);
  await toggleFavourite('gloria');
  expect(await getPref('favourites')).toEqual(['caveat', 'zeyada']);
  expect(useStylePrefs.getState().favourites).toEqual(['caveat', 'zeyada']);
});
test('two changes made at once in this tab both stay', async () => {
  await Promise.all([addSavedLook('A', {}), addSavedLook('B', {}), toggleFavourite('caveat'), toggleFavourite('zeyada')]);
  expect(await storedLooks()).toEqual(['A', 'B']);
  expect(await getPref('favourites')).toEqual(['caveat', 'zeyada']);
});
test('coming back to the tab shows the looks, favourites and hands another tab saved', async () => {
  const stop = refreshStylePrefsOnShow();
  try {
    await setPref('looks', [{ id: 'look-a', name: 'Theirs', v: { tip: 'gel' } }]);
    await setPref('favourites', ['caveat']);
    const r = await addFontFile(fontFile('kalam', 'Theirs.woff')) as { id: string };
    FONTS.splice(FONTS.findIndex(f => f.id === r.id), 1); // this page never registered it
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(useStylePrefs.getState().looks.map(l => l.name)).toEqual(['Theirs']));
    expect(useStylePrefs.getState().favourites).toEqual(['caveat']);
    expect(FONTS.some(f => f.id === r.id)).toBe(true);
  } finally { stop(); }
});
