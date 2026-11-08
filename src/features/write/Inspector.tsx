// Outline's inspector: the selected block's name, where it is, its ⋯ menu, and its whole text in one
// editor, with a line where each later page's part starts (Design decision 3). A header shows its fields.
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { frameRange } from '@/engine/core.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { joinBackBlock, removePart, renameBlock, splitAt } from '@/features/doc/actions';
import { blockColor, pagesLabel } from '@/features/doc/blocks';
import { useStageActive } from '@/features/doc/StageHost';
import { BlockEditor, type PageBreakMark } from '@/features/editor/BlockEditor';
import { FormatToolbar } from '@/features/editor/FormatToolbar';
import type { PageLayout } from '@/features/pages/PageView';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';
import { BlockMenu } from './BlockMenu';
import { HeaderFields } from './HeaderFields';

/**
 * The block name field: saved on Enter or on leaving it; Escape puts the saved name back. Pressing another
 * block or an empty area on the page changes the selection before the field is left, so it goes without a
 * blur: what was typed is saved as it goes.
 */
function NameField({ boxId, name }: { boxId: string; name: string }) {
  const [draft, setDraft] = useState(name);
  const [shown, setShown] = useState(name);
  if (shown !== name) { setShown(name); setDraft(name); } // renamed elsewhere, or undone
  const latest = useRef({ draft, name });
  latest.current = { draft, name };
  useEffect(() => () => {
    const { draft: d, name: was } = latest.current, next = d.trim();
    if (next && next !== was) renameBlock(boxId, next); // (a block that is gone, or the same name, changes nothing)
  }, [boxId]);
  const save = () => {
    const next = draft.trim();
    if (next) renameBlock(boxId, next);
    setDraft(next || name); // an empty name keeps the old one
  };
  return (
    <Input aria-label="Block name" value={draft} maxLength={60} autoComplete="off" spellCheck={false}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== name) save(); }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape' && draft !== name) { e.preventDefault(); e.stopPropagation(); setDraft(name); }
      }}
      className="h-8 flex-1 border-0 bg-transparent px-1.5 text-sm font-semibold shadow-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50" />
  );
}

function Body({ boxId, layout }: { boxId: string; layout: PageLayout | null }) {
  const active = useStageActive();
  const name = useEditor(s => s.doc.boxes.find(b => b.id === boxId)?.name ?? '');
  const kind = useEditor(s => s.doc.boxes.find(b => b.id === boxId)?.kind);
  const color = useEditor(s => blockColor(s.doc.boxes.find(b => b.id === boxId) ?? { color: 0 }));
  const from = useEditor(s => {
    const b = s.doc.boxes.find(x => x.id === boxId);
    return b?.from !== undefined ? s.doc.boxes.find(x => x.id === b.from)?.name ?? null : null;
  });

  // Where the block is, and where each later page's part starts in its text: from the layout only, so
  // typing between layouts doesn't move the lines (the editor carries them along with the text).
  const { where, breaks } = useMemo(() => {
    if (!layout) return { where: '', breaks: [] as PageBreakMark[] };
    const parts = layout.segs.filter(sg => sg.box.id === boxId);
    return {
      where: pagesLabel([...new Set(parts.map(sg => sg.page + 1))].sort((a, b) => a - b)),
      breaks: parts.filter(sg => sg.idx >= 1).map(sg => ({ offset: frameRange(sg.box, sg.idx)[0], page: sg.page + 1, idx: sg.idx, actions: true })),
    };
  }, [layout, boxId]);

  if (!kind) return null;
  return (
    <>
      <div className="flex flex-none items-center gap-2 border-b border-line py-2 pr-2 pl-3.5" style={{ '--bc': color } as CSSProperties}>
        <span aria-hidden className="size-[9px] flex-none rounded-[3px] bg-[var(--bc)]" />
        <NameField boxId={boxId} name={name} />
        {where && <span className="flex-none text-[13px] whitespace-nowrap text-muted">{where}</span>}
        <BlockMenu boxId={boxId} idx={0} />
      </div>
      {from !== null && (
        <div className="flex flex-none items-center gap-2 border-b border-line bg-primary-soft py-1.5 pr-2 pl-3.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate">{`Split from “${from}”`}</span>
          <Button variant="link" size="sm" className="h-7 px-2" onClick={() => joinBackBlock(boxId)}>Join back</Button>
        </div>
      )}
      {kind === 'header' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3.5 pb-5">
          <HeaderFields boxId={boxId} />
          <p className="mt-3 text-[13px] text-muted">New documents fill in today’s date.</p>
        </div>
      ) : (
        <>
          <div className="flex-none overflow-x-auto border-b border-line px-2 py-1.5">
            <FormatToolbar className="flex-nowrap" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3.5 pb-5">
            <BlockEditor boxId={boxId} range={null} breaks={breaks} label={`${name}, all pages`} acceptCaret={active}
              onSplit={idx => splitAt(boxId, idx)} onRemovePart={idx => removePart(boxId, idx)} />
          </div>
        </>
      )}
    </>
  );
}

export const Inspector = memo(function Inspector({ layout, className }: { layout: PageLayout | null; className?: string }) {
  const boxId = useEditor(s => (s.doc.boxes.some(b => b.id === s.selectedId) ? s.selectedId : null));
  return (
    <section aria-label="Selected block" data-box={boxId ?? undefined} className={cn('flex flex-col bg-surface', className)}>
      {/* A block of its own each time, so its name field and editor start from that block. */}
      {boxId ? <Body key={boxId} boxId={boxId} layout={layout} />
        : <p className="px-5 py-7 text-center text-sm text-muted">Select a block on the page or in the outline.</p>}
    </section>
  );
});
