import { useRef, useState, useEffect } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { Logo, Wordmark } from '@/brand/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { navigate, type Route } from '@/app/route';
import { cn } from '@/lib/utils';
import { useEditor, undo, redo, renameDocument } from '@/store/editor';
import { StageNav } from './StageNav';
import { useUndoShortcuts } from './useUndoShortcuts';
import { createAndOpen, openImportPicker } from '@/features/home/actions';

function DocBar({ id, stage }: { id: string; stage: Extract<Route, { name: 'doc' }>['stage'] }) {
  const title = useEditor(s => s.title);
  const saving = useEditor(s => s.saving);
  const canUndo = useEditor(s => s.canUndo);
  const canRedo = useEditor(s => s.canRedo);
  const [draft, setDraft] = useState(title);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(title); }, [title]);
  const commit = () => { editing.current = false; if (draft.trim() !== title) renameDocument(draft); else setDraft(title); };
  useUndoShortcuts();
  return (
    <>
      <a href="#/" aria-label="Home" className="shrink-0"><Logo size={28} /></a>
      <Input
        aria-label="Document name"
        value={draft}
        onFocus={() => { editing.current = true; }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-semibold shadow-none hover:border-line md:max-w-56"
      />
      {/* "Not saved" shows on phones too; "Saved" and "Saving…" only where there is room. */}
      <span className={cn('shrink-0 text-xs', saving === 'unsaved' ? 'font-medium text-danger' : 'hidden text-muted sm:inline')} role="status">
        {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : 'Not saved'}
      </span>
      <div className="hidden flex-1 md:block" />
      {/* Narrow screens: the stages get a full-width row of their own under the name. */}
      <StageNav id={id} stage={stage} className="order-last w-full md:order-none md:w-auto" />
      <div className="flex items-center">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 /></Button>
      </div>
      <Button className="hidden md:inline-flex" onClick={() => navigate({ name: 'doc', id, stage: 'export' })}>Export</Button>
    </>
  );
}

export function TopBar({ route }: { route: Route }) {
  return (
    <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2 md:h-14 md:flex-nowrap md:py-0">
      {route.name === 'home' ? (
        <>
          <a href="#/" className="flex items-center gap-2 text-xl"><Logo size={30} /><Wordmark /></a>
          <div className="flex-1" />
          <Button variant="outline" onClick={openImportPicker}>Import a file</Button>
          <Button onClick={() => { void createAndOpen(); }}>New document</Button>
        </>
      ) : <DocBar id={route.id} stage={route.stage} />}
    </header>
  );
}
