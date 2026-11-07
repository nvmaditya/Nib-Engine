// On phones the Style panel is a sheet over the pages. It is drawn inside the Style stage (no portal),
// so it is hidden with the stage, and it is open only while the stage is shown. It never closes and
// doesn't trap anything: the pages above stay live. It rests at three heights: 148 px, where the
// panel's sticky header shows (title, New variation, the page count notice and scope), about half,
// and up to just below the stage switcher, so the stages can still be reached.
import { useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Drawer, DrawerContent, DrawerHandle, DrawerTitle } from '@/components/ui/drawer';
import { useStageActive } from '@/features/doc/StageHost';

type Snap = number | string;

/** How much of the window a resting height shows, as CSS. */
const shown = (p: Snap): string => (typeof p === 'string' ? p : `${Math.round(p * 1000) / 10}dvh`);

export interface SheetSnaps {
  /** The resting heights, lowest first (vaul's snap points). */
  points: Snap[];
  /** The one the sheet is at. */
  at: Snap;
  set(p: Snap | null): void;
  /** How much of the window the sheet covers there, as CSS (for the room the pages leave below). */
  shown: string;
}

/**
 * The sheet's resting heights, worked out from `stage`, the element that fills the Style stage (it
 * starts just below the top bar and its stage switcher). The sheet starts at about half.
 */
export function useSheetSnaps(stage: RefObject<HTMLElement | null>, on: boolean): SheetSnaps {
  const active = useStageActive();
  const [box, setBox] = useState({ top: 0, height: typeof window === 'undefined' ? 0 : window.innerHeight });
  const [i, setI] = useState(1);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || !on || !active) return;
    const measure = () => {
      const top = Math.round(el.getBoundingClientRect().top), height = window.innerHeight;
      setBox(b => (b.top === top && b.height === height ? b : { top, height }));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [stage, on, active]);
  // (The same array until the window or the top bar changes: vaul moves the sheet when it changes.)
  const points = useMemo((): Snap[] => ['148px', 0.55, `${Math.max(148, box.height - box.top)}px`], [box]);
  // (Pressing the handle at the top height, where vaul has no next one, goes back to the lowest.)
  return { points, at: points[i], set: p => setI(Math.max(0, points.indexOf(p ?? points[0]))), shown: shown(points[i]) };
}

export function StyleSheet({ snaps, children }: { snaps: SheetSnaps; children: ReactNode }) {
  const active = useStageActive();
  return (
    <Drawer open={active} modal={false} dismissible={false} noBodyStyles snapPoints={snaps.points}
      activeSnapPoint={snaps.at} setActiveSnapPoint={snaps.set}>
      {/* vaul slides a full-height sheet down, so the panel's scroll area is cut short by what is below
          the screen, to end at its bottom. It closes only with its stage, which hides it at once: no
          closing slide to wait for, so no closed sheet is left behind. */}
      <DrawerContent aria-describedby={undefined} className="h-full"
        style={{ paddingBottom: `calc(100dvh - ${snaps.shown})`, animationName: active ? undefined : 'none' }}>
        <DrawerTitle className="sr-only">Style</DrawerTitle>
        <DrawerHandle aria-label="Drag to show more or less of Style" className="mx-auto" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
