// The Write panel: which block is being edited, the formatting tools and the block's text.
import { useEffect, useRef, type ReactNode } from 'react';
import { Bold, FileUp, Highlighter, Plus, Strikethrough, Underline } from 'lucide-react';
import { framesOf, hasOwnStyle } from '@/engine/core.js';
import { Button } from '@/components/ui/button';
import { openImport, pagesApi } from '@/features/doc/actions';
import { useStageActive } from '@/features/doc/StageHost';
import { consumeCaret, selectedBox, update, useEditor } from '@/store/editor';

type Cmd = 'bold' | 'ul' | 'strike' | 'hl' | 'h1' | 'h2' | 'bullet' | 'num' | 'quote' | 'page';
type Tool = { cmd: Cmd; body: ReactNode; title?: string; label?: string };

const TOOLS: (Tool | 'sep')[] = [
  { cmd: 'bold', body: <Bold />, title: 'Press harder (Ctrl+B)', label: 'Bold' },
  { cmd: 'ul', body: <Underline />, title: 'Underline (Ctrl+U)', label: 'Underline' },
  { cmd: 'strike', body: <Strikethrough />, title: 'Cross out', label: 'Cross out' },
  { cmd: 'hl', body: <Highlighter />, title: 'Highlight', label: 'Highlight' },
  'sep',
  { cmd: 'h1', body: 'Title' }, { cmd: 'h2', body: 'Heading' }, { cmd: 'bullet', body: '• List' }, { cmd: 'num', body: '1. List' },
  { cmd: 'quote', body: 'Note' }, { cmd: 'page', body: 'Next page', title: 'Continue the rest of this block on the next page' },
];

const HELP: [ReactNode, string][] = [
  [<code># Title</code>, 'Centred in the block, double underline'],
  [<code>## Heading</code>, 'Underlined heading'],
  [<code>**word**</code>, 'Pressed harder'],
  [<code>*word*</code>, 'Underlined'],
  [<code>==word==</code>, 'Highlighter'],
  [<code>~~word~~</code>, 'Crossed out'],
  [<><code>- item</code> <code>1. item</code></>, 'Lists'],
  [<code>&gt; line</code>, 'Side-lined note'],
  [<code>\newpage</code>, 'Continue on the next page'],
];

export function WritePanel() {
  const ta = useRef<HTMLTextAreaElement>(null);
  const active = useStageActive();
  const caret = useEditor(s => s.caret);
  const boxes = useEditor(s => s.doc.boxes);
  useEditor(s => s.version);
  const box = selectedBox();

  // A caret request for the block shown here (a clicked word, Edit, a new block) focuses the editor
  // there, but only in the view on screen: a hidden one leaves the request to the one shown.
  const boxId = box?.id;
  useEffect(() => {
    const el = ta.current;
    if (!active || !caret || !el || caret.boxId !== boxId) return;
    consumeCaret(caret.n);
    const at = Math.min(caret.offset, el.value.length);
    el.focus();
    el.setSelectionRange(at, at);
  }, [active, caret, boxId]);

  const setText = (value: string) => {
    const b = selectedBox();
    if (b) update(() => { b.text = value; }, { layout: 'soon', history: 'type:' + b.id });
  };
  const replaceSel = (str: string, selFrom: number, selLen: number) => {
    const el = ta.current!; el.focus();
    const start = el.selectionStart;
    let ok = false;
    try { ok = document.execCommand('insertText', false, str); } catch { ok = false; } // keeps the editor's own undo
    if (!ok) { el.setRangeText(str, el.selectionStart, el.selectionEnd, 'end'); setText(el.value); }
    el.setSelectionRange(start + selFrom, start + selFrom + selLen);
  };
  const wrapInline = (mk: string, placeholder: string) => {
    const el = ta.current!; el.focus();
    const v = el.value; let s = el.selectionStart, e = el.selectionEnd;
    while (e > s && /\s/.test(v[e - 1])) e--;
    while (s < e && /\s/.test(v[s])) s++;
    const sel = v.slice(s, e);
    const before = v.slice(Math.max(0, s - mk.length), s), after = v.slice(e, e + mk.length);
    const clash = mk === '*' && (v[s - 2] === '*' || v[e + 1] === '*');
    if (sel && before === mk && after === mk && !clash) { el.setSelectionRange(s - mk.length, e + mk.length); replaceSel(sel, 0, sel.length); return; }
    const inner = sel || placeholder;
    el.setSelectionRange(s, e); replaceSel(mk + inner + mk, mk.length, inner.length);
  };
  const linePrefix = (kind: 'h1' | 'h2' | 'bullet' | 'num' | 'quote') => {
    const el = ta.current!; el.focus();
    const v = el.value; const s = el.selectionStart, e = el.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', Math.max(e - (e > s && v[e - 1] === '\n' ? 1 : 0), s)); if (le === -1) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const strip = (l: string) => l.replace(/^(#{1,3}\s+|\s*[-*+]\s+|\s*\d{1,3}[.)]\s+|\s*>\s?)/, '');
    const has = { h1: /^#\s+/, h2: /^##\s+/, bullet: /^\s*[-*+]\s+/, num: /^\s*\d{1,3}[.)]\s+/, quote: /^\s*>/ }[kind];
    const all = lines.every(l => has.test(l));
    let n = 1;
    const out = lines.map(l => {
      const base = strip(l);
      if (all) return base;
      const p = kind === 'h1' ? '# ' : kind === 'h2' ? '## ' : kind === 'bullet' ? '- ' : kind === 'num' ? `${n++}. ` : '> ';
      return p + base;
    }).join('\n');
    el.setSelectionRange(ls, le);
    replaceSel(out, out.length, 0);
  };
  const newPage = () => {
    const el = ta.current!; el.focus();
    const v = el.value, s = el.selectionStart;
    const str = (s > 0 && v[s - 1] !== '\n' ? '\n' : '') + '\\newpage\n';
    el.setSelectionRange(s, el.selectionEnd);
    replaceSel(str, str.length, 0);
  };
  const run = (c: Cmd) => {
    if (c === 'bold') wrapInline('**', 'bold text');
    else if (c === 'ul') wrapInline('*', 'underlined');
    else if (c === 'strike') wrapInline('~~', 'crossed out');
    else if (c === 'hl') wrapInline('==', 'highlighted');
    else if (c === 'page') newPage();
    else linePrefix(c);
  };

  let label: ReactNode = <span className="text-muted">No block selected</span>;
  if (box) {
    const n = boxes.filter(x => x.page === box.page).indexOf(box) + 1;
    const fs = framesOf(box), p0 = box.page + 1, p1 = fs.length ? fs[fs.length - 1].page + 1 : p0;
    label = (
      <span className="truncate text-muted">
        <span className="font-semibold text-fg">Block {n}</span>
        {(p1 > p0 ? ` on pages ${p0}–${p1}` : ` on page ${p0}`) + (hasOwnStyle(box) ? ' · own style' : '')}
      </span>
    );
  }

  return (
    <section aria-label="Write" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 border-b border-line py-2 pr-3 pl-4 text-sm">
        <span className="min-w-0 flex-1 truncate" aria-live="polite">{label}</span>
        <Button variant="outline" size="sm" onClick={() => pagesApi.addBox?.()}><Plus />Add block</Button>
        <Button variant="ghost" size="sm" title="Bring in a PDF, Word or text file" onClick={() => openImport()}><FileUp />Import</Button>
      </div>
      <div role="toolbar" aria-label="Formatting" className="flex flex-none flex-wrap items-center gap-0.5 border-b border-line px-2.5 py-2">
        {TOOLS.map((t, i) => t === 'sep'
          ? <span key={i} aria-hidden className="mx-1 h-5 w-px bg-line" />
          : (
            <button key={t.cmd} type="button" title={t.title} aria-label={t.label} disabled={!box} onClick={() => run(t.cmd)}
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap text-fg hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4">
              {t.body}
            </button>
          ))}
      </div>
      <textarea ref={ta} spellCheck aria-label="Block contents" disabled={!box}
        placeholder={box ? 'Write in this block…' : 'Select a block on the page to edit it, or add a new one.'}
        value={box ? box.text : ''}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
          const k = e.key.toLowerCase();
          if (k === 'b') { e.preventDefault(); run('bold'); }
          else if (k === 'u') { e.preventDefault(); run('ul'); }
        }}
        className="min-h-0 w-full flex-1 resize-none bg-surface py-4 pr-4 pl-5 text-base leading-relaxed text-fg outline-none placeholder:text-muted focus-visible:shadow-[inset_3px_0_0_var(--accent)] disabled:cursor-not-allowed disabled:bg-surface-2" />
      <details className="group flex-none border-t border-line px-4 py-2 text-[13px] text-muted">
        <summary className="cursor-pointer py-1 font-medium text-fg">Formatting help</summary>
        <dl className="mt-2 mb-1 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:text-fg">
          {HELP.map(([dt, dd], i) => <div key={i} className="contents"><dt>{dt}</dt><dd>{dd}</dd></div>)}
        </dl>
        <p className="mt-2 mb-0.5">Line breaks stay where you put them. A block that runs past the bottom of a page carries on at the top of the next one.</p>
      </details>
    </section>
  );
}
