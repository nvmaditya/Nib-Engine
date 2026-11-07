// A page's ⋯ menu: move it up or down, merge it into the page before, add a page after it, delete it.
import type { ReactElement } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { addPageAt, deletePageAt, mergeIntoPreviousPage, movePageTo } from '@/features/doc/actions';
import { useEditor } from '@/store/editor';
import { OptionsButton } from './BlockMenu';

interface Props {
  /** The page (0-based) and how many pages there are. */
  page: number;
  pages: number;
  /** The button that opens it; by default ⋯ named `Options for page {i}`. */
  trigger?: ReactElement;
  /** Called with the page's new index after Move up or Move down (a pager follows the page). */
  onMoved?: (to: number) => void;
}

export function PageMenu({ page, pages, trigger, onMoved }: Props) {
  const first = page === 0, last = page >= pages - 1;
  // A refused move changes nothing, so the pager is told only when the document changed.
  const move = (to: number) => {
    const v = useEditor.getState().version;
    movePageTo(page, to);
    if (useEditor.getState().version !== v) onMoved?.(to);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger ?? <OptionsButton label={`Options for page ${page + 1}`} />}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={first} onSelect={() => move(page - 1)}>Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => move(page + 1)}>Move down</DropdownMenuItem>
        <DropdownMenuItem disabled={first} onSelect={() => mergeIntoPreviousPage(page)}>Merge into previous page</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => addPageAt(page + 1)}>Add a page after this one</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => deletePageAt(page)}>Delete page</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
