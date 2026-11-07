// On phones the Style panel is a sheet over the pages. It is drawn inside the Style stage (no portal),
// so it is hidden with the stage, and it is open only while the stage is shown. It never closes and
// doesn't trap anything: the pages above stay live. It rests at three heights: 148 px, where the
// panel's sticky header shows (title, New variation, scope and the page count), about half, and
// nearly full.
import { useState, type ReactNode } from 'react';
import { Drawer, DrawerContent, DrawerHandle, DrawerTitle } from '@/components/ui/drawer';
import { useStageActive } from '@/features/doc/StageHost';

type Snap = number | string;
const SNAPS: Snap[] = ['148px', 0.55, 0.94];

/**
 * How much of the sheet is below the screen at a resting height. vaul slides a full-height sheet
 * down, so the panel's scroll area is cut short by this much to end at the bottom of the screen.
 */
const hiddenBelow = (p: Snap): string => (typeof p === 'string' ? `calc(100dvh - ${p})` : `${Math.round((1 - p) * 1000) / 10}dvh`);

export function StyleSheet({ children }: { children: ReactNode }) {
  const active = useStageActive();
  const [snap, setSnap] = useState<Snap>(0.55);
  return (
    <Drawer open={active} modal={false} dismissible={false} noBodyStyles snapPoints={SNAPS}
      // Pressing the handle at the top height (where vaul has no next one) goes back to the lowest.
      activeSnapPoint={snap} setActiveSnapPoint={p => setSnap(p ?? SNAPS[0])}>
      {/* It closes only with its stage, which hides it at once: no closing slide to wait for, so no closed sheet is left behind. */}
      <DrawerContent aria-describedby={undefined} className="h-full" style={{ paddingBottom: hiddenBelow(snap), animationName: active ? undefined : 'none' }}>
        <DrawerTitle className="sr-only">Style</DrawerTitle>
        <DrawerHandle aria-label="Drag to show more or less of Style" className="mx-auto" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
