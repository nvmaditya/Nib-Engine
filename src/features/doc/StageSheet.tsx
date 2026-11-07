// On phones the Style and Export panels are a sheet over the pages. It is drawn inside the stage (no
// portal), so it is hidden with the stage, and it is open only while the stage is shown. It never closes
// and doesn't trap anything: the pages above stay live. It rests at three heights: the peek (Style's
// 148 px shows the panel's sticky header: title, New variation, the page count notice and scope;
// Export's 168 px, plus a phone's home indicator, shows its title and its pinned footer), about half,
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
 * The sheet's resting heights, worked out from `stage`, the element that fills the stage (it starts
 * just below the top bar and its stage switcher): `peek`, about half, and the top, which is at least
 * the peek. The sheet starts at about half.
 */
export function useSheetSnaps(stage: RefObject<HTMLElement | null>, on: boolean, peek: string): SheetSnaps {
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
  const points = useMemo((): Snap[] => [peek, 0.55, `${Math.max(parseFloat(peek), box.height - box.top)}px`], [box, peek]);
  // (Pressing the handle at the top height, where vaul has no next one, goes back to the lowest.)
  return { points, at: points[i], set: p => setI(Math.max(0, points.indexOf(p ?? points[0]))), shown: shown(points[i]) };
}

export interface StageSheetProps {
  /** The sheet's name (visually hidden: the panel's own heading shows). */
  title: string;
  /** The drag handle's label. */
  handleLabel: string;
  snaps: SheetSnaps;
  /** With `scroll` the body scrolls. Without it the body is a flex column, and the child scrolls and pads for the safe area itself. */
  scroll?: boolean;
  children: ReactNode;
}

export function StageSheet({ title, handleLabel, snaps, scroll = true, children }: StageSheetProps) {
  const active = useStageActive();
  return (
    <Drawer open={active} modal={false} dismissible={false} noBodyStyles snapPoints={snaps.points}
      activeSnapPoint={snaps.at} setActiveSnapPoint={snaps.set}>
      {/* vaul slides a full-height sheet down, so the panel's scroll area is cut short by what is below
          the screen, to end at its bottom. It closes only with its stage, which hides it at once: no
          closing slide to wait for, so no closed sheet is left behind. */}
      <DrawerContent aria-describedby={undefined} className="h-full"
        style={{ paddingBottom: `calc(100dvh - ${snaps.shown})`, animationName: active ? undefined : 'none' }}>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerHandle aria-label={handleLabel} className="mx-auto" />
        <div className={scroll ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]' : 'flex min-h-0 flex-1 flex-col'}>{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
