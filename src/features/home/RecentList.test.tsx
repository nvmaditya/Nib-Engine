import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast as sonner } from 'sonner';
import { cleanSettings } from '@/engine/doc.js';
import { NewerDocumentError, renameDoc } from '@/store/documents';
import { SAVE_NEWER, setReloader } from '@/store/editor';
import { RecentList } from './RecentList';

const renders = vi.hoisted(() => ({ n: {} as Record<string, number> }));
vi.mock('./PageThumb', () => ({ PageThumb: ({ owner }: { owner: string }) => { renders.n[owner] = (renders.n[owner] ?? 0) + 1; return null; } }));
vi.mock('@/store/documents', () => ({
  NewerDocumentError: class NewerDocumentError extends Error {}, MissingDocumentError: class MissingDocumentError extends Error {},
  deleteDoc: vi.fn(), duplicateDoc: vi.fn(), putDoc: vi.fn(), renameDoc: vi.fn(),
  getPref: vi.fn(async () => undefined), setPref: vi.fn(async () => {}),
}));

const mk = (id: string, title: string) => ({ id, title, createdAt: 1, updatedAt: 1, settings: cleanSettings(null, false), doc: { pageCount: 1, boxes: [], fileName: '' } });

test('typing in Rename doesn’t redraw the rows', async () => {
  const docs = [mk('a1', 'A'), mk('b2', 'B')];
  render(<RecentList docs={docs} readOnly={false} onChange={async () => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'More for A' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const field = within(await screen.findByRole('dialog')).getByRole('textbox', { name: 'Document name' });
  const before = { ...renders.n };
  await userEvent.type(field, 'xyz');
  expect(renders.n).toEqual(before);
});

test('a rename of a document a newer Nib saved offers Reload, which goes to the new version', async () => {
  const reloader = vi.fn();
  setReloader(reloader); // (src/app/updates.ts puts its own in place, which applies a waiting new version first)
  vi.mocked(renameDoc).mockRejectedValueOnce(new NewerDocumentError());
  render(<><RecentList docs={[mk('a1', 'A')]} readOnly={false} onChange={async () => {}} /><Toaster /></>);
  await userEvent.click(screen.getByRole('button', { name: 'More for A' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rename' }));
  const msg = (await screen.findByText(SAVE_NEWER)).closest<HTMLElement>('[data-sonner-toast]')!;
  fireEvent.click(within(msg).getByRole('button', { name: 'Reload' }));
  expect(reloader).toHaveBeenCalledTimes(1);
  setReloader(() => location.reload());
  act(() => { for (const t of sonner.getToasts()) sonner.dismiss(t.id); });
});
