import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { MEMORY_ID, navigate } from '@/app/route';
import { Button } from '@/components/ui/button';
import { loadUploadedFonts } from '@/features/style/fonts';
import { listDocs, onDocsChanged, type DocRecord } from '@/store/documents';
import { closeDocument, useEditor } from '@/store/editor';
import { cn } from '@/lib/utils';
import { closeImport, openImport } from '@/features/doc/actions';
import { ImportDialog } from '@/features/import/ImportDialog';
import { openImportPicker } from './actions';
import { RecentList } from './RecentList';
import { TemplateGrid } from './TemplateGrid';
import { openTemplate } from './templates';

export function HomePage() {
  const [docs, setDocs] = useState<DocRecord[] | 'unreadable' | null>(null);
  const [over, setOver] = useState(false);
  const memory = useEditor(s => s.docId === MEMORY_ID);
  const importOpen = useEditor(s => s.importOpen);
  const importFile = useEditor(s => s.importFile);
  const memTitle = useEditor(s => s.title);
  const memDoc = useEditor(s => s.doc);
  const memS = useEditor(s => s.S);
  // Reading a document cleans it, which drops a hand this page doesn't know, and a duplicate would write
  // that loss. Another tab may have added one since this page started, so register it first.
  const reads = useRef(0);
  const reload = useCallback(async () => {
    const n = ++reads.current; // only the latest read is shown
    await loadUploadedFonts();
    let next: DocRecord[] | 'unreadable';
    try { next = await listDocs(); } catch { next = 'unreadable'; }
    if (n === reads.current) setDocs(next);
  }, []);
  useEffect(() => {
    if (memory) return;
    // Leave the document (its last edit is written first), so opening it again reads what Home changed.
    void closeDocument().then(reload);
  }, [reload, memory]);
  // Other tabs add, rename, duplicate, save and delete documents: the list follows them. A tab where someone is
  // typing saves every few hundred ms, so it is read again at most once a second (the first change at once, the
  // rest together a second later), and not while Home is hidden: shown again, it reads what it missed.
  useEffect(() => {
    if (memory) return;
    let timer: ReturnType<typeof setTimeout> | undefined, again = false, missed = false;
    const read = () => {
      void reload();
      timer = setTimeout(() => { timer = undefined; if (again) { again = false; read(); } }, 1000);
    };
    const heard = () => {
      if (document.visibilityState === 'hidden') missed = true;
      else if (timer !== undefined) again = true;
      else read();
    };
    const shownAgain = () => {
      if (document.visibilityState !== 'visible' || !missed) return;
      missed = false;
      heard();
    };
    const off = onDocsChanged(heard);
    document.addEventListener('visibilitychange', shownAgain);
    return () => { off(); clearTimeout(timer); document.removeEventListener('visibilitychange', shownAgain); };
  }, [reload, memory]);
  const shown = memory
    ? [{ id: MEMORY_ID, title: memTitle, createdAt: 0, updatedAt: Date.now(), settings: memS, doc: memDoc }]
    : docs;

  // A file dropped anywhere on Home opens Import with it (nothing is made until Write it out). While the dialog is
  // open it has its own drop zone: entering and leaving do nothing then.
  const depth = useRef(0);
  useEffect(() => {
    const hasFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const dialogOpen = () => useEditor.getState().importOpen;
    const enter = (e: DragEvent) => { if (hasFile(e) && !dialogOpen()) { depth.current++; setOver(true); } };
    const leave = (e: DragEvent) => { if (hasFile(e) && !dialogOpen() && --depth.current <= 0) { depth.current = 0; setOver(false); } };
    const dover = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault(); depth.current = 0; setOver(false);
      const f = e.dataTransfer?.files[0];
      if (f) openImport(f);
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
          <span className="text-lg font-semibold">Import a PDF, Word or text file</span>
          <span className="text-muted">or drop it anywhere</span>
          <span className="text-[13px] text-muted">Headings, lists, bold, underline and crossed-out words come across.</span>
        </button>

        <TemplateGrid />

        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 text-sm font-semibold text-muted">Recent</h2>
          {shown === null ? null : shown === 'unreadable' ? (
            <p className="rounded-xl border border-line bg-surface p-6 text-muted">Nib can’t read your documents on this device right now.</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-6">
              <p className="text-muted">No documents yet.</p>
              <Button onClick={() => { void openTemplate('blank'); }}>New document</Button>
            </div>
          ) : (
            <RecentList docs={shown} readOnly={memory} onChange={reload} />
          )}
        </section>

        <p className="text-sm text-muted">Everything is saved on this device. Nothing is uploaded.</p>
      </div>

      <ImportDialog open={importOpen} file={importFile} target="new" onClose={closeImport} />
      {over && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-[3px] border-dashed border-primary bg-primary/10 text-lg font-semibold text-fg">
          Drop to import this document
        </div>
      )}
    </main>
  );
}
