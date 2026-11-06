import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { createDoc } from '@/store/documents';
import { App } from '@/app/App';
import { useEditor } from '@/store/editor';

let id = '';
beforeAll(async () => {
  const S = cleanSettings(null, false);
  id = (await createDoc({ title: 'Seeded', settings: S, doc: sampleDoc(S) })).id;
});

test('Write shows the block editor for the selected block', async () => {
  location.hash = `#/d/${id}/write`;
  render(<App />);
  expect(await screen.findByRole('textbox', { name: 'Block contents' })).toBeInTheDocument();
  const panel = screen.getByRole('region', { name: 'Write' });
  expect(within(panel).getByText('Block 2')).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Add block' })).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: /Import/ })).toBeInTheDocument();
  expect(screen.queryByText(/text\sbox/i)).toBeNull(); // the interface says Block
});

test('Outline shows Write until it has its own view', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  expect(await screen.findByRole('textbox', { name: 'Block contents' })).toBeInTheDocument();
});

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

test('Import opens from the Write panel and from a file dropped anywhere on the document', async () => {
  location.hash = `#/d/${id}/write`;
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /Import/ }));
  const dlg = await screen.findByRole('dialog', { name: 'Import a document' });
  await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // jsdom has no DragEvent, so give a plain event the parts the drop handler reads.
  const file = new File(['Dropped words'], 'notes.txt', { type: 'text/plain' });
  const drop = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { types: ['Files'], files: [file] } });
  act(() => { window.dispatchEvent(drop); });
  expect(await screen.findByRole('dialog', { name: 'Import a document' })).toBeInTheDocument();
  expect(await screen.findByDisplayValue('Dropped words')).toBeInTheDocument();
});
