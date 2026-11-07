import { useEffect } from 'react';
import { undo, redo } from '@/store/editor';
import { useOverlays } from './overlays';
import { typing } from './typing';

export function useUndoShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A field or an editor has its own; with the palette or the shortcut sheet open, they don't reach the document.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typing(e.target) || typing(document.activeElement) || useOverlays.getState().open) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      else if (k === 'y' && e.ctrlKey) { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
