// Pieces of the Style panel: sections, hints and folds.
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function Group({ title, value, meta, children }: { title: string; value?: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {value && <span className="font-normal text-muted">{value}</span>}
        {meta && <span className="text-[13px] font-normal text-muted">{meta}</span>}
      </h3>
      {children}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13px] text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-fg">{children}</p>;
}

type FoldId = 'effects' | 'fine' | 'spacing';
const KEY = 'nib.styleFolds';

function readFolds(): Partial<Record<FoldId, boolean>> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/** A fold that starts closed and remembers, on this device, whether it was left open. */
export function Fold({ id, title, children }: { id: FoldId; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => readFolds()[id] === true);
  const change = (o: boolean) => {
    setOpen(o);
    try { localStorage.setItem(KEY, JSON.stringify({ ...readFolds(), [id]: o })); } catch { /* storage is blocked; the fold still works */ }
  };
  return (
    <Collapsible open={open} onOpenChange={change} className="mt-3.5">
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {title}
        <ChevronDown aria-hidden="true" className="size-4 text-muted transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
