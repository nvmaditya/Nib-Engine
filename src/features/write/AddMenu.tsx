// The Add menu: a text block, a margin note or the header on a page, or a blank page at the end.
import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { addBlock, addPageAt } from '@/features/doc/actions';

/** `page` (0-based) is where a text block or margin note goes; the header always goes on page 1. */
export function AddMenu({ page }: { page: number }) {
  const trigger = useRef<HTMLButtonElement>(null);
  // What was chosen runs once the menu has closed. While it is open it keeps the focus to itself, so a
  // new block's editor that took the focus straight away would lose it again.
  const chosen = useRef<(() => void) | null>(null);
  const choose = (run: () => void) => () => { chosen.current = run; };
  const onCloseAutoFocus = (e: Event) => {
    const run = chosen.current;
    chosen.current = null;
    if (!run) return; // closed without a choice: the focus goes back to Add
    e.preventDefault();
    run();
    // A new block's editor takes the focus; when nothing does (a header, a page, a refusal), it goes back to Add.
    setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) trigger.current?.focus(); }, 0);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild ref={trigger}>
        <Button variant="ghost" size="sm"><Plus />Add</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuItem onSelect={choose(() => addBlock('text', page))}>Text block</DropdownMenuItem>
        <DropdownMenuItem onSelect={choose(() => addBlock('note', page))}>Margin note</DropdownMenuItem>
        <DropdownMenuItem onSelect={choose(() => addBlock('header', page))}>Header</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={choose(() => addPageAt())}>Page</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
