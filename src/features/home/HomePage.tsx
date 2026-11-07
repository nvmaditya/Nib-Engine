import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { MEMORY_ID, navigate } from '@/app/route';
import { Button } from '@/components/ui/button';
import { loadUploadedFonts } from '@/features/style/fonts';
import { listDocs, type DocRecord } from '@/store/documents';
import { closeDocument, useEditor } from '@/store/editor';
import { cn } from '@/lib/utils';
import { createAndOpen, importIntoNewDoc, openImportPicker } from './actions';
import { RecentList } from './RecentList';

export function HomePage() {
  const [docs, setDocs] = useState<DocRecord[] | 'unreadable' | null>(null);
  const [over, setOver] = useState(false);
  const memory = useEditor(s => s.docId === MEMORY_ID);
  const memTitle = useEditor(s => s.title);
  const memDoc = useEditor(s => s.doc);
  const memS = useEditor(s => s.S);
  // Reading a document cleans it, which drops a hand this page doesn't know, and a rename or duplicate
  // would write that loss. Another tab may have added one since this page started, so register it first.
  const reload = useCallback(async () => {
    await loadUploadedFonts();
    try { setDocs(await listDocs()); } catch { setDocs('unreadable'); }
  }, []);
  useEffect(() => {
    if (memory) return;
    // Leave the document (its last edit is written first), so opening it again reads what Home changed.
    void closeDocument().then(reload);
  }, [reload, memory]);
  const shown = memory
    ? [{ id: MEMORY_ID, title: memTitle, createdAt: 0, updatedAt: Date.now(), settings: memS, doc: memDoc }]
    : docs;

  // A file dropped anywhere on Home starts a new document with the import dialog open.
  const depth = useRef(0);
  useEffect(() => {
    const hasFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => { if (hasFile(e)) { depth.current++; setOver(true); } };
    const leave = (e: DragEvent) => { if (hasFile(e) && --depth.current <= 0) { depth.current = 0; setOver(false); } };
    const dover = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault(); depth.current = 0; setOver(false);
      const f = e.dataTransfer?.files[0];
      if (f) void importIntoNewDoc(f);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', dover); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', dover); window.removeEventListener('drop', drop); };
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-bg">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
        <button
          type="button"
          onClick={openImportPicker}
          className={cn('flex flex-col items-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            over ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface hover:bg-surface-2')}
        >
          <FileUp className="mb-1 size-6 text-primary" aria-hidden />
          <span className="font-semibold">Import a PDF, Word or text file</span>
          <span className="text-sm text-muted">or drop it anywhere</span>
        </button>

        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 text-sm font-semibold text-muted">Recent</h2>
          {shown === null ? null : shown === 'unreadable' ? (
            <p className="rounded-xl border border-line bg-surface p-6 text-muted">Nib can’t read your documents on this device right now.</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-6">
              <p className="text-muted">No documents yet.</p>
              <Button onClick={() => { void createAndOpen(); }}>New document</Button>
            </div>
          ) : (
            <RecentList docs={shown} readOnly={memory} onChange={reload} />
          )}
        </section>

        <p className="text-sm text-muted">Everything is saved on this device. Nothing is uploaded.</p>
      </div>

    </main>
  );
}
