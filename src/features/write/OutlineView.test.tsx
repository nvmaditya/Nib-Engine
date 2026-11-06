// The Write stage's Outline view. Until it has its own page list and inspector, it shows the Write panel.
import { render, screen } from '@testing-library/react';
import { cleanSettings, sampleDoc } from '@/engine/doc.js';
import { createDoc } from '@/store/documents';
import { App } from '@/app/App';

let id = '';
beforeAll(async () => {
  const S = cleanSettings(null, false);
  id = (await createDoc({ title: 'Seeded', settings: S, doc: sampleDoc(S) })).id;
});

test('Outline shows Write until it has its own view', async () => {
  location.hash = `#/d/${id}/outline`;
  render(<App />);
  expect(await screen.findByRole('textbox', { name: 'Block contents' })).toBeInTheDocument();
});
