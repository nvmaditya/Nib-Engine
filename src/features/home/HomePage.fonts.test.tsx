// Home reads stored documents, and a document can use a hand another tab added after this page
// started. Home registers such hands before it reads, so its list, a rename and a duplicate keep them.
// (With the real store: HomePage.test.tsx stands it in with a mock.)
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings } from '@/engine/doc.js';
import { FONT_KEY_PREFIX, fontId } from '@/features/style/fonts';
import { getDb } from '@/store/db';
import { createDoc, setPref, type DocRecord } from '@/store/documents';
import { fontFile } from '@/test/fonts';
import { HomePage } from './HomePage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

/** What another tab leaves when it adds a font: the record in storage, and no hand in this page's list. */
async function fontFromAnotherTab(hand: string): Promise<string> {
  const buf = await fontFile(hand, 'Theirs.woff').arrayBuffer(), id = fontId(buf);
  await setPref(FONT_KEY_PREFIX + id, { id, name: 'Theirs', buf, forms: 1, addedAt: Date.now() });
  return id;
}
const stored = async (): Promise<DocRecord[]> => (await (await getDb()).getAll('documents')) as DocRecord[];
const withHand = (title: string, font: string) => createDoc({ title, settings: { ...cleanSettings(null, false), font } });

beforeEach(async () => { await (await getDb()).clear('documents'); location.hash = '#/'; });

test('a rename on Home keeps a hand another tab added', async () => {
  const id = await fontFromAnotherTab('patrick'), rec = await withHand('Theirs', id);
  render(<HomePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'More for Theirs' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const field = await screen.findByRole('textbox', { name: 'Document name' });
  await userEvent.clear(field);
  await userEvent.type(field, 'Mine now{Enter}');
  await screen.findByText('Mine now');
  expect((await stored()).find(d => d.id === rec.id)?.settings.font).toBe(id);
});

test('Duplicate keeps a hand another tab added after the list was read', async () => {
  const buf = await fontFile('zeyada', 'Theirs.woff').arrayBuffer();
  await withHand('Theirs', fontId(buf)); // that tab saves the document as it adds the font…
  render(<HomePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'More for Theirs' }));
  const id = await fontFromAnotherTab('zeyada'); // …and this page read the list in between
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
  await screen.findByText('Theirs (copy)');
  await waitFor(async () => expect((await stored()).find(d => d.title === 'Theirs (copy)')?.settings.font).toBe(id));
});
