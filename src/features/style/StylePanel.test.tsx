// The Style panel as a whole: its sections in order, every setting the engine reads, Only a block,
// Fit back in the real app, and where the panel sits (beside the pages, or a sheet over them on phones).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toast as sonner } from 'sonner';
import { App } from '@/app/App';
import { FONTS, LIMITS } from '@/engine/config.js';
import { loadFont } from '@/engine/core.js';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { select, setV } from '@/features/doc/actions';
import { createDoc } from '@/store/documents';
import { flushSave, undo, update } from '@/store/editor';
import { box, docOf, get, lastToast, open } from '@/test/docs';
import { paragraphs, realFonts } from '@/test/fonts';
import { SETTING_CONTROLS } from './controls';
import { StylePanel } from './StylePanel';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

const wideMatchMedia = window.matchMedia;
const width = (px: number) => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => px });
// Every hand's file arrives first: a sample whose hand arrived after its test ended would draw again outside act.
beforeAll(async () => { width(1200); realFonts(); await Promise.all(FONTS.map(f => loadFont(f.id))); });
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});
beforeEach(async () => { await flushSave(); localStorage.clear(); localStorage.setItem('nib.tips', 'seen'); vi.mocked(sonner).mockClear(); });
afterEach(() => { window.matchMedia = wideMatchMedia; width(1200); });

/** A phone: no media query for a wide window matches, and every element is 390 px wide. */
function phone(): void {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
  width(390);
}

const FOLDS = ['Paper effects', 'Fine-tune', 'Letter and word spacing'];
const styleBox = (id: string) => act(() => { select(id); update(s => { s.scope = 'box'; }, { save: false, layout: false }); });
const stageButton = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: new RegExp(`${name}$`) });
/** The page count notice saying `text`. (Not by its role alone: each slider's value and the top bar's Saved line are statuses too.) */
const notice = async (text: string) => (await screen.findByText(text)).closest('[role="status"]');
async function openApp(stage: string): Promise<void> {
  const S = cleanSettings(null, false);
  const rec = await createDoc({ title: 'Seeded', settings: S, doc: sampleDoc(S) });
  location.hash = `#/d/${rec.id}/${stage}`;
  render(<App />);
}

test('the panel, top to bottom', () => {
  open(sampleDoc(cleanSettings(null, false)));
  render(<StylePanel pages={1} />);
  expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.firstChild!.textContent))
    .toEqual(['Looks', 'Handwriting', 'Pen', 'Ink', 'Paper', 'How natural', 'Size and spacing']);
  expect(screen.getByRole('heading', { level: 2, name: 'Style' })).toBeInTheDocument();
});

test('every setting the engine reads can be reached from Style, or is set in Export', async () => {
  open(docOf(box({ name: 'Main text' })));
  update(s => { s.S.crease = true; }, { history: false });
  render(<StylePanel pages={1} />);
  for (const t of FOLDS) await userEvent.click(screen.getByRole('button', { name: t }));
  for (const [key, c] of Object.entries(SETTING_CONTROLS)) {
    if (c.kind === 'slider') {
      const s = screen.getByRole('slider', { name: c.label });
      expect([+s.getAttribute('aria-valuemin')!, +s.getAttribute('aria-valuemax')!]).toEqual(LIMITS[key as keyof typeof LIMITS]);
    } else if (c.kind === 'buttons') expect(within(screen.getByRole('group', { name: c.label })).getAllByRole('button').length).toBeGreaterThan(4);
    else if (c.kind === 'switch') expect(screen.getByRole('switch', { name: c.label })).toBeInTheDocument();
    else if (c.kind === 'color') expect(screen.getByLabelText(c.label)).toBeInTheDocument();
    else if (c.kind === 'picker' || c.kind === 'action') expect(screen.getByRole('button', { name: new RegExp(c.label) })).toBeInTheDocument();
    else expect(screen.queryByRole('switch', { name: c.label }) ?? screen.queryByRole('radiogroup', { name: c.label })).toBeNull(); // Export's
  }
});

test('in Only a block, every handwriting slider changes only that block', async () => {
  open(docOf(box({ name: 'Main text' })));
  styleBox('b1');
  render(<StylePanel pages={1} />);
  for (const t of FOLDS) await userEvent.click(screen.getByRole('button', { name: t }));
  for (const [key, c] of Object.entries(SETTING_CONTROLS)) {
    if (c.kind !== 'slider' || !c.block) continue;
    const s = screen.getByRole('slider', { name: c.label });
    s.focus();
    await userEvent.keyboard(+s.getAttribute('aria-valuenow')! >= LIMITS[key as keyof typeof LIMITS][1] ? '{ArrowLeft}' : '{ArrowRight}');
    // The save waits for a pause (400 ms), which a slow machine can leave between two presses: it changes nothing here.
    if (key === 'flow') await act(() => flushSave());
  }
  expect(Object.keys(get().doc.boxes[0].style).sort()).toEqual(['flow', 'mess', 'mistakes', 'size', 'track', 'variety', 'weight', 'wobble', 'words']);
  expect(get().S).toMatchObject({ size: 30, mess: 45, weight: 100 });
});

test('a document that grows from 2 to 3 pages fits back to 2', async () => {
  const rec = await createDoc({ title: 'Fit', settings: cleanSettings(null, false), doc: docOf(box({ id: 'm', name: 'Main text', text: paragraphs(7) })) });
  location.hash = `#/d/${rec.id}/style`;
  render(<App />);
  await screen.findByText('Page 2 of 2');
  act(() => setV({ size: 36 }));
  expect(await notice('Now 3 pages (was 2)')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fit back to 2 pages' }));
  await screen.findByText('Page 2 of 2');
  expect(screen.queryByText('Page 3 of 3')).toBeNull();
  expect(get().S.size).toBe(34);
  expect(lastToast()).toBe('Back to 2 pages. Letter size is now 34.');
  act(() => undo());
  expect(await notice('Now 3 pages (was 2)')).toBeInTheDocument();
});

test('on a phone, Style is a sheet over the pages, and it goes with the stage', async () => {
  phone();
  await openApp('style');
  const sheet = await screen.findByRole('dialog', { name: 'Style' });
  expect(within(sheet).getByRole('button', { name: 'Whole document' })).toBeInTheDocument();
  expect(within(sheet).getByRole('region', { name: 'Style' })).toBeInTheDocument();
  // The pages stay live above it: the sheet hides nothing from assistive technology and keeps no focus.
  expect(screen.getByRole('main', { name: 'Pages' })).toBeInTheDocument();
  expect(sheet.closest('[data-stage]')).toHaveAttribute('data-stage', 'style');
  await userEvent.click(stageButton('Write'));
  expect(screen.queryByRole('dialog', { name: 'Style' })).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Style', hidden: true })).toBeNull();
  await userEvent.click(stageButton('Style'));
  expect(await screen.findByRole('dialog', { name: 'Style' })).toBeInTheDocument();
});

test('on a phone, the sheet opens up to just below the stage switcher, and the pages make room for it', async () => {
  phone();
  // The Style stage starts 89 px down, below the top bar and its stage switcher (jsdom's window is 768 px tall).
  const rect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.dataset.stage === 'style' ? new DOMRect(0, 89, 390, 679) : rect.call(this);
  });
  try {
    await openApp('style');
    const sheet = await screen.findByRole('dialog', { name: 'Style' });
    const room = () => screen.getByRole('main', { name: 'Pages' }).parentElement!.style.getPropertyValue('--sheet-shown');
    expect(room()).toBe('55dvh');
    // Up one height: the top one, whose top edge is at 89 px.
    screen.getByRole('button', { name: 'Drag to show more or less of Style' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(sheet.style.getPropertyValue('--snap-point-height')).toBe('89px'));
    expect(room()).toBe('679px');
    expect(screen.getByRole('main', { name: 'Pages' })).toHaveClass("after:h-[calc(var(--sheet-shown)+12px)]");
  } finally {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  }
});

test('on a phone, the sheet doesn’t keep Escape from leaving the block', async () => {
  phone();
  await openApp('style');
  await screen.findByRole('dialog', { name: 'Style' });
  expect(get().selectedId).not.toBeNull();
  await userEvent.keyboard('{Escape}');
  expect(get().selectedId).toBeNull();
});

test('on a phone, Tab goes on out of the sheet, both ways', async () => {
  phone();
  await openApp('style');
  const sheet = await screen.findByRole('dialog', { name: 'Style' });
  const controls = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
  controls[controls.length - 1].focus();
  await userEvent.tab();
  expect(sheet).not.toContainElement(document.activeElement as HTMLElement);
  screen.getByRole('button', { name: 'Drag to show more or less of Style' }).focus();
  await userEvent.tab({ shift: true });
  expect(sheet).not.toContainElement(document.activeElement as HTMLElement);
});

test('on a wide screen, the panel sits beside the pages', async () => {
  await openApp('style');
  expect(await screen.findByRole('region', { name: 'Style' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Style' })).toBeNull();
  expect(screen.getByRole('main', { name: 'Pages' })).toBeInTheDocument();
});
