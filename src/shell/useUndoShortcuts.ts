import { useEffect } from 'react';
import { undo, redo } from '@/store/editor';
import { useOverlays } from './overlays';
import { typing } from './typing';

const NATIVE_UNDO = ['historyUndo', 'historyRedo'];

export function useUndoShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A field or an editor has its own.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typing(e.target) || typing(document.activeElement)) return;
      const k = e.key.toLowerCase(), again = k === 'z' ? e.shiftKey : k === 'y' && e.ctrlKey ? true : null;
      if (again === null) return;
      e.preventDefault(); // (and so the browser's own Undo doesn't start either)
      // With the palette or the shortcut sheet open, they never reach the document behind it.
      if (!useOverlays.getState().open) (again ? redo : undo)();
    };
    // Nor does the browser's own Undo or Redo (its menu, or a field in the overlay with nothing of its own to undo),
    // which goes to the last edit it knows of: an editor behind the overlay.
    const onNative = (e: Event) => {
      if (!useOverlays.getState().open || !NATIVE_UNDO.includes((e as InputEvent).inputType)) return;
      if (e.target instanceof Element && e.target.closest('[data-overlay]')) return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeinput', onNative, true);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeinput', onNative, true); };
  }, []);
}
