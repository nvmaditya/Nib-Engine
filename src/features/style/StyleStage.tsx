// Style: the pages in the middle and the Style panel on the right (380 px). On phones the pages fill
// the stage and the panel is a sheet over them; the pages leave room after the last sheet for as much as the
// sheet covers (a spacer, not padding, so the top snap doesn't make the document scroll), so the last one can scroll clear of it.
import { useRef, type CSSProperties } from 'react';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { StageSheet, useSheetSnaps } from '@/features/doc/StageSheet';
import { useWide } from '@/lib/media';
import { StylePanel } from './StylePanel';

export function StyleStage({ layout }: { layout: PageLayout | null }) {
  const wide = useWide();
  const stage = useRef<HTMLDivElement>(null);
  const snaps = useSheetSnaps(stage, !wide, '148px');
  const panel = <StylePanel pages={layout?.pages ?? null} />;
  if (wide) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)] overflow-hidden">
        <PageView layout={layout} mode="style" className="min-h-0 overflow-y-auto" />
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface">{panel}</aside>
      </div>
    );
  }
  return (
    <div ref={stage} className="flex min-h-0 flex-1 flex-col" style={{ '--sheet-shown': snaps.shown } as CSSProperties}>
      <PageView layout={layout} mode="style" className="min-h-0 flex-1 overflow-y-auto after:block after:h-[calc(var(--sheet-shown)+12px)] after:content-['']" />
      <StageSheet title="Style" handleLabel="Drag to show more or less of Style" snaps={snaps}>{panel}</StageSheet>
    </div>
  );
}
