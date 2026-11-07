import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { closeOverlay, otherModalOpen, useOverlays } from './overlayStore';
import { useAppShortcuts } from './useAppShortcuts';

function Harness() { useAppShortcuts(); return <><input aria-label="Field" /><div contentEditable aria-label="Editor" /><button>Plain</button></>; }
const open = () => useOverlays.getState().open;
const press = (key: string, o: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key, bubbles: true, ...o });

beforeEach(() => { useOverlays.setState({ open: null }); render(<Harness />); screen.getByRole('button', { name: 'Plain' }).focus(); });
afterEach(() => { delete (navigator as unknown as Record<string, unknown>).platform; });

test('Ctrl+K opens the command palette and closes it again', () => {
  expect(press('k', { ctrlKey: true })).toBe(false); expect(open()).toBe('palette');
  press('k', { ctrlKey: true }); expect(open()).toBe(null);
});

test('? opens the shortcuts, but in a field it is just typed', () => {
  press('?', { shiftKey: true }); expect(open()).toBe('shortcuts'); act(() => closeOverlay());
  screen.getByRole('textbox', { name: 'Field' }).focus(); expect(press('?', { shiftKey: true })).toBe(true); expect(open()).toBe(null);
});

test('? in the editor is just typed too', () => {
  screen.getByLabelText('Editor').focus();
  expect(press('?', { shiftKey: true })).toBe(true); expect(open()).toBe(null);
});

test('? with Ctrl, ⌘ or Alt held opens nothing', () => {
  for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) { expect(press('?', { shiftKey: true, ...o })).toBe(true); expect(open()).toBe(null); }
});

test('Ctrl+/ opens the shortcuts even from a field or the editor', () => {
  screen.getByLabelText('Editor').focus(); press('/', { ctrlKey: true }); expect(open()).toBe('shortcuts');
  act(() => closeOverlay());
  screen.getByRole('textbox', { name: 'Field' }).focus(); expect(press('/', { ctrlKey: true })).toBe(false); expect(open()).toBe('shortcuts');
  press('/', { ctrlKey: true }); expect(open()).toBe(null);
});

test('Ctrl+K works from a field and the editor as well, and the browser’s own Ctrl+K is kept out', () => {
  screen.getByRole('textbox', { name: 'Field' }).focus(); expect(press('k', { ctrlKey: true })).toBe(false); expect(open()).toBe('palette');
  screen.getByLabelText('Editor').focus(); press('K', { ctrlKey: true }); expect(open()).toBe(null);
});

test('a held Ctrl+K toggles once, however long it repeats', () => { press('k', { ctrlKey: true }); expect(press('k', { ctrlKey: true, repeat: true })).toBe(false); expect(open()).toBe('palette'); });

test('keys pressed while an input method composes are its own', () => { press('?', { shiftKey: true, isComposing: true }); press('k', { ctrlKey: true, isComposing: true }); expect(open()).toBe(null); });

test('Ctrl+Alt+K and Ctrl+Alt+/ aren’t the app’s', () => { expect(press('k', { ctrlKey: true, altKey: true })).toBe(true); expect(press('/', { ctrlKey: true, altKey: true })).toBe(true); expect(open()).toBe(null); });

test('one overlay at a time: Ctrl+K swaps the shortcuts for the palette', () => { press('?', { shiftKey: true }); press('k', { ctrlKey: true }); expect(open()).toBe('palette'); });

test('and Ctrl+/ swaps the palette for the shortcuts', () => { press('k', { ctrlKey: true }); press('/', { ctrlKey: true }); expect(open()).toBe('shortcuts'); });

test('with another dialog or a menu open, the app’s keys open nothing', () => {
  render(<Dialog open><DialogContent><DialogTitle>Import a document</DialogTitle><DialogDescription>x</DialogDescription></DialogContent></Dialog>);
  expect(press('k', { ctrlKey: true })).toBe(false); press('?', { shiftKey: true }); press('/', { ctrlKey: true }); expect(open()).toBe(null);
});

test.each([
  ['a menu', <div role="menu" aria-label="Options" />],
  ['an alert dialog', <div role="alertdialog" aria-label="Delete?" />],
  ['the / menu', <div role="listbox" aria-label="Insert" />],
])('%s open counts as well', (_what, el) => {
  render(el);
  expect(otherModalOpen()).toBe(true);
  expect(press('k', { ctrlKey: true })).toBe(false); press('?', { shiftKey: true }); press('/', { ctrlKey: true }); expect(open()).toBe(null);
});

test('a sheet beside the page, a dialog left in a hidden stage, and the app’s own overlays don’t count', () => {
  render(<>
    <div role="dialog" aria-modal="false" aria-label="Style" />
    <div data-stage="style" hidden><div role="dialog" aria-label="Handwriting" /><div role="menu" aria-label="Options" /></div>
    <div role="dialog" data-overlay="shortcuts" aria-label="Keyboard shortcuts"><div role="listbox" aria-label="Results" /></div>
  </>);
  expect(otherModalOpen()).toBe(false);
  press('k', { ctrlKey: true }); expect(open()).toBe('palette');
});

test('a key something else already took is left alone', () => {
  const take = (e: Event) => e.preventDefault();
  const btn = screen.getByRole('button', { name: 'Plain' });
  btn.addEventListener('keydown', take);
  for (const [key, o] of [['k', { ctrlKey: true }], ['?', { shiftKey: true }], ['/', { ctrlKey: true }]] as const) { press(key, o); expect(open()).toBe(null); }
  btn.removeEventListener('keydown', take);
});

test('on an Apple keyboard ⌘ is the modifier', () => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true }); // (deleted again in afterEach)
  press('k', { ctrlKey: true }); expect(open()).toBe(null); press('k', { metaKey: true }); expect(open()).toBe('palette');
  press('/', { ctrlKey: true }); expect(open()).toBe('palette'); press('/', { metaKey: true }); expect(open()).toBe('shortcuts');
});
