// The app menu, last in the top bar: the palette, the shortcut sheet and the theme.
import { useId, useRef } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { chordLabel, isApple } from '@/lib/keys';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme';
import { openOverlay, type Overlay } from './overlays';

const THEMES: [ThemePref, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const KBD = 'rounded border border-line bg-surface-2 px-1.5 text-[12px] font-medium tracking-normal text-fg';
const isTheme = (v: string): v is ThemePref => THEMES.some(([t]) => t === v);

export function AppMenu() {
  const theme = useThemePref();
  const button = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  // An item that opens an overlay opens it once the menu has gone, with the focus back on this button: the item is
  // gone too, so the button is what the overlay gives the focus back to when it closes (focusBack). Radix's own
  // focusing is prevented, so it can't take the focus from the overlay afterwards.
  const pending = useRef<Overlay | null>(null);
  const closed = (e: Event) => {
    const o = pending.current;
    if (!o) return;
    pending.current = null;
    e.preventDefault();
    button.current?.focus({ preventScroll: true });
    openOverlay(o);
  };
  const apple = isApple();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={button} variant="ghost" size="icon" aria-label="Menu" title="Menu"><Menu /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="min-w-60 max-w-(--radix-dropdown-menu-content-available-width)" onCloseAutoFocus={closed}>
        <DropdownMenuItem aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'} onSelect={() => { pending.current = 'palette'; }}>
          Search commands and documents
          <DropdownMenuShortcut aria-hidden className="pl-2"><kbd className={KBD}>{chordLabel(['Mod', 'K'])}</kbd></DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem aria-keyshortcuts="?" onSelect={() => { pending.current = 'shortcuts'; }}>
          Keyboard shortcuts
          <DropdownMenuShortcut aria-hidden className="pl-2"><kbd className={KBD}>?</kbd></DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel id={labelId}>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-labelledby={labelId} value={theme} onValueChange={v => { if (isTheme(v)) setThemePref(v); }}>
          {THEMES.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
