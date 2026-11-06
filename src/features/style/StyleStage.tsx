// Style: the pages in the middle, the Style panel on the right (380 px). On phones the pages come first.
import { StylePanel } from './StylePanel';

export function StyleStage() {
  return (
    <aside className="order-2 flex-none border-t border-line bg-surface wide:min-h-0 wide:overflow-y-auto wide:border-t-0 wide:border-l">
      <StylePanel />
    </aside>
  );
}
