// The command palette (Ctrl+K, ⌘K): open a document, go to a stage, use a look on the whole document, export, or
// change the theme. Mounted once with the other overlays, outside the stages.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { defaultFilter, useCommandState } from 'cmdk';
import { MEMORY_ID, useRoute } from '@/app/route';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStylePrefs } from '@/features/style/prefs';
import { useThemePref } from '@/lib/theme';
import { listDocs } from '@/store/documents';
import { useEditor } from '@/store/editor';
import { paletteCommands, type CommandContext, type CommandGroupName, type PaletteCommand } from './commands';
import { focusBack } from './overlayStore';

const NAME = 'Search commands and documents';

// Each item's value is its id (two documents may share a title), so the search reads its words instead.
const filter = (value: string, search: string, keywords?: string[]): number => defaultFilter(keywords?.join(' ') ?? value, search);

type Group = [CommandGroupName, PaletteCommand[]];

function byGroup(commands: PaletteCommand[]): Group[] {
  const groups = new Map<CommandGroupName, PaletteCommand[]>();
  for (const c of commands) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups];
}

/**
 * While searching, the group with the best match comes first (then the order of the copy), so the first item,
 * which Enter chooses, is the best match. cmdk sorts the items in a group, but 1.1.1 never moves a group: it looks
 * for one by its React id where it wrote its heading. With weaker matches higher up, `Ess` would choose Outline.
 */
function ranked(groups: Group[], search: string): Group[] {
  if (!search) return groups;
  const best = ([, items]: Group) => Math.max(0, ...items.map(c => filter(c.id, search, c.keywords)));
  return groups.map((g, i) => ({ g, score: best(g), i })).sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.g);
}

function Results({ groups, choose, pick }: { groups: Group[]; choose(c: PaletteCommand): void; pick(id: string): void }) {
  const search = useCommandState(s => s.search);
  const shown = ranked(groups, search);
  // The documents are read after the palette opens, and cmdk keeps its choice when items arrive above it. On Home,
  // where they come first, the latest one is chosen once they are there, unless something has been typed.
  const docs = groups.find(([name]) => name === 'Documents')?.[1].map(c => c.id).join(' ') ?? '';
  const first = shown[0]?.[1][0]?.id;
  useLayoutEffect(() => { if (!search && first) pick(first); }, [docs]); // (only when the documents change)
  return shown.map(([name, items], i) => (
    <Fragment key={name}>
      {i > 0 && <CommandSeparator />}
      <CommandGroup heading={name}>
        {items.map(c => (
          <CommandItem key={c.id} value={c.id} keywords={c.keywords} onSelect={() => choose(c)}>
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {c.meta && <>{' '}<span className="flex-none text-xs text-muted">{c.meta}</span></>}
            {c.shortcut && <>{' '}<CommandShortcut>{c.shortcut}</CommandShortcut></>}
          </CommandItem>
        ))}
      </CommandGroup>
    </Fragment>
  ));
}

// Where a command that went somewhere leaves the focus: the stage it went to, or Home's link.
const PLACES = ['nav[aria-label="Stages"] [aria-current="step"]', 'header a[href="#/"]'];
function focusWhereYouWent(): boolean {
  return PLACES.some(sel => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.closest('[inert], [hidden]')) return false;
    el.focus({ preventScroll: true });
    return document.activeElement === el;
  });
}

/** To what had the focus, else (gone, or in a stage no longer shown) where the command went; there too when nothing had it and the command went somewhere. */
function giveBack(e: Event, went: boolean): void {
  focusBack(e, focusWhereYouWent);
  if (went && document.activeElement === document.body) focusWhereYouWent();
}

// A command that goes to another stage, document or Home is only on screen once the address change has been
// heard, so the focus goes back on the next frame. A dialog the command opened (Import, in a document) keeps it,
// and gives it back itself to what had it before the palette (focusBack stands aside; openImport's opener).
let chosenAt: string | null = null; // the address when the command chosen ran
let frame = 0;
const stopFocus = (): void => cancelAnimationFrame(frame);
function closeFocus(e: Event): void {
  e.preventDefault();
  const from = chosenAt;
  chosenAt = null;
  stopFocus();
  frame = requestAnimationFrame(() => giveBack(e, from !== null && location.hash !== from));
}

/**
 * cmdk 1.1.1 names the chosen option in `aria-activedescendant` a step late, or not at all: it reads which item
 * is chosen before React has drawn the new choice (none on opening; after `Ess`, the one chosen before). So once
 * the list has been drawn, the field and the list name the option that is chosen, and when React writes cmdk's
 * late value again, it is put right after it.
 */
function useActiveDescendant(root: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const sync = () => {
      const id = el.querySelector('[cmdk-item][aria-selected="true"]')?.id;
      for (const t of el.querySelectorAll('[cmdk-input], [cmdk-list]')) {
        if (!id) t.removeAttribute('aria-activedescendant');
        else if (t.getAttribute('aria-activedescendant') !== id) t.setAttribute('aria-activedescendant', id);
      }
    };
    const watch = new MutationObserver(sync);
    watch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-activedescendant'] });
    sync();
    return () => watch.disconnect();
  }, [root]);
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const route = useRoute();
  const looks = useStylePrefs(s => s.looks);
  const theme = useThemePref();
  const memory = useEditor(s => s.docId === MEMORY_ID); // nothing is stored on this device
  const [docs, setDocs] = useState<CommandContext['docs']>([]);

  // The documents are read afresh each time it opens (another tab may have made, renamed or deleted one).
  useEffect(() => {
    if (!open || memory) return;
    let live = true;
    listDocs().then(
      all => { if (live) setDocs(all.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))); },
      () => { if (live) setDocs([]); },
    );
    return () => { live = false; };
  }, [open, memory]);
  useEffect(() => stopFocus, []);

  // Closing first, then the command in the same handler: the file picker keeps the key's or click's activation.
  const choose = (c: PaletteCommand) => { chosenAt = location.hash; onOpenChange(false); c.run(); };
  const groups = open ? byGroup(paletteCommands({ route, docs, looks, theme })) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-overlay="palette" showCloseButton={false} className="top-[12dvh] max-w-[calc(100%-1rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" onCloseAutoFocus={closeFocus}>
        <DialogTitle className="sr-only">{NAME}</DialogTitle>
        <DialogDescription className="sr-only">Open a document, go to a stage, use a look, export, or change the theme.</DialogDescription>
        <Palette groups={groups} choose={choose} />
      </DialogContent>
    </Dialog>
  );
}

/** What the palette shows while open (mounted afresh each time, so nothing is chosen or typed yet). */
function Palette({ groups, choose }: { groups: Group[]; choose(c: PaletteCommand): void }) {
  const [value, setValue] = useState(''); // the item chosen: cmdk's, so the documents arriving can choose again
  const root = useRef<HTMLDivElement>(null);
  useActiveDescendant(root);
  return (
    // No Ctrl+K/J/N/P moving through the list (cmdk's vim keys): Ctrl+K closes the palette, as it opened it.
    <Command ref={root} label={NAME} loop vimBindings={false} filter={filter} value={value} onValueChange={setValue}>
      <CommandInput placeholder={NAME} />
      <CommandList label={NAME}>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        <Results groups={groups} choose={choose} pick={setValue} />
      </CommandList>
    </Command>
  );
}
