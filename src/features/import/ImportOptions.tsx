// The Import dialog's options: where it goes, the file's pages, a look drawn in its own hand, and a header block.
import { useRef } from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { HeaderFields, Settings } from '@/engine/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { today } from '@/features/doc/model';
import { HandSample, paperTint } from '@/features/style/HandSample';
import { lookPatch, STYLE_LOOKS } from '@/features/style/looks';
import { Group, Hint } from '@/features/style/parts';
import { useStylePrefs } from '@/features/style/prefs';
import type { ImportOptionsValue, ImportTarget } from './options';

const KEEP = 'keep';
const FIELDS = [['name', 'Name'], ['class', 'Class'], ['date', 'Date']] as const;

export function ImportOptions({ target, value, onChange, fileParts, base }: {
  target: ImportTarget; value: ImportOptionsValue; onChange(v: ImportOptionsValue): void; fileParts: number; base: Settings;
}) {
  const saved = useStylePrefs(s => s.looks);
  const typed = useRef<HeaderFields | null>(value.header);
  if (value.header) typed.current = value.header;
  const set = (patch: Partial<ImportOptionsValue>) => onChange({ ...value, ...patch });
  const setField = (k: (typeof FIELDS)[number][0], v: string) => set({ header: { ...value.header, [k]: v } });
  const tickHeader = (on: boolean) => set({ header: on ? typed.current ?? { name: '', class: '', date: today() } : null });

  const cards = [...STYLE_LOOKS, ...saved].map(look => ({ id: look.id, name: look.name, paper: look.v.paper ?? base.paper, settings: { ...base, ...lookPatch(look, false) } }));
  if (target === 'open') cards.unshift({ id: KEEP, name: 'Keep this document’s look', paper: base.paper, settings: base });

  return (
    <div className="text-sm">
      {target === 'open' && (
        <Group title="Where it goes">
          <RadioGroup value={value.where} onValueChange={v => set({ where: v as 'replace' | 'append' })} aria-label="Where it goes">
            <Label className="cursor-pointer font-normal"><RadioGroupItem value="replace" />Replace what’s on the pages</Label>
            <Label className="cursor-pointer font-normal"><RadioGroupItem value="append" />Add after the last page</Label>
          </RadioGroup>
          {value.where === 'append' && <Hint>It carries on the writing that ends on the last page, from the top of a new page.</Hint>}
        </Group>
      )}
      {fileParts > 1 && (
        <Group title="Pages">
          <Label className="cursor-pointer font-normal">
            <Checkbox checked={value.breaks} onCheckedChange={c => set({ breaks: c === true })} />Start a new page where the file does
          </Label>
        </Group>
      )}
      <Group title="Look">
        <RadioGroupPrimitive.Root aria-label="Look" value={value.look ?? KEEP} onValueChange={v => set({ look: v === KEEP ? null : v })}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 wide:grid-cols-2">
          {cards.map(c => (
            <RadioGroupPrimitive.Item key={c.id} value={c.id} aria-label={c.name}
              className="flex w-full flex-col items-stretch gap-1.5 rounded-lg border border-line bg-surface p-1.5 text-left text-[13px] font-medium transition-colors outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:ring-1 data-[state=checked]:ring-primary">
              <span className="flex h-[38px] items-center overflow-hidden rounded-md px-2" style={{ background: paperTint(c.paper) }}>
                <HandSample settings={c.settings} text="Homework" height={30} fit="width" />
              </span>
              <span className="line-clamp-2 px-0.5">{c.name}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      </Group>
      {(target === 'new' || value.where === 'replace') && (
        <Group title="Header">
          <Label className="cursor-pointer font-normal">
            <Checkbox checked={value.header !== null} onCheckedChange={c => tickHeader(c === true)} />Add a header block
          </Label>
          {value.header && (
            <>
              <div className="mt-3 grid gap-3">
                {FIELDS.map(([k, label]) => (
                  <div key={k} className="grid gap-1.5">
                    <Label htmlFor={`import-header-${k}`}>{label}</Label>
                    <Input id={`import-header-${k}`} value={value.header?.[k] ?? ''} maxLength={80} autoComplete="off" onChange={e => setField(k, e.target.value)} />
                  </div>
                ))}
              </div>
              <Hint>At the top right of page 1.</Hint>
            </>
          )}
        </Group>
      )}
    </div>
  );
}
