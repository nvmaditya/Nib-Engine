// Style: the pages in the middle and the Style panel on the right (380 px). On phones the pages fill
// the stage and the panel is a sheet over them; the pages leave room at the bottom so the last one
// can scroll clear of the sheet.
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { useWide } from '@/lib/media';
import { StylePanel } from './StylePanel';
import { StyleSheet } from './StyleSheet';

export function StyleStage({ layout }: { layout: PageLayout | null }) {
  const wide = useWide();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <PageView layout={layout} mode="style" className="min-h-0 flex-1 overflow-y-auto pb-[160px]" />
      <StyleSheet>{panel}</StyleSheet>
    </div>
  );
}
