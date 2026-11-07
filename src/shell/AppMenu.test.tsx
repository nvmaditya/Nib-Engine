import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar';
import { AppMenu } from './AppMenu';
import { Overlays } from './Overlays';
import { closeOverlay, focusBack, useOverlays } from './overlayStore';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }), Toaster: () => null }));

const html = document.documentElement;
beforeEach(() => { localStorage.clear(); html.className = ''; useOverlays.setState({ open: null }); });

const menuButton = () => screen.getByRole('button', { name: 'Menu' });
const openMenu = async () => { await userEvent.click(menuButton()); return screen.findByRole('menu'); };

test('the menu searches, shows the shortcuts and switches the theme', async () => {
  render(<AppMenu />);
  expect(menuButton()).toHaveAttribute('title', 'Menu');
  const menu = await openMenu();
  const items = within(menu).getAllByRole('menuitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveAccessibleName('Search commands and documents');
  expect(items[1]).toHaveAccessibleName('Keyboard shortcuts');
  // The keys show in <kbd>, and are said through aria-keyshortcuts rather than in the name.
  expect([...menu.querySelectorAll('kbd')].map(k => k.textContent)).toEqual(['Ctrl+K', '?']);
  expect(items.map(i => i.getAttribute('aria-keyshortcuts'))).toEqual(['Control+K', '?']);
  const theme = within(menu).getByRole('group', { name: 'Theme' });
  const radios = within(theme).getAllByRole('menuitemradio');
  expect(radios.map(r => r.textContent)).toEqual(['System', 'Light', 'Dark']);
  expect(radios.map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  expect(menu.querySelector('[role="separator"]')).toBeInTheDocument();

  await userEvent.click(within(theme).getByRole('menuitemradio', { name: 'Dark' }));
  expect(html).toHaveClass('dark');
  expect(localStorage.getItem('nib.theme')).toBe('dark');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  await waitFor(() => expect(menuButton()).toHaveFocus()); // a choice that opens nothing gives the focus back to the button

  const again = await openMenu();
  expect(within(again).getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  expect(within(again).getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'false');
});

test('on Apple keyboards the search shortcut is ⌘K', async () => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
  try {
    render(<AppMenu />);
    const item = within(await openMenu()).getByRole('menuitem', { name: 'Search commands and documents' });
    expect(item.querySelector('kbd')).toHaveTextContent('⌘K');
    expect(item).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
  } finally { delete (navigator as unknown as Record<string, unknown>).platform; }
});

test('Keyboard shortcuts from the menu opens the sheet with the focus in it', async () => {
  render(<><Overlays /><AppMenu /></>);
  // With the keyboard: the button, then the second item.
  menuButton().focus();
  await userEvent.keyboard('{Enter}');
  const menu = await screen.findByRole('menu');
  await waitFor(() => expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus());
  await userEvent.keyboard('{ArrowDown}{Enter}');
  const sheet = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
  expect(screen.queryByRole('menu')).toBeNull();
  // The item is gone with the menu, so closing the sheet gives the focus to the Menu button.
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(menuButton()).toHaveFocus());
});

test('Search commands and documents opens the palette', async () => {
  render(<AppMenu />);
  const seen: (Element | null)[] = [];
  const off = useOverlays.subscribe(s => { if (s.open) seen.push(document.activeElement); });
  try {
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Search commands and documents' }));
    await waitFor(() => expect(useOverlays.getState().open).toBe('palette'));
  } finally { off(); }
  expect(seen).toEqual([menuButton()]); // it opens once the menu is gone, with the Menu button focused
  // So the palette, closing, gives the focus back to the button, wherever its own field had it.
  document.body.focus();
  closeOverlay();
  focusBack(new Event('focusScope.autoFocusOnUnmount', { cancelable: true }));
  expect(menuButton()).toHaveFocus();
});

test('the top bar has the menu on Home and in a document, and Home’s Import a file waits for wider screens', () => {
  const { unmount } = render(<TopBar route={{ name: 'home' }} ready={false} />);
  const header = document.querySelector('header')!;
  expect(header).toHaveClass('gap-x-2', 'wide:gap-x-3');
  expect(header).not.toHaveClass('gap-x-3');
  const buttons = within(header).getAllByRole('button');
  expect(buttons.map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Import a file', 'New document', 'Menu']);
  expect(screen.getByRole('button', { name: 'Import a file' })).toHaveClass('hidden', 'sm:inline-flex');
  unmount();

  render(<TopBar route={{ name: 'doc', id: 'x', stage: 'write' }} ready={false} />);
  const names = within(document.querySelector('header')!).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent);
  expect(names.slice(names.indexOf('Undo'))).toEqual(['Undo', 'Redo', 'Menu', 'Export']);
});
