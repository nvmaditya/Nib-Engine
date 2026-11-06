import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test, vi } from 'vitest';
import { bootstrapDocuments } from './bootstrap';
import { resetDbForTests } from './db';
import { listDocs } from './documents';

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

test('first run with Longhand work migrates it once', async () => {
  localStorage.setItem('longhand.v2', JSON.stringify({ s: { font: 'caveat' }, doc: { pageCount: 1, boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text: '# Old work' }] } }));
  await Promise.all([bootstrapDocuments(), bootstrapDocuments()]);
  await bootstrapDocuments();
  const docs = await listDocs();
  expect(docs).toHaveLength(1);
  expect(docs[0].title).toBe('Old work');
  expect(docs[0].settings.font).toBe('caveat');
  expect(localStorage.getItem('longhand.v2')).not.toBeNull();
});

test('first run without Longhand work seeds the example', async () => {
  await bootstrapDocuments();
  expect((await listDocs()).map(d => d.title)).toEqual(['The Water Cycle']);
});

test('blocked IndexedDB reports ok:false instead of throwing', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  await expect(bootstrapDocuments()).resolves.toEqual({ ok: false });
});
