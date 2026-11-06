import { cleanDoc, cleanSettings } from '@/engine/doc.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { getDb } from './db';

export interface DocRecord {
  id: string; title: string; createdAt: number; updatedAt: number; settings: Settings; doc: EngineDoc;
}

export const newId = (): string => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);

const emptyDoc = (): EngineDoc => ({ pageCount: 1, boxes: [], fileName: '' });

function clean(rec: DocRecord): DocRecord {
  return { ...rec, settings: cleanSettings(rec.settings, false), doc: cleanDoc(rec.doc) ?? emptyDoc() };
}

export async function listDocs(): Promise<DocRecord[]> {
  const all = (await (await getDb()).getAll('documents')) as DocRecord[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const rec = (await (await getDb()).get('documents', id)) as DocRecord | undefined;
  return rec && clean(rec);
}

export async function putDoc(rec: DocRecord): Promise<void> {
  await (await getDb()).put('documents', structuredClone(rec));
}

export async function createDoc(init: { title?: string; settings?: Settings; doc?: EngineDoc } = {}): Promise<DocRecord> {
  const now = Date.now();
  const rec: DocRecord = {
    id: newId(), title: init.title ?? 'Untitled', createdAt: now, updatedAt: now,
    settings: init.settings ?? cleanSettings(null, false), doc: init.doc ?? emptyDoc(),
  };
  await putDoc(rec);
  return rec;
}

export async function duplicateDoc(id: string): Promise<DocRecord> {
  const src = await getDoc(id);
  if (!src) throw new Error('No such document');
  return createDoc({ title: `${src.title} (copy)`, settings: structuredClone(src.settings), doc: structuredClone(src.doc) });
}

export async function deleteDoc(id: string): Promise<void> {
  await (await getDb()).delete('documents', id);
}

export async function getPref<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get('prefs', key)) as T | undefined;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('prefs', value, key);
}

export async function storageAvailable(): Promise<boolean> {
  try { await getDb(); return true; } catch { return false; }
}

/** The first `# ` heading in any block (markup stripped), else the first non-empty line, else 'Untitled'. */
export function titleFromDoc(doc: EngineDoc): string {
  const strip = (s: string) => s.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  for (const b of doc.boxes) {
    for (const line of b.text.split('\n')) {
      const m = /^#\s+(.*)$/.exec(line);
      if (m && strip(m[1])) return strip(m[1]);
    }
  }
  for (const b of doc.boxes) {
    for (const line of b.text.split('\n')) {
      const t = line.trim();
      if (t) return t.slice(0, 60);
    }
  }
  return 'Untitled';
}
