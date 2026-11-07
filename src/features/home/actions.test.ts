// New document: one press makes one document, however fast it is pressed again.
import { getDb } from '@/store/db';
import { listDocs } from '@/store/documents';
import { useEditor } from '@/store/editor';
import { createAndOpen } from './actions';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

beforeEach(async () => { await (await getDb()).clear('documents'); location.hash = '#/'; });

test('New document pressed again before the first has opened makes one document', async () => {
  await Promise.all([createAndOpen(), createAndOpen(), createAndOpen()]); // a double click, or Enter pressed twice
  const docs = await listDocs();
  expect(docs.map(d => d.title)).toEqual(['Untitled']);
  expect(useEditor.getState().docId).toBe(docs[0].id);
  expect(location.hash).toBe(`#/d/${docs[0].id}/write`);
});

test('once it has opened, New document makes another', async () => {
  await createAndOpen();
  await createAndOpen();
  expect(await listDocs()).toHaveLength(2);
});

test('two different New document requests close together each make their document (a press of each, twice)', async () => {
  const essay = { title: 'Essay' }, letter = { title: 'Letter' }; // two templates, say
  await Promise.all([createAndOpen(essay), createAndOpen(letter), createAndOpen(essay), createAndOpen({ title: 'Letter' })]);
  expect((await listDocs()).map(d => d.title).sort()).toEqual(['Essay', 'Letter']);
});
