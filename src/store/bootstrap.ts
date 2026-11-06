import { cleanSettings, loadSaved, sampleDoc } from '@/engine/doc.js';
import { KEY, OLD_KEY } from '@/engine/config.js';
import { getDb } from './db';
import { newId, titleFromDoc, type DocRecord } from './documents';

function hasLonghandWork(): boolean {
  try { return localStorage.getItem(KEY) !== null || localStorage.getItem(OLD_KEY) !== null; } catch { return false; }
}

/** Once per device: bring over Longhand work, or seed the example document. */
export async function bootstrapDocuments(): Promise<{ ok: boolean }> {
  try {
    const db = await getDb();
    const tx = db.transaction(['prefs', 'documents'], 'readwrite');
    if (await tx.objectStore('prefs').get('bootstrapped')) { await tx.done; return { ok: true }; }
    await tx.objectStore('prefs').put(true, 'bootstrapped');
    const now = Date.now();
    let rec: DocRecord;
    if (hasLonghandWork()) {
      const { S, doc } = loadSaved();
      rec = { id: newId(), title: titleFromDoc(doc), createdAt: now, updatedAt: now, settings: S, doc };
    } else {
      const S = cleanSettings(null, false);
      rec = { id: newId(), title: 'The Water Cycle', createdAt: now, updatedAt: now, settings: S, doc: sampleDoc(S) };
    }
    await tx.objectStore('documents').put(structuredClone(rec));
    await tx.done;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
