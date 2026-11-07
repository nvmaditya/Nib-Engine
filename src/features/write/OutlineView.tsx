// Write's Outline view, for now: the Write bar, then the selected block's editor on the left (400 px) beside
// the handwritten pages; on phones the editor comes first. (The page list and the inspector replace it later
// in this milestone.)
import { useStageActive } from '@/features/doc/StageHost';
import { BlockEditor } from '@/features/editor/BlockEditor';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { useEditor } from '@/store/editor';
import { WriteBar } from './WriteBar';

export function OutlineView({ layout }: { layout: PageLayout | null }) {
  const active = useStageActive();
  const id = useEditor(s => s.doc.boxes.find(b => b.id === s.selectedId && b.kind !== 'header')?.id ?? null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriteBar view="outline" page={0} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:grid wide:grid-cols-[400px_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)] wide:overflow-hidden">
        <aside className="flex-none border-b border-line bg-surface px-5 py-4 wide:min-h-0 wide:overflow-y-auto wide:border-r wide:border-b-0">
          {id
            ? <BlockEditor key={id} boxId={id} range={null} label="Block contents" acceptCaret={active} />
            : <p className="text-muted">Select a block on the page or in the outline.</p>}
        </aside>
        <PageView layout={layout} mode="write" className="flex-none wide:min-h-0 wide:overflow-y-auto" />
      </div>
    </div>
  );
}
