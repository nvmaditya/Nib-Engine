// Export: the pages as they will download in the middle, the Export panel on the right (380 px). On
// phones the pages fill the stage and the panel is a sheet over them (the sheet Style shares); the pages
// leave room after the last one for as much as the sheet covers (a spacer, not padding, so the top
// height doesn't make the document scroll). The page choice and the format live in stores, so the
// panel can unmount and mount again (crossing 860 px) without losing them.
import { useMemo, useRef, type CSSProperties } from 'react';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { StageSheet, useSheetSnaps } from '@/features/doc/StageSheet';
import { useWide } from '@/lib/media';
import { ExportPanel } from './ExportPanel';
import { togglePage, useExportPick } from './state';

/** The lowest the sheet rests: its handle, the panel's title and the pinned Download and Share… show. */
export const EXPORT_PEEK = '168px';

export function ExportStage({ layout }: { layout: PageLayout | null }) {
  const wide = useWide();
  const stage = useRef<HTMLDivElement>(null);
  const snaps = useSheetSnaps(stage, !wide, EXPORT_PEEK);
  const choose = useExportPick(s => s.choose), out = useExportPick(s => s.out);
  const pick = useMemo(() => (choose ? { out: new Set(out), toggle: togglePage } : null), [choose, out]);
  const panel = <ExportPanel pages={layout?.pages ?? 1} />;
  if (wide) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)] overflow-hidden">
        <PageView layout={layout} mode="export" pick={pick} className="min-h-0 overflow-y-auto" />
        <aside className="flex min-h-0 flex-col border-l border-line bg-surface">{panel}</aside>
      </div>
    );
  }
  return (
    <div ref={stage} className="flex min-h-0 flex-1 flex-col" style={{ '--sheet-shown': snaps.shown } as CSSProperties}>
      <PageView layout={layout} mode="export" pick={pick}
        className="min-h-0 flex-1 overflow-y-auto after:block after:h-[calc(var(--sheet-shown)+12px)] after:content-['']" />
      <StageSheet title="Export" handleLabel="Drag to show more or less of Export" snaps={snaps} scroll={false}>{panel}</StageSheet>
    </div>
  );
}
