// Write's Pages view, for now: the Write panel on the left (400 px) beside the handwritten pages.
// On phones the panel comes first. (The typed pages replace the panel later in this milestone.)
import { useEffect } from 'react';
import { addBlock, pagesApi } from '@/features/doc/actions';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { WritePanel } from './WritePanel';

export function PagesView({ layout }: { layout: PageLayout | null }) {
  // The panel's Add block puts a text block on page 1.
  useEffect(() => {
    const add = () => addBlock('text', 0);
    pagesApi.addBox = add;
    return () => { if (pagesApi.addBox === add) pagesApi.addBox = null; };
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:grid wide:grid-cols-[400px_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)] wide:overflow-hidden">
      <aside className="flex h-[min(620px,75dvh)] flex-none flex-col border-b border-line bg-surface wide:h-auto wide:min-h-0 wide:border-r wide:border-b-0">
        <WritePanel />
      </aside>
      <PageView layout={layout} mode="write" className="flex-none wide:min-h-0 wide:overflow-y-auto" />
    </div>
  );
}
