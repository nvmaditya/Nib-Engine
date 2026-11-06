import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, MoreHorizontal } from 'lucide-react';
import { MEMORY_ID, navigate } from '@/app/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteDoc, duplicateDoc, listDocs, putDoc, type DocRecord } from '@/store/documents';
import { flushSave, toast, useEditor } from '@/store/editor';
import { cn } from '@/lib/utils';
import { createAndOpen, importIntoNewDoc, openImportPicker } from './actions';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function relativeTime(t: number, now = Date.now()): string {
  const diff = Math.round((dayStart(now) - dayStart(t)) / 86400000);
  if (diff <= 0) return 'Edited today';
  if (diff === 1) return 'Edited yesterday';
  const d = new Date(t);
  return `Edited ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function HomePage() {
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [renaming, setRenaming] = useState<DocRecord | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<DocRecord | null>(null);
  const [over, setOver] = useState(false);
  const memory = useEditor(s => s.docId === MEMORY_ID);
  const memTitle = useEditor(s => s.title);
  const memDoc = useEditor(s => s.doc);
  const reload = useCallback(async () => {
    try {
      await flushSave(); // the document just left may still have an edit waiting to be written
      setDocs(await listDocs());
    } catch { setDocs([]); }
  }, []);
  useEffect(() => { if (!memory) void reload(); }, [reload, memory]);
  const shown: DocRecord[] | null = memory
    ? [{ id: MEMORY_ID, title: memTitle, createdAt: 0, updatedAt: Date.now(), settings: {} as DocRecord['settings'], doc: memDoc }]
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

  const open = (d: DocRecord) => navigate({ name: 'doc', id: d.id, stage: 'write' });
  const doRename = async () => {
    if (!renaming) return;
    await putDoc({ ...renaming, title: name.trim() || 'Untitled', updatedAt: Date.now() });
    setRenaming(null); await reload();
  };
  const doDuplicate = async (d: DocRecord) => { await duplicateDoc(d.id); await reload(); };
  const doDelete = async () => {
    if (!deleting) return;
    await deleteDoc(deleting.id); setDeleting(null); await reload();
  };

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
          {shown === null ? null : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-6">
              <p className="text-muted">No documents yet.</p>
              <Button onClick={() => { void createAndOpen(); }}>New document</Button>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {shown.map(d => (
                <li key={d.id} className="flex items-center gap-2 pr-2 hover:bg-surface-2">
                  <button type="button" onClick={() => open(d)} className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left">
                    <span className="truncate font-semibold">{d.title}</span>
                    <span className="flex flex-none gap-2 text-sm text-muted">
                      <span>{d.doc.pageCount === 1 ? '1 page' : `${d.doc.pageCount} pages`}</span>
                      <span aria-hidden>·</span>
                      <span>{relativeTime(d.updatedAt)}</span>
                    </span>
                  </button>
                  {!memory && <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`More for ${d.title}`}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { setName(d.title); setRenaming(d); }}>Rename</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { void doDuplicate(d); }}>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-muted">Everything is saved on this device. Nothing is uploaded.</p>
      </div>

      <Dialog open={!!renaming} onOpenChange={o => { if (!o) setRenaming(null); }}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); void doRename(); }} className="contents">
            <DialogHeader><DialogTitle>Rename document</DialogTitle></DialogHeader>
            <Input aria-label="Document name" value={name} onChange={e => setName(e.target.value)} autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit">Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”? This can’t be undone.</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">The document is removed from this device.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void doDelete(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
