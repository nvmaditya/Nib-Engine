import { navigate } from '@/app/route';
import { createDoc, type DocRecord } from '@/store/documents';
import { openDocument, update } from '@/store/editor';

async function open(rec: DocRecord): Promise<void> {
  openDocument(rec);
  navigate({ name: 'doc', id: rec.id, stage: 'write' });
}

export async function createAndOpen(): Promise<void> {
  await open(await createDoc({ title: 'Untitled' }));
}

/** A new document, opened on Write, with the import dialog already showing this file. */
export async function importIntoNewDoc(file: File): Promise<void> {
  await open(await createDoc({ title: 'Untitled' }));
  update(s => { s.importOpen = true; s.importFile = file; }, { save: false, layout: false });
}

export function openImportPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.docx,.txt,.md,application/pdf,text/plain';
  input.onchange = () => { const f = input.files?.[0]; if (f) void importIntoNewDoc(f); };
  input.click();
}
