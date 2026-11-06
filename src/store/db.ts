import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'nib';

let dbPromise: Promise<IDBPDatabase> | null = null;

/** One shared connection. A failed open is forgotten so the next call can try again. */
export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    let p: Promise<IDBPDatabase>;
    try {
      p = openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
        },
      });
    } catch (e) {
      return Promise.reject(e);
    }
    dbPromise = p;
    p.catch(() => { if (dbPromise === p) dbPromise = null; });
  }
  return dbPromise;
}

/** Test-only: drop the memoised connection (call after swapping globalThis.indexedDB). */
export async function resetDbForTests(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) { try { (await p).close(); } catch { /* the open had failed */ } }
}
