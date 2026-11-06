import { cleanSettings, loadSaved, sampleDoc } from '@/engine/doc.js';
import { KEY, OLD_KEY } from '@/engine/config.js';
import type { IDBPTransaction } from 'idb';
import { getDb } from './db';
import { newId, titleFromDoc, type DocRecord } from './documents';

function hasLonghandWork(): boolean {
  try { return localStorage.getItem(KEY) !== null || localStorage.getItem(OLD_KEY) !== null; } catch { return false; }
}

/** Once per device: bring over Longhand work, or seed the example document. */
export async function bootstrapDocuments(): Promise<{ ok: boolean }> {
  let tx: IDBPTransaction<unknown, ['prefs', 'documents'], 'readwrite'> | undefined;
  try {
    const db = await getDb();
    tx = db.transaction(['prefs', 'documents'], 'readwrite');
    tx.done.catch(() => {}); // an abort must not surface as an unhandled rejection
    const prefs = tx.objectStore('prefs');
    if (await prefs.get('bootstrapped')) { await tx.done; return { ok: true }; }
    const now = Date.now();
    let rec: DocRecord;
    if (hasLonghandWork()) {
      const { S, doc } = loadSaved();
      rec = { id: newId(), title: titleFromDoc(doc), createdAt: now, updatedAt: now, settings: S, doc };
    } else {
      const S = cleanSettings(null, false);
      rec = { id: newId(), title: 'The Water Cycle', createdAt: now, updatedAt: now, settings: S, doc: sampleDoc(S) };
    }
    const copy = structuredClone(rec); // everything that can throw happens before the first write
    await prefs.put(true, 'bootstrapped');
    await tx.objectStore('documents').put(copy);
    await tx.done;
    return { ok: true };
  } catch {
    try { tx?.abort(); } catch { /* already finished */ }
    return { ok: false };
  }
}
