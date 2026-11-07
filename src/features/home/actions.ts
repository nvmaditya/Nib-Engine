import { navigate } from '@/app/route';
import type { EngineDoc, Settings } from '@/engine/types';
import { createDoc, type DocRecord } from '@/store/documents';
import { openDocument, toast, update } from '@/store/editor';

async function open(rec: DocRecord): Promise<void> {
  openDocument(rec);
  navigate({ name: 'doc', id: rec.id, stage: 'write' });
}

export const CANT_CREATE = 'Nib can’t create documents on this device right now.';

async function create(): Promise<DocRecord | null> {
  try { return await createDoc({ title: 'Untitled' }); } catch { toast(CANT_CREATE); return null; }
}

/** Make a document of what is given (an Untitled blank one by default) and open it on Write. False, having said so, when it can't be made. */
export async function createAndOpen(init: { title?: string; settings?: Settings; doc?: EngineDoc } = {}): Promise<boolean> {
  let rec: DocRecord;
  try { rec = await createDoc(init); } catch { toast(CANT_CREATE); return false; }
  await open(rec);
  return true;
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
