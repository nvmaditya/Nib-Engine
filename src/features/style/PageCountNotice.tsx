// In Style's header: a change that made the document take more or fewer pages says so, and when it
// grew, Fit back takes it back to the count it had. The count it compares with (the base) is the one
// shown when Style comes on screen, when the pages are first laid out, when another document opens,
// and when the notice is dismissed. The base is kept in `useStylePanel`, so crossing 860 px (which mounts
// the panel again) keeps the notice.
import { useLayoutEffect } from 'react';
import { X } from 'lucide-react';
import { fontReady, fontsInUse } from '@/engine/core.js';
import { Button } from '@/components/ui/button';
import { useStageActive } from '@/features/doc/StageHost';
import { useEditor } from '@/store/editor';
import { fitBack, pagesWord } from './fit';
import { useStylePanel } from './panelState';

/** The buttons here go away when pressed, so focus moves on to the panel's heading first. */
function toHeading(from: HTMLElement) {
  from.closest('[data-style-head]')?.querySelector('h2')?.focus();
}

export function PageCountNotice({ pages }: { pages: number | null }) {
  const active = useStageActive();
  const docId = useEditor(s => s.docId);
  useEditor(s => s.fontTick); // a hand's file arriving enables Fit back
  const st = useStylePanel(s => s.notice) ?? { base: pages, active, docId };
  let base = st.base;
  // Start the count again (while rendering, so the old count never shows): Style shown, first pages, another document.
  if (active !== st.active || docId !== st.docId || (base === null && pages !== null)) {
    if ((active && !st.active) || docId !== st.docId || base === null) base = pages;
  }
  // Keep what this drawing counts from (once drawn: a store isn't changed while drawing).
  useLayoutEffect(() => {
    const n = useStylePanel.getState().notice;
    if (!n || n.base !== base || n.active !== active || n.docId !== docId) useStylePanel.setState({ notice: { base, active, docId } });
  });
  if (!active || pages === null || base === null || pages === base) return null;

  const was = base, ready = fontsInUse().every(fontReady);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary-soft py-1.5 pr-1.5 pl-3 text-[13px]">
      <span className="min-w-0 flex-1">Now {pagesWord(pages)} (was {was})</span>
      {pages > was && (
        // (pointer events stay on while disabled, so its title shows on hover)
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px] disabled:pointer-events-auto disabled:hover:bg-surface" disabled={!ready}
          title={ready ? undefined : 'Waiting for the handwriting to load'} onClick={e => { const el = e.currentTarget; if (fitBack(was)) toHeading(el); }}>
          Fit back to {pagesWord(was)}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-7 text-muted hover:text-fg" aria-label="Dismiss"
        onClick={e => { toHeading(e.currentTarget); useStylePanel.setState({ notice: { base: pages, active, docId } }); }}>
        <X />
      </Button>
    </div>
  );
}
