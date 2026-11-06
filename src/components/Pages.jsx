import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PAGE_W, PAGE_H } from '../engine/config.js';
import { paintPaper, paperKey, renderSegment, segBounds, segId, inkKey, setFrame, geom, snapX, snapY, applyLook, frameShot, autoName, cleanName, framesOf } from '../engine/core.js';
import { update, toast } from '../store.js';
import { select, addBoxAt, addPage, removePage, editFrame, styleBox, shuffleBox, separateFrame, deleteFrame, pagesApi } from '../actions.js';
import { savePng } from '../exporters.js';
import { PlusIcon, MoveIcon, ShuffleIcon } from './icons.jsx';

let dragging = false; // while a box is dragged, nothing is redrawn and leftover transforms are kept

/* ---------- Canvases ---------- */
function PaperCanvas({ i, pages, pxW, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, k = paperKey(i, pxW);
    if (c.dataset.k !== k) { paintPaper(c, i, pxW); c.dataset.k = k; }
  });
  return <canvas className="bg" ref={ref} role="img" aria-label={`Handwritten page ${i + 1} of ${pages}`} data-tick={tick} />;
}
function InkCanvas({ sg, s, px }) {
  const ref = useRef(null);
  const bb = segBounds(sg);
  useLayoutEffect(() => { if (!dragging) ref.current.style.transform = ''; });
  useEffect(() => {
    const c = ref.current, k = inkKey(sg, px);
    if (c.dataset.k !== k) { renderSegment(c, sg, px); c.dataset.k = k; }
  });
  return <canvas ref={ref} data-id={segId(sg)} style={{ left:bb.ox * s, top:bb.oy * s, width:bb.w * s, height:bb.h * s }} />;
}

/* ---------- A box's part on one page: select, move, resize, and its toolbar ---------- */
function BoxFrame({ sg, s, gap, selected, touched, multi, view }) {
  const ref = useRef(null);
  const top = sg.top + gap * 0.1;
  useLayoutEffect(() => { if (!dragging) ref.current.style.transform = ''; });

  const startDrag = (e, mode) => {
    const box = sg.box, cont = sg.idx > 0; // a later page's part stays on its own page
    const el = ref.current, fig = el.closest('.sheet'), paperEl = fig.querySelector('.paper'), sheetsEl = fig.parentElement, pagesEl = sheetsEl.parentElement;
    const sc = view.current.s, g = geom();
    const r0 = paperEl.getBoundingClientRect();
    const f0 = { page:sg.page, x:sg.x, y:sg.top, w:sg.w };
    const st = { x:e.clientX, y:e.clientY, w:f0.w, moved:false };
    const grabDX = (e.clientX - r0.left) / sc - f0.x, grabDY = (e.clientY - r0.top) / sc - f0.y;
    const head = paperEl.querySelector(`.ink-layer canvas[data-id="${box.id}:${sg.idx}"]`);
    let target = { page:f0.page, x:f0.x, y:f0.y }, raf = 0;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dragging = mode === 'move';
    fig.classList.add('dragging'); paperEl.classList.remove('scanned');
    const move = ev => {
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 3) return;
      st.moved = true;
      if (mode === 'resize') {
        const nw = Math.round(Math.max(60, Math.min(PAGE_W - f0.x - 6, f0.w + dx / sc)));
        if (nw !== st.w) { st.w = nw; if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(() => setFrame(sg, { w:st.w })); }); }
        return;
      }
      const papers = [...sheetsEl.querySelectorAll('.paper')];
      let ti = f0.page, tr = papers[f0.page] ? papers[f0.page].getBoundingClientRect() : r0;
      if (!cont) for (let i = 0; i < papers.length; i++) {
        const r = papers[i].getBoundingClientRect();
        if (ev.clientY >= r.top - 17 && ev.clientY <= r.bottom + 17) { ti = i; tr = r; break; }
      }
      const nx = snapX((ev.clientX - tr.left) / sc - grabDX, g, f0.w);
      const ny = snapY((ev.clientY - tr.top) / sc - grabDY, g);
      target = { page:ti, x:nx, y:ny };
      const or = paperEl.getBoundingClientRect();
      const tx = (tr.left + nx * sc) - (or.left + f0.x * sc), ty = (tr.top + ny * sc) - (or.top + f0.y * sc);
      el.style.transform = `translate(${tx}px,${ty}px)`;
      if (head) head.style.transform = `translate(${tx}px,${ty}px)`;
      const cr = pagesEl.getBoundingClientRect();
      if (ev.clientY < cr.top + 60) pagesEl.scrollTop -= 14; else if (ev.clientY > cr.bottom - 40) pagesEl.scrollTop += 14;
    };
    const end = ev => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
      fig.classList.remove('dragging'); dragging = false;
      if (raf) cancelAnimationFrame(raf);
      if (st.moved) update(() => {
        if (mode === 'move' && ev.type === 'pointerup') setFrame(sg, cont ? { x:target.x, y:target.y } : target);
        if (mode === 'resize') setFrame(sg, { w:st.w });
      });
      else { el.style.transform = ''; if (head) head.style.transform = ''; }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  const onPointerDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target;
    if (t.closest('.box-tools') && !t.closest('.grip')) return; // a button
    e.stopPropagation();
    update(s => { s.selectedId = sg.box.id; s.touchedId = segId(sg); }, { save:false, layout:false });
    const isRz = !!t.closest('.rz'), isGrip = !!t.closest('.grip');
    if (e.pointerType === 'touch' && !isRz && !isGrip) return; // let touch scroll the page
    e.preventDefault();
    startDrag(e, isRz ? 'resize' : 'move');
  };
  const onKeyDown = e => {
    if (e.target !== ref.current) return;
    const g = geom();
    const move = patch => { e.preventDefault(); update(() => setFrame(sg, patch)); };
    switch (e.key) {
      case 'ArrowUp': return move({ y:snapY(sg.top - gap, g) });
      case 'ArrowDown': return move({ y:snapY(sg.top + gap, g) });
      case 'ArrowLeft': return move({ x:snapX(sg.x - 4, g, sg.w) });
      case 'ArrowRight': return move({ x:snapX(sg.x + 4, g, sg.w) });
      case 'Delete': case 'Backspace': e.preventDefault(); return deleteFrame(sg);
      case 'Enter': e.preventDefault(); return editFrame(sg);
      case 'Escape': select(null); ref.current.blur(); return undefined;
      default: return undefined;
    }
  };
  const cls = ['box', selected && 'selected', touched && 'touched', sg.idx > 0 && 'cont', !sg.box.text.trim() && 'empty', top * view.current.s < 52 && 'tools-below'].filter(Boolean).join(' ');
  return (
    <div ref={ref} className={cls} data-id={segId(sg)} tabIndex={0} role="group"
      aria-label={sg.idx ? `Text box, continued on page ${sg.page + 1}` : 'Text box'}
      style={{ left:sg.x * s, top:top * s, width:sg.w * s, height:Math.max(gap * 0.8, sg.bottom - top) * s }}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      onDoubleClick={e => { if (!e.target.closest('.box-tools')) editFrame(sg); }}
      onFocus={() => { if (!selected) select(sg.box.id); }}>
      <span className="ph">Empty text box</span>
      <span className="rz" title="Drag to change width" />
      <div className="box-tools">
        <button type="button" className="bt grip" data-act="move" aria-label="Move text box"><MoveIcon />Move</button>
        <button type="button" className="bt" data-act="edit" onClick={() => editFrame(sg)}>Edit</button>
        <button type="button" className="bt" data-act="style" onClick={() => styleBox(sg.box.id)}>Style</button>
        <button type="button" className="bt" data-act="shuffle" aria-label="Reshuffle this text box" title="Reshuffle this text box" onClick={() => shuffleBox(sg.box.id)}><ShuffleIcon size={14} /></button>
        {sg.idx > 0 && <button type="button" className="bt" data-act="separate" title="Make this page’s part its own text box" onClick={() => separateFrame(sg)}>Separate</button>}
        <button type="button" className="bt danger" data-act="delete" title={multi ? 'Delete the text on this page; the rest moves up' : 'Delete this text box'} onClick={() => deleteFrame(sg)}>Delete</button>
      </div>
    </div>
  );
}

/* ---------- One sheet of paper ---------- */
const Sheet = memo(function Sheet({ i, pages, segs, allSegs, cssW, cssH, dpr, st, view, tick, removable }) {
  const s = cssW / PAGE_W;
  const [saving, setSaving] = useState(false);
  const saveImage = async () => {
    setSaving(true);
    try { toast(`Saved ${await savePng(i)}`); } catch (e) { toast('That image couldn’t be made.'); } finally { setSaving(false); }
  };
  return (
    <figure className="sheet" data-i={i}>
      <div className="paper" style={{ width:cssW, height:cssH }}>
        <PaperCanvas i={i} pages={pages} pxW={cssW * dpr} tick={tick} />
        <div className="ink-layer">{segs.map(sg => <InkCanvas key={segId(sg)} sg={sg} s={s} px={s * dpr} />)}</div>
        <canvas className="scan" aria-hidden="true" />
        <div className="ui"
          onPointerDown={e => { if (e.target === e.currentTarget) select(null); }}
          onDoubleClick={e => {
            if (e.target !== e.currentTarget) return;
            const r = e.currentTarget.getBoundingClientRect();
            addBoxAt(i, (e.clientX - r.left) / s, (e.clientY - r.top) / s, null, allSegs);
          }}>
          {segs.map(sg => (
            <BoxFrame key={segId(sg)} sg={sg} s={s} gap={st.S.gap} view={view}
              selected={sg.box.id === st.selectedId} touched={st.touchedId === segId(sg)}
              multi={allSegs.some(o => o.box === sg.box && o !== sg)} />
          ))}
        </div>
      </div>
      <figcaption>
        <span className="cap-label">{pages > 1 ? `Page ${i + 1} of ${pages}` : 'Page 1'}</span>
        <span className="cap-actions">
          {removable && <button type="button" className="btn small rm-page" onClick={() => removePage(i, allSegs)}>Remove page</button>}
          <button type="button" className="btn small save-png" disabled={saving} onClick={saveImage}>Save as image</button>
        </span>
      </figcaption>
    </figure>
  );
});

/* ---------- The exact scan preview ---------- */
// The CSS likeness can't flatten lighting, so once editing pauses each page is put through the
// same processing as the downloads, using the paper and ink already drawn on screen.
const screenKey = paper => [paper.querySelector('.bg').dataset.k, ...[...paper.querySelectorAll('.ink-layer canvas')].map(c => c.dataset.k + '@' + c.style.left + ',' + c.style.top)].join('\n');
function composeFromScreen(paper, dpr) {
  const bg = paper.querySelector('.bg');
  const out = document.createElement('canvas'); out.width = bg.width; out.height = bg.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(bg, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  for (const c of paper.querySelectorAll('.ink-layer canvas')) {
    ctx.drawImage(c, Math.round(parseFloat(c.style.left) * dpr), Math.round(parseFloat(c.style.top) * dpr), Math.round(parseFloat(c.style.width) * dpr), Math.round(parseFloat(c.style.height) * dpr));
  }
  return out;
}
let scanSeq = 0, scanTimer = 0;
function scheduleScanPreview(sheetsEl, pagesEl, S, dpr) {
  clearTimeout(scanTimer); const seq = ++scanSeq;
  const keyOf = p => S.look + '|' + S.tilt + '|' + screenKey(p);
  for (const p of sheetsEl.querySelectorAll('.paper.scanned')) if (S.look === 'none' || p.dataset.scanKey !== keyOf(p)) p.classList.remove('scanned');
  if (S.look === 'none') return;
  scanTimer = setTimeout(async () => {
    const view = pagesEl.getBoundingClientRect(), mid = (view.top + view.bottom) / 2;
    const figs = [...sheetsEl.children].map(f => { const r = f.getBoundingClientRect(); return { f, d:Math.abs((r.top + r.bottom) / 2 - mid) }; }).sort((a, b) => a.d - b.d);
    for (const { f } of figs) {
      if (seq !== scanSeq || dragging) return;
      const paper = f.querySelector('.paper'), key = keyOf(paper), i = Number(f.dataset.i);
      if (paper.dataset.scanKey !== key) {
        try {
          const out = applyLook(frameShot(composeFromScreen(paper, dpr), i), i);
          if (seq !== scanSeq) return;
          const sc = paper.querySelector('.scan'); sc.width = out.width; sc.height = out.height; sc.getContext('2d').drawImage(out, 0, 0);
          paper.dataset.scanKey = key;
        } catch (e) { continue; }
      }
      paper.classList.add('scanned');
      await new Promise(r => setTimeout(r, 0));
    }
  }, 450);
}

/* ---------- The pages, with their tool bar ---------- */
export default function Pages({ st, layout }) {
  const pagesRef = useRef(null), sheetsRef = useRef(null);
  const view = useRef({ s:1 });
  const [cssW, setCssW] = useState(0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  useLayoutEffect(() => {
    const el = pagesRef.current;
    const measure = () => { const avail = el.clientWidth - 32; if (avail >= 80) setCssW(Math.floor(Math.min(avail, 680))); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cssH = Math.round(cssW * PAGE_H / PAGE_W);
  view.current = { s:cssW / PAGE_W };

  // Add a box where the reader is looking, on a free line.
  pagesApi.addBox = () => {
    if (!layout) return;
    const cr = pagesRef.current.getBoundingClientRect(); let best = { page:0, y:geom().top, area:-1 };
    [...sheetsRef.current.querySelectorAll('.paper')].forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const t = Math.max(r.top, cr.top + 56), b = Math.min(r.bottom, cr.bottom), a = b - t;
      if (a > best.area) best = { page:i, area:a, y:((t - r.top) + Math.max(0, a) * 0.3) / view.current.s };
    });
    addBoxAt(null, null, null, best, layout.segs);
  };

  useEffect(() => { if (sheetsRef.current && layout) scheduleScanPreview(sheetsRef.current, pagesRef.current, st.S, dpr); });
  useEffect(() => { // after an import, show its first page
    if (st.scrollToPage == null || !sheetsRef.current) return;
    const f = sheetsRef.current.children[st.scrollToPage];
    if (f) { f.scrollIntoView({ block:'start' }); update(s => { s.scrollToPage = null; }, { save:false, layout:false }); }
  });

  const hint = window.matchMedia('(hover: none)').matches ? 'Tap a box, then use Move to drag it.' : 'Drag boxes to move them. Pull the right edge to resize. Double-click the paper for a new box.';
  const lookChange = e => {
    const v = e.target.value, label = e.target.selectedOptions[0].text.toLowerCase();
    update(s => { s.S.look = v; }, { layout:false });
    if (v !== 'none') toast(`Downloads will look ${label}, as shown on the page.`);
  };
  const tick = layout ? layout.tick : '';
  return (
    <main className="pages" id="pages" aria-label="Pages" ref={pagesRef}>
      <div className="page-bar" role="toolbar" aria-label="Page tools">
        <button className="btn small" id="add-box" type="button" onClick={() => pagesApi.addBox()}><PlusIcon />Add text box</button>
        <button className="btn small" id="add-page" type="button" onClick={() => layout && addPage(layout.pages)}><PlusIcon />Add page</button>
        <label className="look-pick" title="How downloaded pages look">Look
          <select id="look" className="look-sel" value={st.S.look} onChange={lookChange}>
            <option value="none">As written</option>
            <option value="scan">Scanned</option>
            <option value="gray">Scanned, greyscale</option>
            <option value="bw">Black and white</option>
          </select>
        </label>
        <label className="tilt-pick" title="Downloads come out turned a fraction of a degree and cropped a little unevenly, like a quick photo or scan">
          <input type="checkbox" id="tilt" checked={!!st.S.tilt} onChange={e => update(s => { s.S.tilt = e.target.checked; }, { layout:false })} /> Camera tilt
        </label>
        <label className="fname-pick" id="fname-wrap">File name
          <input type="text" id="fname" maxLength={80} spellCheck="false" autoComplete="off" aria-describedby="fname-ext"
            value={st.doc.fileName || ''} placeholder={autoName()}
            onChange={e => update(s => { s.doc.fileName = e.target.value; }, { layout:false })}
            onBlur={e => { const c = cleanName(e.target.value); if (c !== e.target.value.trim() || c !== e.target.value) update(s => { s.doc.fileName = c; }, { layout:false }); }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
          <span className="fname-ext" id="fname-ext">.pdf</span>
        </label>
        <span className="bar-hint" id="bar-hint">{hint}</span>
      </div>
      {(!layout || !cssW) && <p className="loading" id="loading">Loading handwriting…</p>}
      <div id="sheets" ref={sheetsRef} data-look={st.S.look}>
        {layout && cssW > 0 && Array.from({ length:layout.pages }, (_, i) => {
          const segs = layout.segs.filter(sg => sg.page === i);
          return <Sheet key={i} i={i} pages={layout.pages} segs={segs} allSegs={layout.segs} cssW={cssW} cssH={cssH} dpr={dpr}
            st={st} view={view} tick={tick} version={st.version} removable={layout.pages > 1 && i < st.doc.pageCount && !segs.length} />;
        })}
      </div>
      <div className="pages-end" />
    </main>
  );
}
