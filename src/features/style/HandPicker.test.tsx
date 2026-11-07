// The Handwriting section and its picker: every hand drawn by the engine, filters, favourites,
// the preview text, and your own font.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import type { Stage } from '@/app/route';
import { FONTS } from '@/engine/config.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { loadFont } from '@/engine/core.js';
import { scopeBox, select, view } from '@/features/doc/actions';
import { StageHost } from '@/features/doc/StageHost';
import { setPref } from '@/store/documents';
import { flushSave, undo, update, useEditor } from '@/store/editor';
import { box, docOf, fontsLoad, get, lastToast, open } from '@/test/docs';
import { fontFile } from '@/test/fonts';
import { docStart } from './hands';
import { HandSection } from './HandSection';
import { useStylePrefs } from './prefs';

vi.mock('@/engine/core.js', async orig => ({ ...(await orig<typeof import('@/engine/core.js')>()), drawSample: vi.fn(() => 100) }));
import { drawSample } from '@/engine/core.js';

const prefs = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/store/documents', async orig => ({
  ...(await orig<typeof import('@/store/documents')>()),
  putDoc: vi.fn(async () => {}),
  getPref: vi.fn(async (k: string) => prefs.get(k)),
  setPref: vi.fn(async (k: string, v: unknown) => { prefs.set(k, v); }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

// Every built-in hand's file has "arrived", so each sample draws at once.
beforeAll(async () => { fontsLoad(); await Promise.all(FONTS.map(f => loadFont(f.id))); });
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await flushSave();
  vi.mocked(sonner).mockClear(); vi.mocked(drawSample).mockClear(); vi.mocked(setPref).mockClear();
  prefs.clear();
  useStylePrefs.setState({ looks: [], favourites: [], previewText: '' });
});
afterEach(() => { for (let i = FONTS.length - 1; i >= 0; i--) if (FONTS[i].group === 'mine') FONTS.splice(i, 1); });

function Live() {
  useEditor(s => s.version);
  return <HandSection V={view()} start={docStart(get().doc)} blockName={scopeBox()?.name ?? null} />;
}
const Host = ({ stage }: { stage: Stage }) => <StageHost stage={stage} render={s => (s === 'style' ? <Live /> : <p>Write</p>)} />;

const dialog = () => screen.getByRole('dialog', { name: 'Handwriting' });
const list = () => within(dialog()).getByRole('list', { name: 'Handwriting' });
const rowNames = () => within(list()).getAllByRole('button', { name: / · / }).map(b => b.textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search handwriting' });
const change = () => userEvent.click(screen.getByRole('button', { name: 'Change handwriting' }));
const openPicker = async () => { open(sampleDoc(cleanSettings(null, false))); render(<Live />); await change(); };
const upload = (file: File) => userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('Use your own font'), file);

test('the panel shows the current hand writing the start of the document', () => {
  open(sampleDoc(cleanSettings(null, false)));
  render(<Live />);
  expect(drawSample).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ font: 'labelle' }), 'The water cycle is the continuous', expect.any(Number));
  expect(screen.getByText('La Belle Aurore · joined-up')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change handwriting' })).toHaveTextContent('Change');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a hand with several shapes per letter says so', () => {
  open(sampleDoc(cleanSettings(null, false)));
  update(s => { s.S.font = 'caveat'; }, { history: false });
  render(<Live />);
  expect(screen.getByText('Caveat · print, neat · 3 shapes per letter')).toBeInTheDocument();
});

test('Change opens every hand; choosing one is one undo step and keeps the picker open', async () => {
  await openPicker();
  expect(within(dialog()).getAllByRole('button', { name: / · / })).toHaveLength(33);
  expect(search()).toHaveAttribute('placeholder', 'Search 33 hands');
  expect(screen.getByRole('button', { name: 'La Belle Aurore · joined-up' })).toHaveAttribute('aria-pressed', 'true');
  // Each row is the engine's drawing of that hand, with the document's pen, ink and realism.
  expect(drawSample).toHaveBeenCalledWith(expect.anything(), { ...get().S, font: 'zeyada' }, 'The water cycle is the continuous', expect.any(Number));
  await userEvent.click(screen.getByRole('button', { name: 'Caveat · print, neat' }));
  expect(get().S.font).toBe('caveat');
  expect(screen.getByRole('button', { name: 'Caveat · print, neat' })).toHaveAttribute('aria-pressed', 'true');
  expect(dialog()).toBeInTheDocument();
  act(() => undo());
  expect(get().S.font).toBe('labelle');
  expect(get().canUndo).toBe(false);
});

test('choosing the hand already in use changes nothing', async () => {
  await openPicker();
  await userEvent.click(screen.getByRole('button', { name: 'La Belle Aurore · joined-up' }));
  expect(get().canUndo).toBe(false);
});

test('filters narrow the list; favourites are starred hands kept on the device', async () => {
  await openPicker();
  expect(within(screen.getByRole('group', { name: 'Filter' })).getAllByRole('button').map(b => b.textContent))
    .toEqual(['All', 'Joined-up', 'Print', 'Neat', 'Messy', 'Fun', '★ Favourites']);
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Fun' }));
  expect(screen.getByRole('button', { name: 'Fun' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  expect(rowNames()).toEqual(['Indie Flower · print, fun', 'Gloria Hallelujah · print, fun', 'Covered By Your Grace · print, fun']);
  await userEvent.click(screen.getByRole('button', { name: 'Add Gloria Hallelujah to favourites' }));
  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }));
  expect(rowNames()).toEqual(['Gloria Hallelujah · print, fun']);
  expect(useStylePrefs.getState().favourites).toEqual(['gloria']);
  expect(prefs.get('favourites')).toEqual(['gloria']);
  expect(screen.getByRole('button', { name: 'Remove Gloria Hallelujah from favourites' })).toHaveAttribute('aria-pressed', 'true');
  expect(get().canUndo).toBe(false); // a device preference, not a change to the document
});

test('an empty list says why', async () => {
  await openPicker();
  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }));
  expect(screen.getByText('No favourites yet. Tap ★ on any hand.')).toBeInTheDocument();
  expect(within(dialog()).queryByRole('list')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  await userEvent.type(search(), 'zzz');
  expect(screen.getByText('No handwriting matches that.')).toBeInTheDocument();
});

test('the preview text is yours to change, and is remembered', async () => {
  await openPicker();
  const f = screen.getByRole('textbox', { name: 'Preview' });
  expect(f).toHaveValue('The water cycle is the continuous');
  await userEvent.clear(f);
  await userEvent.type(f, 'Dear Nani', { skipClick: true }); // straight over the start, selected again once the field was emptied
  expect(drawSample).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 'Dear Nani', expect.any(Number));
  expect(useStylePrefs.getState().previewText).toBe('Dear Nani');
  expect(prefs.get('previewText')).toBe('Dear Nani');
  expect(get().canUndo).toBe(false);
  await userEvent.clear(f);
  expect(f).toHaveValue('The water cycle is the continuous');
});

test('a click in the start of the document puts the caret there; emptying the field brings the start back, selected', async () => {
  await openPicker();
  const f = screen.getByRole('textbox', { name: 'Preview' });
  await userEvent.click(f); // the caret goes where the click lands (here, the end)
  await userEvent.keyboard(' movement');
  expect(f).toHaveValue('The water cycle is the continuous movement');
  await userEvent.clear(f);
  expect(f).toHaveValue('The water cycle is the continuous');
  await userEvent.keyboard('Hi');
  expect(f).toHaveValue('Hi');
});

test('a preview of only spaces counts as none', async () => {
  useStylePrefs.setState({ previewText: '   ' }); // as if kept from before
  await openPicker();
  const f = screen.getByRole('textbox', { name: 'Preview' });
  expect(f).toHaveValue('The water cycle is the continuous');
  expect(drawSample).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ font: 'zeyada' }), 'The water cycle is the continuous', expect.any(Number));
  await userEvent.clear(f);
  await userEvent.keyboard('  ');
  expect(f).toHaveValue('The water cycle is the continuous');
  expect(useStylePrefs.getState().previewText).toBe('');
  await userEvent.keyboard('Hi');
  expect(f).toHaveValue('Hi');
});

test('in Only “Margin note” the picker says so and changes only that block', async () => {
  open(docOf(box({ id: 'n', kind: 'note', name: 'Margin note', text: 'Remember' })));
  act(() => { select('n'); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });
  render(<Live />);
  await change();
  expect(within(dialog()).getByText('for “Margin note”')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Zeyada · print, messy' }));
  expect(get().doc.boxes.find(b => b.id === 'n')!.style.font).toBe('zeyada');
  expect(get().S.font).toBe('labelle');
  expect(screen.getByRole('button', { name: 'Zeyada · print, messy' })).toHaveAttribute('aria-pressed', 'true');
});

test('use your own font: it is chosen, listed first and said', async () => {
  await openPicker();
  await upload(fontFile('caveat', 'My hand.woff'));
  await waitFor(() => expect(lastToast()).toBe('Added “My hand” with 3 shapes per letter. It’s in Your fonts on this device.'));
  expect(get().S.font).toMatch(/^up-/);
  expect(rowNames()[0]).toBe('My hand · your font');
  expect(screen.getByRole('button', { name: 'My hand · your font' })).toHaveAttribute('aria-pressed', 'true');
  expect(search()).toHaveAttribute('placeholder', 'Search 34 hands');
  act(() => undo());
  expect(get().S.font).toBe('labelle');
});

test('your own font with one shape per letter, and one Nib can’t keep on the device', async () => {
  await openPicker();
  await upload(fontFile('labelle', 'Neat.ttf'));
  await waitFor(() => expect(lastToast()).toBe('Added “Neat”. It’s in Your fonts on this device.'));
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  await upload(fontFile('caveat', 'Mine.otf'));
  await waitFor(() => expect(lastToast()).toBe('Added “Mine” for now. Nib couldn’t keep it on this device, so it goes when you close this page.'));
  expect(rowNames().slice(0, 2)).toEqual(['Mine · your font', 'Neat · your font']);
  expect(screen.getByRole('button', { name: 'Mine · your font' })).toHaveAttribute('aria-pressed', 'true');
});

test('a new font is shown even when a search or filter would hide it', async () => {
  await openPicker();
  await userEvent.click(screen.getByRole('button', { name: 'Neat' }));
  await userEvent.type(search(), 'zzz');
  await upload(fontFile('caveat', 'My hand.woff'));
  await waitFor(() => expect(lastToast()).toMatch(/^Added “My hand”/));
  expect(search()).toHaveValue('');
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  expect(rowNames()[0]).toBe('My hand · your font');
});

test('a file Nib can’t read is refused with a message', async () => {
  await openPicker();
  await upload(new File([new Uint8Array(16)], 'hand.woff2'));
  await waitFor(() => expect(lastToast()).toBe('That file isn’t a font Nib can read. Try a .ttf, .otf or .woff file.'));
  expect(get().S.font).toBe('labelle');
});

test('a font whose letters can’t be read is refused too, and leaves nothing in the list', async () => {
  await openPicker();
  await upload(new File([new Uint8Array(64)], 'broken.ttf'));
  await waitFor(() => expect(lastToast()).toBe('That file isn’t a font Nib can read. Try a .ttf, .otf or .woff file.'));
  expect(rowNames()).toHaveLength(33);
  expect(get().S.font).toBe('labelle');
  expect(get().canUndo).toBe(false);
});

test('the same font twice is chosen again, not added twice', async () => {
  await openPicker();
  await upload(fontFile('caveat', 'My hand.woff'));
  await waitFor(() => expect(lastToast()).toMatch(/^Added “My hand”/));
  await userEvent.click(screen.getByRole('button', { name: 'Caveat · print, neat' }));
  expect(get().S.font).toBe('caveat');
  await upload(fontFile('caveat', 'Other.woff'));
  await waitFor(() => expect(lastToast()).toBe('“My hand” is already in Your fonts.'));
  expect(rowNames().filter(n => n?.endsWith('your font'))).toHaveLength(1);
  expect(get().S.font).toMatch(/^up-/);
});

test('the search is still there after closing the picker and switching stages', async () => {
  open(sampleDoc(cleanSettings(null, false)));
  const { rerender } = render(<Host stage="style" />);
  await change();
  await userEvent.type(search(), 'cav');
  await userEvent.click(screen.getByRole('button', { name: 'Print' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  rerender(<Host stage="write" />);
  rerender(<Host stage="style" />);
  expect(screen.queryByRole('dialog')).toBeNull();
  await change();
  expect(search()).toHaveValue('cav');
  expect(screen.getByRole('button', { name: 'Print' })).toHaveAttribute('aria-pressed', 'true');
  expect(rowNames()).toEqual(['Caveat · print, neat']);
});

test('the picker doesn’t stay open over another stage', async () => {
  open(sampleDoc(cleanSettings(null, false)));
  const { rerender } = render(<Host stage="style" />);
  await change();
  expect(dialog()).toBeInTheDocument();
  rerender(<Host stage="write" />);
  expect(screen.queryByRole('dialog', { name: 'Handwriting' })).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Handwriting', hidden: true })).toBeNull();
  // Back in Style, it is as it was left.
  rerender(<Host stage="style" />);
  expect(dialog()).toBeInTheDocument();
});
