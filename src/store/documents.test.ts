import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { openDB, unwrap } from 'idb';
import { beforeEach, expect, test, vi } from 'vitest';
import { DB_NAME, forgetDb, getDb, resetDbForTests } from './db';
import { SAMPLE_BODY, SAMPLE_HEAD } from '@/engine/config.js';
import {
  DOC_SCHEMA, MissingDocumentError, NewerDocumentError, StaleDocumentError, createDoc, deleteDoc, duplicateDoc, getDoc, listDocs,
  onDocsChanged, putDoc, renameDoc, titleFromDoc, type DocChange, type DocRecord,
} from './documents';

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

test('documents are written with schema 4', async () => {
  const a = await createDoc();
  expect(await schemaOf(a.id)).toBe(4);
  await putDoc({ ...a, title: 'B' });
  expect(await schemaOf(a.id)).toBe(4);
});

/** A schema-3 record whose header has the fixed-key fields, in storage as the previous version left it. */
async function schema3(): Promise<DocRecord> {
  const a = await createDoc({ title: 'Week 1' });
  const fields = { date: '1 May 2026', roll: '12', name: 'Riya', class: '8' };
  await (await getDb()).put('documents', { ...a, schema: 3, doc: { pageCount: 1, fileName: '', boxes: [{ id: 'h', kind: 'header', text: 'x', fields }] } });
  return a;
}
const RIYA = [
  { id: 'name', label: 'Name', value: 'Riya' }, { id: 'class', label: 'Class', value: '8' }, { id: 'roll', label: 'Roll no.', value: '12' },
  { id: 'date', label: 'Date', value: '1 May 2026', today: true },
];

test('a schema-3 record’s header is read as a list in the old order, and written back as schema 4', async () => {
  const a = await schema3();
  const read = (await getDoc(a.id))!;
  expect(read.doc.boxes[0].fields).toEqual(RIYA);
  expect(read.doc.boxes[0].text).toBe('Name: Riya\nClass: 8\nRoll no.: 12\nDate: 1 May 2026');
  await putDoc(read);
  expect(await schemaOf(a.id)).toBe(4);
});

test('Home’s rename stamps 4 on a schema-3 record without cleaning it, and its header still reads as a list', async () => {
  const a = await schema3();
  await renameDoc(a.id, 'Week 2');
  const stored = (await (await getDb()).get('documents', a.id)) as DocRecord & { schema: number };
  expect([stored.schema, stored.title, stored.doc.boxes[0].fields]).toEqual([4, 'Week 2', { date: '1 May 2026', roll: '12', name: 'Riya', class: '8' }]);
  expect((await getDoc(a.id))!.doc.boxes[0].fields).toEqual(RIYA);
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
  await (await getDb()).put('documents', { ...a, schema: DOC_SCHEMA + 1 });
  await expect(putDoc({ ...a, title: 'Old tab' })).rejects.toBeInstanceOf(NewerDocumentError);
  await expect(renameDoc(a.id, 'Old tab')).rejects.toBeInstanceOf(NewerDocumentError);
  expect((await getDoc(a.id))!.title).toBe('New');
});

// ---- Two tabs. Each write bumps the stored revision; a copy read before another tab's write can't overwrite it. ----

test('a save from a copy read before another write is refused, and the other write stays', async () => {
  const a = await createDoc({ title: 'Notes' });
  const mine = (await getDoc(a.id))!, theirs = (await getDoc(a.id))!;
  await putDoc({ ...theirs, title: 'Renamed there' }, { session: 'tab-a' });
  await expect(putDoc({ ...mine, doc: { ...mine.doc, fileName: 'typed here' } }, { session: 'tab-b' })).rejects.toBeInstanceOf(StaleDocumentError);
  const now = (await getDoc(a.id))!;
  expect([now.title, now.doc.fileName]).toEqual(['Renamed there', '']);
});

test('an editing session saves again and again over its own writes', async () => {
  const a = await createDoc({ title: 'Notes' });
  const read = (await getDoc(a.id))!;
  await putDoc({ ...read, title: 'One' }, { session: 'tab-a' });
  await putDoc({ ...read, title: 'Two' }, { session: 'tab-a' }); // still the revision it read: the last write was its own
  expect((await getDoc(a.id))!.title).toBe('Two');
  // Without a session, only the revision it read counts.
  await expect(putDoc({ ...read, title: 'Three' })).rejects.toBeInstanceOf(StaleDocumentError);
  expect((await getDoc(a.id))!.title).toBe('Two');
});

test('a copy read with getDoc or listDocs can’t pass for the tab that saved it last: written back after that tab saves again, it is refused', async () => {
  const a = await createDoc({ title: 'Notes' });
  const db = await getDb();
  const stored = await db.get('documents', a.id);
  await db.put('documents', { ...stored, title: 'Typed in a tab', rev: 2, savedBy: 'their-tab' }); // that tab's save
  const read = (await getDoc(a.id))!, listed = (await listDocs())[0];
  await db.put('documents', { ...stored, title: 'Typed again there', rev: 3, savedBy: 'their-tab' }); // and its next one
  await expect(putDoc({ ...read, title: 'Written by a helper' })).rejects.toBeInstanceOf(StaleDocumentError);
  await expect(putDoc({ ...listed, title: 'Written from the list' })).rejects.toBeInstanceOf(StaleDocumentError);
  // Only the session given apart from the record counts, not one written into it.
  await expect(putDoc({ ...read, title: 'Claims the session', savedBy: 'their-tab' } as DocRecord)).rejects.toBeInstanceOf(StaleDocumentError);
  expect((await getDoc(a.id))!.title).toBe('Typed again there');
  expect(read).not.toHaveProperty('savedBy');
  expect(listed).not.toHaveProperty('savedBy');
});

test('a record an earlier Nib wrote (no revision) isn’t overwritten by a copy read before that Nib saved it again', async () => {
  const a = await createDoc({ title: 'Notes' });
  const db = await getDb();
  const { rev: _r, savedBy: _s, ...asLeft } = await db.get('documents', a.id);
  await db.put('documents', { ...asLeft, schema: 2, updatedAt: 1000 }); // as the earlier Nib left it, before a deploy
  const read = (await getDoc(a.id))!;
  expect([read.rev, read.updatedAt]).toEqual([0, 1000]);
  await db.put('documents', { ...asLeft, schema: 2, title: 'Typed in the old tab', updatedAt: 2000 }); // its tab saves again
  await expect(putDoc({ ...read, title: 'Written back' })).rejects.toBeInstanceOf(StaleDocumentError);
  await expect(putDoc({ ...read, title: 'Typed in the new tab', updatedAt: 3000 }, { readAt: 1000, session: 'tab-n' })).rejects.toBeInstanceOf(StaleDocumentError);
  expect((await getDoc(a.id))!.title).toBe('Typed in the old tab');
  // Read again, it can be written: from then on it has a revision, and the earlier Nib can't overwrite it.
  const now = (await getDoc(a.id))!;
  await putDoc({ ...now, title: 'Typed in the new tab', updatedAt: 3000 }, { readAt: now.updatedAt, session: 'tab-n' });
  expect(await db.get('documents', a.id)).toMatchObject({ title: 'Typed in the new tab', rev: 1, schema: DOC_SCHEMA });
});

test('each write bumps the revision a read gives', async () => {
  const a = await createDoc();
  expect((await getDoc(a.id))!.rev).toBe(1);
  await putDoc({ ...(await getDoc(a.id))!, title: 'B' });
  await renameDoc(a.id, 'C');
  expect((await getDoc(a.id))!.rev).toBe(3);
  expect((await listDocs())[0].rev).toBe(3);
});

test('a save never brings back a document deleted in another tab', async () => {
  const a = await createDoc({ title: 'Doomed' });
  const read = (await getDoc(a.id))!;
  await deleteDoc(a.id);
  await expect(putDoc({ ...read, title: 'Typed after' })).rejects.toBeInstanceOf(MissingDocumentError);
  await expect(renameDoc(a.id, 'Renamed after')).rejects.toBeInstanceOf(MissingDocumentError);
  await expect(duplicateDoc(a.id)).rejects.toBeInstanceOf(MissingDocumentError);
  expect(await listDocs()).toEqual([]);
});

test('Home’s rename changes only the name, on the stored copy as it is now', async () => {
  const a = await createDoc({ title: 'Notes' });
  const listed = (await listDocs())[0];
  await putDoc({ ...(await getDoc(a.id))!, doc: { ...listed.doc, fileName: 'typed in a tab' } }, { session: 'tab-a' });
  await renameDoc(listed.id, 'Essay');
  const now = (await getDoc(a.id))!;
  expect([now.title, now.doc.fileName]).toEqual(['Essay', 'typed in a tab']);
  // The tab's next save is refused: the name was changed by someone else.
  await expect(putDoc({ ...now, rev: 2 }, { session: 'tab-a' })).rejects.toBeInstanceOf(StaleDocumentError);
});

test('Home’s rename keeps a Longhand-era record unmigrated, so it is still migrated when read', async () => {
  const a = await createDoc({ title: 'Old' });
  const old = { ...a, doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b2', page: 0, x: 1, y: 1, w: 300, text: SAMPLE_HEAD }, { id: 'b1', page: 0, x: 1, y: 1, w: 300, text: SAMPLE_BODY }] } } as Record<string, unknown>;
  delete old.schema;
  await (await getDb()).put('documents', old);
  await renameDoc(a.id, 'Renamed');
  expect(await schemaOf(a.id)).toBeUndefined();
  expect((await getDoc(a.id))!.doc.boxes.map(b => b.name)).toEqual(['Header', 'Main text']);
});

test('other tabs hear of new documents, saves, renames and deletes; this tab doesn’t hear its own', async () => {
  vi.resetModules();
  const other = await import('./documents'); // another tab: its own copy of the module, the same storage
  const heard: DocChange[] = [], ownEars: DocChange[] = [];
  const off = onDocsChanged(c => heard.push(c));
  const offOwn = other.onDocsChanged(c => ownEars.push(c));
  const a = await other.createDoc({ title: 'A' });
  await other.putDoc({ ...a, title: 'B' }, { session: 'tab-a' });
  await other.renameDoc(a.id, 'C');
  await other.deleteDoc(a.id);
  await vi.waitFor(() => expect(heard).toHaveLength(4));
  expect(heard).toEqual([
    { type: 'added', id: a.id },
    { type: 'saved', id: a.id, rev: 2, by: 'tab-a' },
    { type: 'saved', id: a.id, rev: 3 },
    { type: 'deleted', id: a.id },
  ]);
  expect(ownEars).toEqual([]);
  off(); offOwn();
  await (await import('./db')).resetDbForTests(); // the other tab's connection
});

test('a channel the browser closed (a tab that slept) is replaced: the others hear that tab’s next save, and it hears theirs again', async () => {
  const heardHere: DocChange[] = [], heardThere: DocChange[] = [];
  const off = onDocsChanged(c => heardHere.push(c)); // this tab, awake (its channel is made before the spy below)
  const made: BroadcastChannel[] = [];
  const Real = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class extends Real { constructor(name: string) { super(name); made.push(this); } };
  vi.resetModules();
  const sleeper = await import('./documents');
  const offThere = sleeper.onDocsChanged(c => heardThere.push(c));
  globalThis.BroadcastChannel = Real;
  try {
    const a = await createDoc({ title: 'A' });
    expect(made).toHaveLength(1);
    made[0].close(); // the sleeping tab's channel
    await sleeper.putDoc({ ...(await sleeper.getDoc(a.id))!, title: 'B' });
    await vi.waitFor(() => expect(heardHere).toContainEqual({ type: 'saved', id: a.id, rev: 2 }));
    await renameDoc(a.id, 'C');
    await vi.waitFor(() => expect(heardThere).toContainEqual({ type: 'saved', id: a.id, rev: 3 }));
  } finally {
    off(); offThere();
    await (await import('./db')).resetDbForTests(); // the sleeping tab's connection
  }
});
