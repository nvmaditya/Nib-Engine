import { useEffect, useRef } from 'react';
import { update, selectedBox } from '../store.js';
import { hasOwnStyle, framesOf } from '../engine/core.js';
import { mobile, setTab, pagesApi } from '../actions.js';

const TOOLS = [
  ['bold', <b>B</b>, 'Press harder (Ctrl+B)', 'Bold'],
  ['ul', <u>U</u>, 'Underline (Ctrl+U)', 'Underline'],
  ['strike', <s>S</s>, 'Cross out', 'Cross out'],
  ['hl', <span className="hl">H</span>, 'Highlight', 'Highlight'],
  'sep',
  ['h1', 'Title'], ['h2', 'Heading'], ['bullet', '• List'], ['num', '1. List'], ['quote', 'Note'],
  ['page', 'Next page', 'Continue the rest of this box on the next page'],
];

export default function WritePanel({ st, hidden }) {
  const ta = useRef(null);
  const box = selectedBox();

  // Opening a box (or one page's part of it) focuses the editor and selects what was asked for.
  useEffect(() => {
    if (!st.focusEditor || !ta.current || hidden) return;
    const el = ta.current, sel = st.pendingSelect;
    const t = setTimeout(() => {
      el.focus();
      if (sel) { el.setSelectionRange(sel[0], sel[0]); el.blur(); el.focus(); el.setSelectionRange(sel[0], sel[1], 'backward'); update(s => { s.pendingSelect = null; }, { save:false, layout:false }); }
    }, 30);
    return () => clearTimeout(t);
  }, [st.focusEditor, hidden]);

  const setText = value => { const b = selectedBox(); if (b) update(() => { b.text = value; }, { layout:'soon' }); };
  const replaceSel = (str, selFrom, selLen) => {
    const el = ta.current; el.focus();
    const start = el.selectionStart;
    let ok = false;
    try { ok = document.execCommand('insertText', false, str); } catch (e) { ok = false; } // keeps the editor's own undo
    if (!ok) { el.setRangeText(str, el.selectionStart, el.selectionEnd, 'end'); setText(el.value); }
    el.setSelectionRange(start + selFrom, start + selFrom + selLen);
  };
  const wrapInline = (mk, placeholder) => {
    const el = ta.current; el.focus();
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
  const linePrefix = kind => {
    const el = ta.current; el.focus();
    const v = el.value; const s = el.selectionStart, e = el.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', Math.max(e - (e > s && v[e - 1] === '\n' ? 1 : 0), s)); if (le === -1) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const strip = l => l.replace(/^(#{1,3}\s+|\s*[-*+]\s+|\s*\d{1,3}[.)]\s+|\s*>\s?)/, '');
    const has = { h1:/^#\s+/, h2:/^##\s+/, bullet:/^\s*[-*+]\s+/, num:/^\s*\d{1,3}[.)]\s+/, quote:/^\s*>/ }[kind];
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
    const el = ta.current; el.focus();
    const v = el.value, s = el.selectionStart;
    const str = (s > 0 && v[s - 1] !== '\n' ? '\n' : '') + '\\newpage\n';
    el.setSelectionRange(s, el.selectionEnd);
    replaceSel(str, str.length, 0);
  };
  const run = c => {
    if (c === 'bold') wrapInline('**', 'bold text');
    else if (c === 'ul') wrapInline('*', 'underlined');
    else if (c === 'strike') wrapInline('~~', 'crossed out');
    else if (c === 'hl') wrapInline('==', 'highlighted');
    else if (c === 'page') newPage();
    else linePrefix(c);
  };

  let label = <span id="editing-label">No text box selected</span>;
  if (box) {
    const n = st.doc.boxes.filter(x => x.page === box.page).indexOf(box) + 1;
    const fs = framesOf(box), p0 = box.page + 1, p1 = fs.length ? fs[fs.length - 1].page + 1 : p0;
    label = <span id="editing-label"><strong>Text box {n}</strong>{(p1 > p0 ? ` on pages ${p0}–${p1}` : ` on page ${p0}`) + (hasOwnStyle(box) ? ' · own style' : '')}</span>;
  }
  const addBox = () => {
    if (mobile()) { setTab('preview'); requestAnimationFrame(() => pagesApi.addBox && pagesApi.addBox()); }
    else if (pagesApi.addBox) pagesApi.addBox();
  };

  return (
    <section className="panel" id="panel-write" role="tabpanel" aria-label="Write" hidden={hidden}>
      <div className="editing">{label}<button className="btn small" id="add-box-2" type="button" onClick={addBox}>Add text box</button></div>
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t, i) => t === 'sep'
          ? <span key={i} className="sep" aria-hidden="true" />
          : <button key={t[0]} className="tool" type="button" data-cmd={t[0]} title={t[2]} aria-label={t[3]} disabled={!box} onClick={() => run(t[0])}>{t[1]}</button>)}
      </div>
      <textarea id="src" ref={ta} spellCheck="true" aria-label="Text box contents" disabled={!box}
        placeholder={box ? 'Write in this text box…' : 'Select a text box on the page to edit it, or add a new one.'}
        value={box ? box.text : ''}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
          const k = e.key.toLowerCase();
          if (k === 'b') { e.preventDefault(); run('bold'); }
          else if (k === 'u') { e.preventDefault(); run('ul'); }
        }} />
      <details className="cheats">
        <summary>Formatting help</summary>
        <dl>
          <dt><code># Title</code></dt><dd>Centred in the box, double underline</dd>
          <dt><code>## Heading</code></dt><dd>Underlined heading</dd>
          <dt><code>**word**</code></dt><dd>Pressed harder</dd>
          <dt><code>*word*</code></dt><dd>Underlined</dd>
          <dt><code>==word==</code></dt><dd>Highlighter</dd>
          <dt><code>~~word~~</code></dt><dd>Crossed out</dd>
          <dt><code>- item</code> <code>1. item</code></dt><dd>Lists</dd>
          <dt><code>&gt; line</code></dt><dd>Side-lined note</dd>
          <dt><code>\newpage</code></dt><dd>Continue on the next page</dd>
        </dl>
        <p>Line breaks stay where you put them. A box that runs past the bottom of a page carries on at the top of the next one.</p>
      </details>
    </section>
  );
}
