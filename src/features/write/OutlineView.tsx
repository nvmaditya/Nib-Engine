// Write's Outline view: the page list, the handwritten pages and the selected block's editor side by
// side. Below 860 px the list sits above the editor and the handwritten pages are left out (Outline's
// bottom sheet for phones comes in Milestone 6).
import { useEffect, useRef, type FocusEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Seg } from '@/engine/types';
import { useStageActive } from '@/features/doc/StageHost';
import { PageView, type PageLayout } from '@/features/pages/PageView';
import { useEditor } from '@/store/editor';
import { BlockMenu } from './BlockMenu';
import { Inspector } from './Inspector';
import { OutlineList } from './OutlineList';
import { WriteBar } from './WriteBar';

const tagMenu = (sg: Seg) => <BlockMenu boxId={sg.box.id} idx={sg.idx} />;

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
  const root = useRef<HTMLDivElement>(null);
  const handOff = useFocusHandOff(root, active);
  // The Add menu adds to the selected block's page, else to the last page.
  const addPage = useEditor(s => {
    if (!layout) return 0;
    const sg = layout.segs.find(x => x.box.id === s.selectedId);
    return sg ? sg.page : layout.pages - 1;
  });
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col" {...handOff}>
      <WriteBar view="outline" page={addPage} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:grid wide:grid-cols-[260px_minmax(0,1fr)_minmax(320px,380px)] wide:grid-rows-[minmax(0,1fr)] wide:overflow-hidden">
        <OutlineList layout={layout} className="max-h-[45dvh] flex-none overflow-y-auto border-b border-line wide:max-h-none wide:min-h-0 wide:border-r wide:border-b-0" />
        <PageView layout={layout} mode="write" tagMenu={tagMenu} className="hidden wide:block wide:min-h-0 wide:overflow-y-auto" />
        <Inspector layout={layout} className="min-h-[60dvh] flex-none wide:min-h-0 wide:border-l wide:border-line" />
      </div>
    </div>
  );
}
