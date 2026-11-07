// Looks: six built-in ones and the ones saved on this device.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { scopeBox, select, setV, view } from '@/features/doc/actions';
import { StageHost } from '@/features/doc/StageHost';
import { setPref } from '@/store/documents';
import { flushSave, undo, update, useEditor } from '@/store/editor';
import { box, docOf, get, lastToast, lastToastAction, open } from '@/test/docs';
import { LooksSection } from './LooksSection';
import { lookPatch, matchLook, STYLE_LOOKS } from './looks';
import { addSavedLook, useStylePrefs } from './prefs';

const store = new Map<string, unknown>();
vi.mock('@/store/documents', () => ({
  putDoc: vi.fn(async () => {}),
  getPref: vi.fn(async (k: string) => store.get(k)),
  setPref: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));
vi.mock('@/engine/core.js', async orig => ({ ...(await orig<typeof import('@/engine/core.js')>()), drawSample: vi.fn(() => 120) }));

beforeEach(async () => {
  await flushSave();
  store.clear();
  vi.mocked(sonner).mockClear();
  vi.mocked(setPref).mockClear();
  useStylePrefs.setState({ looks: [], favourites: [], previewText: '' });
});

function Live() {
  useEditor(s => s.version);
  return <LooksSection V={view()} S={get().S} blockScope={!!scopeBox()} />;
}
const styleBox = (id: string) => act(() => { select(id); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });
const save = async (name?: string) => {
  await userEvent.click(screen.getByRole('button', { name: 'Save the current style as a look' }));
  const f = screen.getByRole('textbox', { name: 'Look name' });
  expect(f).toHaveValue('My look');
  if (name) { await userEvent.clear(f); await userEvent.type(f, name); }
  await userEvent.type(f, '{Enter}');
};

test('six looks, in order', () => {
  open(docOf(box())); render(<Live />);
  expect(screen.getAllByRole('button', { name: /^(Exam answer|Neat notes|Letter|Quick scribble|Journal|School copy)$/ }).map(b => b.textContent))
    .toEqual(['Exam answer', 'Neat notes', 'Letter', 'Quick scribble', 'Journal', 'School copy']);
  expect(screen.getByText('hand, pen, ink, paper and realism in one tap')).toBeInTheDocument();
  expect(STYLE_LOOKS.map(l => l.id)).toEqual(['exam', 'notes', 'letter', 'scribble', 'journal', 'school']);
});
test('each look’s word shrinks to fit its tile, whole', () => {
  open(docOf(box())); render(<Live />);
  const canvases = screen.getAllByRole('button', { name: /^(Exam answer|Neat notes|Letter|Quick scribble|Journal|School copy)$/ }).map(b => b.querySelector('canvas'));
  for (const c of canvases) expect(c).toHaveClass('max-w-full', 'h-auto');
});
test('a new document is an Exam answer', () => {
  open(docOf(box())); render(<Live />);
  expect(screen.getByRole('button', { name: 'Exam answer' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Journal' })).toHaveAttribute('aria-pressed', 'false');
});
test('Journal sets hand, pen, ink, paper and how natural in one undo step', async () => {
  open(docOf(box())); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
  expect(get().S).toMatchObject({ font: 'caveat', tip: 'felt', ink: 'purple', paper: 'yellow', mess: 45, wobble: 30, variety: 60, flow: 55 });
  expect(screen.getByRole('button', { name: 'Journal' })).toHaveAttribute('aria-pressed', 'true');
  act(() => undo());
  expect(get().S).toMatchObject({ font: 'labelle', paper: 'ruled' });
  expect(get().canUndo).toBe(false);
});
test('in Only “Margin note”, a look leaves the paper alone', async () => {
  open(docOf(box(), box({ id: 'n', kind: 'note', name: 'Margin note' }))); styleBox('n'); render(<Live />);
  expect(screen.getByText('hand, pen, ink and realism for this block')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Quick scribble' }));
  expect(get().doc.boxes[1].style).toEqual({ font: 'reenie', tip: 'pencil', ink: 'black', mess: 72, wobble: 50, variety: 75, flow: 70 });
  expect(get().S.paper).toBe('ruled');
  expect(screen.getByRole('button', { name: 'Quick scribble' })).toHaveAttribute('aria-pressed', 'true');
});
test('a look whose hand is gone keeps the rest', () => expect(lookPatch({ id: 'x', name: 'X', v: { font: 'up-gone', tip: 'gel' } }, false)).toEqual({ tip: 'gel' }));
test('matching compares paper against the document, and not in Only scope', () => {
  open(docOf(box()));
  const S = { ...get().S, paper: 'grid' };
  const scribble = { ...S, font: 'reenie', tip: 'pencil', ink: 'black', mess: 72, wobble: 50, variety: 75, flow: 70 };
  expect(matchLook(scribble, S, STYLE_LOOKS, false)?.id).toBe('scribble');
  const journal = { ...S, font: 'caveat', tip: 'felt', ink: 'purple', mess: 45, wobble: 30, variety: 60, flow: 55 };
  expect(matchLook(journal, S, STYLE_LOOKS, false)).toBeNull();
  expect(matchLook(journal, S, STYLE_LOOKS, true)?.id).toBe('journal');
});
test('save the current style as a look; it is in Looks in every document', async () => {
  open(docOf(box())); setV({ font: 'kalam', size: 26 }); render(<Live />);
  await save('Kalam small');
  expect(lastToast()).toBe('Saved “Kalam small”. It’s in Looks on every document.');
  expect(useStylePrefs.getState().looks[0].v).toMatchObject({ font: 'kalam', size: 26, paper: 'ruled' });
  expect(screen.queryByRole('dialog', { name: 'Save as a look' })).toBeNull();
  act(() => open(docOf(box({ id: 'other' }))));
  expect(screen.getByRole('button', { name: 'Kalam small' })).toBeInTheDocument();
});
test('a look that can’t be saved says so', async () => {
  open(docOf(box())); render(<Live />);
  vi.mocked(setPref).mockRejectedValueOnce(new Error('quota'));
  await save();
  expect(lastToast()).toBe('Nib couldn’t save that look on this device.');
  expect(screen.queryByRole('button', { name: 'My look' })).toBeNull();
});
test('a saved look can be removed, and Undo puts it back', async () => {
  open(docOf(box())); await addSavedLook('Mine', { font: 'kalam' }); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove Mine' }));
  expect(lastToast()).toBe('Removed “Mine”.');
  expect(screen.queryByRole('button', { name: 'Mine' })).toBeNull();
  act(() => lastToastAction()!());
  await screen.findByRole('button', { name: 'Mine' });
});
test('the save dialog doesn’t stay open over another stage', async () => {
  open(docOf(box()));
  const r = (stage: 'style' | 'write') => <StageHost stage={stage} render={s => s === 'style' ? <Live /> : <p>write</p>} />;
  const { rerender } = render(r('style'));
  await userEvent.click(screen.getByRole('button', { name: 'Save the current style as a look' }));
  expect(screen.getByRole('dialog', { name: 'Save as a look' })).toBeInTheDocument();
  rerender(r('write'));
  expect(screen.queryByRole('dialog', { name: 'Save as a look' })).toBeNull();
});

test.each([
  ['Escape', async () => { await userEvent.keyboard('{Escape}'); }],
  ['×', async () => { await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })); }],
  ['Save', async () => { await userEvent.click(screen.getByRole('button', { name: 'Save' })); }],
])('closing Save as a look by %s puts focus back on its button', async (_n, close) => {
  open(docOf(box())); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Save the current style as a look' }));
  await close();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save as a look' })).toBeNull());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save the current style as a look' })).toHaveFocus());
});
test('Remove moves focus to the next card, or to Save when it was the last', async () => {
  open(docOf(box()));
  await addSavedLook('One', { font: 'kalam' }); await addSavedLook('Two', { font: 'caveat' });
  render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove One' }));
  expect(screen.getByRole('button', { name: 'Two' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Remove Two' }));
  expect(screen.getByRole('button', { name: 'Save the current style as a look' })).toHaveFocus();
});
test('pressing the Look that is already chosen records nothing and keeps Redo', async () => {
  open(docOf(box())); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
  act(() => undo());
  expect(get().canRedo).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Exam answer' }));
  expect(get().canRedo).toBe(true);
  expect(get().canUndo).toBe(false);
});
test('a saved Look can be pressed while it is chosen without a step', async () => {
  open(docOf(box())); await addSavedLook('Mine', { font: 'kalam' }); render(<Live />);
  await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Mine' }));
  act(() => undo());
  expect(screen.getByRole('button', { name: 'Journal' })).toHaveAttribute('aria-pressed', 'true');
  expect(get().canRedo).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
  expect(get().canRedo).toBe(true);
});
