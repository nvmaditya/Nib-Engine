// Style: the pages in the middle and the Style panel on the right (380 px). On phones the pages fill
// the stage and the panel is a sheet over them; the pages leave room at the bottom for as much as the
// sheet covers, so the last one can scroll clear of it.
import { useRef, type CSSProperties } from 'react';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { useWide } from '@/lib/media';
import { StylePanel } from './StylePanel';
import { StyleSheet, useSheetSnaps } from './StyleSheet';

export function StyleStage({ layout }: { layout: PageLayout | null }) {
  const wide = useWide();
  const stage = useRef<HTMLDivElement>(null);
  const snaps = useSheetSnaps(stage, !wide);
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
      <PageView layout={layout} mode="style" className="min-h-0 flex-1 overflow-y-auto pb-[calc(var(--sheet-shown)+12px)]" />
      <StyleSheet snaps={snaps}>{panel}</StyleSheet>
    </div>
  );
}
