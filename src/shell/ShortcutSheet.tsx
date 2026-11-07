// The shortcut sheet: every keyboard shortcut in Nib, by where it works (`?`, or Ctrl+/ / ⌘/). Closing it gives the
// focus back to what had it, unless the palette took its place.
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { chordLabel, isApple } from '@/lib/keys';
import { focusBack } from './overlayStore';
import { SHORTCUTS, type ShortcutRow } from './shortcuts';

const KBD = 'rounded border border-line bg-surface-2 px-1.5 text-[12px] font-medium whitespace-pre';

function Keys({ row, apple }: { row: ShortcutRow; apple: boolean }) {
  const shown = [
    ...(row.keys ?? []).filter((_, k) => !(apple && row.notApple?.[k])).map(chordLabel),
    ...(row.typed ? [row.typed] : []),
  ];
  return (
    <dd className="flex-none text-right">
      {shown.map((label, k) => (
        <span key={k}>{k > 0 && <span className="text-muted"> or </span>}<kbd className={KBD}>{label}</kbd></span>
      ))}
    </dd>
  );
}

export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const apple = isApple();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-overlay="shortcuts" className="max-h-[85dvh] overflow-y-auto wide:max-w-2xl" onCloseAutoFocus={focusBack}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Every keyboard shortcut in Nib, by where it works.</DialogDescription>
        </DialogHeader>
        <div className="wide:columns-2 wide:gap-8">
          {SHORTCUTS.map(g => (
            <div key={g.title} className="pb-5 last:pb-0">
              <h3 className="text-sm font-semibold break-after-avoid">{g.title}</h3>
              {g.note && <p className="mt-0.5 text-[13px] text-muted break-after-avoid">{g.note}</p>}
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                {g.rows.map(r => (
                  <div key={r.what} className="flex items-baseline justify-between gap-3 break-inside-avoid">
                    <dt>{r.what}{r.only && <>{' '}<span className="whitespace-nowrap text-muted">In {r.only}</span></>}</dt>
                    <Keys row={r} apple={apple} />
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
