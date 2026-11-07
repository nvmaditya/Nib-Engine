// The command palette in the app: Ctrl+K, a few letters, Enter.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast as sonner } from 'sonner';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { App } from '@/app/App';
import { MEMORY_ID, parseHash } from '@/app/route';
import { openImport } from '@/features/doc/actions';
import { DEFAULT_PREFS, useExportPrefs } from '@/features/export/state';
import { setThemePref } from '@/lib/theme';
import { createDoc, setPref, type DocRecord } from '@/store/documents';
import { closeDocument, flushSave, openDocument, undo, update, useEditor } from '@/store/editor';
import { loadFont } from '@/engine/core.js';
import { fontsLoad, rec } from '@/test/docs';
import { CommandPalette } from './CommandPalette';
import { useOverlays } from './overlays';

const NAME = 'Search commands and documents';
let essay: DocRecord, here: DocRecord;

beforeAll(async () => {
  await setPref('bootstrapped', true); // no example document: the two of this file
  essay = await createDoc({ title: 'Essay' });
  fontsLoad(); await Promise.all(['labelle', 'patrick'].map(loadFont)); // the hands used here, read before any page waits for one
});
beforeEach(async () => {
  useOverlays.setState({ open: null });
  useExportPrefs.setState({ ...DEFAULT_PREFS });
  here = await createDoc({ title: 'Lab report' });
});
afterEach(async () => {
  act(() => { sonner.dismiss(); setThemePref('system'); });
  await act(() => flushSave());
});

const user = () => userEvent.setup();
const docName = () => screen.findByRole('textbox', { name: 'Document name' });
const route = () => parseHash(location.hash);
const stages = () => screen.getByRole('navigation', { name: 'Stages' });
const palette = () => screen.queryByRole('dialog', { name: NAME });

/** The app at `here`, on Write, ready. */
async function openApp(stage = 'write') {
  location.hash = `#/d/${here.id}/${stage}`;
  render(<App />);
  await waitFor(async () => expect(await docName()).toHaveValue('Lab report'));
}

/** Ctrl+K, and the palette with the documents read. */
async function openPalette(u: ReturnType<typeof user>) {
  await u.keyboard('{Control>}k{/Control}');
  const field = await screen.findByRole('combobox', { name: NAME });
  await within(palette()!).findByRole('option', { name: /^Essay/ });
  expect(field).toHaveFocus();
  return field;
}

/**
 * Type `text`, then Enter. (Apart: all in one call, the keys share one act(), so the list hasn't re-rendered with
 * the first match chosen by the time Enter comes. In a browser each key is drawn before the next.)
 */
async function choose(u: ReturnType<typeof user>, text: string) {
  await u.keyboard(text);
  await u.keyboard('{Enter}');
}

test('Ctrl+K, a few letters and Enter open a document', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  await choose(u, 'Ess');
  await waitFor(() => expect(location.hash).toBe(`#/d/${essay.id}/write`));
  await waitFor(async () => expect(await docName()).toHaveValue('Essay'));
  expect(palette()).not.toBeInTheDocument();
});

test('…a stage, with the focus on the stage it went to', async () => {
  const u = user();
  await openApp();
  within(document.querySelector<HTMLElement>('[data-stage="write"]')!).getAllByRole('button')[0].focus(); // a control in Write, which goes away
  await openPalette(u);
  await choose(u, 'Sty');
  await waitFor(() => expect(route()).toEqual({ name: 'doc', id: here.id, stage: 'style' }));
  await waitFor(() => expect(within(stages()).getByRole('button', { name: '2 Style' })).toHaveFocus());
});

test('…there too when nothing had the focus', async () => {
  const u = user();
  await openApp();
  expect(document.activeElement).toBe(document.body);
  await openPalette(u);
  await choose(u, 'Export as PNG');
  await waitFor(() => expect(within(stages()).getByRole('button', { name: '3 Export' })).toHaveFocus());
});

test('…or Home, with the focus on the Home link', async () => {
  const u = user();
  await openApp();
  within(document.querySelector<HTMLElement>('[data-stage="write"]')!).getAllByRole('button')[0].focus();
  await openPalette(u);
  await choose(u, 'Home');
  await waitFor(() => expect(location.hash).toBe('#/'));
  await waitFor(() => expect(document.activeElement).toBe(document.querySelector('header a[href="#/"]')));
});

test('a look applies to the whole document as one step, and again does nothing', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  await choose(u, 'Neat notes');
  expect(useEditor.getState().S.font).toBe('patrick');
  expect(useEditor.getState().canUndo).toBe(true);
  await openPalette(u);
  await choose(u, 'Neat notes');
  act(() => undo());
  expect(useEditor.getState().S.font).toBe('labelle');
  expect(useEditor.getState().canUndo).toBe(false); // the second one recorded nothing
});

test('Export as PNG chooses PNG and opens Export', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  await choose(u, 'Export as PNG');
  expect(useExportPrefs.getState().format).toBe('png');
  await waitFor(() => expect(route()).toEqual({ name: 'doc', id: here.id, stage: 'export' }));
});

test('Dark theme switches the theme, and says which one is in use', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  expect(within(palette()!).getByRole('option', { name: 'System theme Current' })).toBeInTheDocument();
  await choose(u, 'Dark theme');
  expect(document.documentElement).toHaveClass('dark');
  await openPalette(u);
  expect(within(palette()!).getByRole('option', { name: 'Dark theme Current' })).toBeInTheDocument();
});

test('Keyboard shortcuts opens the sheet in its place, and the focus comes back after it', async () => {
  const u = user();
  await openApp();
  const write = within(stages()).getByRole('button', { name: '1 Write' });
  write.focus();
  await openPalette(u);
  await choose(u, 'Keyboard');
  const sheet = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
  expect(palette()).not.toBeInTheDocument();
  await u.keyboard('{Escape}');
  await waitFor(() => expect(write).toHaveFocus());
});

test('the groups, in order; a document says when it was edited, and the shortcut sheet its key', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  const headings = [...palette()!.querySelectorAll('[cmdk-group-heading]')].map(h => h.textContent);
  expect(headings).toEqual(['Go to', 'Documents', 'Create', 'Export', 'Looks for the whole document', 'Theme', 'Help']);
  const p = within(palette()!);
  expect(p.getAllByRole('option').slice(0, 4).map(o => o.textContent)).toEqual(['Outline', 'Style', 'Export', 'Home']);
  const essayItem = p.getByRole('option', { name: /^Essay/ });
  expect(essayItem).toHaveAccessibleName('Essay Edited today');
  expect(within(essayItem).getByText('Edited today')).toHaveClass('text-muted');
  expect(palette()!.querySelector(`[data-value="doc:${essay.id}"]`)).toBe(essayItem);
  expect(palette()!.querySelector(`[data-value="doc:${here.id}"]`)).toBeNull(); // the open document
  expect(p.getByRole('option', { name: 'Keyboard shortcuts ?' }).querySelector('kbd')).toHaveTextContent('?');
});

const shown = () => within(palette()!).queryAllByRole('option').map(o => o.textContent);

test('search filters on the words each item is known by', async () => {
  const u = user();
  await openApp();
  const field = await openPalette(u);
  await u.keyboard('docx');
  expect(shown()).toEqual(['Import a file…']);
  await u.clear(field); await u.keyboard('handwritten');
  expect(shown()).toEqual([]); // Write is the stage on screen
  await u.clear(field); await u.keyboard('paper');
  expect(shown()[0]).toBe('Style');
  expect(within(palette()!).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  await u.clear(field); await u.keyboard('pdf');
  expect(shown()).toEqual(['Export as PDF', 'Export', 'Import a file…']);
});

test('Ctrl+Z in the search is the field’s own: the document behind it is left alone', async () => {
  const u = user();
  await openApp();
  act(() => update(s => { s.title = 'Changed'; }, { history: 'test' }));
  await openPalette(u);
  await u.keyboard('x{Control>}z{/Control}');
  expect(useEditor.getState().title).toBe('Changed');
});

test('nothing matches says so', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  await u.keyboard('zzzz');
  expect(within(palette()!).getByText('Nothing matches that.')).toBeInTheDocument();
  expect(within(palette()!).queryAllByRole('option')).toEqual([]);
});

test('with the Import dialog open, Ctrl+K opens nothing', async () => {
  const u = user();
  await openApp();
  act(() => openImport());
  await screen.findByRole('dialog', { name: 'Import a document' });
  await u.keyboard('{Control>}k{/Control}');
  expect(useOverlays.getState().open).toBe(null);
  expect(palette()).not.toBeInTheDocument();
});

test('Escape closes it and gives the focus back, and so does Ctrl+K again', async () => {
  const u = user();
  await openApp();
  const name = await docName();
  name.focus();
  await openPalette(u);
  await u.keyboard('{Escape}');
  await waitFor(() => expect(name).toHaveFocus());
  expect(palette()).not.toBeInTheDocument();
  await openPalette(u);
  await u.keyboard('{Control>}k{/Control}');
  await waitFor(() => expect(name).toHaveFocus());
  expect(palette()).not.toBeInTheDocument();
});

test('in a document, Import a file… opens Import, which keeps the focus', async () => {
  const u = user();
  await openApp();
  (await docName()).focus();
  await openPalette(u);
  const outside: Element[] = [];
  const seen = (e: FocusEvent) => { const t = e.target as Element; if (!t.closest('[role="dialog"]')) outside.push(t); };
  await choose(u, 'Import');
  const dlg = await screen.findByRole('dialog', { name: 'Import a document' });
  document.addEventListener('focusin', seen);
  await act(async () => { await new Promise(r => setTimeout(r, 50)); }); // the palette's closing focus has had its frame
  document.removeEventListener('focusin', seen);
  expect(dlg).toContainElement(document.activeElement as HTMLElement);
  expect(outside).toEqual([]); // nothing behind it was given the focus, even for a moment
  expect(palette()).not.toBeInTheDocument();
});

test('closing that Import gives the focus back to what had it before the palette', async () => {
  const u = user();
  await openApp();
  const name = await docName();
  name.focus();
  await openPalette(u);
  await choose(u, 'Import');
  await screen.findByRole('dialog', { name: 'Import a document' });
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  await u.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(name).toHaveFocus());
});

test('the documents are read afresh each time it opens', async () => {
  const u = user();
  await openApp();
  await openPalette(u);
  await u.keyboard('{Escape}');
  const fresh = await createDoc({ title: 'Made in another tab' });
  await openPalette(u);
  expect(await within(palette()!).findByRole('option', { name: /^Made in another tab/ })).toBe(palette()!.querySelector(`[data-value="doc:${fresh.id}"]`));
});

test('on Home the latest document comes first, and Enter opens it, though the list is read after the palette opens', async () => {
  const u = user();
  location.hash = '#/';
  render(<App />);
  await screen.findByRole('button', { name: 'New document' });
  await openPalette(u);
  const first = within(palette()!).getAllByRole('option')[0];
  expect(first).toBe(palette()!.querySelector(`[data-value="doc:${here.id}"]`));
  expect(first).toHaveAttribute('aria-selected', 'true');
  await u.keyboard('{Enter}');
  await waitFor(async () => expect(route()).toEqual({ name: 'doc', id: here.id, stage: 'write' }));
  await waitFor(async () => expect(await docName()).toHaveValue('Lab report'));
});

test('on Home, Import a file… opens the file picker', async () => {
  const u = user();
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { void this; });
  location.hash = '#/';
  render(<App />);
  await screen.findByRole('button', { name: 'New document' });
  await openPalette(u);
  await choose(u, 'Import');
  const picked = click.mock.contexts.filter(el => (el as HTMLInputElement).type === 'file');
  expect(picked).toHaveLength(1);
  click.mockRestore();
});

test('with nowhere to store documents, the list is empty', async () => {
  location.hash = `#/d/${MEMORY_ID}/write`;
  openDocument({ ...rec('Kept here', 'x'), id: MEMORY_ID });
  useOverlays.setState({ open: 'palette' });
  render(<CommandPalette open onOpenChange={() => {}} />);
  const p = within(await screen.findByRole('dialog', { name: NAME }));
  await act(async () => { await new Promise(r => setTimeout(r, 20)); }); // (any reading of the list would be done)
  expect(p.queryByRole('option', { name: /^Essay/ })).not.toBeInTheDocument();
  expect(p.getByRole('option', { name: 'New document' })).toBeInTheDocument();
  await act(() => closeDocument());
});
