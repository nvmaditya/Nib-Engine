import { cleanDoc, cleanSettings, migrateDoc } from '@/engine/doc.js';
import type { EngineDoc, Settings } from '@/engine/types';
import { getDb } from './db';

export interface DocRecord {
  id: string; title: string; createdAt: number; updatedAt: number; settings: Settings; doc: EngineDoc;
  /**
   * 3 since documents carry a revision; 2 from Nib's Write milestone; records without it are Longhand-era (1).
   * A Nib that writes 2 doesn't keep the revision, so it must not overwrite a 3 (it refuses newer records).
   */
  schema?: number;
  /** Bumps on every write (records without it are 0). A write is refused if storage moved on since its copy was read. */
  rev?: number;
}

/**
 * As stored: also the editing session that wrote it last, so that session's next save isn't stopped by its own
 * writes. Reads never give it out: a copy read and written back can't pass for that session.
 */
type StoredDoc = DocRecord & { savedBy?: string };

export const DOC_SCHEMA = 3;

/** A record in storage was written by a newer Nib; this older copy must not overwrite it. */
export class NewerDocumentError extends Error {
  constructor() { super('This document was saved by a newer version of Nib.'); this.name = 'NewerDocumentError'; }
}

/** Another tab saved the document after this copy was read; writing the copy would lose that change. */
export class StaleDocumentError extends Error {
  constructor() { super('This document was changed in another tab.'); this.name = 'StaleDocumentError'; }
}

/** The document isn't stored any more (deleted in another tab); a save must not bring it back. */
export class MissingDocumentError extends Error {
  constructor() { super('This document isn’t on this device.'); this.name = 'MissingDocumentError'; }
}

export const newId = (): string => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);

const emptyDoc = (): EngineDoc => ({ pageCount: 1, boxes: [], fileName: '' });
const revOf = (r: { rev?: unknown }): number => (typeof r.rev === 'number' && Number.isInteger(r.rev) && r.rev >= 0 ? r.rev : 0);

function clean({ savedBy: _, ...rec }: StoredDoc): DocRecord {
  return {
    ...rec, rev: revOf(rec),
    settings: cleanSettings(rec.settings, false), doc: migrateDoc(cleanDoc(rec.doc) ?? emptyDoc(), rec.schema ?? 1),
  };
}

// ---- Other tabs hear of every write, so they can follow it (the revision check is the guarantee when one is missed). ----

/** A change to the stored documents, as another tab hears of it. `by` is the editing session that saved it, if any. */
export type DocChange =
  | { type: 'added'; id: string }
  | { type: 'saved'; id: string; rev: number; by?: string }
  | { type: 'deleted'; id: string };

const CHANNEL = 'nib-documents';
let channel: BroadcastChannel | null | undefined;
const listeners = new Set<(c: DocChange) => void>();

function readChange(v: unknown): DocChange | null {
  const c = v as Partial<{ type: unknown; id: unknown; rev: unknown; by: unknown }> | null;
  if (!c || typeof c !== 'object' || typeof c.id !== 'string') return null;
  if (c.type === 'added' || c.type === 'deleted') return { type: c.type, id: c.id };
  if (c.type === 'saved' && typeof c.rev === 'number') return { type: 'saved', id: c.id, rev: c.rev, ...(typeof c.by === 'string' && { by: c.by }) };
  return null;
}

/** One channel per page: it carries this page's news to the others, and theirs here (never its own back). */
function channelOf(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }
  if (channel) {
    channel.onmessage = e => { const c = readChange(e.data); if (c) for (const fn of [...listeners]) fn(c); };
    (channel as unknown as { unref?: () => void }).unref?.(); // (tests run under Node, where an open channel would keep it running)
  }
  return channel;
}

function announce(c: DocChange): void {
  try { channelOf()?.postMessage(c); } catch { /* the other tabs find out when they save */ }
}

/** Hear of documents added, saved, renamed or deleted in other tabs. Returns the remover. */
export function onDocsChanged(fn: (c: DocChange) => void): () => void {
  channelOf();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---- Reading and writing ----

export async function listDocs(): Promise<DocRecord[]> {
  const all = (await (await getDb()).getAll('documents')) as StoredDoc[];
  return all.map(clean).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const rec = (await (await getDb()).get('documents', id)) as StoredDoc | undefined;
  return rec && clean(rec);
}

/**
 * Change the stored copy of a document in one transaction. `change` gets the stored record and returns the one
 * to write (its revision is set here), or throws to write nothing. Resolves with the revision written.
 */
async function rewrite(id: string, change: (stored: StoredDoc) => StoredDoc): Promise<number> {
  const tx = (await getDb()).transaction('documents', 'readwrite');
  tx.done.catch(() => {}); // an abort is reported through the rejection below
  const store = tx.objectStore('documents');
  const stored = (await store.get(id)) as StoredDoc | undefined;
  let next: StoredDoc;
  try {
    if (!stored) throw new MissingDocumentError();
    if ((stored.schema ?? 1) > DOC_SCHEMA) throw new NewerDocumentError();
    next = { ...change(stored), rev: revOf(stored) + 1 };
  } catch (e) {
    tx.abort();
    throw e;
  }
  await store.put(next);
  await tx.done;
  return next.rev!;
}

/**
 * Save `rec` over the stored document, only if storage hasn't moved on since `rec` was read: the stored revision is
 * still `rec.rev`, or the last write was this editing session's own. Otherwise nothing is written:
 * StaleDocumentError (another tab saved since), MissingDocumentError (it was deleted: a save never brings it back),
 * NewerDocumentError (a newer Nib wrote it). Resolves with the revision written.
 *
 * `session`: the editing session saving (only the editor's save gives one). It is given apart from the record, so a
 * copy that was read and written back never counts as that session's own write.
 */
export async function putDoc(rec: DocRecord, o: { session?: string } = {}): Promise<number> {
  const { savedBy: _, ...copy } = structuredClone(rec as StoredDoc);
  const { session } = o;
  const rev = await rewrite(rec.id, stored => {
    const own = session !== undefined && stored.savedBy === session;
    if (!own && revOf(stored) !== revOf(rec)) throw new StaleDocumentError();
    return { ...copy, schema: DOC_SCHEMA, savedBy: session };
  });
  announce({ type: 'saved', id: rec.id, rev, ...(session !== undefined && { by: session }) });
  return rev;
}

/**
 * Home's Rename: only the name changes, on the stored copy as it is now, so nothing another tab saved is lost and
 * nothing is cleaned. A Longhand-era record keeps its schema, so it is still migrated when read.
 */
export async function renameDoc(id: string, title: string): Promise<void> {
  const rev = await rewrite(id, stored => ({
    ...stored, title, updatedAt: Date.now(), savedBy: undefined,
    schema: (stored.schema ?? 1) >= 2 ? DOC_SCHEMA : stored.schema,
  }));
  announce({ type: 'saved', id, rev });
}

export async function createDoc(init: { title?: string; settings?: Settings; doc?: EngineDoc } = {}): Promise<DocRecord> {
  const now = Date.now();
  const rec: DocRecord = {
    id: newId(), title: init.title ?? 'Untitled', createdAt: now, updatedAt: now,
    settings: init.settings ?? cleanSettings(null, false), doc: init.doc ?? emptyDoc(), rev: 1,
  };
  const copy = { ...structuredClone(rec), schema: DOC_SCHEMA };
  const tx = (await getDb()).transaction('documents', 'readwrite');
  tx.done.catch(() => {}); // a failed add is reported through the rejection below
  await tx.objectStore('documents').add(copy);
  await tx.done;
  announce({ type: 'added', id: rec.id });
  return rec;
}

export async function duplicateDoc(id: string): Promise<DocRecord> {
  const src = await getDoc(id);
  if (!src) throw new MissingDocumentError();
  return createDoc({ title: `${src.title} (copy)`, settings: structuredClone(src.settings), doc: structuredClone(src.doc) });
}

export async function deleteDoc(id: string): Promise<void> {
  await (await getDb()).delete('documents', id);
  announce({ type: 'deleted', id });
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
