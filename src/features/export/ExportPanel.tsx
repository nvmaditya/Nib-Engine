// The Export panel: how the downloaded pages look, the file name, and the downloads themselves.
import { useEffect, useState, type ReactNode } from 'react';
import { Download, ImageDown, Loader2 } from 'lucide-react';
import { autoName, cleanName } from '@/engine/core.js';
import type { Look } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { setS } from '@/features/doc/actions';
import { toast, update, useEditor } from '@/store/editor';
import { savePdf, savePng } from './exporters';

const LOOKS: { id: Look; name: string }[] = [
  { id: 'none', name: 'As written' },
  { id: 'scan', name: 'Scanned' },
  { id: 'gray', name: 'Greyscale scan' },
  { id: 'bw', name: 'Black and white' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function ExportPanel({ pages }: { pages: number }) {
  const look = useEditor(s => s.S.look);
  const tilt = useEditor(s => s.S.tilt);
  const fileName = useEditor(s => s.doc.fileName);
  useEditor(s => s.version);
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { if (page > pages - 1) setPage(Math.max(0, pages - 1)); }, [page, pages]);

  const setFileName = (v: string) => update(s => { s.doc.fileName = v; }, { layout: false, history: 'filename' });
  const downloadPdf = async () => {
    setBusy('pdf');
    try { toast(`Saved ${await savePdf()}`); }
    catch { toast('The PDF couldn’t be made. Check your connection and try again.'); }
    finally { setBusy(null); }
  };
  const downloadPng = async () => {
    setBusy('png');
    try { toast(`Saved ${await savePng(page)}`); }
    catch { toast('That image couldn’t be made.'); }
    finally { setBusy(null); }
  };

  return (
    <section aria-label="Export">
      <div className="border-b border-line px-5 pt-3 pb-3">
        <h2 className="text-base font-semibold">Export</h2>
        <p className="mt-1 text-[13px] text-muted">The pages are shown as they will download.</p>
      </div>
      <Group title="How it looks">
        <RadioGroup value={look} aria-label="How it looks" className="gap-2.5"
          onValueChange={v => setS('look', v as Look, { layout: false })}>
          {LOOKS.map(l => (
            <Label key={l.id} className="cursor-pointer font-normal">
              <RadioGroupItem value={l.id} />{l.name}
            </Label>
          ))}
        </RadioGroup>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={tilt} aria-label="Camera tilt" onCheckedChange={v => setS('tilt', v, { layout: false })} />Camera tilt
        </label>
        <p className="mt-2 text-[13px] text-muted">Downloads come out turned a fraction of a degree and cropped a little unevenly, like a quick photo or scan.</p>
      </Group>
      <Group title="File name">
        <div className="flex items-center gap-1.5">
          <Input aria-label="File name" maxLength={80} spellCheck={false} autoComplete="off" value={fileName} placeholder={autoName()}
            onChange={e => setFileName(e.target.value)}
            onBlur={e => { const c = cleanName(e.target.value); if (c !== e.target.value) setFileName(c); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          <span className="text-sm text-muted">.pdf</span>
        </div>
      </Group>
      <Group title="Download">
        <Button className="w-full" size="lg" disabled={busy !== null} onClick={() => { void downloadPdf(); }}>
          {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />}Download PDF
        </Button>
        <p className="mt-2 text-[13px] text-muted">{pages === 1 ? '1 page' : `${pages} pages`}, A4</p>
        <div className="mt-4 flex items-center gap-2">
          <Select value={String(page)} onValueChange={v => setPage(Number(v))}>
            <SelectTrigger aria-label="Page to download" className="w-28 flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: pages }, (_, i) => <SelectItem key={i} value={String(i)}>Page {i + 1}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="min-w-0 flex-1" disabled={busy !== null} onClick={() => { void downloadPng(); }}>
            {busy === 'png' ? <Loader2 className="animate-spin" /> : <ImageDown />}<span className="truncate">Download page {page + 1} as PNG</span>
          </Button>
        </div>
      </Group>
    </section>
  );
}
