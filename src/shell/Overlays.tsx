// The app's own overlays and the keys that open them, mounted once outside the stages.
import { CommandPalette } from './CommandPalette';
import { closeOverlay, openOverlay, useOverlays } from './overlayStore';
import { ShortcutSheet } from './ShortcutSheet';
import { useAppShortcuts } from './useAppShortcuts';

export function Overlays() {
  useAppShortcuts();
  const open = useOverlays(s => s.open);
  return (
    <>
      <ShortcutSheet open={open === 'shortcuts'} onOpenChange={o => (o ? openOverlay('shortcuts') : closeOverlay())} />
      <CommandPalette open={open === 'palette'} onOpenChange={o => (o ? openOverlay('palette') : closeOverlay())} />
    </>
  );
}
