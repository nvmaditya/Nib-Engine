import { navigate } from '@/app/route';
import { createDoc, type DocRecord } from '@/store/documents';
import { openDocument, toast, update } from '@/store/editor';

async function open(rec: DocRecord): Promise<void> {
  openDocument(rec);
  navigate({ name: 'doc', id: rec.id, stage: 'write' });
}

export const CANT_CREATE = 'Nib can’t create documents on this device right now.';

/** What a new document starts with (createDoc's): the name, the style, the document itself. */
export type NewDocument = NonNullable<Parameters<typeof createDoc>[0]>;

async function create(init: NewDocument = {}): Promise<DocRecord | null> {
  try { return await createDoc({ title: 'Untitled', ...init }); } catch { toast(CANT_CREATE); return null; }
}

/** The New document requests still making their document, by what they start with. */
const creating = new Map<string, Promise<boolean>>();

/**
 * Make a document of what is given (an Untitled blank one by default) and open it on Write. False, having said so,
 * when it can't be made. Pressed again before the first one has opened (a double click, Enter pressed twice), it is
 * the same press: one press makes one document. A request for a different start (another template) is a press of
 * its own, so it isn't lost.
 */
export function createAndOpen(init: NewDocument = {}): Promise<boolean> {
  const key = JSON.stringify(init);
  let made = creating.get(key);
  if (!made) {
    made = (async () => {
      try { const rec = await create(init); if (!rec) return false; await open(rec); return true; } finally { creating.delete(key); }
    })();
    creating.set(key, made);
  }
  return made;
}

/** A new document, opened on Write, with the import dialog already showing this file. */
export async function importIntoNewDoc(file: File): Promise<void> {
  const rec = await create();
  if (!rec) return;
  await open(rec);
  update(s => { s.importOpen = true; s.importFile = file; }, { save: false, layout: false });
}

export function openImportPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.docx,.txt,.md,application/pdf,text/plain';
  input.onchange = () => { const f = input.files?.[0]; if (f) void importIntoNewDoc(f); };
  input.click();
}
