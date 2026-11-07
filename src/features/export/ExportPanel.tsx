// The Export panel: the format, which pages, how they look, the quality and the file name, then
// Download, which says what it makes and about how big it is, and Share… where the browser can share
// files. It is a column: the header, the choices (which scroll), and a footer pinned at the bottom.
// Beside the pages the footer sits at the bottom of the column; in the phone sheet it sits at the bottom
// of the part that shows, so Download shows even at the sheet's lowest. Every choice lives in a store or
// in the document, so the panel can unmount and mount again (crossing 860 px) without losing any.
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { cleanName, fontReady, fontsInUse } from '@/engine/core.js';
import type { Look } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { setS } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { Group, Hint } from '@/features/style/parts';
import { Segmented, SegButton } from '@/features/write/WriteBar';
import { gesture, useEditor } from '@/store/editor';
import { useSizeEstimate } from './estimate';
import { downloadLabel, estimateBytes, exportBase, formatSize, planOf, suffixShown, type Format, type Quality } from './plan';
import { canShareFiles, download, share } from './run';
import { loadExportPrefs, setChoose, setExportPrefs, useExportPick, useExportPrefs, useExportRun, type ExportRun } from './state';

const FORMATS: [Format, string][] = [['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG']];

const QUALITIES: [Quality, string][] = [['standard', 'Standard'], ['print', 'Print quality']];
const QUALITY_HINT: Record<Quality, string> = {
  standard: '1747 × 2471 pixels a page, for screens and uploads.',
  print: '2480 × 3508 pixels a page (300 dpi), for printing.',
};

const LOOKS: [Look, string][] = [['none', 'As written'], ['scan', 'Scanned'], ['gray', 'Greyscale scan'], ['bw', 'Black and white']];

const WAITING = 'Waiting for the handwriting to load';

/**
 * What the Download button says while files are being made: the page being made now. Once every page
 * is made, the files are being saved (separate images go about a quarter of a second apart), and it
 * says what it makes again.
 */
const making = (run: ExportRun): string | null =>
  run.kind && run.done < run.total ? `Making page ${run.done + 1} of ${run.total}…` : null;

/** A switch with its name beside it. */
function Toggle({ name, checked, onChange }: { name: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
      <Switch checked={checked} aria-label={name} onCheckedChange={onChange} />{name}
    </label>
  );
}

export function ExportPanel({ pages }: { pages: number }) {
  const active = useStageActive();
  useEditor(s => (active ? s.version : -1)); // redraw on every change only while the stage is shown
  useEditor(s => s.fontTick); // a hand's file arriving lets Download go
  const look = useEditor(s => s.S.look), tilt = useEditor(s => s.S.tilt);
  const fileName = useEditor(s => s.doc.fileName), title = useEditor(s => s.title);
  const format = useExportPrefs(s => s.format), zip = useExportPrefs(s => s.zip), quality = useExportPrefs(s => s.quality);
  const choose = useExportPick(s => s.choose), out = useExportPick(s => s.out);
  const run = useExportRun();
  const [canShare] = useState(canShareFiles);
  useEffect(() => { void loadExportPrefs(); }, []);

  const plan = planOf({ format, zip, quality }, { choose, out }, pages, fileName, title);
  const n = plan.pages.length;
  const sample = useSizeEstimate(plan.pages[0] ?? null);
  const progress = making(run);
  const size = !progress && n && sample ? formatSize(estimateBytes(plan, sample)) : null;
  const waiting = !fontsInUse().every(fontReady);
  const off = !n || run.kind !== null || waiting;
  const why = waiting ? WAITING : undefined;

  // One edit of the name, from its first keystroke to leaving the field, is one undo step.
  const edit = useRef<ReturnType<typeof gesture> | null>(null);
  const setName = (v: string) => (edit.current ??= gesture('file-name'))(s => { s.doc.fileName = v; }, { layout: false });

  return (
    <section aria-label="Export" className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none border-b border-line px-5 py-3">
        <h2 className="text-base font-semibold">Export</h2>
        <p className="mt-1 hidden text-[13px] text-muted wide:block">The pages are shown exactly as they will download.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&>section:last-child]:border-b-0">
        <Group title="Format">
          <Segmented label="Format">
            {FORMATS.map(([f, name]) => <SegButton key={f} pressed={format === f} onClick={() => setExportPrefs({ format: f })}>{name}</SegButton>)}
          </Segmented>
          {format !== 'pdf' && n > 1 && (
            <>
              <Toggle name="Put the images in one ZIP" checked={zip} onChange={v => setExportPrefs({ zip: v })} />
              <Hint>{`One file to send or upload, instead of ${n}.`}</Hint>
            </>
          )}
        </Group>

        <Group title="Pages">
          <RadioGroup value={choose ? 'choose' : 'all'} aria-label="Pages" className="gap-2.5" onValueChange={v => setChoose(v === 'choose')}>
            <Label className="cursor-pointer font-normal"><RadioGroupItem value="all" />{`All pages (${pages})`}</Label>
            <Label className="cursor-pointer font-normal"><RadioGroupItem value="choose" />Choose pages</Label>
          </RadioGroup>
          {choose && <Hint>{`Click a page to leave it out or put it back. ${n} of ${pages} chosen.`}</Hint>}
        </Group>

        <Group title="How it looks">
          <RadioGroup value={look} aria-label="How it looks" className="gap-2.5"
            onValueChange={v => { if (v !== look) setS('look', v as Look, { layout: false }); }}>
            {LOOKS.map(([id, name]) => (
              <Label key={id} className="cursor-pointer font-normal"><RadioGroupItem value={id} />{name}</Label>
            ))}
          </RadioGroup>
          <Toggle name="Slight camera tilt" checked={tilt} onChange={v => { if (v !== tilt) setS('tilt', v, { layout: false }); }} />
          <Hint>Turned a fraction of a degree and cropped a little unevenly, like a quick photo.</Hint>
        </Group>

        <Group title="Quality">
          <Segmented label="Quality">
            {QUALITIES.map(([q, name]) => <SegButton key={q} pressed={quality === q} onClick={() => setExportPrefs({ quality: q })}>{name}</SegButton>)}
          </Segmented>
          <Hint>{QUALITY_HINT[quality]}</Hint>
        </Group>

        <Group title="File name">
          <div className="flex items-center gap-1.5">
            <Input aria-label="File name" maxLength={80} spellCheck={false} autoComplete="off" className="min-w-0 flex-1"
              value={fileName} placeholder={exportBase('', title)}
              onChange={e => setName(e.target.value)}
              onBlur={e => {
                const c = cleanName(e.target.value);
                if (c !== e.target.value) setName(c);
                edit.current = null;
              }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <span className="flex-none text-sm whitespace-nowrap text-muted">{suffixShown(plan)}</span>
          </div>
        </Group>
      </div>

      <div className="flex-none border-t border-line px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          {/* (pointer events stay on while disabled, so the title shows on hover) */}
          <Button size="lg" className="min-w-0 flex-1 px-4 disabled:pointer-events-auto disabled:hover:bg-primary" disabled={off} title={why}
            onClick={() => { void download(); }}>
            {run.kind ? <Loader2 className="animate-spin" /> : <Download />}
            <span className="min-w-0 truncate">{progress ?? downloadLabel(plan)}</span>
            {size && <>{' '}<span className="flex-none font-normal opacity-80">{size}</span></>}
          </Button>
          {/* (Its name shows as its title: with the word beside it, the Download button would have no room
              to say what it makes, in the 380 px column and on phones alike.) */}
          {canShare && (
            <Button size="icon" variant="outline" className="size-10 flex-none disabled:pointer-events-auto disabled:hover:bg-surface" disabled={off}
              aria-label="Share…" title={why ?? 'Share…'} onClick={() => { void share(); }}>
              <Share2 />
            </Button>
          )}
        </div>
        <p className="mt-2 text-[13px] text-muted">Made on this device. Nothing is uploaded.</p>
      </div>
    </section>
  );
}
