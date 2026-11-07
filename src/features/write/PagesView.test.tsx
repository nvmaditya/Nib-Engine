// The Write stage's Pages view. Until it has typed pages, it shows the Write panel beside the handwritten pages.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { createDoc } from '@/store/documents';
import { App } from '@/app/App';

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
