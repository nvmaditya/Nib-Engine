// The Style panel: what the handwriting looks like, for the whole document or only the selected block.
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Shuffle } from 'lucide-react';
import { FONTS, FONT_GROUPS, INKS, LIMITS, PAPERS, PENS, PRESETS } from '@/engine/config.js';
import { PHOTO_URL, engineFor, familyCss, hasOwnStyle } from '@/engine/core.js';
import type { FontCfg, Settings } from '@/engine/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { newVariation, resetBoxStyle, setS, setV, view } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { selectedBox, toast, update, useEditor } from '@/store/editor';

type SliderKey = keyof typeof LIMITS;
const fmt: Partial<Record<SliderKey, (v: number) => string>> = {
  weight: v => v + '%',
  track: v => (v > 0 ? '+' : '') + v,
  words: v => (v > 0 ? '+' : '') + v + '%',
};

// "As drawn" and the straight fold crease are no longer offered; documents that use them still draw them.
const PEN_CHOICES = PENS.filter(p => p.id !== 'font');
const EFFECTS: [keyof Settings & ('lighting' | 'ghost' | 'holes'), string][] = [['lighting', 'Room lighting'], ['ghost', 'Show-through'], ['holes', 'Punch holes']];

const option = 'rounded-lg border border-line bg-surface transition-colors hover:border-line-strong aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary';

function Group({ title, value, children }: { title: string; value?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold">{title}{value && <span className="font-normal text-muted">{value}</span>}</h3>
      {children}
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13px] text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-fg">{children}</p>;
}

function Range({ id, label, V, step = 1 }: { id: SliderKey; label: string; V: Settings; step?: number }) {
  const [min, max] = LIMITS[id];
  const v = V[id];
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-sm font-medium">{label}</span>
        <output className="text-[13px] text-muted tabular-nums">{fmt[id] ? fmt[id](v) : v}</output>
      </div>
      <Slider className="mt-2.5 h-5" thumbLabel={label} min={min} max={max} step={step} value={[v]}
        onValueChange={([n]) => { if (n !== V[id]) setV({ [id]: n }, 'slider:' + id); }} />
    </div>
  );
}

let uploadN = 0;
function FontPicker({ V }: { V: Settings }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (f: FontCfg) => !query || f.name.toLowerCase().includes(query) || f.family.toLowerCase().includes(query);
  const groups = FONT_GROUPS
    .map(([g, label]) => [label, FONTS.filter(f => (f.group || 'mine') === g && match(f))] as const)
    .filter(([, list]) => list.length);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target, file = input.files && input.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      uploadN++;
      const family = 'Nib Upload ' + uploadN;
      const face = new FontFace(family, buf.slice(0));
      await face.load(); document.fonts.add(face);
      const id = 'upload-' + uploadN;
      const cfg: FontCfg = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Your font', family, weight: 400, scale: 1, buf, local: true, group: 'mine' };
      const eng = engineFor(cfg) as { letterAlts: number } | null;
      const per = eng ? Math.round(eng.letterAlts / 26) : 0;
      if (per > 0) cfg.forms = per + 1;
      FONTS.push(cfg);
      setQ(''); setV({ font: id });
      toast(!eng ? 'Font added. This format can’t be reshaped, so letters only wobble.'
        : per > 0 ? `Font added with ${per + 1} shapes per letter. It stays until you close this page.`
          : 'Font added. It stays until you close this page.');
    } catch {
      toast('That file isn’t a font this browser can read. Try a .ttf, .otf or .woff2 file.');
    }
    input.value = '';
  };
  const chip = cn(option, 'flex min-h-16 flex-col items-start justify-center gap-0.5 overflow-hidden px-3 py-2 text-left');
  return (
    <Group title="Handwriting">
      <input type="search" placeholder="Search handwriting" aria-label="Search handwriting" autoComplete="off" value={q} onChange={e => setQ(e.target.value)}
        className="mb-2.5 h-9 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg outline-none placeholder:text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
      <div className="-mx-1.5 max-h-[min(430px,55vh)] overflow-y-auto border-b border-line px-1.5 pt-0.5 pb-3">
        {groups.map(([label, list]) => (
          <section key={label} className="mt-3.5 first:mt-0">
            <h4 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{label} <span className="tracking-normal normal-case">({list.length})</span></h4>
            <div className="grid grid-cols-2 gap-2">
              {list.map(f => (
                <button key={f.id} type="button" className={chip} aria-pressed={f.id === V.font} onClick={() => setV({ font: f.id })}>
                  <span className="max-w-full overflow-hidden leading-tight whitespace-nowrap text-fg" style={{ fontFamily: familyCss(f), fontWeight: f.weight, fontSize: Math.max(16, Math.round(26 * f.scale)) }}>Homework</span>
                  <span className="text-xs text-muted">{f.name}</span>
                  {(f.forms ?? 0) > 1 && <span className="text-[11.5px] font-medium text-primary">{f.forms} shapes per letter</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="my-1 text-[13px] text-muted">No handwriting matches that name.</p>}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label className={cn(chip, 'cursor-pointer items-center border-dashed text-center text-[13px] font-medium text-muted focus-within:ring-2 focus-within:ring-ring/50')}>
            <input type="file" className="sr-only" accept=".ttf,.otf,.woff,.woff2" onChange={e => { void onFile(e); }} />
            <span>Use your own font</span><span className="text-xs font-normal">TTF, OTF or WOFF</span>
          </label>
        </div>
      </div>
    </Group>
  );
}

function ScopeBar() {
  const scopeState = useEditor(s => s.scope);
  const boxes = useEditor(s => s.doc.boxes);
  const b = selectedBox();
  const scope = scopeState === 'box' && b ? 'box' : 'all';
  const own = boxes.filter(hasOwnStyle).length;
  let hint: string;
  if (scope === 'box' && b) {
    const n = boxes.filter(x => x.page === b.page).indexOf(b) + 1;
    hint = `Changes go to block ${n} on page ${b.page + 1} only. Paper and line spacing are shared by every page.`;
  } else {
    hint = (b ? 'Changes go to every block' : 'Changes go to every block. Select a block on the page to style it on its own')
      + (own ? ` (${own === 1 ? 'one block keeps its' : own + ' blocks keep their'} own style).` : '.');
  }
  const setScope = (sc: 'all' | 'box') => update(s => { s.scope = sc; }, { save: false, layout: false });
  const seg = 'h-8 rounded-md text-sm font-medium text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm';
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface px-5 pt-3 pb-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Style</h2>
        <Button variant="outline" size="sm" onClick={newVariation}
          title={scope === 'box' ? 'Draw this block with new random shapes' : 'Draw the whole document with new random shapes'}>
          <Shuffle />New variation
        </Button>
      </div>
      <div role="group" aria-label="Which blocks these settings change" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        <button type="button" className={seg} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Whole document</button>
        <button type="button" className={seg} aria-pressed={scope === 'box'} disabled={!b} onClick={() => setScope('box')}>Only this block</button>
      </div>
      <p className="mt-2 text-[13px] text-muted">{hint}</p>
      {scope === 'box' && b && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" disabled={!hasOwnStyle(b)} onClick={resetBoxStyle}>Match document</Button>
        </div>
      )}
    </div>
  );
}

export function StylePanel() {
  const S = useEditor(s => s.S);
  useEditor(s => s.version);
  const V = view();
  const pen = PENS.find(p => p.id === V.tip) || PENS[1];
  const inkLabel = V.ink === 'custom' ? 'Your colour' : (INKS.find(i => i.id === V.ink) || INKS[0]).name;
  return (
    <section aria-label="Style">
      <ScopeBar />
      <FontPicker V={V} />
      <Group title="Pen" value={pen.name}>
        <div className="grid grid-cols-3 gap-1.5">
          {PEN_CHOICES.map(p => (
            <button key={p.id} type="button" aria-pressed={p.id === V.tip} onClick={() => setV({ tip: p.id })}
              className={cn(option, 'flex flex-col items-start gap-1 px-2.5 py-2 text-left text-[13px] leading-tight font-medium')}>
              <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" className="block h-3 w-full text-fg">
                <path d="M3 7 C 25 1, 45 12, 65 5 S 90 4, 97 6" fill="none" stroke="currentColor" strokeWidth={Math.min(4.5, p.w * 1.25)} strokeLinecap="round"
                  opacity={p.id === 'pencil' ? 0.6 : 1} strokeDasharray={p.id === 'pencil' ? '7 1.2' : undefined} />
              </svg>
              <span>{p.name}</span><small className="text-[11.5px] font-normal text-muted">{p.note}</small>
            </button>
          ))}
        </div>
        <Range id="weight" label="Line weight" V={V} />
        <Hint>Every handwriting is redrawn at the pen’s real line width, so even a bold font can look like a fine ballpoint.</Hint>
      </Group>
      <Group title="Ink" value={inkLabel}>
        <div className="flex flex-wrap gap-3">
          {INKS.map(i => (
            <button key={i.id} type="button" aria-pressed={i.id === V.ink} aria-label={i.name + ' ink'} title={i.name} onClick={() => setV({ ink: i.id })}
              style={{ background: i.c }}
              className="size-9 rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-surface transition-shadow aria-pressed:ring-2 aria-pressed:ring-primary" />
          ))}
          <label title="Pick any colour" aria-pressed={V.ink === 'custom'}
            style={{ background: V.ink === 'custom' ? V.customInk : 'conic-gradient(#e33,#e9c43b,#3b9e5b,#2d6fd8,#8a4fd6,#e33)' }}
            className="relative size-9 cursor-pointer overflow-hidden rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-surface focus-within:ring-2 focus-within:ring-ring aria-pressed:ring-2 aria-pressed:ring-primary">
            <input type="color" value={V.customInk} aria-label="Pick any ink colour" className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={e => setV({ customInk: e.target.value, ink: 'custom' }, 'ink-custom')} />
          </label>
        </div>
      </Group>
      <Group title="Realism">
        <div className="mb-3.5 grid grid-cols-4 gap-1.5">
          {PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => setV(p.v)}
              aria-pressed={(Object.keys(p.v) as (keyof Settings)[]).every(k => V[k] === p.v[k])}
              className={cn(option, 'h-9 px-1 text-[13px] font-medium')}>{p.name}</button>
          ))}
        </div>
        <Range id="mess" label="Natural movement" V={V} />
        <Hint>Lines climb and sag, line starts drift, words tilt and ride off the line, and gaps between words change.</Hint>
        <Range id="variety" label="Vary each letter" V={V} />
        <Hint>Repeated letters never look exactly the same: each one picks a shape at random and its outline is bent a little differently.</Hint>
        <Range id="wobble" label="Letter wobble" V={V} />
        <Range id="flow" label="Ink flow" V={V} />
        <Hint>Pressure changes stroke by stroke, like a real pen: downstrokes press harder, and ink runs darker and lighter along the line.</Hint>
        <Range id="mistakes" label="Mistakes" V={V} />
        <Hint>Now and then a word is misspelt, crossed out and written again. Words you cross out yourself with <code>~~word~~</code> get the same kinds of cut.</Hint>
      </Group>
      <Group title="Size and spacing">
        <Range id="size" label="Letter size" V={V} />
        <Range id="gap" label="Line spacing" V={S} />
        <Range id="track" label="Letter spacing" V={V} step={0.5} />
        <Range id="words" label="Word spacing" V={V} step={5} />
      </Group>
      <Group title="Paper">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(PAPERS).map(([id, p]) => (
            <button key={id} type="button" aria-pressed={id === S.paper} onClick={() => setS('paper', id)}
              className={cn(option, 'flex flex-col items-center gap-1.5 px-1 py-2 text-center text-xs leading-tight font-medium')}>
              <span className={'pv pv-' + id} aria-hidden="true" style={p.photo ? { backgroundImage: `url("${PHOTO_URL}")` } : undefined} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {EFFECTS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={!!S[k]} onCheckedChange={v => setS(k, v)} aria-label={label} />{label}
            </label>
          ))}
        </div>
        <Hint>Show-through adds faint writing from the back of the sheet, the way real notebook paper looks.</Hint>
      </Group>
    </section>
  );
}
