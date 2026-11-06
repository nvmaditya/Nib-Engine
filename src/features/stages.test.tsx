import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { createDoc } from '@/store/documents';
import { App } from '@/app/App';
import { select } from '@/features/doc/actions';
import { placeCaret, useEditor } from '@/store/editor';

let id = '';
beforeAll(async () => {
  const S = cleanSettings(null, false);
  id = (await createDoc({ title: 'Seeded', settings: S, doc: sampleDoc(S) })).id;
});

/** The button in the Stages nav whose label ends with `name` ('1 Write' for Write). */
const stageButton = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Stages' })).getByRole('button', { name: new RegExp(`${name}$`) });
const search = () => screen.findByRole('searchbox', { name: 'Search handwriting' });

test('Style shows the scope switch and hides the removed options', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Whole document' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Only this block' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /New variation/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Gel pen/ })).toBeInTheDocument();
  expect(screen.queryByText('As drawn')).toBeNull();
  expect(screen.queryByText('Fold crease')).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Block contents' })).toBeNull();
});

test('a document with the fold crease on can turn it off, and then the switch goes', async () => {
  const S = cleanSettings({ crease: true }, false);
  const creased = (await createDoc({ title: 'Creased', settings: S, doc: sampleDoc(S) })).id;
  location.hash = `#/d/${creased}/style`;
  render(<App />);
  const crease = await screen.findByRole('switch', { name: 'Fold crease' });
  expect(crease).toBeChecked();
  await userEvent.click(crease);
  await waitFor(() => expect(screen.queryByRole('switch', { name: 'Fold crease' })).toBeNull());
  expect(useEditor.getState().S.crease).toBe(false);
  expect(screen.getByRole('switch', { name: 'Punch holes' })).toBeInTheDocument();
});

test('Export shows the download controls', async () => {
  location.hash = `#/d/${id}/export`;
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download page 1 as PNG' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'File name' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Camera tilt' })).toBeInTheDocument();
});

test('switching stages keeps the Style search', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  await userEvent.type(await search(), 'cav');
  await userEvent.click(stageButton('Write'));
  await userEvent.click(stageButton('Style'));
  expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('cav');
});

test('an inactive stage stays in the page but hidden', async () => {
  location.hash = `#/d/${id}/style`;
  render(<App />);
  await search();
  await userEvent.click(stageButton('Write'));
  expect(await screen.findByRole('textbox', { name: 'Block contents' })).toBeVisible();
  const box = screen.getByRole('searchbox', { name: 'Search handwriting', hidden: true });
  expect(box).not.toBeVisible();
  expect(box.closest('[inert]')).not.toBeNull();
  expect(screen.queryByRole('searchbox', { name: 'Search handwriting' })).toBeNull();
});

test('a caret request goes to the Write view on screen, not to a hidden one', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Block contents' });
  await userEvent.click(stageButton('Style'));
  location.hash = `#/d/${id}/write`;
  await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Block contents', hidden: true })).toHaveLength(2));
  act(() => placeCaret('b1', 5));
  const shown = screen.getByRole('textbox', { name: 'Block contents' }) as HTMLTextAreaElement;
  await waitFor(() => expect(document.activeElement).toBe(shown));
  expect([shown.selectionStart, shown.selectionEnd]).toEqual([5, 5]);
  expect(shown.closest('[data-stage]')).toHaveAttribute('data-stage', 'write');
  expect(useEditor.getState().caret).toBeNull();
});

test('Escape in a rich-text editor doesn’t leave the block', async () => {
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Block contents' });
  act(() => select('b1'));
  const ed = document.createElement('div');
  ed.setAttribute('contenteditable', 'true'); ed.tabIndex = 0;
  document.body.append(ed); ed.focus();
  await userEvent.keyboard('{Escape}');
  expect(useEditor.getState().selectedId).toBe('b1');
  ed.remove();
  await userEvent.keyboard('{Escape}');
  expect(useEditor.getState().selectedId).toBeNull();
});

test('Write goes back to the Write view you used last', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Block contents' });
  await userEvent.click(stageButton('Style'));
  await search();
  await userEvent.click(stageButton('Write'));
  expect(location.hash).toBe(`#/d/${id}/outline`);
});
