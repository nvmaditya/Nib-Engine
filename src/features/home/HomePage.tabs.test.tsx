// Home with other tabs open on the same device: its list follows what they add, rename, duplicate, save and delete.
// (With the real store: HomePage.test.tsx stands it in with a mock.)
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast as sonner } from 'sonner';
import { getDb } from '@/store/db';
import { createDoc, getDoc } from '@/store/documents';
import { HomePage } from './HomePage';

/** Another tab: its own copy of the store's modules, on the same storage. */
async function anotherTab() {
  vi.resetModules();
  const docs = await import('@/store/documents'), db = await import('@/store/db');
  return { docs, close: () => db.resetDbForTests() };
}

beforeEach(async () => { await (await getDb()).clear('documents'); location.hash = '#/'; });
afterEach(() => { act(() => { sonner.dismiss(); }); });

/** Changes close together are listed together, a second after the first (HomePage). */
const later = { timeout: 3000 };

// (Five changes, most a second after the last: over 4 s of the default 5.)
test('the list follows documents another tab adds, renames, duplicates, saves and deletes', { timeout: 10000 }, async () => {
  const mine = await createDoc({ title: 'Mine' });
  render(<HomePage />);
  await screen.findByText('Mine');
  const other = await anotherTab();
  try {
    const theirs = await other.docs.createDoc({ title: 'Theirs' });
    expect(await screen.findByText('Theirs', {}, later)).toBeInTheDocument();
    await other.docs.renameDoc(theirs.id, 'Theirs, renamed');
    expect(await screen.findByText('Theirs, renamed', {}, later)).toBeInTheDocument();
    await other.docs.duplicateDoc(mine.id);
    expect(await screen.findByText('Mine (copy)', {}, later)).toBeInTheDocument();
    await other.docs.putDoc({ ...(await other.docs.getDoc(mine.id))!, title: 'Mine, renamed in its tab' }, { session: 'their-tab' });
    expect(await screen.findByText('Mine, renamed in its tab', {}, later)).toBeInTheDocument();
    await other.docs.deleteDoc(theirs.id);
    await waitFor(() => expect(screen.queryByText('Theirs, renamed')).toBeNull(), later);
  } finally { await other.close(); }
});

test('a rename on Home keeps what another tab saved since the list was read', async () => {
  const rec = await createDoc({ title: 'Notes' });
  const user = userEvent.setup();
  render(<HomePage />);
  await screen.findByText('Notes');
  const read = (await getDoc(rec.id))!;
  // That tab's save, written straight to storage: this page doesn't hear of it.
  await (await getDb()).put('documents', { ...read, doc: { ...read.doc, fileName: 'typed there' }, rev: 2, savedBy: 'their-tab', schema: 3 });
  await user.click(screen.getByRole('button', { name: 'More for Notes' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const field = await screen.findByRole('textbox', { name: 'Document name' });
  await user.clear(field);
  await user.type(field, 'Essay{Enter}');
  await screen.findByText('Essay');
  const now = (await getDoc(rec.id))!;
  expect([now.title, now.doc.fileName]).toEqual(['Essay', 'typed there']);
});

test('renaming a document another tab just deleted says it isn’t on this device, and doesn’t bring it back', async () => {
  const rec = await createDoc({ title: 'Doomed' });
  const user = userEvent.setup();
  render(<><HomePage /><Toaster /></>);
  await user.click(await screen.findByRole('button', { name: 'More for Doomed' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const dlg = await screen.findByRole('dialog', { name: 'Rename document' });
  await (await getDb()).delete('documents', rec.id); // deleted there, and this page didn't hear of it
  await user.click(within(dlg).getByRole('button', { name: 'Rename' }));
  expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Doomed')).toBeNull());
  expect(await getDoc(rec.id)).toBeUndefined();
});
