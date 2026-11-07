// In Style's header: a change that made the document take more or fewer pages says so, and when it
// grew, Fit back takes it back to the count it had. The count it compares with (the base) is the one
// shown when Style comes on screen, when the pages are first laid out, when another document opens,
// and when the notice is dismissed.
import { useState } from 'react';
import { X } from 'lucide-react';
import { fontReady, fontsInUse } from '@/engine/core.js';
import { Button } from '@/components/ui/button';
import { useStageActive } from '@/features/doc/StageHost';
import { useEditor } from '@/store/editor';
import { fitBack, pagesWord } from './fit';

interface Base { base: number | null; active: boolean; docId: string | null }

export function PageCountNotice({ pages }: { pages: number | null }) {
  const active = useStageActive();
  const docId = useEditor(s => s.docId);
  useEditor(s => s.fontTick); // a hand's file arriving enables Fit back
  const [st, setSt] = useState<Base>({ base: pages, active, docId });
  let base = st.base;
  // Start the count again (while rendering, so the old count never shows): Style shown, first pages, another document.
  if (active !== st.active || docId !== st.docId || (base === null && pages !== null)) {
    if ((active && !st.active) || docId !== st.docId || base === null) base = pages;
    setSt({ base, active, docId });
  }
  if (!active || pages === null || base === null || pages === base) return null;

  const was = base, ready = fontsInUse().every(fontReady);
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg bg-primary-soft py-1.5 pr-1.5 pl-3 text-[13px]">
      <span className="min-w-0 flex-1">Now {pagesWord(pages)} (was {was})</span>
      {pages > was && (
        // (pointer events stay on while disabled, so its title shows on hover)
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px] disabled:pointer-events-auto disabled:hover:bg-surface" disabled={!ready}
          title={ready ? undefined : 'Waiting for the handwriting to load'} onClick={() => fitBack(was)}>
          Fit back to {pagesWord(was)}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-7 text-muted hover:text-fg" aria-label="Dismiss"
        onClick={() => setSt({ base: pages, active, docId })}>
        <X />
      </Button>
    </div>
  );
}
