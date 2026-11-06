// Export: the pages as they will download in the middle, the Export panel on the right. On phones the pages come first.
import { ExportPanel } from './ExportPanel';

export function ExportStage({ pages }: { pages: number }) {
  return (
    <aside className="order-2 flex-none border-t border-line bg-surface wide:min-h-0 wide:overflow-y-auto wide:border-t-0 wide:border-l">
      <ExportPanel pages={pages} />
    </aside>
  );
}
