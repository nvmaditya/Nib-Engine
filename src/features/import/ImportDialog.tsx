// Bring in a PDF, Word or text file: read it, check and change its text in a rich preview, choose where it goes,
// its look and a header, then write it out (into the open document as one undo step, or as a new document,
// which is made only then). Full screen below 860 px and a two-column panel above it, by CSS alone, so
// crossing 860 px never remounts the preview or loses an edit.
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast as sonner } from 'sonner';
import { cleanSettings } from '@/engine/doc.js';
import { importError, readDocument } from '@/engine/importers.js';
import type { ReadResult } from '@/engine/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { matches, WIDE } from '@/lib/media';
import { cn } from '@/lib/utils';
import { placeCaret, useEditor } from '@/store/editor';
import { handsArriving, importAsNewDocument, importIntoOpenDocument, type ImportRequest } from './apply';
import { ImportOptions } from './ImportOptions';
import { ImportPreview, type PreviewHandle } from './ImportPreview';
import { IMPORT_ACCEPT, initialOptions, lookById, type ImportOptionsValue, type ImportTarget } from './options';

const NO_TEXT = 'There’s no text to write out.';
const get = useEditor.getState;

/** The file being read, read or refused. `msg` is a refusal's message, or (when ready) why it can't be written out. */
interface Read { status: 'idle' | 'reading' | 'ready' | 'error'; name: string; res: ReadResult | null; msg: string }
const IDLE: Read = { status: 'idle', name: '', res: null, msg: '' };

const count = (n: number, one: string): string => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;
/** `Essay.pdf: 1,204 words from 3 pages.`, with the pages only for a file that has them. */
const readLine = (name: string, r: ReadResult): string => `${name}: ${count(r.words, 'word')}${r.pages > 0 ? ` from ${count(r.pages, 'page')}` : ''}.`;

/** Undo and Redo, as the document's shortcuts hear them (`useUndoShortcuts`). */
const undoKey = (e: KeyboardEvent): boolean => {
  const k = e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || (k === 'y' && e.ctrlKey));
};
/** A field with its own undo: a text box, or the preview. (A file input, a radio or a button has none.) */
const TEXT_INPUTS = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
const typing = (el: EventTarget | null): boolean =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUTS.includes(el.type))
  || (el instanceof HTMLElement && !!el.closest('[contenteditable="true"]'));
const NATIVE_UNDO = ['historyUndo', 'historyRedo'];

/**
 * After Write it out on a phone the focus goes to the pages (their first heading, once drawn), never into the
 * editor: a caret there brings up the on-screen keyboard over the text just written.
 */
function focusPages(): () => void {
  const at = { route: location.hash, doc: get().docId, active: document.activeElement };
  let tries = 0, timer: ReturnType<typeof setTimeout> | undefined, done = false;
  const stop = () => {
    done = true; clearTimeout(timer);
    window.removeEventListener('pointerdown', stop, true); window.removeEventListener('keydown', stop, true);
  };
  // Give up as soon as the person has done anything else: touched or typed, moved the focus, left Write or the document.
  const moved = () => document.activeElement !== document.body && document.activeElement !== at.active
    || location.hash !== at.route || get().docId !== at.doc;
  window.addEventListener('pointerdown', stop, true); window.addEventListener('keydown', stop, true);
  const go = () => {
    if (done) return;
    if (moved()) { stop(); return; }
    const region = document.querySelector<HTMLElement>('[data-pages]');
    const target = region?.querySelector<HTMLElement>('[data-page-heading]') ?? (tries >= 40 ? region : null);
    if (target) { if (!target.hasAttribute('tabindex')) target.tabIndex = -1; target.focus({ preventScroll: true }); stop(); } else if (tries++ < 40) timer = setTimeout(go, 50); else stop();
  };
  timer = setTimeout(go, 50); // (once the dialog has let go of the focus)
  return stop;
}

export function ImportDialog({ open, file, target, onClose }: { open: boolean; file: File | null; target: ImportTarget; onClose(): void }) {
  // The focus on its way to the pages outlives the panel (closing is part of Write it out) but not the editor around
  // it. (From Home the page itself goes with the navigation, which is the point: the route check handles that.)
  const stopFocus = useRef<(() => void) | null>(null);
  useEffect(() => () => { if (target === 'open') stopFocus.current?.(); }, [target]);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {/* Mounted afresh each time it opens, so opening starts with no file and the choices where they start. */}
      {open && <ImportPanel file={file} target={target} onClose={onClose} stopFocus={stopFocus} />}
    </Dialog>
  );
}

function ImportPanel({ file, target, onClose, stopFocus }: { file: File | null; target: ImportTarget; onClose(): void; stopFocus: { current: (() => void) | null } }) {
  const [read, setRead] = useState<Read>(IDLE);
  const [options, setOptions] = useState<ImportOptionsValue>(() => initialOptions(target, target === 'open' ? get().doc : null));
  const [base] = useState(() => (target === 'open' ? get().S : cleanSettings(null, false)));
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const preview = useRef<PreviewHandle>(null);
  const reading = useRef(0); // only the last file read wins
  const toPages = useRef(false); // written out into the open document on a phone: the focus goes to the pages
  // What had the focus when it opened (the Write bar's Import, say): it gets it back on closing. The dialog is
  // opened from the store, not by a Radix trigger, so Radix itself has nothing to give it back to.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  // An earlier import's message would sit over the footer (on phones, over Write it out): put away each one
  // showing, by its own id (dismissing them all at once can swallow a new message that reuses an id).
  useEffect(() => { for (const t of sonner.getToasts?.() ?? []) sonner.dismiss(t.id); }, []);

  async function readFile(f: File): Promise<void> {
    const seq = ++reading.current;
    setRead({ status: 'reading', name: f.name, res: null, msg: '' });
    try {
      const res = await readDocument(f);
      if (seq === reading.current) setRead({ status: 'ready', name: f.name, res, msg: '' });
    } catch (e) {
      if (seq === reading.current) setRead({ status: 'error', name: f.name, res: null, msg: importError(String((e as { code?: unknown } | null)?.code ?? '')) });
    }
  }
  useEffect(() => {
    if (file) void readFile(file);
    return () => { reading.current++; }; // a read still going when the file changes or the dialog closes is forgotten
  }, [file]);

  // The browser's own Undo, from a field in here with nothing of its own to undo (or the Edit menu), would
  // reach the last edit it knows of, which can be in an editor behind the dialog: only the dialog's own count.
  useEffect(() => {
    const keep = (e: Event) => {
      if (!NATIVE_UNDO.includes((e as InputEvent).inputType) || content.current?.contains(e.target as Node | null)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    window.addEventListener('beforeinput', keep, true);
    return () => window.removeEventListener('beforeinput', keep, true);
  }, []);

  // "No text to write out" goes once something is typed in the preview again.
  const blank = read.status === 'ready' && read.msg !== '';
  useEffect(() => {
    const ed = preview.current?.editor;
    if (!blank || !ed) return;
    const clear = () => setRead(r => (r.status === 'ready' ? { ...r, msg: '' } : r));
    ed.on('update', clear);
    return () => { ed.off('update', clear); };
  }, [blank]);

  async function writeOut(): Promise<void> {
    const res = read.res;
    if (read.status !== 'ready' || !res || busy) return;
    const markup = (preview.current?.markup() ?? '').replace(/\s+$/, '');
    if (!markup) { setRead(r => ({ ...r, msg: NO_TEXT })); return; }
    const req: ImportRequest = {
      text: markup, name: res.name,
      // A header belongs at the top of page 1: never with Add after (its choice is hidden then, but kept).
      place: { where: options.where, look: lookById(options.look), header: target === 'new' || options.where === 'replace' ? options.header : null },
    };
    // Add after places the text by where the writing ends in the look's hands: one still on its way is waited for.
    const hands = target === 'open' ? handsArriving(req.place) : null;
    if (hands) {
      const at = reading.current;
      setBusy(true);
      await hands;
      setBusy(false);
      if (at !== reading.current) return; // closed (Cancel), or another file chosen, meanwhile
    }
    if (target === 'open') {
      importIntoOpenDocument(req);
      // The caret goes where the imported text starts (the block it went into ends with it), ready to write on.
      // (Not on a phone: a caret there brings up the on-screen keyboard over the pages just written. The pages get
      // the focus instead.)
      if (matches(WIDE)) {
        const s = get(), b = s.doc.boxes.find(x => x.id === s.selectedId);
        if (b) placeCaret(b.id, b.text.endsWith(req.text) ? b.text.length - req.text.length : 0);
      } else { toPages.current = true; stopFocus.current = focusPages(); }
      onClose();
      return;
    }
    setBusy(true);
    const ok = await importAsNewDocument(req);
    setBusy(false);
    if (!ok) return;
    // The new document is open on Write now; its caret waits at the start of the imported text (its Main text).
    if (matches(WIDE)) { const b = get().doc.boxes.find(x => x.name === 'Main text'); if (b) placeCaret(b.id, 0); } else { toPages.current = true; stopFocus.current = focusPages(); }
    onClose();
  }

  const choose = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; };
  const drop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false); // (the document behind doesn't open it as well)
    const f = e.dataTransfer.files[0];
    if (f) void readFile(f);
  };
  // While the dialog is open, Ctrl+Z is the dialog's (the preview's own undo): it never undoes the document behind.
  const keepUndo = (e: KeyboardEvent) => {
    if (!undoKey(e)) return;
    e.stopPropagation();
    if (!typing(e.target)) e.preventDefault();
  };

  const ready = read.status === 'ready' && read.res ? read.res : null;
  const alert = read.status === 'error' || blank ? read.msg : '';
  const input = <input type="file" className="sr-only" accept={IMPORT_ACCEPT} onChange={choose} />;

  return (
    <DialogContent ref={content} tabIndex={-1}
      // Opening never puts the focus in the editor, so a phone's keyboard doesn't come up over the text at once.
      onOpenAutoFocus={e => { e.preventDefault(); content.current?.focus(); }}
      // Closing gives the focus back to what opened it, unless the caret went into the document (Write it out).
      onCloseAutoFocus={e => {
        e.preventDefault();
        if (toPages.current) return; // written out on a phone: focusPages has it, not the opener
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[contenteditable="true"]')) return;
        if (opener?.isConnected) opener.focus();
      }}
      onKeyDown={keepUndo}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={drop}
      className={cn(
        'flex flex-col gap-0 overflow-hidden p-0 outline-none',
        'top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:max-w-none',
        'wide:top-[50%] wide:left-[50%] wide:h-[min(52rem,calc(100dvh-4rem))] wide:w-[min(68rem,calc(100vw-4rem))] wide:translate-x-[-50%] wide:translate-y-[-50%] wide:rounded-xl wide:border',
      )}>
      <DialogHeader className="flex-none border-b border-line px-5 py-3 pr-12">
        <DialogTitle className="text-base leading-6">Import a document</DialogTitle>
        <DialogDescription className="sr-only">Choose a file, check its text, then write it out on the pages.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto wide:grid wide:grid-cols-[minmax(0,1fr)_340px] wide:overflow-hidden">
        {/* (The preview scrolls on its own in this column on wide screens; on phones the whole body scrolls.) */}
        <div className={cn('flex min-h-0 flex-col', !ready && 'min-h-full wide:col-span-2')}>
          <div className="flex flex-none items-center gap-3 px-4 pt-3">
            <div className="min-w-0 flex-1 text-sm">
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-muted">
                {read.status === 'reading' && <Loader2 className="size-4 flex-none animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {read.status === 'reading' ? `Reading ${read.name}…` : ready && !blank ? readLine(read.name, ready) : ''}
              </p>
              {alert && <p role="alert" className="pb-1 text-danger">{alert}</p>}
            </div>
            {ready && (
              <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-none cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-ring/50')}>
                {input}Choose another file
              </label>
            )}
          </div>
          {ready ? (
            <ImportPreview parts={ready.parts} breaks={options.breaks} ref={preview} />
          ) : read.status !== 'reading' && (
            <label className={cn(
              'm-4 flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center has-focus-visible:ring-2 has-focus-visible:ring-ring/50',
              over ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-2',
            )}>
              {input}
              <FileUp className="mb-1 size-6 text-primary" aria-hidden="true" />
              <span className="font-semibold">Choose a PDF, Word (.docx) or text file</span>
              <span className="text-[13px] text-muted">or drop it here. Headings, lists, bold, underline and crossed-out words come across.</span>
            </label>
          )}
        </div>
        {ready && (
          <div className="wide:min-h-0 wide:overflow-y-auto wide:border-l wide:border-line">
            <ImportOptions target={target} value={options} onChange={setOptions} fileParts={ready.parts.filter(p => p.trim()).length} base={base} />
          </div>
        )}
      </div>

      <DialogFooter className="flex-none flex-row justify-end border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button variant="outline" className="flex-1 wide:flex-none" onClick={onClose}>Cancel</Button>
        <Button className="flex-1 wide:flex-none" disabled={!ready || busy} onClick={() => { void writeOut(); }}>
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}Write it out
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
