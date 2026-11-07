// The handwriting picker: every hand, each drawn by the engine writing the preview text, with search,
// one filter at a time, favourites, and your own font. A panel on the right on wide screens, a bottom
// sheet on phones. It is open only while the Style stage is shown; its search and filter are kept by
// the Handwriting section, so they are still there when it opens again.
import { useId, useLayoutEffect, useReducer, useRef, type ChangeEvent } from 'react';
import { Star, Upload } from 'lucide-react';
import { FONTS } from '@/engine/config.js';
import type { FontCfg, Settings } from '@/engine/types';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { setV, view } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { useWide } from '@/lib/media';
import { cn } from '@/lib/utils';
import { toast, useEditor } from '@/store/editor';
import { addFontFile, FONT_EXTENSIONS, type AddFontResult } from './fonts';
import { HAND_FILTERS, handList, handNote, type HandFilter } from './hands';
import { HandSample, paperTint } from './HandSample';
import { setPreviewText, toggleFavourite, useStylePrefs } from './prefs';

const CANT_READ = 'That file isn’t a font Nib can read. Try a .ttf, .otf or .woff file.';
const REFUSED: Record<Extract<AddFontResult, { ok: false }>['reason'], string> = { type: CANT_READ, unreadable: CANT_READ };

/** What an upload says it did. */
function uploadMessage(r: AddFontResult): string {
  if (!r.ok) return REFUSED[r.reason];
  if (r.existed) return `“${r.name}” is already in Your fonts.`;
  if (!r.kept) return `Added “${r.name}” for now. Nib couldn’t keep it on this device, so it goes when you close this page.`;
  return r.forms > 1
    ? `Added “${r.name}” with ${r.forms} shapes per letter. It’s in Your fonts on this device.`
    : `Added “${r.name}”. It’s in Your fonts on this device.`;
}

const chip = 'h-7 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-surface';

function HandRow({ cfg, V, text, chosen, favourite }: { cfg: FontCfg; V: Settings; text: string; chosen: boolean; favourite: boolean }) {
  const name = `${cfg.name} · ${handNote(cfg)}`;
  return (
    <li className="flex items-center gap-0.5">
      <button type="button" aria-pressed={favourite} onClick={() => void toggleFavourite(cfg.id)}
        aria-label={favourite ? `Remove ${cfg.name} from favourites` : `Add ${cfg.name} to favourites`}
        className="grid size-9 flex-none place-items-center rounded-md text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:text-primary">
        <Star aria-hidden="true" className={cn('size-[18px]', favourite && 'fill-current')} />
      </button>
      <button type="button" data-hand={cfg.id} aria-pressed={chosen} onClick={() => { if (view().font !== cfg.id) setV({ font: cfg.id }); }}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-[10px] border border-transparent p-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary-soft">
        <span className="flex h-11 items-center overflow-hidden rounded-md px-2.5" style={{ background: paperTint(V.paper) }}>
          <HandSample settings={{ ...V, font: cfg.id }} text={text} height={34} />
        </span>
        <span className="truncate px-0.5 text-xs text-muted">{name}</span>
      </button>
    </li>
  );
}

export function HandPicker({ open, onOpenChange, V, start, blockName, q, onQ, filter, onFilter }: {
  open: boolean; onOpenChange(open: boolean): void; V: Settings; start: string; blockName: string | null;
  q: string; onQ(q: string): void; filter: HandFilter; onFilter(f: HandFilter): void;
}) {
  const active = useStageActive();
  const wide = useWide();
  const favourites = useStylePrefs(s => s.favourites);
  const previewText = useStylePrefs(s => s.previewText);
  const [, fontsAdded] = useReducer((n: number) => n + 1, 0);
  const [emptied, markEmptied] = useReducer((n: number) => n + 1, 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reveal = useRef<string | null>(null);
  const previewId = useId();

  const hands = handList(q, filter, favourites);
  // Preview text of only spaces counts as none: the field and the rows show the start of the document.
  const preview = previewText.trim() ? previewText : start;

  // Emptying the Preview field brings the start of the document back, selected, so what you type next replaces it.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (emptied && el && el.ownerDocument.activeElement === el) el.select();
  }, [emptied]);

  // A font just uploaded (or found again) is scrolled into view once the list shows it.
  useLayoutEffect(() => {
    const id = reveal.current;
    if (!id) return;
    reveal.current = null;
    listRef.current?.querySelector(`[data-hand="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget, file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    const docId = useEditor.getState().docId;
    const r = await addFontFile(file);
    if (r.ok) {
      if (useEditor.getState().docId === docId && view().font !== r.id) setV({ font: r.id });
      if (!handList(q, filter, useStylePrefs.getState().favourites).some(f => f.id === r.id)) { onQ(''); onFilter('all'); }
      reveal.current = r.id;
      fontsAdded();
    }
    toast(uploadMessage(r));
  }

  return (
    <Dialog open={open && active} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} aria-describedby={undefined}
        // On phones the search box isn't focused at first, so the keyboard doesn't cover the list.
        onOpenAutoFocus={wide ? undefined : e => { e.preventDefault(); contentRef.current?.focus(); }}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0 outline-none',
          'top-auto right-0 bottom-0 left-0 h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none',
          'wide:top-16 wide:right-4 wide:bottom-4 wide:left-auto wide:h-auto wide:w-[440px] wide:max-w-[calc(100vw-2rem)] wide:rounded-xl wide:border wide:pb-0',
        )}>
        <DialogHeader className="flex-row items-baseline gap-2 px-4 pt-3.5 pr-12 pb-2.5">
          <DialogTitle className="text-[15px] leading-6">Handwriting</DialogTitle>
          {blockName && <span className="min-w-0 truncate text-[13px] text-muted">for “{blockName}”</span>}
        </DialogHeader>
        <div className="px-4">
          <Input type="search" aria-label="Search handwriting" placeholder={`Search ${FONTS.length} hands`} autoComplete="off" spellCheck={false}
            value={q} onChange={e => onQ(e.target.value)} className="bg-surface-2" />
        </div>
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5 px-4 pt-2.5 pb-2">
          {HAND_FILTERS.map(([f, label]) => (
            <button key={f} type="button" className={chip} aria-pressed={filter === f} onClick={() => onFilter(f)}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-b border-line px-4 pb-2.5">
          <label htmlFor={previewId} className="text-xs text-muted">Preview</label>
          <Input ref={fieldRef} id={previewId} value={preview} maxLength={80} autoComplete="off" className="h-8 text-[13px]"
            onChange={e => { const v = e.target.value.trim() ? e.target.value : ''; void setPreviewText(v); if (!v) markEmptied(); }} />
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
          {hands.length > 0 && (
            <ul role="list" aria-label="Handwriting" className="flex flex-col gap-0.5">
              {hands.map(cfg => (
                <HandRow key={cfg.id} cfg={cfg} V={V} text={preview} chosen={cfg.id === V.font} favourite={favourites.includes(cfg.id)} />
              ))}
            </ul>
          )}
          <div aria-live="polite">
            {!hands.length && (
              <p className="px-4 py-7 text-center text-[13px] text-muted">
                {filter === 'fav' && !handList('', 'fav', favourites).length ? 'No favourites yet. Tap ★ on any hand.' : 'No handwriting matches that.'}
              </p>
            )}
          </div>
        </div>
        <div className="flex-none border-t border-line px-4 py-2.5">
          <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-ring/50')}>
            <Upload aria-hidden="true" />Use your own font
            <input type="file" accept={FONT_EXTENSIONS.join(',')} className="sr-only" onChange={e => { void onFile(e); }} />
          </label>
          <p className="mt-1.5 text-[12.5px] text-muted">TTF, OTF or WOFF. It’s remembered on this device.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
