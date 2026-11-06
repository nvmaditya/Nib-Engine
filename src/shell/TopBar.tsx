import { useRef, useState, useEffect } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { Logo, Wordmark } from '@/brand/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { navigate, type Route } from '@/app/route';
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
        className="h-8 w-40 border-transparent bg-transparent font-semibold shadow-none hover:border-line sm:w-56"
      />
      <span className="hidden text-xs text-muted sm:inline" role="status">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : 'Not saved'}</span>
      <div className="flex-1" />
      <StageNav id={id} stage={stage} />
      <div className="flex items-center">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 /></Button>
      </div>
      <Button onClick={() => navigate({ name: 'doc', id, stage: 'export' })}>Export</Button>
    </>
  );
}

export function TopBar({ route }: { route: Route }) {
  return (
    <header className="flex h-14 flex-none items-center gap-3 border-b border-line bg-surface px-4">
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
