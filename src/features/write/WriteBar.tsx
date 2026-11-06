// The bar above Write's views: Pages or Outline, what the Pages view shows, the formatting tools, Add and Import.
import type { ReactNode } from 'react';
import { FileUp, Files, ListTree } from 'lucide-react';
import { navigate, parseHash } from '@/app/route';
import { Button } from '@/components/ui/button';
import { openImport } from '@/features/doc/actions';
import { FormatToolbar } from '@/features/editor/FormatToolbar';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';
import { AddMenu } from './AddMenu';

export type WriteMode = 'side' | 'typed' | 'hand';

const MODES: [WriteMode, string][] = [['side', 'Side by side'], ['typed', 'Typed'], ['hand', 'Handwritten']];

/** Go to the Pages ('write') or Outline view of the open document. */
function goTo(stage: 'write' | 'outline'): void {
  const r = parseHash(location.hash);
  const id = r.name === 'doc' ? r.id : useEditor.getState().docId;
  if (id !== null) navigate({ name: 'doc', id, stage });
}

function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="inline-flex flex-none gap-0.5 rounded-[10px] bg-surface-2 p-[3px]">{children}</div>;
}

function SegButton({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium whitespace-nowrap text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:size-4">
      {children}
    </button>
  );
}

interface Props {
  view: 'write' | 'outline';
  /** What the Pages view shows; the Show group appears only with `onMode`. */
  mode?: WriteMode;
  onMode?(m: WriteMode): void;
  /** The page (0-based) the Add menu adds to. */
  page: number;
  className?: string;
}

export function WriteBar({ view, mode, onMode, page, className }: Props) {
  const pages = view === 'write';
  return (
    <div className={cn('flex flex-none flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2', className)}>
      <Segmented label="Write view">
        <SegButton pressed={pages} onClick={() => goTo('write')}><Files />Pages</SegButton>
        <SegButton pressed={!pages} onClick={() => goTo('outline')}><ListTree />Outline</SegButton>
      </Segmented>
      {pages && onMode && (
        <Segmented label="Show">
          {MODES.map(([k, l]) => <SegButton key={k} pressed={mode === k} onClick={() => onMode(k)}>{l}</SegButton>)}
        </Segmented>
      )}
      {/* Below 860 px the tools get a row of their own and scroll sideways. */}
      {pages && (
        <div className="order-last flex min-w-0 basis-full overflow-x-auto wide:order-none wide:flex-1 wide:basis-auto">
          <FormatToolbar className="mx-auto flex-nowrap" />
        </div>
      )}
      <div className="ml-auto flex flex-none items-center gap-1">
        <AddMenu page={page} />
        <Button variant="ghost" size="sm" title="Bring in a PDF, Word or text file" onClick={() => openImport()}><FileUp />Import</Button>
      </div>
    </div>
  );
}
