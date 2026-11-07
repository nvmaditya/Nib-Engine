import { memo, useCallback, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { navigate } from '@/app/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { loadUploadedFonts } from '@/features/style/fonts';
import { useStylePrefs } from '@/features/style/prefs';
import { NewerDocumentError, deleteDoc, duplicateDoc, putDoc, type DocRecord } from '@/store/documents';
import { SAVE_NEWER, toast } from '@/store/editor';
import { PageThumb } from './PageThumb';
import { lookNameOf, recentMeta } from './recent';
import { RECENT_PX, forgetThumb } from './thumbs';

const FAILED = 'That didn’t work. Try again.';

const Row = memo(function Row({ d, readOnly, onRename, onDuplicate, onDelete }: {
  d: DocRecord; readOnly: boolean; onRename(d: DocRecord): void; onDuplicate(d: DocRecord): void; onDelete(d: DocRecord): void;
}) {
  const saved = useStylePrefs(s => s.looks);
  const [pages, setPages] = useState<number | null>(null);
  return (
    <li className="flex items-center gap-2 pr-2 hover:bg-surface-2">
      <button type="button" onClick={() => navigate({ name: 'doc', id: d.id, stage: 'write' })} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
        <PageThumb owner={'doc:' + d.id} S={d.settings} doc={d.doc} px={RECENT_PX} onPages={setPages} className="w-[52px] flex-none" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{d.title}</span>
          <span className="block text-sm text-muted wide:truncate">{recentMeta(pages, lookNameOf(d.settings, saved), d.updatedAt)}</span>
        </span>
      </button>
      {!readOnly && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More for ${d.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(d)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(d)}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(d)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </li>
  );
});

export function RecentList({ docs, readOnly, onChange }: { docs: DocRecord[]; readOnly: boolean; onChange(): Promise<void> }) {
  const [renaming, setRenaming] = useState<DocRecord | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<DocRecord | null>(null);
  const change = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { toast(e instanceof NewerDocumentError ? SAVE_NEWER : FAILED); }
    await onChange();
  }, [onChange]);
  const startRename = useCallback((d: DocRecord) => { setName(d.title); setRenaming(d); }, []);
  const doRename = async () => {
    if (!renaming) return;
    const d = renaming, title = name.trim() || 'Untitled';
    setRenaming(null);
    await change(() => putDoc({ ...d, title, updatedAt: Date.now() }));
  };
  const doDuplicate = useCallback((d: DocRecord) => change(() => loadUploadedFonts().then(() => duplicateDoc(d.id))), [change]);
  const doDelete = async () => {
    if (!deleting) return;
    const d = deleting;
    setDeleting(null);
    await change(async () => { await deleteDoc(d.id); await forgetThumb('doc:' + d.id); });
  };

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {docs.map(d => (
          <Row key={d.id} d={d} readOnly={readOnly}
            onRename={startRename} onDuplicate={doDuplicate} onDelete={setDeleting} />
        ))}
      </ul>

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
    </>
  );
}
