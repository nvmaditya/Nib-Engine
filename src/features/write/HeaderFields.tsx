// A header block's fields (Name, Class and Date to start with), each written as one line of the header, and
// the editor that adds, renames, removes and reorders them.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { HEADER_LIMITS } from '@/engine/doc.js';
import type { HeaderField } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { addField, moveField, removeField, renameField, setField } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';
import { OptionsButton } from './BlockMenu';
import { dragGhost, dropClass, gripClass, pageDropIndex, rowAt, startDrag } from './dnd';

/**
 * The field editor over a header block's fields, each change one undo step in the open document (typing in one
 * field's value: one step for the burst). `compact` is for the typed page: one ruled line a row, at the page's text
 * size, and Add field laid over the line under the fields.
 */
export function HeaderFields({ boxId, compact = false }: { boxId: string; compact?: boolean }) {
  // Changing a field replaces the list, so this re-renders on every change (and on undo).
  const fields = useEditor(s => s.doc.boxes.find(b => b.id === boxId && b.kind === 'header')?.fields);
  const ops = useMemo((): FieldOps => ({
    setValue: (id, value) => setField(boxId, id, value),
    add: field => addField(boxId, field),
    rename: (id, label) => renameField(boxId, id, label),
    remove: id => removeField(boxId, id),
    move: (id, to) => moveField(boxId, id, to),
  }), [boxId]);
  if (!fields) return null;
  return <FieldEditor fields={fields} ops={ops} compact={compact} />;
}

/* ---------- The field editor ---------- */

/** What the editor asks for; the header (or Import's copy of one) does it. */
export interface FieldOps {
  setValue(id: string, value: string): void;
  /** Add at the end; the new field's id, or null when nothing was added. */
  add(field: { label: string; today?: true }): string | null;
  rename(id: string, label: string): void;
  remove(id: string): void;
  move(id: string, to: number): void;
}

/** What Add field offers, in this order, leaving out those the header has (by label, trimmed, ignoring case). */
const COMMON = ['Name', 'Class', 'Section', 'Subject', 'Roll no.', 'Registration no.', 'Date', 'Teacher', 'School'];

/** A part of a row the focus can go to, found by its attribute (its value is the field's id). */
type Part = 'value' | 'name' | 'label' | 'menu';
const PART_ATTR: Record<Part, string> = { value: 'data-field-value', name: 'data-field-name', label: 'data-field-label', menu: 'data-field-menu' };
/** Where the focus goes once a change has been drawn. `menu`: a menu item asked for it, so it may have to wait for the menu to close. */
interface FocusTo { id: string; part: Part; menu?: true }

const ring = 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
/** The typed page's value input (and name input): no box, a rule under it, the page's text size and line height. */
const COMPACT_INPUT = 'h-auto rounded-sm border-0 border-b border-line bg-transparent px-[0.25em] py-0 text-[length:inherit] leading-[inherit] focus-visible:ring-2 focus-visible:ring-ring/50';
/**
 * On the typed page, an icon at the text's size, with a 44 px square to press below `wide:`. The rows' grid clips
 * the squares at its first and last lines (`COMPACT_CLIP`), so a block under the header keeps its taps.
 */
const COMPACT_HIT = 'relative before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 wide:before:hidden';
/** The squares stop 3 px past the first and last lines (room for the focus rings), and well past the sides. */
const COMPACT_CLIP = '[clip-path:inset(-3px_-24px)]';
/** On the typed page, the label, name and value are above those squares: a press on them is theirs. */
const OVER_SQUARES = 'relative z-[1]';
/** On the typed page, the grip and the ⋯ show while their row has the pointer or the focus, and always where there is no hover. */
const COMPACT_REVEAL = 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100';

function partOf(root: HTMLElement, { id, part }: FocusTo): HTMLElement | undefined {
  const attr = PART_ATTR[part];
  return [...root.querySelectorAll<HTMLElement>(`[${attr}]`)].find(el => el.getAttribute(attr) === id);
}

/** Focus `to` inside `root`; whether it now has the focus. A field's name is focused with its text selected. */
function focusPart(root: HTMLElement | null, to: FocusTo): boolean {
  const el = root && partOf(root, to);
  if (!el) return false;
  if (document.activeElement !== el) {
    el.focus();
    if (to.part === 'name' && el instanceof HTMLInputElement) el.select();
  }
  return document.activeElement === el;
}

/**
 * A header's fields as rows: a grip to drag the row (pointer only), the label (pressed to rename it in place), the
 * value, and a ⋯ menu (Rename, Move up, Move down, Remove), then Add field. It holds no list of its own: every
 * change goes to `ops`, and the rows follow `fields`. After each change the focus goes where the spec says
 * (the next value after Remove, the moved row's ⋯ after a move, the new value or name after Add, the label after
 * a rename). `compact` is the typed page's: one ruled line a row at the page's text size, the grip and ⋯ shown on
 * hover or focus, and Add field laid over the line under the fields.
 */
export function FieldEditor({ fields, ops, compact = false }: { fields: HeaderField[]; ops: FieldOps; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(fields);
  latest.current = fields;
  // The field whose name is open, and whether its row has been drawn yet (a field just added may not have been).
  const [renaming, setRenaming] = useState<{ id: string; shown: boolean } | null>(null);
  if (renaming) {
    const here = fields.some(f => f.id === renaming.id);
    if (here && !renaming.shown) setRenaming({ id: renaming.id, shown: true });
    else if (!here && renaming.shown) setRenaming(null); // its field went (Undo, another tab): it doesn't come back open
  }
  // Whose ⋯ menu is open (held here, so a press meant for another row can open that row's).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const focusTo = useRef<FocusTo | null>(null);
  // A menu item chose where the focus goes: the menu mustn't put it back on its button as it closes.
  const fromMenu = useRef(false);

  // Each change is drawn before this runs, so what the focus goes to is there now.
  useLayoutEffect(() => {
    const to = focusTo.current;
    if (!to) return;
    if (focusPart(root.current, to) || !to.menu) focusTo.current = null;
  });
  // Radix's menu puts the focus back on its button a moment after it closes; if an item chose, the focus is already
  // where it goes (or goes there now, if the change was drawn later than the menu closed).
  const onCloseAutoFocus = (e: Event) => {
    if (!fromMenu.current) return;
    fromMenu.current = false;
    e.preventDefault();
    const to = focusTo.current;
    focusTo.current = null;
    if (to) focusPart(root.current, to);
  };
  const choose = (to: FocusTo, change: () => void) => {
    focusTo.current = { ...to, menu: true };
    fromMenu.current = true;
    change();
  };

  const openName = (id: string, fromItem: boolean) => {
    if (fromItem) fromMenu.current = true;
    focusTo.current = { id, part: 'name', ...(fromItem && { menu: true as const }) };
    setRenaming({ id, shown: latest.current.some(f => f.id === id) });
  };
  const endName = (id: string, draft: string | null, back: boolean) => {
    if (draft !== null) ops.rename(id, draft);
    if (back) focusTo.current = { id, part: 'label' };
    setRenaming(r => (r?.id === id ? null : r));
  };
  const add = (field: { label: string; today?: true }, then: 'value' | 'name') => {
    const id = ops.add(field);
    if (id === null) return; // nothing added: the menu gives the focus back to Add field
    if (then === 'name') openName(id, true);
    else choose({ id, part: 'value' }, () => {});
  };

  /**
   * The field whose row is on the line at `y`, or past the first or last line the row at that end. On a phone's
   * typed page the rows are closer together than the 44 px squares their grip and ⋯ are pressed in, so a square
   * reaches over the lines next to its own, where the later row's is on top: a press is for the row whose line it
   * lands on (a drop finds its row the same way).
   */
  const fieldAt = (y: number): HeaderField | undefined => {
    const row = root.current ? rowAt(root.current.querySelectorAll<HTMLElement>('[data-drop-field]'), y) : undefined;
    return row ? latest.current[Number(row.dataset.dropField)] : undefined;
  };

  // The grip drags its row before or after another row; a press that doesn't move does nothing, and the focus stays put.
  const drag = (e: ReactPointerEvent<HTMLElement>, own: HeaderField) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const f = fieldAt(e.clientY) ?? own;
    startDrag(e, {
      kind: 'grip', targets: 'field', ghost: () => dragGhost(f.label),
      onDrop: t => {
        const list = latest.current, from = list.findIndex(x => x.id === f.id);
        if (!t || from < 0) return;
        const to = Math.min(pageDropIndex(from, t.page, t.after), list.length - 1);
        if (to !== from) ops.move(f.id, to);
      },
    });
  };

  const have = new Set(fields.map(f => f.label.trim().toLowerCase()));
  const offered = COMMON.filter(l => !have.has(l.toLowerCase()));
  const full = fields.length >= HEADER_LIMITS.fields;
  const last = fields.length - 1;

  const addButton = compact ? (
    <button type="button" title={full ? 'A header holds up to 12 fields.' : undefined}
      className={cn('invisible absolute top-full left-0 z-10 inline-flex h-6 items-center gap-0.5 rounded-[4px] bg-[var(--bc,var(--primary))] py-0 pr-1.5 pl-1 text-[11px] leading-none font-medium whitespace-nowrap text-white',
        'group-hover/fields:visible group-focus-within/fields:visible data-[state=open]:visible in-[.selected]:visible',
        'hover:brightness-110 disabled:pointer-events-auto disabled:opacity-60 wide:h-5 [&_svg]:size-3', ring)}>
      <Plus aria-hidden />Add field
    </button>
  ) : (
    <Button variant="ghost" size="sm" title={full ? 'A header holds up to 12 fields.' : undefined}
      className="mt-2 -ml-1 h-11 px-2.5 text-muted hover:text-fg disabled:pointer-events-auto disabled:hover:bg-transparent disabled:hover:text-muted wide:h-8">
      <Plus aria-hidden />Add field
    </Button>
  );

  return (
    <div ref={root} className="group/fields relative">
      <div className={cn('grid items-center', compact ? cn('grid-cols-[auto_fit-content(45%)_minmax(0,1fr)_auto] gap-x-[0.4em]', COMPACT_CLIP) : 'grid-cols-[auto_fit-content(40%)_minmax(0,1fr)_auto] gap-x-3 gap-y-2')}>
        {fields.map((f, i) => (
          <div key={f.id} data-drop-field={i} className={cn('group/row col-span-full grid grid-cols-subgrid items-center', compact ? 'h-lh' : 'rounded-md', dropClass)}>
            <span role="img" aria-label={`Move “${f.label}”`} data-vaul-no-drag="" onPointerDown={e => drag(e, f)}
              className={cn(gripClass, 'grid flex-none place-items-center text-muted hover:text-fg active:text-fg',
                compact ? cn('size-[1em] rounded-sm [&_svg]:size-[1em]', COMPACT_HIT, COMPACT_REVEAL)
                  : 'size-11 rounded-md hover:bg-surface-2 wide:size-[26px] [&_svg]:size-4')}>
              <GripVertical aria-hidden />
            </span>
            {renaming?.id === f.id ? (
              <NameInput id={f.id} label={f.label} compact={compact} has={() => latest.current.some(x => x.id === f.id)}
                end={(draft, back) => endName(f.id, draft, back)} />
            ) : (
              <button type="button" aria-label={`Rename “${f.label}”`} data-field-label={f.id} onClick={() => openName(f.id, false)}
                className={cn('min-w-0 cursor-text truncate rounded-sm text-left text-muted hover:text-fg', ring,
                  compact ? cn('leading-[inherit]', OVER_SQUARES) : '-mx-1 px-1 py-1 text-[13px] font-medium hover:bg-surface-2')}>
                {f.label}
              </button>
            )}
            <Input aria-label={f.label} data-field-value={f.id} value={f.value} maxLength={80} autoComplete="off"
              onChange={e => ops.setValue(f.id, e.target.value)} className={compact ? cn(COMPACT_INPUT, OVER_SQUARES) : 'focus-visible:ring-ring/50'} />
            <DropdownMenu open={menuFor === f.id} onOpenChange={o => setMenuFor(cur => (o ? f.id : cur === f.id ? null : cur))}>
              <DropdownMenuTrigger asChild onPointerDown={e => {
                const at = fieldAt(e.clientY);
                if (at && at.id !== f.id) { e.preventDefault(); setMenuFor(at.id); } // (Radix leaves a prevented press alone)
              }}>
                <OptionsButton label={`More for “${f.label}”`} data-field-menu={f.id}
                  className={compact ? cn('size-[1em] rounded-sm data-[state=open]:opacity-100 [&_svg]:size-[1em]', COMPACT_HIT, COMPACT_REVEAL) : 'size-11 wide:size-7'} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={8} className="w-44" onCloseAutoFocus={onCloseAutoFocus}>
                <DropdownMenuItem onSelect={() => openName(f.id, true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem disabled={i === 0} onSelect={() => choose({ id: f.id, part: 'menu' }, () => ops.move(f.id, i - 1))}>Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={i === last} onSelect={() => choose({ id: f.id, part: 'menu' }, () => ops.move(f.id, i + 1))}>Move down</DropdownMenuItem>
                <DropdownMenuItem disabled={last === 0} title={last === 0 ? 'A header needs at least one field.' : undefined}
                  className="data-[disabled]:pointer-events-auto"
                  onSelect={() => choose({ id: (fields[i + 1] ?? fields[i - 1]).id, part: 'value' }, () => ops.remove(f.id))}>Remove</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <DropdownMenu>
        {/* Disabled on the trigger, which passes it on: a disabled button still gets pointer events, and Radix opens on those. */}
        <DropdownMenuTrigger asChild disabled={full}>{addButton}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" collisionPadding={8} className="w-52" onCloseAutoFocus={onCloseAutoFocus}>
          {offered.map(l => (
            <DropdownMenuItem key={l} onSelect={() => add(l === 'Date' ? { label: l, today: true } : { label: l }, 'value')}>{l}</DropdownMenuItem>
          ))}
          {offered.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => add({ label: 'Field' }, 'name')}>Custom field…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * A field's name while it is renamed, opened with its text selected. Enter keeps what was typed and Esc puts the
 * old name back, both giving the focus back to the name (and the key goes no further); leaving it keeps what was
 * typed. If it goes while still open (its editor is closed, or another block is pressed in Outline), what was
 * typed is kept, as the block name field does, unless its field went first. Whichever comes first ends it: the
 * name is sent once at most.
 */
function NameInput({ label, id, compact, has, end }: {
  label: string; id: string; compact: boolean;
  /** Whether its field is still in the list. */
  has(): boolean;
  /** It ended: the name to keep (null: keep the old one), and whether the focus goes back to the name. */
  end(draft: string | null, back: boolean): void;
}) {
  const [draft, setDraft] = useState(label);
  const live = useRef({ draft, label, has, end, done: false });
  Object.assign(live.current, { draft, has, end });
  const finish = (keep: boolean, back: boolean) => {
    const s = live.current;
    if (s.done) return;
    s.done = true;
    s.end(keep ? s.draft : null, back);
  };
  useEffect(() => () => {
    const s = live.current;
    if (!s.done && s.draft !== s.label && s.has()) { s.done = true; s.end(s.draft, false); }
  }, []);
  return (
    <Input aria-label="Field name" data-field-name={id} value={draft} maxLength={30} autoComplete="off" spellCheck={false}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        finish(e.key === 'Enter', true);
      }}
      // As wide as the labels' column (a little wider if they are all short), so the values don't move much.
      size={1} className={compact ? cn(COMPACT_INPUT, OVER_SQUARES, 'w-full min-w-[4em] text-fg') : 'h-8 w-full min-w-24 px-1.5 text-[13px] font-medium focus-visible:ring-ring/50'} />
  );
}
