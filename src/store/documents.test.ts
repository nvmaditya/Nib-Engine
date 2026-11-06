import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { openDB, unwrap } from 'idb';
import { beforeEach, expect, test } from 'vitest';
import { DB_NAME, forgetDb, getDb, resetDbForTests } from './db';
import { SAMPLE_BODY, SAMPLE_HEAD } from '@/engine/config.js';
import { NewerDocumentError, createDoc, deleteDoc, duplicateDoc, getDoc, listDocs, putDoc, titleFromDoc } from './documents';

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

test('documents list newest first', async () => {
  const a = await createDoc({ title: 'A' });
  const b = await createDoc({ title: 'B' });
  await putDoc({ ...a, updatedAt: b.updatedAt + 10 });
  expect((await listDocs()).map(d => d.title)).toEqual(['A', 'B']);
});

test('duplicate copies deeply and names the copy', async () => {
  const a = await createDoc({ title: 'Notes' });
  const c = await duplicateDoc(a.id);
  expect(c.title).toBe('Notes (copy)');
  expect(c.id).not.toBe(a.id);
  c.doc.boxes.push({} as any);
  expect((await getDoc(a.id))!.doc.boxes).toHaveLength(0);
});

test('delete removes it', async () => {
  const a = await createDoc();
  await deleteDoc(a.id);
  expect(await getDoc(a.id)).toBeUndefined();
});

test('title comes from the first # heading', () => {
  expect(titleFromDoc({ pageCount: 1, fileName: '', boxes: [{ text: 'Name: A\n# The **Water** Cycle' } as any] })).toBe('The Water Cycle');
});

test('title falls back to the first line, then Untitled', () => {
  expect(titleFromDoc({ pageCount: 1, fileName: '', boxes: [{ text: '\nHello there' } as any] })).toBe('Hello there');
  expect(titleFromDoc({ pageCount: 1, fileName: '', boxes: [] })).toBe('Untitled');
});

test('a connection the browser closes is replaced by a fresh one', async () => {
  const a = await createDoc({ title: 'A' });
  forceCloseDatabase(unwrap(await getDb()) as unknown as Parameters<typeof forceCloseDatabase>[0]);
  expect((await getDoc(a.id))?.title).toBe('A');
});

test('after a failed write, forgetting the connection lets the next write through', async () => {
  const a = await createDoc({ title: 'A' });
  (await getDb()).close(); // lost without a close event
  await expect(putDoc({ ...a, title: 'B' })).rejects.toThrow();
  forgetDb();
  await putDoc({ ...a, title: 'B' });
  expect((await getDoc(a.id))?.title).toBe('B');
});

test('another tab opening a newer version is not held up by this tab', async () => {
  await createDoc({ title: 'A' });
  let blocked = false;
  const other = await openDB(DB_NAME, 2, { blocked: () => { blocked = true; } });
  expect(blocked).toBe(false);
  other.close();
  // This tab let go of its connection; it can't open the newer version, and says so instead of hanging.
  await expect(listDocs()).rejects.toMatchObject({ name: 'VersionError' });
});

const schemaOf = async (id: string) => ((await (await getDb()).get('documents', id)) as { schema?: number }).schema;

test('documents are written with schema 2', async () => {
  const a = await createDoc();
  expect(await schemaOf(a.id)).toBe(2);
  await putDoc({ ...a, title: 'B' });
  expect(await schemaOf(a.id)).toBe(2);
});

test('a schema-1 record is migrated when read', async () => {
  const a = await createDoc({ title: 'Old' });
  const old = { ...a, doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b2', page: 0, x: 1, y: 1, w: 300, text: SAMPLE_HEAD }, { id: 'b1', page: 0, x: 1, y: 1, w: 300, text: SAMPLE_BODY }] } } as Record<string, unknown>;
  delete old.schema;
  await (await getDb()).put('documents', old);
  expect((await getDoc(a.id))!.doc.boxes.map(b => b.name)).toEqual(['Header', 'Main text']);
  expect((await listDocs())[0].doc.boxes.map(b => b.kind)).toEqual(['header', 'text']);
});

test('a record from a newer Nib is never overwritten', async () => {
  const a = await createDoc({ title: 'New' });
  await (await getDb()).put('documents', { ...a, schema: 3 });
  await expect(putDoc({ ...a, title: 'Old tab' })).rejects.toBeInstanceOf(NewerDocumentError);
  expect((await getDoc(a.id))!.title).toBe('New');
});
