// Style: the pages in the middle, the Style panel on the right (380 px). On phones the pages come first.
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { StylePanel } from './StylePanel';

export function StyleStage({ layout }: { layout: PageLayout | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:grid wide:grid-cols-[minmax(0,1fr)_380px] wide:grid-rows-[minmax(0,1fr)] wide:overflow-hidden">
      <PageView layout={layout} mode="style" className="flex-none wide:min-h-0 wide:overflow-y-auto" />
      <aside className="flex-none border-t border-line bg-surface wide:min-h-0 wide:overflow-y-auto wide:border-t-0 wide:border-l">
        <StylePanel />
      </aside>
    </div>
  );
}
