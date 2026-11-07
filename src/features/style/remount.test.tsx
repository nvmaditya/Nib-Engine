// Crossing 860 px (a tablet turned, a window resized) swaps Style's aside for a sheet, a new tree: what a
// person was doing in the panel is kept across it. Another document starts afresh.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { App } from '@/app/App';
import { FONTS } from '@/engine/config.js';
import { loadFont } from '@/engine/core.js';
import { cleanSettings } from '@/engine/doc.js';
import { setV } from '@/features/doc/actions';
import { createDoc } from '@/store/documents';
import { flushSave } from '@/store/editor';
import { box, docOf } from '@/test/docs';
import { paragraphs, realFonts } from '@/test/fonts';
import { resizableWindow } from '@/test/media';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

// Every hand's file arrives first: a sample whose hand arrived after its test ended would draw again outside act.
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  realFonts();
  await Promise.all(FONTS.map(f => loadFont(f.id)));
});
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});

const user = userEvent.setup();
const seeded = (title: string) => createDoc({ title, settings: cleanSettings(null, false), doc: docOf(box({ id: 'm', name: 'Main text', text: paragraphs(7) })) });
const go = (hash: string) => act(() => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });
/** The app on a 2-page document's `stage`, its pages laid out. */
async function openSeeded(stage: string): Promise<void> {
  const rec = await seeded('Seeded');
  location.hash = `#/d/${rec.id}/${stage}`;
  render(<App />);
  await screen.findByText('Page 2 of 2');
}

let win: ReturnType<typeof resizableWindow>;
beforeEach(async () => { await flushSave(); localStorage.clear(); localStorage.setItem('nib.tips', 'seen'); win = resizableWindow(1280); await openSeeded('style'); });
afterEach(() => win.restore());
const turn = (w: number) => act(() => win.resize(w));

test('crossing 860 px keeps the hand picker open with its search and filter', async () => {
  await user.click(screen.getByRole('button', { name: 'Change handwriting' }));
  await user.type(screen.getByRole('searchbox', { name: 'Search handwriting' }), 'cav');
  await user.click(screen.getByRole('button', { name: 'Joined-up' }));
  for (const w of [390, 1280]) {
    turn(w);
    expect(screen.getByRole('dialog', { name: 'Handwriting' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('cav');
    expect(screen.getByRole('button', { name: 'Joined-up' })).toHaveAttribute('aria-pressed', 'true');
  }
  // On a wide screen the search has the focus again, with the caret after what was typed, so typing carries on.
  expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveFocus();
  await user.keyboard('e');
  expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('cave');
});

test('…and Save as a look with the name typed so far', async () => {
  await user.click(screen.getByRole('button', { name: 'Save the current style as a look' }));
  await user.clear(screen.getByRole('textbox', { name: 'Look name' }));
  await user.type(screen.getByRole('textbox', { name: 'Look name' }), 'Mine');
  for (const w of [390, 1280]) {
    turn(w);
    expect(screen.getByRole('dialog', { name: 'Save as a look' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Look name' })).toHaveValue('Mine');
    expect(screen.getByRole('textbox', { name: 'Look name' })).toHaveFocus();
  }
  // The caret is after what was typed (not all of it selected), so typing carries on.
  await user.keyboard('s');
  expect(screen.getByRole('textbox', { name: 'Look name' })).toHaveValue('Mines');
});

test('…and the page count notice', async () => {
  act(() => setV({ size: 40 }));
  await screen.findByText(/^Now 3 pages \(was 2\)/);
  for (const w of [390, 1280]) {
    turn(w);
    expect(screen.getByText(/^Now 3 pages \(was 2\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit back to 2 pages' })).toBeInTheDocument();
  }
});

test('another document starts with the picker closed and no notice', async () => {
  const other = await seeded('Other');
  act(() => setV({ size: 40 }));
  await screen.findByText(/^Now 3 pages \(was 2\)/);
  await user.click(screen.getByRole('button', { name: 'Change handwriting' }));
  await user.type(screen.getByRole('searchbox', { name: 'Search handwriting' }), 'cav');
  go('#/');
  await screen.findByRole('button', { name: 'New document' });
  go(`#/d/${other.id}/style`);
  await screen.findByText('Page 2 of 2');
  expect(screen.getByRole('button', { name: 'Change handwriting' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Handwriting' })).toBeNull();
  expect(screen.queryByText(/^Now /)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Change handwriting' }));
  expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('');
});
