// A block's ⋯ menu, for the part of it on one page: rename, join or split it, move it, style it, delete it.
import { useId, useRef, useState, type ComponentProps, type ReactElement, type RefObject } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { HEADER_FIELDS } from '@/engine/doc.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addToEndOf, deleteBlock, joinBackBlock, moveBlockTo, removePart, renameBlock, showField, splitAt, styleBox } from '@/features/doc/actions';
import { joinable, layoutFor } from '@/features/doc/model';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';

/** The ⋯ button that opens a menu; `label` is its accessible name. */
export function OptionsButton({ label, className, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <button type="button" aria-label={label} {...props}
      className={cn('inline-flex size-7 flex-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-surface-2 data-[state=open]:text-fg [&_svg]:size-4', className)}>
      <MoreHorizontal />
    </button>
  );
}

/** A header's optional fields, added and removed from its menu. */
const OPTIONAL = HEADER_FIELDS.filter((f): f is ['subject' | 'roll', string] => f[0] === 'subject' || f[0] === 'roll');

interface Props {
  boxId: string;
  /** Which part (0-based) the menu is for. */
  idx: number;
  /** The button that opens it; by default ⋯ named `Options for {name}`. */
  trigger?: ReactElement;
}

export function BlockMenu({ boxId, idx, trigger }: Props) {
  const name = useEditor(s => s.doc.boxes.find(b => b.id === boxId)?.name);
  const [renaming, setRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (name === undefined) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild ref={triggerRef}>{trigger ?? <OptionsButton label={`Options for ${name}`} />}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <BlockMenuItems boxId={boxId} idx={idx} onRename={() => setRenaming(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <RenameDialog boxId={boxId} name={name} onClose={() => setRenaming(false)} returnTo={triggerRef} />}
    </>
  );
}

/** The menu's items, worked out from the layout only while it is open. */
function BlockMenuItems({ boxId, idx, onRename }: { boxId: string; idx: number; onRename(): void }) {
  useEditor(s => s.version);
  const { S, doc } = useEditor.getState();
  const box = doc.boxes.find(b => b.id === boxId);
  if (!box) return null;
  const L = layoutFor(S, doc);
  const parts = L.segs.filter(s => s.box === box), part = parts.find(s => s.idx === idx);
  const header = box.kind === 'header';
  const from = box.from !== undefined ? doc.boxes.find(b => b.id === box.from) : undefined;
  // A header's text comes from its fields: it is never split, cut by part, joined or added to another block.
  const others = joinable(box) ? doc.boxes.filter(b => b !== box && b.id !== box.from && joinable(b)) : [];
  // Moving to the page it shows on, or to the page it is stored on (where a pushed block is anyway), would do nothing.
  const here = new Set([part?.page ?? box.page, box.page]);
  const pages = Array.from({ length: L.pages }, (_, p) => p);
  const canMove = idx === 0 && pages.some(p => !here.has(p));

  return (
    <>
      <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
      {from && joinable(box) && <DropdownMenuItem onSelect={() => joinBackBlock(boxId)}>Join back into “{from.name}”</DropdownMenuItem>}
      {!header && parts.length > 1 && part && (
        <>
          <DropdownMenuItem onSelect={() => splitAt(boxId, idx)}>{idx === 0 ? 'Split from the rest' : 'Split into its own block'}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => removePart(boxId, idx)}>Remove the page {part.page + 1} part</DropdownMenuItem>
        </>
      )}
      {header && OPTIONAL.map(([k, label]) => {
        const on = typeof box.fields?.[k] === 'string';
        return <DropdownMenuItem key={k} onSelect={() => showField(boxId, k, !on)}>{on ? 'Remove' : 'Add'} {label}</DropdownMenuItem>;
      })}
      {others.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Add to the end of…</DropdownMenuLabel>
          {others.map(o => <DropdownMenuItem key={o.id} onSelect={() => addToEndOf(boxId, o.id)}>“{o.name}”</DropdownMenuItem>)}
          <DropdownMenuSeparator />
        </>
      )}
      {canMove && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to page…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {pages.map(p => <DropdownMenuItem key={p} disabled={here.has(p)} onSelect={() => moveBlockTo(boxId, 0, p)}>Page {p + 1}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem onSelect={() => styleBox(boxId)}>Give it its own style</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => deleteBlock(boxId)}>Delete block</DropdownMenuItem>
    </>
  );
}

function RenameDialog({ boxId, name, onClose, returnTo }: { boxId: string; name: string; onClose(): void; returnTo: RefObject<HTMLButtonElement | null> }) {
  const [value, setValue] = useState(name);
  const id = useId();
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      {/* Focus goes back to the ⋯ button (the menu item that opened this is gone). */}
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm"
        onCloseAutoFocus={e => { e.preventDefault(); returnTo.current?.focus(); }}>
        <form className="contents" onSubmit={e => { e.preventDefault(); renameBlock(boxId, value); onClose(); }}>
          <DialogHeader><DialogTitle>Rename block</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>Block name</Label>
            <Input id={id} value={value} maxLength={60} autoFocus onFocus={e => e.currentTarget.select()} onChange={e => setValue(e.target.value)} />
          </div>
          <DialogFooter><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
