import { navigate } from '@/app/route';
import { createDoc, type DocRecord } from '@/store/documents';
import { openDocument, toast, update } from '@/store/editor';

async function open(rec: DocRecord): Promise<void> {
  openDocument(rec);
  navigate({ name: 'doc', id: rec.id, stage: 'write' });
}

const CANT_CREATE = 'Nib can’t create documents on this device right now.';

async function create(): Promise<DocRecord | null> {
  try { return await createDoc({ title: 'Untitled' }); } catch { toast(CANT_CREATE); return null; }
}

let creating: Promise<void> | null = null;

/**
 * New document. Pressed again before the first one has opened (a double click, Enter pressed twice), it is the
 * same press: the button stays on screen until the new document opens, and one press makes one document.
 */
export function createAndOpen(): Promise<void> {
  creating ??= (async () => {
    try { const rec = await create(); if (rec) await open(rec); } finally { creating = null; }
  })();
  return creating;
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
