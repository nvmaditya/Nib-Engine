import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { flushSave, openDocument, update } from '@/store/editor';
import { get, rec } from '@/test/docs';
import { Overlays } from './Overlays';
import { useOverlays } from './overlays';
import { useUndoShortcuts } from './useUndoShortcuts';

vi.mock('@/store/documents', async orig => ({ ...(await orig<typeof import('@/store/documents')>()), putDoc: vi.fn(async () => {}) }));

function Page() {
  useUndoShortcuts();
  return <><button>Plain</button><input aria-label="Field" /><div contentEditable aria-label="Editor"><p>x</p><div contentEditable={false}><button>In a widget</button></div></div></>;
}
const text = () => get().doc.boxes[0].text;
const press = (key: string, o: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key, bubbles: true, ...o });

beforeEach(async () => {
  await flushSave();
  openDocument(rec('A', 'x'));
  update(s => { s.doc.boxes[0].text = 'xy'; }, { history: 'test' });
  useOverlays.setState({ open: null });
  render(<><Overlays /><Page /></>);
});

test('Ctrl+Z and Ctrl+Y on the page undo and redo the document', () => {
  screen.getByRole('button', { name: 'Plain' }).focus();
  expect(press('z', { ctrlKey: true })).toBe(false); expect(text()).toBe('x');
  press('y', { ctrlKey: true }); expect(text()).toBe('xy');
});

test('in a field or an editor they are its own', () => {
  screen.getByRole('textbox', { name: 'Field' }).focus();
  expect(press('z', { ctrlKey: true })).toBe(true); expect(text()).toBe('xy');
  screen.getByLabelText('Editor').focus();
  fireEvent.keyDown(screen.getByText('x'), { key: 'z', ctrlKey: true, bubbles: true }); expect(text()).toBe('xy');
});

test('on a control in an editor’s widget (a page break’s line) they are the document’s, as on the page', () => {
  screen.getByRole('button', { name: 'In a widget' }).focus();
  expect(press('z', { ctrlKey: true })).toBe(false); expect(text()).toBe('x');
});

test('with the shortcut sheet open, they leave the document behind it alone', () => {
  screen.getByRole('button', { name: 'Plain' }).focus();
  press('/', { ctrlKey: true });
  const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
  expect(within(sheet).getByRole('button', { name: 'Close' })).toBe(document.activeElement);
  press('z', { ctrlKey: true }); expect(text()).toBe('xy');
  press('Escape'); press('z', { ctrlKey: true }); expect(text()).toBe('x');
  press('/', { ctrlKey: true });
  press('Z', { ctrlKey: true, shiftKey: true }); press('y', { ctrlKey: true }); expect(text()).toBe('x');
});
