// The app's own overlays, the command palette and the shortcut sheet: one open at a time. Each is a modal
// dialog marked `data-overlay`, mounted once outside the stages (Overlays.tsx).
import { create } from 'zustand';

export type Overlay = 'palette' | 'shortcuts';

export const useOverlays = create<{ open: Overlay | null }>()(() => ({ open: null }));

// What had the focus when the first overlay opened, to have it back when the last one closes. The page itself
// and a place inside an overlay are never taken for it: a key that opens one again before the last one's
// closing has given the focus back (Radix does that on a timer, which runs after the keys already waiting)
// finds the focus there, and what had it before is still the place to go back to.
let before: HTMLElement | null = null;
function show(open: Overlay | null): void {
  const el = document.activeElement;
  if (open && !useOverlays.getState().open && el instanceof HTMLElement && el !== document.body && !el.closest('[data-overlay]')) before = el;
  useOverlays.setState({ open });
}

/** Show `o`, in place of the other overlay if that one is open. */
export const openOverlay = (o: Overlay): void => show(o);

/** Show `o`, or close it if it is the one open. */
export const toggleOverlay = (o: Overlay): void => show(useOverlays.getState().open === o ? null : o);

export const closeOverlay = (): void => show(null);

/**
 * What had the focus before the first overlay opened. A dialog an overlay's command opens (the palette's Import)
 * gives the focus back there, not to the overlay's field, which is gone by then.
 */
export const focusBeforeOverlay = (): HTMLElement | null => before;

const CONTROLS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// Focus `el` if it can take the focus (still in the page, and not in a stage or part that is hidden or inert,
// where focus() does nothing); whether it took it.
function focusOn(el: HTMLElement | null): boolean {
  if (!el?.isConnected || el.closest('[inert], [hidden]')) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}
const focusFirstIn = (root: Element | null): boolean => !!root && [...root.querySelectorAll<HTMLElement>(CONTROLS)].some(focusOn);

/**
 * An overlay's `onCloseAutoFocus`. A modal Radix dialog gives the focus to its trigger when it closes, and the
 * overlays have none, so the focus would be left on the page itself. Instead it goes back to what had it before
 * the first overlay opened, or stays in the overlay that took this one's place. When nothing had it (the page
 * itself had it: a document opened from Home, whose card is gone) or that can't take it any more (gone, or in a
 * stage no longer shown), it goes to `instead` if that takes it, else the first control in the stage on screen,
 * else the top bar's. It is given back only if it was lost (on the page itself): when the overlay closed into
 * another dialog (the palette's Import, which gives it back itself, to `focusBeforeOverlay()`), or something took
 * it meanwhile (New document's caret), it stays there, and nothing is kept for later.
 */
export function focusBack(e: Event, instead?: () => boolean): void {
  e.preventDefault();
  if (useOverlays.getState().open) return;
  const el = before;
  before = null;
  const taken = document.activeElement !== null && document.activeElement !== document.body && !document.activeElement.closest('[data-overlay]');
  if (taken || otherModalOpen() || (el && focusOn(el)) || instead?.()) return;
  if (!focusFirstIn(document.querySelector('[data-stage]:not([hidden])'))) focusFirstIn(document.querySelector('header'));
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
