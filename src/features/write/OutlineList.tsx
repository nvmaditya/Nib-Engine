// Outline's page list: each page with the parts of blocks on it, in the order they are laid out. Pages
// reorder by their grip and blocks move to another page by dragging their item (Design decision 4);
// a block's later part can't move on its own (spec §4 rule 4).
import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { HEADER_FIELDS } from '@/engine/doc.js';
import { frameRange, hasOwnStyle } from '@/engine/core.js';
import type { Seg } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { addPageAt, moveBlockTo, movePageTo, rule4, select } from '@/features/doc/actions';
import { blockColor, partLabel } from '@/features/doc/blocks';
import { useStageActive } from '@/features/doc/StageHost';
import { plainText } from '@/features/editor/markup';
import type { PageLayout } from '@/features/pages/PageView';
import { cn } from '@/lib/utils';
import { toast, useEditor } from '@/store/editor';
import { dropClass, gripClass, pageDropIndex, startDrag } from './dnd';
import { PageMenu } from './PageMenu';

const SNIPPET = 70;
const ring = 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

/** The first 70 characters of a part's words (markup removed), read only as far as needed. */
function snippetOf(markup: string): string {
  let out = '';
  for (const line of markup.split('\n')) {
    const words = plainText(line);
    if (words) out = out ? `${out} ${words}` : words;
    if (out.length >= SNIPPET) break;
  }
  return out.slice(0, SNIPPET);
}

/** What a part's item shows under its name: its text, or a header's filled-in fields. */
function partSnippet(sg: Seg): string {
  const b = sg.box;
  if (b.kind === 'header') return HEADER_FIELDS.map(([k]) => b.fields?.[k]?.trim()).filter(Boolean).join(' · ');
  const [from, to] = frameRange(b, sg.idx);
  return snippetOf(b.text.slice(from, to));
}

/** What follows the pointer while dragging. */
function ghost(text: string, color?: string): HTMLElement {
  const g = document.createElement('div');
  g.className = 'flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-fg shadow-lg';
  if (color) {
    const dot = document.createElement('span');
    dot.className = 'size-[9px] flex-none rounded-[3px]';
    dot.style.background = color;
    g.append(dot);
  }
  g.append(text);
  return g;
}

interface ItemProps {
  boxId: string; idx: number; name: string; color: string; label: string; own: boolean; snippet: string; selected: boolean;
}

const OutlineItem = memo(function OutlineItem({ boxId, idx, name, color, label, own, snippet, selected }: ItemProps) {
  // A first part moves to the page it is dropped on (selected, as pressing it on the page does). A later
  // part follows the part before it, which the person is told as soon as the drag starts.
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => startDrag(e, {
    kind: 'item',
    ghost: () => ghost(name, color),
    onStart: () => {
      if (idx === 0) { select(boxId); return; }
      toast(rule4({ part: idx + 1, name }));
      return false;
    },
    onDrop: t => { if (t) moveBlockTo(boxId, idx, t.page); },
  });
  return (
    <li>
      <button type="button" data-item={`${boxId}:${idx}`} data-box={boxId}
        aria-label={[label ? `${name}, part ${label}` : name, own && 'own style'].filter(Boolean).join(', ')}
        aria-current={selected ? 'true' : undefined}
        onClick={() => select(boxId)} onPointerDown={onPointerDown}
        style={{ '--bc': color } as CSSProperties}
        className={cn(
          'ml-3 grid w-[calc(100%-0.75rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-[9px] gap-y-px rounded-[9px] border border-transparent px-2 py-[7px] text-left select-none [-webkit-touch-callout:none] hover:bg-surface-2',
          idx > 0 ? 'cursor-pointer' : 'cursor-grab',
          selected && 'border-[color-mix(in_srgb,var(--bc)_45%,transparent)] bg-[color-mix(in_srgb,var(--bc)_10%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--bc)_10%,var(--surface))]',
          ring,
        )}>
        <span aria-hidden className="size-[9px] flex-none rounded-[3px] bg-[var(--bc)]" />
        <span className="min-w-0 truncate text-[13px]">
          <span className="font-semibold">{name}</span>
          {label && <span className="ml-1.5 text-xs text-muted">{label}</span>}
        </span>
        {own ? <span className="rounded-full bg-surface-2 px-[7px] py-px text-[11px] font-medium whitespace-nowrap text-muted">Own style</span> : <span />}
        <span className="col-start-2 col-end-4 truncate text-xs text-muted">{snippet}</span>
      </button>
    </li>
  );
});

function PageSection({ i, pages, segs, parts, selectedId }: { i: number; pages: number; segs: Seg[]; parts: Map<string, number>; selectedId: string | null }) {
  // The grip drags the page; it drops before or after another page's section (Pages view does the same).
  const onGrip = (e: ReactPointerEvent<HTMLElement>) => startDrag(e, {
    kind: 'grip',
    ghost: () => ghost(`Page ${i + 1}`),
    onDrop: t => { if (t) movePageTo(i, pageDropIndex(i, t.page, t.after)); },
  });
  return (
    <div data-drop-page={i} className={cn('rounded-[10px] pt-0.5 pb-1.5', dropClass)}>
      <div className="flex items-center gap-1 py-1 pr-0.5">
        <span role="img" aria-label={`Drag to move page ${i + 1}`} title="Drag to move this page" onPointerDown={onGrip}
          className={cn(gripClass, 'inline-grid size-[26px] flex-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4')}>
          <GripVertical aria-hidden />
        </span>
        <h3 tabIndex={-1} data-page-heading={i}
          className={cn('min-w-0 flex-1 rounded-sm text-xs font-semibold tracking-[0.02em] text-muted uppercase', ring)}>
          Page {i + 1}
        </h3>
        <PageMenu page={i} pages={pages} />
      </div>
      {segs.length ? (
        <ul>
          {segs.map(sg => (
            <OutlineItem key={`${sg.box.id}:${sg.idx}`} boxId={sg.box.id} idx={sg.idx} name={sg.box.name} color={blockColor(sg.box)}
              label={partLabel(sg.idx, parts.get(sg.box.id) ?? 1)} own={hasOwnStyle(sg.box)} snippet={partSnippet(sg)}
              selected={sg.box.id === selectedId} />
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 ml-3 rounded-[9px] border border-dashed border-line-strong p-2.5 text-center text-xs text-muted">Drop a block here</p>
      )}
    </div>
  );
}

export const OutlineList = memo(function OutlineList({ layout, className }: { layout: PageLayout | null; className?: string }) {
  const active = useStageActive();
  // Names, styles and text change in place without a new layout (renaming, typing): follow every change while shown.
  useEditor(s => (active ? s.version : -1));
  const selectedId = useEditor(s => s.selectedId);
  const pages = layout?.pages ?? 0;
  const parts = new Map<string, number>();
  for (const sg of layout?.segs ?? []) parts.set(sg.box.id, (parts.get(sg.box.id) ?? 0) + 1);
  // Each page's parts from the top down, and left to right on the same line.
  const onPage = (i: number) => (layout?.segs ?? []).filter(sg => sg.page === i).sort((a, b) => a.top - b.top || a.x - b.x);

  return (
    <section aria-label="Outline" className={cn('bg-surface', className)}>
      <h2 className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] font-semibold">
        Pages {layout && <span className="rounded-full bg-surface-2 px-[7px] py-px text-[11px] font-medium text-muted">{pages}</span>}
      </h2>
      <div className="px-2 pt-1.5 pb-[18px]">
        {Array.from({ length: pages }, (_, i) => (
          <PageSection key={i} i={i} pages={pages} segs={onPage(i)} parts={parts} selectedId={selectedId} />
        ))}
        {layout && <Button variant="ghost" size="sm" className="mt-2 ml-1" onClick={() => addPageAt()}><Plus />Add page</Button>}
        <p className="mx-2 mt-3.5 text-xs text-muted">Drag a page to reorder; anything that runs on from it follows. Drag a block onto another page to move it.</p>
      </div>
    </section>
  );
});
