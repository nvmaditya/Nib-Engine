// Things people do to the document, ported from the single-page version's handlers.
import { state, update, toast, snapshot, undoTo, selectedBox } from './store.js';
import { BOX_KEYS, uid } from './engine/doc.js';
import { framesOf, frameRange, textWithoutFrame, splitAtFrame, geom, snapX, snapY, boxSettings, clearMeasureCache } from './engine/core.js';
import { PAGE_W } from './engine/config.js';

export const mobile = () => window.matchMedia('(max-width: 859px)').matches;

export function select(id) {
  update(s => { s.selectedId = id; if (!id && s.scope === 'box') s.scope = 'all'; }, { save:false, layout:false });
}
export function setTab(t) {
  if (t === 'preview' && !mobile()) t = 'write';
  update(s => { s.tab = t; }, { save:false, layout:false });
}
export function editBox(id) {
  update(s => { s.selectedId = id; s.focusEditor = (s.focusEditor || 0) + 1; if (mobile() || s.tab === 'style') s.tab = 'write'; }, { save:false, layout:false });
}
// Edit one page's part: open the editor with just that page's text selected.
export function editFrame(sg) {
  const box = sg.box;
  const range = framesOf(box).length > 1 ? frameRange(box, sg.idx) : null;
  update(s => { s.selectedId = box.id; s.focusEditor = (s.focusEditor || 0) + 1; s.pendingSelect = range; if (mobile() || s.tab === 'style') s.tab = 'write'; }, { save:false, layout:false });
}
export function styleBox(id) {
  update(s => { s.selectedId = id; s.scope = 'box'; s.tab = 'style'; }, { save:false, layout:false });
}
export function shuffleBox(id) {
  update(s => { const b = s.doc.boxes.find(x => x.id === id); if (b) b.shuffle = 1 + Math.floor(Math.random() * 1e9); });
}
export function reshuffle() {
  const b = state.scope === 'box' ? selectedBox() : null;
  if (b) shuffleBox(b.id); // in "This text box" mode only that box changes
  else update(s => { s.S.seed = Math.floor(Math.random() * 1e9); });
}

export function deleteBox(id) {
  const snap = snapshot();
  update(s => { s.doc.boxes = s.doc.boxes.filter(b => b.id !== id); if (s.selectedId === id) { s.selectedId = null; if (s.scope === 'box') s.scope = 'all'; } });
  toast('Text box deleted.', undoTo(snap, id));
}
// Delete one page's part: only that page's text goes, and what follows moves up.
export function deleteFrame(sg) {
  const box = sg.box;
  if (framesOf(box).length < 2) { deleteBox(box.id); return; }
  const snap = snapshot();
  update(s => {
    box.text = textWithoutFrame(box, sg.idx);
    if (!box.text.trim()) { s.doc.boxes = s.doc.boxes.filter(b => b !== box); s.selectedId = null; }
  });
  toast(`Text on page ${sg.page + 1} deleted; what follows moves up.`, undoTo(snap, box.id));
}
// From this page's part on, the text becomes a text box of its own.
export function separateFrame(sg) {
  if (!sg.idx) return;
  const snap = snapshot(), box = sg.box;
  update(s => {
    const nb = splitAtFrame(box, sg, uid());
    s.doc.boxes.splice(s.doc.boxes.indexOf(box) + 1, 0, nb);
    s.selectedId = nb.id;
  });
  toast(`Page ${sg.page + 1} is now its own text box.`, undoTo(snap, box.id));
}

export function addBoxAt(page, x, y, spot, segs) {
  const g = geom(); const w = Math.min(420, g.right - g.left);
  if (spot) { page = spot.page; y = spot.y; x = g.left; }
  const nx = snapX(x, g, w);
  let ny = snapY(y - state.S.gap * 0.6, g);
  if (spot) { // look for a free line near the middle of the view so new boxes don't land on writing
    const busy = yy => segs.some(sg => sg.page === page && sg.x < nx + w && sg.x + sg.w > nx && sg.top < yy + g.gap * 1.3 && sg.bottom > yy + g.gap * 0.2);
    for (let d = 0; d < 40; d++) {
      const down = snapY(ny + d * g.gap, g), up = snapY(ny - d * g.gap, g);
      if (!busy(down)) { ny = down; break; }
      if (!busy(up)) { ny = up; break; }
    }
  }
  const box = { id:uid(), page, x:nx, y:ny, w, text:'', style:{}, shuffle:0, frames:{} };
  update(s => { s.doc.boxes.push(box); s.doc.pageCount = Math.max(s.doc.pageCount, page + 1); });
  editBox(box.id);
}
export function addPage(pages) { update(s => { s.doc.pageCount = pages + 1; }); }
export function removePage(i, segs) {
  if (segs.some(sg => sg.page === i)) return;
  update(s => { for (const b of s.doc.boxes) if (b.page > i) b.page--; s.doc.pageCount = Math.max(1, s.doc.pageCount - 1); });
}

// What the Style panel shows and edits: the selected box's own settings, or the shared ones.
export const scopeBox = () => state.scope === 'box' ? selectedBox() : null;
export const view = () => { const b = scopeBox(); return b ? boxSettings(b) : state.S; };
export function setV(obj) {
  update(s => {
    const b = s.scope === 'box' ? s.doc.boxes.find(x => x.id === s.selectedId) : null;
    for (const [k, v] of Object.entries(obj)) {
      if (b && BOX_KEYS.includes(k)) b.style = { ...(b.style || {}), [k]:v };
      else s.S[k] = v;
    }
    clearMeasureCache();
  });
}
export function resetBoxStyle() {
  const b = selectedBox(); if (!b) return;
  const before = { style:b.style, shuffle:b.shuffle };
  update(() => { b.style = {}; b.shuffle = 0; clearMeasureCache(); });
  toast('This box matches the others again.', { label:'Undo', fn:() => update(() => { Object.assign(b, before); clearMeasureCache(); }) });
}

// An imported document becomes one text box that flows over as many pages as it needs.
export function writeOut(text, where, name, pages) {
  const g = geom();
  const box = { id:uid(), page:0, x:g.left, y:snapY(g.top - g.gap, g), w:g.right - g.left, text, style:{}, shuffle:0, frames:{} };
  const snap = snapshot();
  update(s => {
    if (where === 'append') { box.page = pages; s.doc.boxes.push(box); s.doc.pageCount = pages + 1; }
    else s.doc = { pageCount:1, boxes:[box], fileName:name || '' };
    s.selectedId = box.id; s.scope = 'all'; s.scrollToPage = box.page; s.tab = mobile() ? 'preview' : s.tab;
  });
  return { box, undo:undoTo(snap, null) };
}
export const MAX_W = PAGE_W;
// The pages view registers how to add a box where the reader is looking.
export const pagesApi = { addBox:null };
