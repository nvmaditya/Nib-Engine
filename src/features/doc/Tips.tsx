// The first-visit tips: a card in a corner (along the bottom on phones), a landmark a screen reader can find, and
// never something that takes the focus. Sheets (z-40) and dialogs (z-50) cover it. Mounted once beside the stages.
import { useEffect, useId, useRef, type FocusEvent } from 'react';
import { Button } from '@/components/ui/button';
import { chordLabel } from '@/lib/keys';
import { matches } from '@/lib/media';
import { dismissTips, tipLines, useTips } from './tips';

const TOUCH = '(hover: none) and (pointer: coarse)';
const KBD = 'rounded border border-line bg-surface-2 px-1.5 text-[12px] font-medium whitespace-nowrap';
const CONTROLS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A tip, with the keys it names in `<kbd>`. */
function Line({ text }: { text: string }) {
  const keys = [chordLabel(['Mod', 'K']), '?'];
  const parts = text.split(new RegExp(`(${keys.map(escape).join('|')})`));
  return <>{parts.map((p, i) => (keys.includes(p) ? <kbd key={i} className={KBD}>{p}</kbd> : p))}</>;
}

// Focus `el` if it can take the focus (still in the page, and not in a stage that is hidden or inert); whether it took it.
function focusOn(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el.closest('[inert], [hidden]')) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

export function Tips() {
  const open = useTips(s => s.open);
  const id = useId();
  const card = useRef<HTMLElement>(null);
  const from = useRef<Element | null>(null); // what had the focus before it came into the card

  useEffect(() => dismissTips, []); // leaving the document puts them away: they show once

  if (!open) return null;

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) from.current = e.relatedTarget;
  };
  // A click never takes the focus (Got it keeps it off the button), so the caret stays where it is. When the focus
  // is in the card (the keyboard, a screen reader), it goes back to what had it, or else into the stage on screen.
  const gotIt = () => {
    if (card.current?.contains(document.activeElement) && !focusOn(from.current)) {
      const stage = document.querySelector('[data-stage]:not([hidden])');
      if (stage) [...stage.querySelectorAll(CONTROLS)].some(focusOn);
    }
    dismissTips();
  };

  return (
    <aside
      ref={card}
      aria-labelledby={id}
      onFocus={onFocus}
      className="fixed z-30 rounded-xl border border-line bg-surface p-4 shadow-lg inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] wide:inset-x-auto wide:bottom-4 wide:left-4 wide:w-80"
    >
      <h2 id={id} className="text-sm font-semibold">Tips</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-muted">
        {tipLines(matches(TOUCH)).map(t => <li key={t}><Line text={t} /></li>)}
      </ol>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onMouseDown={e => e.preventDefault()} onClick={gotIt}>Got it</Button>
      </div>
    </aside>
  );
}
