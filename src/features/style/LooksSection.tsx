// Looks: hand, pen, ink, paper and realism in one tap, and the looks saved on this device.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import type { Settings } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStageActive } from '@/features/doc/StageHost';
import { toast } from '@/store/editor';
import { HandSample, paperTint } from './HandSample';
import { currentLookValues, lookPatch, matchLook, pickLook, STYLE_LOOKS } from './looks';
import { Group } from './parts';
import { addSavedLook, putBackSavedLook, removeSavedLook, useStylePrefs, type SavedLook } from './prefs';

const DEFAULT_NAME = 'My look';

export function LooksSection({ V, S, blockScope }: { V: Settings; S: Settings; blockScope: boolean }) {
  const saved = useStylePrefs(s => s.looks);
  const active = useStageActive();
  const saveRef = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState(DEFAULT_NAME);
  const all = [...STYLE_LOOKS, ...saved];
  const on = matchLook(V, S, all, blockScope);

  // A dialog is portalled out of its stage, so it has to be closed when the stage is.
  useEffect(() => { if (!active) setAsking(false); }, [active]);

  const ask = () => { setName(DEFAULT_NAME); setAsking(true); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAsking(false);
    const shown = name.trim().slice(0, 40).trim() || DEFAULT_NAME;
    addSavedLook(name, currentLookValues()).then(
      () => toast(`Saved “${shown}”. It’s in Looks on every document.`),
      () => toast('Nib couldn’t save that look on this device.'),
    );
  };
  const remove = (look: SavedLook, card: HTMLElement | null) => {
    // The button being pressed goes away, so focus moves on first: to the next card, or to Save.
    const next = card?.nextElementSibling?.querySelector('button');
    (next ?? saveRef.current)?.focus();
    void removeSavedLook(look.id).then(r => {
      if (r) toast(`Removed “${r.look.name}”.`, { label: 'Undo', fn: () => { void putBackSavedLook(r.look, r.index); } });
    });
  };

  return (
    <Group title="Looks" meta={blockScope ? 'hand, pen, ink and realism for this block' : 'hand, pen, ink, paper and realism in one tap'}>
      <div className="grid grid-cols-2 gap-2 wide:grid-cols-3">
        {all.map(look => {
          const isSaved = saved.includes(look);
          return (
            <div key={look.id} className="relative">
              <button type="button" aria-pressed={on === look} onClick={() => { if (on !== look) pickLook(look); }}
                className="flex w-full flex-col items-stretch gap-1.5 rounded-lg border border-line bg-surface p-1.5 text-left text-[13px] font-medium transition-colors outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary">
                <span className="flex h-[38px] items-center overflow-hidden rounded-md px-2" style={{ background: paperTint(look.v.paper ?? S.paper) }}>
                  <HandSample settings={{ ...V, ...lookPatch(look, false) }} text="Homework" height={30} fit="width" />
                </span>
                <span className="truncate px-0.5">{look.name}</span>
              </button>
              {isSaved && (
                <button type="button" aria-label={`Remove ${look.name}`} onClick={e => remove(look, e.currentTarget.parentElement)}
                  className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-surface/90 text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50">
                  <X aria-hidden="true" className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Button ref={saveRef} variant="outline" size="sm" className="mt-3" onClick={ask}><Plus />Save the current style as a look</Button>
      <Dialog open={asking && active} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-sm" onCloseAutoFocus={e => { e.preventDefault(); saveRef.current?.focus(); }}>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader><DialogTitle>Save as a look</DialogTitle></DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="look-name">Look name</Label>
              <Input id="look-name" value={name} maxLength={40} autoComplete="off" onChange={e => setName(e.target.value)} />
            </div>
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Group>
  );
}
