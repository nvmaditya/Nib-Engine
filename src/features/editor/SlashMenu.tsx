// The `/` menu: what to insert or turn the line into. Focus stays in the editor; its arrow keys, Enter and
// Escape reach the menu through the suggestion plugin.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SuggestionProps } from '@tiptap/suggestion';
import { onSlashKey, type SlashItem } from './extensions';

export function SlashMenu({ state }: { state: SuggestionProps<SlashItem, SlashItem> | null }) {
  const id = useId();
  const [sel, setSel] = useState({ q: '', i: 0 });
  const items = state?.items ?? [];
  const query = state?.query ?? '';
  const active = sel.q === query ? Math.min(sel.i, Math.max(0, items.length - 1)) : 0; // a new query starts at the top
  const now = useRef(active);
  now.current = active;

  useEffect(() => {
    if (!state) return;
    return onSlashKey(state.editor, e => {
      const n = state.items.length;
      if (!n) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const i = (now.current + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        now.current = i;
        setSel({ q: state.query, i });
        return true;
      }
      if (e.key === 'Enter') { state.command(state.items[now.current]); return true; }
      return false;
    });
  }, [state]);

  // While it is open, the editor (where focus is) says it controls the menu and points at the highlighted option.
  const dom = state?.editor.view.dom, listId = `${id}-list`, optionId = `${id}-${active}`, open = !!state && items.length > 0;
  useEffect(() => {
    if (!dom || !open) return;
    const attrs = { 'aria-haspopup': 'listbox', 'aria-expanded': 'true', 'aria-controls': listId };
    for (const [k, v] of Object.entries(attrs)) dom.setAttribute(k, v);
    return () => { for (const k of Object.keys(attrs)) dom.removeAttribute(k); };
  }, [dom, open, listId]);
  useEffect(() => {
    if (!dom || !open) return;
    dom.setAttribute('aria-activedescendant', optionId);
    return () => dom.removeAttribute('aria-activedescendant');
  }, [dom, open, optionId]);

  if (!state || !open) return null;
  const r = state.clientRect?.(), left = Math.max(8, Math.min(r?.left ?? 0, window.innerWidth - 232)), top = (r?.bottom ?? 0) + 6;
  return createPortal(
    <div id={listId} role="listbox" aria-label="Insert" className="fixed z-50 w-56 rounded-lg border border-line bg-surface p-1 text-fg shadow-lg" style={{ left, top }}>
      {items.map((it, i) => (
        <div key={it.label} id={`${id}-${i}`} role="option" aria-selected={i === active}
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium aria-selected:bg-surface-2"
          onMouseDown={e => { e.preventDefault(); state.command(it); }}
          onMouseEnter={() => setSel({ q: query, i })}>
          {it.label}
        </div>
      ))}
    </div>,
    document.body,
  );
}
