// The app's own keys: Ctrl+K (⌘K) for the command palette, and Ctrl+/ (⌘/) or `?` for the shortcut sheet.
// They come last (the window, bubbling), so whatever the key went to has had it first.
import { useEffect } from 'react';
import { isModKey } from '@/lib/keys';
import { openOverlay, otherModalOpen, toggleOverlay } from './overlays';
import { typing } from './typing';

export function useAppShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      // Ctrl+K and Ctrl+/ work from a field or the editor too. They are the app's even with another dialog
      // or menu open (the browser's own Ctrl+K stays out), but then they open nothing.
      const mod = isModKey(e) && !e.altKey ? e.key.toLowerCase() : '';
      if (mod === 'k' || mod === '/') {
        e.preventDefault();
        if (!e.repeat && !otherModalOpen()) toggleOverlay(mod === 'k' ? 'palette' : 'shortcuts');
        return;
      }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || typing(document.activeElement)) return;
      if (!otherModalOpen()) openOverlay('shortcuts');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
