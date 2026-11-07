// Where keys are typed (M1's rule): a field, or an editor and anything inside it. The app's own keys leave them
// alone there, except Ctrl/⌘+K and Ctrl/⌘+/.

/**
 * Whether keys at `t` are typed into a field or an editor. In an editor the nearest `contenteditable` decides, as
 * the browser's isContentEditable does (which jsdom lacks): a control in an editor's widget (`false`) is not.
 */
export function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return true;
  const host = el.closest('[contenteditable]');
  return !!host && host.getAttribute('contenteditable') !== 'false';
}
