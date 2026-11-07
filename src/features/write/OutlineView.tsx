// Write's Outline view: the page list, the handwritten pages and the selected block's editor side by
// side. Below 860 px the handwritten pages fill the stage under the Write bar, and the page list and the
// editor are a sheet over them (the one Style and Export use). The list comes first, capped at 40dvh and
// scrolling on its own, so a long text never pushes it out of reach. The sheet rests at its peek
// (OUTLINE_PEEK), at about half, or just below the Write bar; the pages leave room after the last one for
// as much as it covers. A word tapped on a page puts the caret in the sheet's editor.
import { useEffect, useRef, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Seg } from '@/engine/types';
import { StageSheet, useSheetSnaps } from '@/features/doc/StageSheet';
import { useStageActive } from '@/features/doc/StageHost';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { useWide } from '@/lib/media';
import { useEditor } from '@/store/editor';
import { PartMenu } from './TypedPage';
import { Inspector } from './Inspector';
import { OutlineList } from './OutlineList';
import { WriteBar } from './WriteBar';

const tagMenu = (sg: Seg) => <PartMenu sg={sg} />;

/** The lowest the sheet rests on phones, in px: its handle, the list's title, and page 1's heading and first block. */
export const OUTLINE_PEEK = 148;

const itemsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-item]')];
const itemOf = (root: HTMLElement, boxId: string | null) =>
  (boxId ? itemsIn(root).find(el => el.dataset.box === boxId) : undefined) ?? null;

/** The block a control belongs to: a list item's, the inspector's, or a handwritten part's. */
function boxOf(t: Element): string | null {
  const own = t.closest<HTMLElement>('[data-box]');
  if (own) return own.dataset.box ?? null;
  const part = t.closest<HTMLElement>('.block-frame[data-id]');
  return part?.dataset.id ? part.dataset.id.replace(/:\d+$/, '') : null;
}

/**
 * When an action takes away the control that had the focus (Delete block, Split, Remove part, Join back,
 * from the inspector, a ⋯ menu or a page-break line), the focus goes to the selected block's item, else
 * to the item that took the place of the gone block's in the list, else to its page's heading.
 * Returns the root's handlers: React's onFocus also hears focus inside the menus' portals.
 */
function useFocusHandOff(root: RefObject<HTMLElement | null>, active: boolean) {
  // The focused element, and where its block's first item was in the list (-1: none) and on which page.
  const spot = useRef<{ el: HTMLElement | null; at: number; page: number }>({ el: null, at: -1, page: -1 });
  const version = useEditor(s => (active ? s.version : -1));
  const note = (t: EventTarget, focused: boolean) => {
    const el = root.current;
    if (!el || !(t instanceof HTMLElement)) return;
    if (el.contains(t)) { // (a menu's portal keeps the place of the button that opened it)
      const item = itemOf(el, boxOf(t)), page = (item ?? t).closest<HTMLElement>('[data-drop-page]')?.dataset.dropPage;
      spot.current = { ...spot.current, at: item ? itemsIn(el).indexOf(item) : -1, page: page === undefined ? -1 : Number(page) };
    }
    if (focused) spot.current.el = t;
  };
  useEffect(() => {
    if (!active) return;
    // After the change, and after a closing menu has tried to give the focus back to its button.
    const t = setTimeout(() => {
      const el = root.current, { el: was, at, page } = spot.current, now = document.activeElement;
      if (!el || !was || was.isConnected || (now && now !== document.body && now.isConnected)) return;
      spot.current = { el: null, at: -1, page: -1 };
      const heads = [...el.querySelectorAll<HTMLElement>('[data-page-heading]')];
      const to = itemOf(el, useEditor.getState().selectedId) ?? (at >= 0 ? itemsIn(el)[at] : undefined)
        ?? heads[Math.min(Math.max(page, 0), heads.length - 1)];
      to?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [root, active, version]);
  return {
    onFocus: (e: FocusEvent<HTMLElement>) => note(e.target, true),
    onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => note(e.target, false),
  };
}

export function OutlineView({ layout }: { layout: PageLayout | null }) {
  const active = useStageActive();
  const wide = useWide();
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const handOff = useFocusHandOff(root, active);
  const snaps = useSheetSnaps(stage, !wide, `${OUTLINE_PEEK}px`);
  // The Add menu adds to the selected block's page, else to the last page.
  const addPage = useEditor(s => {
    if (!layout) return 0;
    const sg = layout.segs.find(x => x.box.id === s.selectedId);
    return sg ? sg.page : layout.pages - 1;
  });
  // (The focus hand-off's root holds the sheet too: it is drawn in place, not in a portal.)
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col" {...handOff}>
      <WriteBar view="outline" page={addPage} />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_minmax(320px,380px)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <OutlineList layout={layout} className="min-h-0 overflow-y-auto border-r border-line" />
          <PageView layout={layout} mode="write" tagMenu={tagMenu} className="min-h-0 overflow-y-auto" />
          <Inspector layout={layout} className="min-h-0 border-l border-line" />
        </div>
      ) : (
        <div ref={stage} className="flex min-h-0 flex-1 flex-col" style={{ '--sheet-shown': snaps.shown } as CSSProperties}>
          <PageView layout={layout} mode="write" tagMenu={tagMenu}
            className="min-h-0 flex-1 overflow-y-auto after:block after:h-[calc(var(--sheet-shown)+12px)] after:content-['']" />
          <StageSheet title="Outline" handleLabel="Drag to show more or less of Outline" snaps={snaps}>
            <OutlineList layout={layout} className="max-h-[40dvh] overflow-y-auto overscroll-contain border-b border-line" />
            <Inspector layout={layout} className="flex-none" />
          </StageSheet>
        </div>
      )}
    </div>
  );
}
