// Write on a phone: one page at a time, a Typed ⇄ Handwritten flip, swipes between pages, and a caret
// request that takes you to its page. Also the top bar's single 860 px breakpoint.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanSettings } from '@/engine/doc.js';
import { App } from '@/app/App';
import type { Route } from '@/app/route';
import type { EngineDoc } from '@/engine/types';
import { addPageAt, deletePageAt } from '@/features/doc/actions';
import { TopBar } from '@/shell/TopBar';
import { createDoc } from '@/store/documents';
import { flushSave, placeCaret, useEditor } from '@/store/editor';
import { box, docOf, fontsLoad, lines } from '@/test/docs';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

// A phone: no media query for a wide window matches, and every element is 390 px wide.
const wideMatchMedia = window.matchMedia;
beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
  fontsLoad();
});
afterAll(() => {
  window.matchMedia = wideMatchMedia;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await flushSave();
  localStorage.removeItem('nib.phoneFace');
  const S = cleanSettings(null, false);
  const id = (await createDoc({ title: 'T', settings: S, doc: docOf(box({ id: 'm', name: 'Main text', text: lines(40) })) })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText('Page 1 of 2');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Fire pointerdown, pointermove and pointerup on `el`, travelling (dx, dy) px. */
function swipe(el: Element, dx: number, dy: number): void {
  const at = (x: number, y: number) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y });
  fireEvent.pointerDown(el, at(200, 300));
  fireEvent.pointerMove(el, at(200 + dx / 2, 300 + dy / 2));
  fireEvent.pointerMove(el, at(200 + dx, 300 + dy));
  fireEvent.pointerUp(el, at(200 + dx, 300 + dy));
}
/** The page under the pager. */
const pageArea = () => document.querySelector<HTMLElement>('[data-phone-page]')!;
const docRoute: Route = { name: 'doc', id: 'x', stage: 'write' };

test('one page at a time', async () => {
  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Main text, page 1' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 2' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Main text, page 2' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 1' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Options for page 2' })).toBeInTheDocument();
});

test('a page deleted under you shows the one before, and you stay there when a page is added', async () => {
  act(() => addPageAt());
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  act(() => deletePageAt(2));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  act(() => addPageAt());
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
});

test('the Write bar has no Show group; the flip is the only one', () => {
  const shows = screen.getAllByRole('group', { name: 'Show' });
  expect(shows).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Side by side' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Typed' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Handwritten' })).toHaveAttribute('aria-pressed', 'false');
});

test('flip to the handwritten page', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  expect(screen.getByRole('img', { name: 'Handwritten page 1 of 2' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 1' })).toBeNull();
  expect(screen.queryByText('Handwritten', { selector: 'figcaption' })).toBeNull(); // no caption under the page
  expect(localStorage.getItem('nib.phoneFace')).toBe('hand');
  // remembered
  cleanup();
  render(<App />);
  expect(await screen.findByRole('img', { name: 'Handwritten page 1 of 2' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Handwritten' })).toHaveAttribute('aria-pressed', 'true');
});

test('the page fills the width less 16 px gutters', () => {
  expect(document.querySelector<HTMLElement>('.typed-page[data-paper="0"]')!.style.width).toBe('358px');
});

test('swipe left for the next page; a swipe that starts in the editor types instead', () => {
  swipe(pageArea(), -120, 5);
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  swipe(screen.getByRole('textbox', { name: 'Main text, page 2' }), 120, 5);
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
});

test('a short or mostly vertical swipe stays; swipe right goes back', () => {
  swipe(pageArea(), -50, 0);
  swipe(pageArea(), -120, 90);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  swipe(pageArea(), -120, 70);
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  swipe(pageArea(), 120, 0);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  swipe(pageArea(), 120, 0); // no page before the first
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('two fingers (a pinch) don’t turn the page; the next swipe does', () => {
  const el = pageArea(), at = (id: number, x: number, primary: boolean) => ({ pointerId: id, pointerType: 'touch', isPrimary: primary, button: 0, clientX: x, clientY: 300 });
  fireEvent.pointerDown(el, at(1, 200, true));
  fireEvent.pointerDown(el, at(2, 260, false));
  fireEvent.pointerUp(el, at(2, 380, false));
  fireEvent.pointerUp(el, at(1, 60, true));
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  fireEvent.pointerDown(el, at(3, 200, true)); // an earlier touch whose end never arrived doesn't block this one
  fireEvent.pointerDown(el, at(4, 200, true));
  fireEvent.pointerUp(el, at(4, 60, true));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
});

test('a swipe that starts on a grip moves the block, not the page', () => {
  swipe(screen.getByRole('button', { name: 'Move Main text' }), -120, 0);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('a caret on another page takes you there', () => {
  act(() => placeCaret('m', lines(40).indexOf('line35')));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Main text, page 2' }));
});

test('a caret request turns the handwritten page over to the typed one', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  act(() => placeCaret('m', lines(40).indexOf('line3')));
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Typed' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Main text, page 1' }));
  // once handled, it doesn't pull you back
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
});

test('while the stage is hidden (width 0) the page and its editor stay mounted', async () => {
  let width = 390, resize: (() => void) | null = null;
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  cleanup();
  render(<App />);
  await screen.findByText('Page 1 of 2');
  try {
    width = 0;
    act(() => resize?.());
    expect(screen.getByRole('textbox', { name: 'Main text, page 1' })).toBeInTheDocument();
    expect(screen.queryByText('Loading handwriting…')).toBeNull();
  } finally {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    vi.unstubAllGlobals();
  }
});

test('a swipe that starts on the handwritten writing turns the page', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Handwritten' }));
  const frame = await waitFor(() => { const f = document.querySelector('.block-frame'); expect(f).not.toBeNull(); return f!; });
  swipe(frame, -160, 0);
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
});

test('a document with nothing written opens on its typed page, and the face kept for others stays', async () => {
  cleanup();
  localStorage.setItem('nib.phoneFace', 'hand');
  const id = (await createDoc({ title: 'New', settings: cleanSettings(null, false), doc: docOf() })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText('Page 1 of 1');
  expect(screen.getByRole('button', { name: 'Typed' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Empty page. Use + Add, or drag a block here in Outline.')).toBeInTheDocument();
  expect(localStorage.getItem('nib.phoneFace')).toBe('hand');
});

test('a mouse drag does not turn the page', () => {
  const at = (x: number) => ({ pointerId: 3, pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: 300 });
  fireEvent.pointerDown(pageArea(), at(250));
  fireEvent.pointerUp(pageArea(), at(50));
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('Move down in the page menu keeps the pager on the moved page', async () => {
  cleanup();
  const S = cleanSettings(null, false);
  const two = { ...docOf(box({ id: 'a', name: 'First', text: 'one' }), box({ id: 'b', name: 'Second', text: 'two', page: 1 })), pageCount: 2 };
  const id = (await createDoc({ title: 'U', settings: S, doc: two })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText('Page 1 of 2');
  await userEvent.click(screen.getByRole('button', { name: 'Options for page 1' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'First, page 2' })).toBeInTheDocument();
});

/** Choose `name` in the page menu of the page on screen. */
async function pageMenu(page: number, name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Options for page ${page}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}

const EMPTY = 'Empty page. Use + Add, or drag a block here in Outline.';
test('Add a page after this one turns to the new blank page, after the text that runs on', async () => {
  await pageMenu(1, 'Add a page after this one'); // Main text runs onto page 2
  expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
  expect(screen.getByText(EMPTY)).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Main text, page 2' })).toBeNull();
  await openDoc(docOf(box({ id: 'm', name: 'Main text', text: lines(70) }))); // runs onto page 3
  await pageMenu(1, 'Add a page after this one');
  expect(await screen.findByText('Page 4 of 4')).toBeInTheDocument();
  expect(screen.getByText(EMPTY)).toBeInTheDocument();
  await openPages(3); // nothing runs on: the blank page is right after this one
  await pageMenu(1, 'Add a page after this one');
  expect(await screen.findByText('Page 2 of 4')).toBeInTheDocument();
  expect(screen.getByText(EMPTY)).toBeInTheDocument();
});

/** Open `doc` in Write, on its first page. */
async function openDoc(doc: EngineDoc): Promise<void> {
  cleanup();
  const id = (await createDoc({ title: 'M', settings: cleanSettings(null, false), doc })).id;
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByText(/^Page 1 of \d+$/);
}
/** Open a document whose pages hold one short block each: First, Second, Third… */
const openPages = (n: number): Promise<void> => {
  const names = ['First', 'Second', 'Third'];
  return openDoc({ ...docOf(...names.slice(0, n).map((name, page) => box({ id: name, name, text: name.toLowerCase(), page }))), pageCount: n });
};

test('Merge into previous page turns to the page it went to', async () => {
  await openPages(2);
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await pageMenu(2, 'Merge into previous page');
  expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Second, page 1' })).toBeInTheDocument();
  // With a page after it, the pager doesn't stay on the merged page's old place (now the page after).
  await openPages(3);
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await pageMenu(2, 'Merge into previous page');
  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Second, page 1' })).toBeInTheDocument();
});

test('a refused merge leaves the pager where it was', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await pageMenu(2, 'Merge into previous page'); // page 2 shows only Main text part 2
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
});

test('the top bar uses the 860 px breakpoint', () => {
  cleanup();
  render(<TopBar route={docRoute} ready />);
  expect(screen.getByRole('button', { name: 'Export' }).className).toMatch(/wide:inline-flex/);
  expect(document.querySelector('header')!.outerHTML).not.toMatch(/\bmd:/);
});

// Export stays off the phone's top bar (the stage switcher under it has Export), but the save state stays.
test('on a phone the top bar keeps the save state, as an icon that says it', () => {
  cleanup();
  render(<TopBar route={docRoute} ready />);
  const status = screen.getByRole('status');
  expect(status.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  expect(status).toHaveAttribute('title', 'Saved');
  expect(status).toHaveTextContent('Saved'); // read out, though only the icon shows
  expect(status.querySelector('svg')).toHaveClass('sm:hidden');
  expect(screen.getByText('Saved')).toHaveClass('sr-only', 'sm:not-sr-only');
  act(() => { useEditor.setState({ saving: 'unsaved' }); });
  expect(status).toHaveAttribute('title', 'Not saved');
  expect(screen.getByText('Not saved')).not.toHaveClass('sr-only'); // a problem shows in words too
  act(() => { useEditor.setState({ saving: 'saved' }); });
});
