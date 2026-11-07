// The three tips shown the first time a document opens on this device: a landmark beside the work that never takes
// the focus, put away for good by Got it (or by leaving the document). Each test is a page of its own, loaded
// afresh (vi.resetModules), so the tips' memory of having shown on this page starts empty; IndexedDB and
// localStorage keep what they hold, as they do across a reload.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answer, resizableWindow } from '@/test/media';

const appCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/app.css'), 'utf8');

// Home's document pictures are drawn in the background, one by one, and have nothing to do with the tips.
vi.mock('@/features/home/PageThumb', () => ({ PageThumb: () => null }));

interface Page {
  App: typeof import('@/app/App').App;
  docs: typeof import('@/store/documents');
  editor: typeof import('@/store/editor');
  db: typeof import('@/store/db');
}
let page: Page;

/** A page loaded afresh: the app's modules anew, on the same storage. */
async function freshPage(): Promise<Page> {
  vi.resetModules();
  const { App } = await import('@/app/App');
  return { App, docs: await import('@/store/documents'), editor: await import('@/store/editor'), db: await import('@/store/db') };
}
/** Close the page: unmount it, let its last change be written, and close its connection to the database. */
async function closePage(): Promise<void> {
  cleanup();
  await page.editor.flushSave();
  await page.db.resetDbForTests();
}

const matchMedia = window.matchMedia;
beforeEach(async () => { localStorage.removeItem('nib.tips'); page = await freshPage(); });
afterEach(async () => {
  await closePage();
  vi.unstubAllGlobals();
  window.matchMedia = matchMedia;
  delete (navigator as unknown as Record<string, unknown>).platform;
});

const TOUCH = '(hover: none) and (pointer: coarse)';
const LINES = [
  'Click or tap a word on a handwritten page to put the caret there in its text.',
  'Drag a block by its name tag to move it. Its ⋯ menu splits it, joins it back or removes one page’s part.',
  'Press Ctrl+K to open a document, go to a stage or change the theme, and ? to see every shortcut.',
];

const tips = () => screen.findByRole('complementary', { name: 'Tips' });
const noTips = () => expect(screen.queryByRole('complementary', { name: 'Tips' })).toBeNull();
const items = (aside: HTMLElement) => within(aside).getAllByRole('listitem').map(li => li.textContent);
const nameField = () => screen.findByRole('textbox', { name: 'Document name' });

/** Make a document and render the page at it, in Write. */
async function openFirst(title: string): Promise<void> {
  const rec = await page.docs.createDoc({ title });
  location.hash = `#/d/${rec.id}/write`;
  render(<page.App />);
  await waitFor(async () => expect(await nameField()).toHaveValue(title));
}
/** Go Home, and wait for its list of documents to be read. */
async function goHome(): Promise<void> {
  act(() => { location.hash = '#/'; });
  await within(await screen.findByRole('region', { name: 'Recent' })).findByRole('list');
}
/** Open another document on the page that is already showing one. */
async function openNext(title: string): Promise<void> {
  const rec = await page.docs.createDoc({ title });
  act(() => { location.hash = `#/d/${rec.id}/write`; });
  await waitFor(async () => expect(await nameField()).toHaveValue(title));
}

test('the first document to open shows three tips, and nothing takes the focus', async () => {
  const user = userEvent.setup();
  await openFirst('Essay');
  const aside = await tips();
  expect(within(aside).getByRole('heading', { level: 2, name: 'Tips' })).toBeInTheDocument();
  expect(within(aside).getByRole('list')).toHaveClass('list-decimal');
  expect(items(aside)).toEqual(LINES);
  expect(within(aside).getByText('Ctrl+K', { selector: 'kbd' })).toBeInTheDocument();
  expect(within(aside).getByText('?', { selector: 'kbd' })).toBeInTheDocument();
  expect(within(aside).getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  expect(document.activeElement).toBe(document.body);
  expect(aside).not.toContainElement(document.activeElement as HTMLElement);
  expect(localStorage.getItem('nib.tips')).toBe('seen'); // seen as soon as they show

  // Typing goes on while they show.
  const field = await nameField();
  await user.click(field);
  await user.type(field, ' two');
  expect(field).toHaveValue('Essay two');
  expect(field).toHaveFocus();
  expect(await tips()).toBeInTheDocument();
});

test('the card showing takes no focus from what has it', async () => {
  localStorage.setItem('nib.tips', 'seen');
  await openFirst('Essay');
  noTips();
  const field = await nameField();
  act(() => field.focus());
  const { showTipsIfDue } = await import('./tipsSeen'); // this page's own copy
  localStorage.removeItem('nib.tips');
  act(() => showTipsIfDue());
  expect(await tips()).toBeInTheDocument();
  expect(field).toHaveFocus();
});

test('Got it puts them away, and they don’t come back', async () => {
  const user = userEvent.setup();
  await openFirst('First');
  const field = await nameField();
  act(() => field.focus());
  const blurred = vi.fn();
  field.addEventListener('blur', blurred);
  await user.click(within(await tips()).getByRole('button', { name: 'Got it' }));
  noTips();
  expect(field).toHaveFocus(); // a click leaves the focus where it was: it never went into the card
  expect(blurred).not.toHaveBeenCalled();
  act(() => field.blur()); // (a name field with the focus keeps what is typed in it when another document opens)
  await openNext('Second');
  noTips();

  // After a reload too.
  await closePage();
  page = await freshPage();
  await openFirst('Third');
  noTips();
});

test('leaving the document without Got it puts them away too: they show once', async () => {
  await openFirst('First');
  await tips();
  await goHome();
  noTips();
  await openNext('Second');
  noTips();
});

test('pressing Got it from the keyboard gives the focus back to what had it', async () => {
  const user = userEvent.setup();
  await openFirst('Essay');
  const aside = await tips();
  act(() => page.editor.renameDocument('Essay, again')); // something to undo, so Undo can take the focus
  const undo = screen.getByRole('button', { name: 'Undo' });
  await waitFor(() => expect(undo).toBeEnabled());
  act(() => undo.focus());
  // Into the card, as a Tab from the control before it or a screen reader's jump to the Tips landmark does.
  const gotIt = within(aside).getByRole('button', { name: 'Got it' });
  act(() => gotIt.focus());
  await user.keyboard('{Enter}');
  noTips();
  expect(undo).toHaveFocus();
});

test('when the focus has been into the card and out again, Got it gives it back to where it came from last', async () => {
  const user = userEvent.setup();
  await openFirst('Essay');
  const aside = await tips();
  const gotIt = within(aside).getByRole('button', { name: 'Got it' });
  const homeLink = screen.getByRole('link', { name: 'Home' }), field = await nameField();
  act(() => homeLink.focus());
  act(() => gotIt.focus());
  act(() => field.focus());
  act(() => gotIt.focus());
  await user.keyboard('{Enter}');
  noTips();
  expect(field).toHaveFocus();
});

test('Tab from the last control before the card, then Got it, and the focus is back on that control', async () => {
  const user = userEvent.setup();
  await openFirst('Essay');
  const aside = await tips();
  let before: Element | null = null;
  for (let i = 0; i < 200 && !aside.contains(document.activeElement); i++) { before = document.activeElement; await user.tab(); }
  expect(within(aside).getByRole('button', { name: 'Got it' })).toHaveFocus();
  expect(before).not.toBe(document.body);
  await user.keyboard('{Enter}');
  noTips();
  expect(document.activeElement).toBe(before);
});

test('if what had the focus is gone, Got it gives it to the first control in the stage on screen', async () => {
  const user = userEvent.setup();
  await openFirst('Essay');
  const aside = await tips();
  const gone = document.createElement('button');
  document.body.append(gone);
  act(() => gone.focus());
  act(() => within(aside).getByRole('button', { name: 'Got it' }).focus());
  gone.remove();
  await user.keyboard('{Enter}');
  noTips();
  const stage = document.querySelector('[data-stage]:not([hidden])')!;
  const first = stage.querySelector('button:not([disabled]), input:not([disabled]), [contenteditable="true"], a[href], [tabindex]:not([tabindex="-1"])');
  expect(first).not.toBeNull();
  expect(document.activeElement).toBe(first);
});

test('with storage blocked they show once on this page', async () => {
  const blocked = () => { throw new DOMException('blocked', 'SecurityError'); };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked, key: blocked, length: 0 });
  await openFirst('First');
  expect(await tips()).toBeInTheDocument();
  await openNext('Second');
  noTips();
  await goHome();
  await openNext('Third');
  noTips();
});

test('on a touch-only device the third tip is about swiping', async () => {
  window.matchMedia = (query: string) => ({
    matches: query === TOUCH || answer(query, window.innerWidth), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
  await openFirst('Essay');
  expect(items(await tips())).toEqual([LINES[0], LINES[1], 'Swipe sideways on a page to turn to the next one.']);
});

test('on an Apple keyboard the shortcut reads ⌘K', async () => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
  await openFirst('Essay');
  const aside = await tips();
  expect(items(aside)[2]).toBe('Press ⌘K to open a document, go to a stage or change the theme, and ? to see every shortcut.');
  expect(within(aside).getByText('⌘K', { selector: 'kbd' })).toBeInTheDocument();
});

test('the card sits out of the way: along the bottom on phones, in the bottom left corner from 860 px, under sheets and dialogs', async () => {
  await openFirst('Essay');
  const aside = await tips();
  for (const c of ['fixed', 'z-30', 'inset-x-3', 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))]', 'wide:inset-x-auto', 'wide:bottom-4', 'wide:left-4', 'wide:w-80', 'bg-surface', 'border-line']) expect(aside).toHaveClass(c);
  expect(aside.closest('[data-stage]')).toBeNull(); // outside the stages, so a hidden stage never hides it
});

/* ---------- Below 860 px: the stage's sheet, and room at the foot of the pages ---------- */

/** app.css's rules about the tips (`[data-tips]`), as a page's stylesheet: jsdom applies them to getComputedStyle. */
function tipsRules(): HTMLStyleElement {
  const rules = appCss.match(/^[^{}\n]*\[data-tips\][^{}]*\{[^}]*\}/gm) ?? [];
  expect(rules).toHaveLength(1);
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.append(style);
  return style;
}
const go = (hash: string) => act(() => { location.hash = hash; });

test('below 860 px, while the stage on screen holds a sheet, the card is out of the way and out of the accessibility tree; it comes back in Write', async () => {
  const win = resizableWindow(390), style = tipsRules();
  try {
    await openFirst('Essay');
    expect(await tips()).toBeVisible();
    const id = location.hash.split('/')[2];
    go(`#/d/${id}/style`);
    await waitFor(() => expect(document.querySelector('[data-stage="style"]:not([hidden]) [data-vaul-drawer]')).not.toBeNull());
    const card = document.querySelector('aside[data-tips]');
    expect(card).not.toBeNull(); // still open: it is the sheet that puts it away
    expect(card).not.toBeVisible();
    noTips();
    go(`#/d/${id}/write`);
    expect(await tips()).toBeVisible();
    go(`#/d/${id}/export`);
    await waitFor(() => expect(document.querySelector('[data-stage="export"]:not([hidden]) [data-vaul-drawer]')).not.toBeNull());
    noTips();
  } finally { style.remove(); win.restore(); }
});

test('while the card shows, the pages get room below for it (--tips-room, the card’s height and its gap), and lose it when it goes', async () => {
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.matches('aside[data-tips]') ? 180 : 0; } });
  const room = () => document.documentElement.style.getPropertyValue('--tips-room');
  try {
    const user = userEvent.setup();
    await openFirst('Essay');
    const aside = await tips();
    expect(room()).toBe('calc(180px + 0.75rem + env(safe-area-inset-bottom))');
    await user.click(within(aside).getByRole('button', { name: 'Got it' }));
    noTips();
    expect(room()).toBe('');
  } finally { Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height); }
  // The phone pages' scroll area uses it, below 860 px only.
  expect(appCss).toMatch(/@media \(width < 53\.75rem\) \{\s*\[data-stage='write'\] main\[data-pages\] \{\s*padding-bottom: var\(--tips-room, 0px\);\s*\}\s*\}/);
});

test('leaving the document takes the room away with the card', async () => {
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.matches('aside[data-tips]') ? 180 : 0; } });
  try {
    await openFirst('Essay');
    await tips();
    expect(document.documentElement.style.getPropertyValue('--tips-room')).not.toBe('');
    await goHome();
    expect(document.documentElement.style.getPropertyValue('--tips-room')).toBe('');
  } finally { Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height); }
});
