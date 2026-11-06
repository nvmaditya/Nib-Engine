import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'nib';

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * One shared connection. A failed open is forgotten so the next call can try again, and so is a
 * connection the browser closes, one another tab's newer version needs closed, or an open that
 * another tab is holding up.
 */
export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    let p: Promise<IDBPDatabase>;
    const forget = () => { if (dbPromise === p) dbPromise = null; };
    try {
      p = openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
        },
        blocked: forget, // an older version is still open in another tab; the next call asks again
        blocking: () => { forget(); void p.then(db => db.close()); }, // let the other tab's upgrade go ahead
        terminated: forget, // the browser closed it (storage cleared, the disk went away)
      });
    } catch (e) {
      return Promise.reject(e);
    }
    dbPromise = p;
    p.catch(forget);
  }
  return dbPromise;
}

/** Drop the shared connection (after a failed write) so the next call opens a fresh one. */
export function forgetDb(): void {
  const p = dbPromise;
  dbPromise = null;
  p?.then(db => db.close(), () => {});
}

/** Test-only: drop the memoised connection (call after swapping globalThis.indexedDB). */
export async function resetDbForTests(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) { try { (await p).close(); } catch { /* the open had failed */ } }
}
