// Write: the block editor on the left (400 px), the pages beside it. On phones the editor comes first.
import { WritePanel } from './WritePanel';

export function WriteStage() {
  return (
    <aside className="order-0 flex h-[min(620px,75dvh)] flex-none flex-col border-b border-line bg-surface wide:h-auto wide:min-h-0 wide:border-r wide:border-b-0">
      <WritePanel />
    </aside>
  );
}
