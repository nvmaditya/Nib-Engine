import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanSettings } from '@/engine/doc.js';
import { RecentList } from './RecentList';

const renders = vi.hoisted(() => ({ n: {} as Record<string, number> }));
vi.mock('./PageThumb', () => ({ PageThumb: ({ owner }: { owner: string }) => { renders.n[owner] = (renders.n[owner] ?? 0) + 1; return null; } }));
vi.mock('@/store/documents', () => ({
  NewerDocumentError: class NewerDocumentError extends Error {},
  deleteDoc: vi.fn(), duplicateDoc: vi.fn(), putDoc: vi.fn(),
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
