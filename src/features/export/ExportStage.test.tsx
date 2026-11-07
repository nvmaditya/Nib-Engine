// The Export stage: the pages with the Export panel beside them, or under them as a sheet on phones
// (the sheet Style shares), and the page choice that outlives the panel.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { App } from '@/app/App';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import type { EngineDoc } from '@/engine/types';
import { select } from '@/features/doc/actions';
import { layoutFor } from '@/features/doc/model';
import type { PageLayout } from '@/features/pages/PageView';
import { createDoc } from '@/store/documents';
import { flushSave } from '@/store/editor';
import { box, docOf, get, lines, open } from '@/test/docs';
import { realFonts } from '@/test/fonts';
import { ExportStage } from './ExportStage';
import { setChoose, setExportPrefs, togglePage, useExportPick, useExportPrefs } from './state';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

const wideMatchMedia = window.matchMedia;
const width = (px: number) => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => px });
beforeAll(() => { width(1200); realFonts(); });
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});
beforeEach(async () => { await flushSave(); localStorage.clear(); vi.mocked(sonner).mockClear(); });
afterEach(() => { window.matchMedia = wideMatchMedia; width(1200); });

/** A phone: no media query for a wide window matches, and every element is 390 px wide. */
function phone(): void {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
  width(390);
}

const stageButton = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: new RegExp(`${name}$`) });
const pageLayout = (): PageLayout => ({ ...layoutFor(get().S, get().doc), tick: 't' });
async function openApp(stage: string, doc?: EngineDoc): Promise<void> {
  const S = cleanSettings(null, false);
  const rec = await createDoc({ title: 'Seeded', settings: S, doc: doc ?? sampleDoc(S) });
  location.hash = `#/d/${rec.id}/${stage}`;
  render(<App />);
}
/** The stage starts 89 px down, below the top bar and its stage switcher (jsdom's window is 768 px tall). */
function stageAt89(stage: string): () => void {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.dataset.stage === stage ? new DOMRect(0, 89, 390, 679) : rect.call(this);
  });
  return () => spy.mockRestore();
}
const room = () => screen.getByRole('main', { name: 'Pages' }).parentElement!.style.getPropertyValue('--sheet-shown');

test('on a phone, Export is a sheet over the pages, and it goes with the stage', async () => {
  phone(); await openApp('export');
  const sheet = await screen.findByRole('dialog', { name: 'Export' });
  expect(sheet).toHaveAttribute('aria-modal', 'false');
  expect(within(sheet).getByRole('region', { name: 'Export' })).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Pages' })).toBeInTheDocument();
  await userEvent.click(stageButton('Write'));
  expect(screen.queryByRole('dialog', { name: 'Export', hidden: true })).toBeNull();
  await userEvent.click(stageButton('Export'));
  expect(await screen.findByRole('dialog', { name: 'Export' })).toBeInTheDocument();
});

test('on a phone, the sheet opens up to just below the stage switcher, rests as low as 168 px, and the pages make room for it', async () => {
  phone(); const restore = stageAt89('export');
  try {
    await openApp('export');
    const sheet = await screen.findByRole('dialog', { name: 'Export' });
    expect(room()).toBe('55dvh');
    const handle = screen.getByRole('button', { name: 'Drag to show more or less of Export' }); handle.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(sheet.style.getPropertyValue('--snap-point-height')).toBe('89px'));
    expect(room()).toBe('679px');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(room()).toBe('168px'));
    // A spacer after the last page, not padding, so the top height doesn't make the document scroll.
    expect(screen.getByRole('main', { name: 'Pages' })).toHaveClass('after:h-[calc(var(--sheet-shown)+12px)]');
  } finally { restore(); }
});

test('on a phone, Style still rests as low as 148 px', async () => {
  phone(); const restore = stageAt89('style');
  try {
    await openApp('style');
    await screen.findByRole('dialog', { name: 'Style' });
    screen.getByRole('button', { name: 'Drag to show more or less of Style' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(room()).toBe('679px'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(room()).toBe('148px'));
  } finally { restore(); }
});

test('on a phone, the sheet doesn’t keep Escape from leaving the block', async () => {
  phone();
  await openApp('export', docOf(box({ id: 'm', name: 'Main text', text: 'Hello' })));
  await screen.findByRole('dialog', { name: 'Export' });
  act(() => select('m'));
  expect(get().selectedId).toBe('m');
  await userEvent.keyboard('{Escape}');
  expect(get().selectedId).toBeNull();
});

test('on a phone, Tab goes on out of the sheet, both ways', async () => {
  phone(); await openApp('export');
  const sheet = await screen.findByRole('dialog', { name: 'Export' });
  const controls = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
  controls[controls.length - 1].focus();
  await userEvent.tab();
  expect(sheet).not.toContainElement(document.activeElement as HTMLElement);
  screen.getByRole('button', { name: 'Drag to show more or less of Export' }).focus();
  await userEvent.tab({ shift: true });
  expect(sheet).not.toContainElement(document.activeElement as HTMLElement);
});

test('on a wide screen, the panel sits beside the pages', async () => {
  await openApp('export');
  expect(await screen.findByRole('region', { name: 'Export' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Export' })).toBeNull();
});

test('Choose pages makes the pages checkboxes; clicking one leaves it out', async () => {
  await openApp('export', docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); // 2 pages
  await screen.findByText('Page 2 of 2'); // (the document is open: opening resets the choice)
  act(() => setChoose(true));
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Include page 2' }));
  expect(useExportPick.getState().out).toEqual([1]);
  expect(screen.getByText('Page 2 of 2 · left out')).toBeInTheDocument();
});

test('the choices outlive the panel, so crossing 860 px keeps them', () => {
  // The stage itself, on the open document (no App, so nothing reopens it): a phone tree, then a wide one.
  open(docOf(box({ id: 'm', text: lines(40) }))); phone();
  const first = render(<ExportStage layout={pageLayout()} />);
  act(() => { setChoose(true); togglePage(0); setExportPrefs({ format: 'png' }); });
  first.unmount();
  window.matchMedia = wideMatchMedia; width(1200);
  render(<ExportStage layout={pageLayout()} />);
  expect(screen.getByRole('checkbox', { name: 'Include page 1' })).not.toBeChecked();
  expect(useExportPrefs.getState().format).toBe('png');
});
