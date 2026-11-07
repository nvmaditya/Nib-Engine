import { useRef, useState, useEffect } from 'react';
import { Check, CircleAlert, LoaderCircle, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { Logo, Wordmark } from '@/brand/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { navigate, type Route } from '@/app/route';
import { cn } from '@/lib/utils';
import { useEditor, undo, redo, renameDocument } from '@/store/editor';
import { AppMenu } from './AppMenu';
import { StageNav } from './StageNav';
import { useUndoShortcuts } from './useUndoShortcuts';
import { openImportPicker } from '@/features/home/actions';
import { openTemplate } from '@/features/home/templates';

const SAVE: Record<'saved' | 'saving' | 'unsaved', [string, LucideIcon]> = {
  saved: ['Saved', Check], saving: ['Saving…', LoaderCircle], unsaved: ['Not saved', CircleAlert],
};

function DocBar({ id, stage, ready }: { id: string; stage: Extract<Route, { name: 'doc' }>['stage']; ready: boolean }) {
  const title = useEditor(s => s.title);
  const saving = useEditor(s => s.saving);
  const canUndo = useEditor(s => s.canUndo);
  const canRedo = useEditor(s => s.canRedo);
  const [draft, setDraft] = useState(title);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(title); }, [title, ready]);
  const commit = () => { editing.current = false; if (draft.trim() !== title) renameDocument(draft); else setDraft(title); };
  useUndoShortcuts();
  const [said, SaveIcon] = SAVE[saving];
  return (
    <>
      <a href="#/" aria-label="Home" className="shrink-0"><Logo size={28} /></a>
      <Input
        aria-label="Document name"
        value={ready ? draft : ''}
        placeholder={ready ? undefined : 'Opening…'}
        disabled={!ready}
        onFocus={() => { editing.current = true; }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-semibold shadow-none hover:border-line wide:max-w-56"
      />
      {/* The save state, in words where there is room. On a phone it is an icon (its words are read out and are its
          title), and "Not saved" shows in words too. */}
      <span role="status" title={ready ? said : undefined}
        className={cn('flex shrink-0 items-center gap-1 text-xs', saving === 'unsaved' ? 'font-medium text-danger' : 'text-muted')}>
        {ready && (
          <>
            <SaveIcon aria-hidden className="size-4 sm:hidden" />
            <span className={saving === 'unsaved' ? undefined : 'sr-only sm:not-sr-only'}>{said}</span>
          </>
        )}
      </span>
      <div className="hidden flex-1 wide:block" />
      {/* Narrow screens: the stages get a full-width row of their own under the name. */}
      <StageNav id={id} stage={stage} className="order-last w-full wide:order-none wide:w-auto" />
      <div className="flex items-center">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!ready || !canUndo} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!ready || !canRedo} onClick={redo}><Redo2 /></Button>
      </div>
      <AppMenu />
      <Button className="hidden wide:inline-flex" onClick={() => navigate({ name: 'doc', id, stage: 'export' })}>Export</Button>
    </>
  );
}

/** `ready`: the document named by the route is the one open in the editor. */
export function TopBar({ route, ready }: { route: Route; ready: boolean }) {
  return (
    <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface px-4 py-2 wide:h-14 wide:flex-nowrap wide:gap-x-3 wide:py-0">
      {route.name === 'home' ? (
        <>
          <a href="#/" className="flex items-center gap-2 text-xl"><Logo size={30} /><Wordmark /></a>
          <div className="flex-1" />
          {/* Narrow screens have only the Import hero for this, so the bar stays one row at 320 px. */}
          <Button variant="outline" className="hidden sm:inline-flex" onClick={openImportPicker}>Import a file</Button>
          <Button onClick={() => { void openTemplate('blank'); }}>New document</Button>
          <AppMenu />
        </>
      ) : <DocBar id={route.id} stage={route.stage} ready={ready} />}
    </header>
  );
}
