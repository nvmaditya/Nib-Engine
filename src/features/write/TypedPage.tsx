// A page's typed copy: each block part at its place on the page, edited in place. A part edits the markup
// lines that start in it (plan, Design decision 1). While a part's editor has focus its lines are frozen:
// typing never re-slices it, so the caret never moves, and the block's later parts shift by the lines it
// gained. Everything is worked out from the layout again once the editor is left or the block changes
// from outside (undo, an action).
import { memo, useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { GripVertical } from 'lucide-react';
import { create } from 'zustand';
import { PAGE_H, PAGE_W } from '@/engine/config.js';
import { segId, srcOffset } from '@/engine/core.js';
import type { Box, Seg } from '@/engine/types';
import { blockColor, partLabel } from '@/features/doc/blocks';
import { select } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { BlockEditor, type PageBreakMark } from '@/features/editor/BlockEditor';
import { lineStart } from '@/features/editor/positions';
import { frozenRanges, partRanges, type LineRange } from '@/features/editor/slices';
import { drag, nudge, startBlockDrag } from '@/features/pages/drag';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';
import { BlockMenu, OptionsButton } from './BlockMenu';
import { gripClass } from './dnd';
import { HeaderFields } from './HeaderFields';
import './typed.css';

/* ---------- Frozen lines ---------- */

interface PartKey { boxId: string; idx: number }
/** The focused part's block: its ranges when the freeze began (`base`), and how many lines that part holds now. */
interface Freeze extends PartKey { base: LineRange[]; count: number }

// One editor has the focus at a time, so one freeze serves every typed page.
const useFreeze = create<{ focused: PartKey | null; freeze: Freeze | null }>(() => ({ focused: null, freeze: null }));
const is = (k: PartKey | null, boxId: string, idx: number) => !!k && k.boxId === boxId && k.idx === idx;

const freeze = {
  /** The part's editor took the focus holding `lines` lines, while its block showed `shown`. */
  focus(boxId: string, idx: number, lines: number, shown: LineRange[]) {
    useFreeze.setState({ focused: { boxId, idx }, freeze: { boxId, idx, base: shown, count: lines } });
  },
  /** It lost the focus, or went away. */
  leave(boxId: string, idx: number) {
    const s = useFreeze.getState();
    if (is(s.focused, boxId, idx) || is(s.freeze, boxId, idx)) {
      useFreeze.setState({ focused: is(s.focused, boxId, idx) ? null : s.focused, freeze: is(s.freeze, boxId, idx) ? null : s.freeze });
    }
  },
  /** It wrote and holds `lines` lines now. After an outside change ended the freeze, typing starts a new one. */
  lines(boxId: string, idx: number, lines: number, shown: LineRange[]) {
    const s = useFreeze.getState();
    if (s.freeze && is(s.freeze, boxId, idx)) { if (s.freeze.count !== lines) useFreeze.setState({ freeze: { ...s.freeze, count: lines } }); }
    else if (is(s.focused, boxId, idx)) useFreeze.setState({ freeze: { boxId, idx, base: shown, count: lines } });
  },
  /** The block changed from outside: its lines come from the layout again. */
  external(boxId: string) {
    if (useFreeze.getState().freeze?.boxId === boxId) useFreeze.setState({ freeze: null });
  },
};

/* ---------- What each part shows ---------- */

type Body =
  | { t: 'fields' }
  | { t: 'editor'; range: LineRange; breaks: PageBreakMark[] }
  | { t: 'cont'; from: number }   // no line of its own: its paragraph starts on page `from`
  | { t: 'wait' }                 // a part the frozen lines don't reach yet; it fills once the editor is left
  | { t: 'none' };                // a header's later part: its fields are on its first part

/** A part on a typed page, in plain values (so a page is drawn again only when one of them changes). */
interface Part {
  id: string; boxId: string; idx: number; page: number;
  x: number; top: number; w: number; h: number;  // page units
  label: string; body: Body;
  /** The ranges its block shows on every page, for a freeze that starts here (not the parts that wait). */
  shown: LineRange[];
}

interface Block { parts: Seg[]; text: string; lines: number; ranges: LineRange[]; reach: number }

const lineCount = (t: string) => { let n = 1; for (let i = t.indexOf('\n'); i !== -1; i = t.indexOf('\n', i + 1)) n++; return n; };

// The lines each part of a block shows: from the layout, or frozen while one of its editors has focus. A frozen
// block that has lost a part gives its last part the rest; one that has gained a part leaves it waiting.
function blockOf(box: Box, segs: Seg[], fr: Freeze | null): Block {
  const parts = segs.filter(o => o.box.id === box.id).sort((a, b) => a.idx - b.idx);
  const base = { parts, text: box.text, lines: lineCount(box.text) };
  if (!fr || fr.boxId !== box.id) return { ...base, ranges: partRanges(box, segs), reach: parts.length };
  const r = frozenRanges(fr.base, fr.idx, fr.count), n = parts.length, end = r[r.length - 1].end;
  if (n < r.length) return { ...base, ranges: [...r.slice(0, n - 1), { first: r[n - 1].first, end }], reach: n };
  return { ...base, ranges: [...r, ...Array.from({ length: n - r.length }, () => ({ first: end, end }))], reach: r.length };
}

function bodyOf(box: Box, b: Block, k: number): Body {
  if (box.kind === 'header') return k === 0 ? { t: 'fields' } : { t: 'none' };
  if (k >= b.reach) return { t: 'wait' };
  const r = b.ranges[k];
  if (r.end <= r.first) {
    let j = k - 1;
    while (j > 0 && b.ranges[j].end <= b.ranges[j].first) j--;
    return { t: 'cont', from: b.parts[Math.max(0, j)].page + 1 };
  }
  // A later part that starts inside these lines shows where the handwriting goes on to its page.
  const from = lineStart(b.text, r.first), to = r.end >= b.lines ? b.text.length : lineStart(b.text, r.end) - 1;
  const breaks: PageBreakMark[] = [];
  for (const p of b.parts.slice(k + 1)) {
    const at = p.rows.length ? srcOffset(b.text, p.rows[0].src) : b.text.length;
    if (at >= from && at <= to) breaks.push({ offset: at, page: p.page + 1, idx: p.idx, actions: false });
  }
  return { t: 'editor', range: r, breaks };
}

function partsOn(page: number, segs: Seg[], fr: Freeze | null, gap: number): Part[] {
  const { doc } = useEditor.getState(), blocks = new Map<string, Block>(), out: Part[] = [];
  for (const sg of segs) {
    if (sg.page !== page) continue;
    // The block as the store holds it now (the layout may be a moment older than the text).
    const id = sg.box.id, box = doc.boxes.find(b => b.id === id) ?? sg.box;
    let b = blocks.get(id);
    if (!b) blocks.set(id, (b = blockOf(box, segs, fr)));
    const top = sg.top + gap * 0.1;
    out.push({
      id: segId(sg), boxId: id, idx: sg.idx, page: sg.page, x: sg.x, top, w: sg.w, h: Math.max(gap * 0.8, sg.bottom - top),
      label: partLabel(sg.idx, b.parts.length), body: bodyOf(box, b, b.parts.indexOf(sg)),
      // A freeze that starts on another of its parts keeps a waiting part waiting.
      shown: b.ranges.slice(0, b.reach),
    });
  }
  return out;
}

/* ---------- Focus that would be lost ---------- */

/**
 * When what had the focus (an editor, a field, an open ⋯ menu) goes away with the part or page it was on
 * (Delete block, Split, Remove part, Delete page), the focus would fall to the page itself. Instead it goes
 * to the ⋯ of the next part down that page, else to the page's heading. `where` is the page (0-based) and,
 * for a part, its top (page units).
 */
export function useFocusRescue(ref: RefObject<HTMLElement | null>, where: () => { page: number; top: number | null }): void {
  const at = useRef(where);
  at.current = where;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    return () => { // runs while the element is still in the page
      const a = document.activeElement, column = el.closest('[data-sheets]');
      const had = (!!a && a !== document.body && el.contains(a)) || el.matches('[data-state="open"]') || !!el.querySelector('[data-state="open"]');
      if (!had || !column) return;
      const { page, top } = at.current();
      setTimeout(() => rescueFocus(column, page, top), 0); // after the menu has given the focus back, if it could
    };
  }, [ref]);
}

function rescueFocus(column: Element, page: number, top: number | null): void {
  const a = document.activeElement;
  if ((a && a !== document.body) || !column.isConnected) return;
  const rows = column.querySelectorAll<HTMLElement>('[data-drop-page]');
  const row = rows[Math.min(page, rows.length - 1)];
  if (!row) return;
  if (top !== null) {
    const next = [...row.querySelectorAll<HTMLElement>('.typed-part')]
      .filter(p => Number(p.dataset.top) >= top)
      .sort((p, q) => Number(p.dataset.top) - Number(q.dataset.top))[0];
    const menu = next?.querySelector<HTMLElement>('[data-part-menu]');
    if (menu) { menu.focus(); return; }
  }
  row.querySelector<HTMLElement>('[data-page-heading]')?.focus();
}

/* ---------- The page ---------- */

/** The ⋯ on a coloured name tag. */
const TAG_BUTTON = 'size-[18px] rounded-[4px] text-white/90 hover:bg-white/25 hover:text-white data-[state=open]:bg-white/25 data-[state=open]:text-white [&_svg]:size-3.5';

/** A part's ⋯ menu on a handwritten page's name tag. */
export function PartMenu({ sg }: { sg: Seg }) {
  const ref = useRef<HTMLButtonElement>(null);
  useFocusRescue(ref, () => ({ page: sg.page, top: sg.top }));
  return <BlockMenu boxId={sg.box.id} idx={sg.idx} trigger={<OptionsButton ref={ref} label={`Options for ${sg.box.name}`} className={TAG_BUTTON} />} />;
}

/**
 * The typed copy of page `page` (0-based), at `s` CSS pixels per page unit. `segs` is every page's parts,
 * since a part's lines depend on its block's other parts.
 */
export function TypedPage({ page, segs, s }: { page: number; segs: Seg[]; s: number }) {
  const fr = useFreeze(st => st.freeze);
  const gap = useEditor(st => st.S.gap);
  const latest = useRef(segs);
  latest.current = segs;
  const seg = useCallback((id: string) => latest.current.find(sg => segId(sg) === id), []);
  const parts = partsOn(page, segs, fr, gap);
  return <TypedSheet page={page} s={s} gap={gap} parts={parts} sig={JSON.stringify(parts)} seg={seg} />;
}

interface TypedSheetProps { page: number; s: number; gap: number; parts: Part[]; sig: string; seg(id: string): Seg | undefined }

// Drawn again only when something it shows changed: typing re-renders only the editor typed in.
const TypedSheet = memo(function TypedSheet({ page, s, gap, parts, seg }: TypedSheetProps) {
  return (
    <div className="typed-page relative overflow-visible border border-line bg-surface" data-paper={page}
      style={{ width: Math.round(PAGE_W * s), height: Math.round(PAGE_H * s) }}>
      {parts.map(p => <TypedPart key={p.id} p={p} s={s} gap={gap} seg={seg} />)}
      {!parts.length && (
        <p className="absolute inset-x-0 top-[44%] m-0 px-8 text-center text-[12px] leading-snug text-muted">
          Empty page. Use + Add, or drag a block here in Outline.
        </p>
      )}
    </div>
  );
}, (a, b) => a.sig === b.sig && a.page === b.page && a.s === b.s && a.gap === b.gap && a.seg === b.seg);

function TypedPart({ p, s, gap, seg }: { p: Part; s: number; gap: number; seg(id: string): Seg | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useStageActive();
  const name = useEditor(st => st.doc.boxes.find(b => b.id === p.boxId)?.name ?? '');
  const color = useEditor(st => { const b = st.doc.boxes.find(x => x.id === p.boxId); return b ? blockColor(b) : undefined; });
  const selected = useEditor(st => st.selectedId === p.boxId);
  const live = useRef(p);
  live.current = p;
  useLayoutEffect(() => { if (!drag.active && ref.current) ref.current.style.transform = ''; }); // a drop is drawn in its new place
  useFocusRescue(ref, () => ({ page: live.current.page, top: live.current.top }));
  // Its lines are worked out from the layout again once it goes, or its stage is hidden (which may not blur it).
  useEffect(() => () => freeze.leave(p.boxId, p.idx), [p.boxId, p.idx]);
  useEffect(() => { if (!active) freeze.leave(p.boxId, p.idx); }, [active, p.boxId, p.idx]);

  // The grip drags the part over any page (snapping to the ruled lines; a later part stays on its page, rule 4),
  // and its arrow keys move it a line up or down, or a little sideways.
  const onGrip = (e: PointerEvent<HTMLButtonElement>) => {
    const sg = seg(p.id);
    if ((e.pointerType === 'mouse' && e.button !== 0) || !sg || !ref.current) return;
    e.preventDefault();
    if (!selected) select(p.boxId);
    startBlockDrag(e, sg, { s, frame: ref.current, mode: 'move' });
  };
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => { const sg = seg(p.id); if (sg && nudge(sg, e.key)) e.preventDefault(); };

  const b = p.body;
  return (
    <div ref={ref} className={cn('typed-part', selected && 'selected')} data-part={p.id} data-top={p.top}
      style={{ left: p.x * s, top: p.top * s, width: p.w * s, minHeight: p.h * s, '--bc': color } as CSSProperties}>
      <div className="typed-tag">
        <button type="button" aria-label={`Move ${name}`} title="Drag to move" onPointerDown={onGrip} onKeyDown={onGripKey}
          className={cn(gripClass, 'grid h-[18px] w-4 place-items-center rounded-[3px] text-white/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-[13px]')}>
          <GripVertical aria-hidden />
        </button>
        <span className="font-semibold">{name}</span>
        {p.label && <><span aria-hidden className="font-medium opacity-85">·</span><span className="font-medium opacity-85">{p.label}</span></>}
        <BlockMenu boxId={p.boxId} idx={p.idx} trigger={<OptionsButton label={`Options for ${name}`} data-part-menu="" className={TAG_BUTTON} />} />
      </div>
      <div className="typed-body" style={{ fontSize: gap * s * 0.56, lineHeight: `${gap * s}px`, '--lh': `${gap * s}px` } as CSSProperties}>
        {b.t === 'fields' && <HeaderFields boxId={p.boxId} compact />}
        {b.t === 'cont' && <p className="m-0 text-muted">{`Continues the paragraph from page ${b.from}.`}</p>}
        {b.t === 'editor' && (
          <BlockEditor boxId={p.boxId} range={b.range} breaks={b.breaks} label={`${name}, page ${p.page + 1}`} acceptCaret={active}
            onFocusChange={(on, lines) => {
              if (!on) { freeze.leave(p.boxId, p.idx); return; }
              freeze.focus(p.boxId, p.idx, lines, live.current.shown);
              if (useEditor.getState().selectedId !== p.boxId) select(p.boxId);
            }}
            onLineCount={lines => freeze.lines(p.boxId, p.idx, lines, live.current.shown)}
            onExternalChange={() => freeze.external(p.boxId)} />
        )}
      </div>
    </div>
  );
}
