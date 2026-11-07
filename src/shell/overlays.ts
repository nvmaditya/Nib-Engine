// The app's own overlays, the command palette and the shortcut sheet: one open at a time. Each is a modal
// dialog marked `data-overlay`, mounted once outside the stages (Overlays.tsx).
import { create } from 'zustand';

export type Overlay = 'palette' | 'shortcuts';

export const useOverlays = create<{ open: Overlay | null }>()(() => ({ open: null }));

// What had the focus when the first overlay opened, to have it back when the last one closes.
let before: HTMLElement | null = null;
function show(open: Overlay | null): void {
  if (open && !useOverlays.getState().open) before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useOverlays.setState({ open });
}

/** Show `o`, in place of the other overlay if that one is open. */
export const openOverlay = (o: Overlay): void => show(o);

/** Show `o`, or close it if it is the one open. */
export const toggleOverlay = (o: Overlay): void => show(useOverlays.getState().open === o ? null : o);

export const closeOverlay = (): void => show(null);

/**
 * An overlay's `onCloseAutoFocus`. A modal Radix dialog gives the focus to its trigger when it closes, and the
 * overlays have none, so the focus would be left on the page itself. Instead it goes back to what had it before
 * the first overlay opened (if that is still there), or stays in the overlay that took this one's place.
 */
export function focusBack(e: Event): void {
  e.preventDefault();
  if (useOverlays.getState().open) return;
  const el = before;
  before = null;
  if (el?.isConnected) el.focus({ preventScroll: true });
}

// Another dialog or menu: not a sheet that stays open beside the page (aria-modal="false") and not one of ours.
// The / menu's list counts too, as it does for DocumentView's Escape; the palette's own list doesn't.
const MODALS = '[role="dialog"]:not([aria-modal="false"]):not([data-overlay]), [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Whether a dialog or menu other than the app's overlays is open, so the app's keys open nothing over it.
 * One left in a stage that isn't shown (hidden and inert) doesn't count.
 */
export function otherModalOpen(): boolean {
  return [...document.querySelectorAll(MODALS)].some(m => !m.closest('[data-stage][hidden]') && !m.closest('[data-overlay]'));
}
