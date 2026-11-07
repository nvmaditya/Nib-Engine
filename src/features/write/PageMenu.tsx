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
  /**
   * The page (0-based) a pager should show next: the page's new index after Move up or Move down, the new
   * blank page after Add a page after this one (after any text that runs on from this page), and the page
   * before after Merge into previous page.
   */
  onShow?: (page: number) => void;
}

export function PageMenu({ page, pages, trigger, onShow }: Props) {
  const first = page === 0, last = page >= pages - 1;
  // A refused action changes nothing, so the pager is told only when the document changed.
  const then = (run: () => void, next: number) => () => {
    const v = useEditor.getState().version;
    run();
    if (useEditor.getState().version !== v) onShow?.(next);
  };
  const add = () => {
    const blank = addPageAt(page + 1);
    if (blank !== null) onShow?.(blank);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger ?? <OptionsButton label={`Options for page ${page + 1}`} />}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={first} onSelect={then(() => movePageTo(page, page - 1), page - 1)}>Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={then(() => movePageTo(page, page + 1), page + 1)}>Move down</DropdownMenuItem>
        <DropdownMenuItem disabled={first} onSelect={then(() => mergeIntoPreviousPage(page), page - 1)}>Merge into previous page</DropdownMenuItem>
        <DropdownMenuItem onSelect={add}>Add a page after this one</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => deletePageAt(page)}>Delete page</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
