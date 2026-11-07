// What had the focus before a message's button took it, so pressing the button (its Undo, say) gives the focus
// back there instead of leaving it on <body> when the message goes.
const TOASTER = '[data-sonner-toaster]';

let last: HTMLElement | null = null;

/** Remember each element that takes the focus, except the messages' own buttons. Returns the remover. */
export function installFocusMemory(): () => void {
  const onFocus = (e: FocusEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && !t.closest(TOASTER)) last = t;
  };
  document.addEventListener('focusin', onFocus, true);
  return () => document.removeEventListener('focusin', onFocus, true);
}

/** The element that had the focus last, outside the messages. */
export const rememberedFocus = (): HTMLElement | null => last;

/**
 * Give the focus back to `el`, but only if it was lost: it is on <body>, or on a message (which is going). Never to
 * an element that is gone, or behind a dialog (`inert`), or in a hidden stage.
 */
export function giveFocusBack(el: HTMLElement | null): void {
  const now = document.activeElement;
  const lost = now === null || now === document.body || now.closest(TOASTER) !== null;
  if (!el || !lost || !el.isConnected || el.closest('[inert], [hidden]')) return;
  el.focus({ preventScroll: true });
}
