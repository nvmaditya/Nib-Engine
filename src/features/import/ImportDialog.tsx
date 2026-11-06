// Bring in a PDF, Word or text file, check the text, then write it out as one block that flows across pages.
import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { importError, readDocument } from '@/engine/importers.js';
import type { ReadResult } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { closeImport, writeOut } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { toast } from '@/store/editor';

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const compose = (r: ReadResult, br: boolean) => r.parts.filter(p => p.trim()).join(br ? '\n\\newpage\n' : '\n\n');

export function ImportDialog({ open, file, pages }: { open: boolean; file: File | null; pages: number }) {
  const [status, setStatus] = useState({ msg: '', err: false });
  const [res, setRes] = useState<ReadResult | null>(null);
  const [text, setText] = useState('');
  const [where, setWhere] = useState<'replace' | 'append'>('replace');
  const [breaks, setBreaks] = useState(false);
  const [over, setOver] = useState(false);
  const generated = useRef('');
  const reading = useRef(0);

  useEffect(() => {
    if (open) { setRes(null); setText(''); setStatus({ msg: '', err: false }); setBreaks(false); }
  }, [open]);
  useEffect(() => { if (open && file) void read(file); }, [open, file]);

  async function read(f: File) {
    const seq = ++reading.current;
    setRes(null); setStatus({ msg: `Reading ${f.name || 'file'}…`, err: false });
    try {
      const r = await readDocument(f);
      if (seq !== reading.current) return;
      setRes(r); setBreaks(false);
      generated.current = compose(r, false); setText(generated.current);
      setStatus({ msg: `${f.name}: ${r.words.toLocaleString()} words${r.pages ? ` from ${r.pages} page${r.pages === 1 ? '' : 's'}` : ''}. Markup like ## for headings and **bold** shows how it will be written.`, err: false });
    } catch (e) {
      if (seq === reading.current) setStatus({ msg: importError((e as { code?: string } | null)?.code ?? ''), err: true });
    }
  }
  const toggleBreaks = (checked: boolean) => {
    if (!res) return;
    if (text === generated.current) { setBreaks(checked); generated.current = compose(res, checked); setText(generated.current); }
    else setStatus({ msg: 'You’ve edited the text, so page breaks are now up to you: put \\newpage on its own line where a new page should start.', err: false });
  };
  const go = () => {
    const t = text.replace(/\s+$/, '');
    if (!t.trim()) return;
    const { undo } = writeOut(t, where, res?.name, pages);
    closeImport();
    requestAnimationFrame(() => toast('Written out. Each page’s part can be moved, resized, edited or separated on its own.', undo));
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeImport(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a document</DialogTitle>
          <DialogDescription className="sr-only">Choose a file, check its text, then write it out on the pages.</DialogDescription>
        </DialogHeader>
        <label
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void read(f); }}
          className={cn('flex min-h-28 flex-none cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center focus-within:border-primary',
            over ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-2')}>
          <input type="file" className="sr-only" accept={ACCEPT}
            onChange={e => { const f = e.target.files && e.target.files[0]; if (f) void read(f); e.target.value = ''; }} />
          <FileUp className="mb-1 size-5 text-primary" aria-hidden />
          <span className="font-semibold">Choose a PDF, Word (.docx) or text file</span>
          <span className="text-[13px] text-muted">or drop it here. Headings, lists, bold, underline and crossed-out words come across.</span>
        </label>
        <p role="status" aria-live="polite" className={cn('min-h-5 text-sm', status.err ? 'text-danger' : 'text-muted')}>{status.msg}</p>
        {res && (
          <div className="flex min-h-0 flex-col gap-2">
            <label htmlFor="imp-text" className="text-sm font-medium">Check the text and change anything before it’s written out</label>
            <textarea id="imp-text" spellCheck value={text} onChange={e => setText(e.target.value)}
              className="h-[34vh] min-h-32 w-full resize-y rounded-lg border border-input bg-surface px-3 py-2.5 font-mono text-sm leading-relaxed text-fg outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <RadioGroup value={where} onValueChange={v => setWhere(v as 'replace' | 'append')} aria-label="Where the text goes" className="flex flex-wrap gap-x-5 gap-y-2">
                <Label className="cursor-pointer font-normal"><RadioGroupItem value="replace" />Replace what’s on the pages</Label>
                <Label className="cursor-pointer font-normal"><RadioGroupItem value="append" />Add after the last page</Label>
              </RadioGroup>
              {res.parts.length > 1 && (
                <Label className="cursor-pointer font-normal">
                  <Checkbox checked={breaks} onCheckedChange={c => toggleBreaks(c === true)} />Start a new page where the file does
                </Label>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeImport}>Cancel</Button>
          <Button disabled={!res} onClick={go}>Write it out</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
