// Pasted HTML (Google Docs, Word, web pages), cleaned so it carries only the formatting it shows: no bold from
// a normal-weight wrapper, no highlight from a white or near-white background, and lists as flat items with an
// indent, the way markup writes them.

const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL']);
// The blocks a line break splits in two (a list item's paragraph splits the item, so it keeps its indent).
const LINE = new Set(['BLOCKQUOTE', 'DD', 'DIV', 'DT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P', 'PRE', 'TD', 'TH']);
const isList = (n: Node | null): n is HTMLElement => !!n && (n.nodeName === 'UL' || n.nodeName === 'OL');
const isBlock = (n: Node) => n.nodeType === 1 && BLOCK.has(n.nodeName);
const clampIndent = (n: number) => Math.max(0, Math.min(3, n));

// CSS colours with every channel at 240 or more.
const NEAR_WHITE = new Set(['white', 'snow', 'honeydew', 'mintcream', 'azure', 'aliceblue', 'ghostwhite', 'whitesmoke', 'floralwhite', 'ivory', 'lavenderblush']);

/** A colour as [r, g, b, alpha], for the forms pasted HTML uses; null if it isn't one of them. */
function rgba(v: string): number[] | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1], d = h.length <= 4 ? [...h].map(c => parseInt(c + c, 16)) : h.match(/../g)!.map(x => parseInt(x, 16));
    return [d[0], d[1], d[2], d.length > 3 ? d[3] / 255 : 1];
  }
  const fn = /^(rgb|hsl)a?\(([^)]*)\)$/.exec(v);
  if (fn) {
    const p = fn[2].split(/[\s,/]+/).filter(Boolean), num = (x = '', full: number) => (x.endsWith('%') ? (parseFloat(x) / 100) * full : parseFloat(x));
    const a = p[3] === undefined ? 1 : num(p[3], 1);
    if (fn[1] === 'rgb') return [num(p[0], 255), num(p[1], 255), num(p[2], 255), a];
    const h = parseFloat(p[0]) * (p[0]?.endsWith('turn') ? 360 : 1), s = num(p[1], 1), l = num(p[2], 1);
    const f = (n: number) => { const k = (n + h / 30) % 12; return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4), a];
  }
  return NEAR_WHITE.has(v) ? [255, 255, 255, 1] : null;
}

/** Whether a background colour shows as no highlight: none, transparent, or near white (every channel ≥ 240). */
export function isBlankBackground(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/\s*!important$/, '');
  if (!v || /^(transparent|none|inherit|initial|unset|revert|revert-layer|auto|window|currentcolor)$/.test(v)) return true;
  const c = rgba(v);
  return !!c && (c[3] === 0 || c.slice(0, 3).every(x => x >= 240));
}

const normalWeight = (w: string) => w === 'normal' || w === 'lighter' || (/^\d+$/.test(w) && +w < 500);

function unwrap(el: Element): void {
  el.replaceWith(...el.childNodes);
}

// Styles that would add formatting the text doesn't show.
function cleanStyles(body: HTMLElement): void {
  for (const el of body.querySelectorAll<HTMLElement>('[style]')) {
    const st = el.style;
    if ((st.backgroundColor || st.getPropertyValue('background')) && isBlankBackground(st.backgroundColor)) {
      st.removeProperty('background');
      st.removeProperty('background-color');
    }
    // Bold's own rule reads font-weight 400 as "not bold"
    if (normalWeight(st.fontWeight) && st.fontWeight !== '400') st.fontWeight = '400';
  }
  // Google Docs wraps everything in <b style="font-weight:normal">
  for (const el of body.querySelectorAll<HTMLElement>('b, strong')) if (normalWeight(el.style.fontWeight)) unwrap(el);
}

interface Item { ordered: boolean; kind: '1' | 'a'; delim: '.' | ')'; num: number; depth: number; content: Node[]; attrs?: Element }

// Consecutive items with the same kind of list become one list; an ordered list starts at its first item's number.
function buildLists(doc: Document, items: Item[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let cur: HTMLElement | null = null, key = '';
  for (const it of items) {
    const k = it.ordered ? 'ol' + it.kind + it.delim : 'ul';
    if (!cur || k !== key) {
      cur = doc.createElement(it.ordered ? 'ol' : 'ul');
      if (it.ordered) { cur.setAttribute('start', String(it.num)); cur.setAttribute('data-kind', it.kind); cur.setAttribute('data-delim', it.delim); }
      out.push(cur);
      key = k;
    }
    const li = doc.createElement('li');
    li.setAttribute('data-indent', String(clampIndent(it.depth)));
    li.append(...it.content);
    cur.append(li);
  }
  return out;
}

// Word writes list items as paragraphs: <p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">·</span>…</p>.
function wordLists(doc: Document, body: HTMLElement): void {
  const levelOf = (el: Element | null) => {
    const m = el?.nodeName === 'P' ? /mso-list:\s*l\d+\s+level(\d+)/i.exec(el.getAttribute('style') ?? '') : null;
    return m ? parseInt(m[1], 10) : 0;
  };
  for (const p of [...body.querySelectorAll('p')]) {
    if (!p.isConnected || !levelOf(p) || levelOf(p.previousElementSibling)) continue; // each run once, from its first item
    const run: Element[] = [];
    for (let el: Element | null = p; el && levelOf(el); el = el.nextElementSibling) run.push(el);
    const items = run.map((el): Item => {
      const ignore = [...el.querySelectorAll<HTMLElement>('span')].find(s => /mso-list:\s*ignore/i.test(s.getAttribute('style') ?? ''));
      const marker = (ignore?.textContent ?? '').replace(/\s+/g, ' ').trim();
      ignore?.remove();
      const p2 = doc.createElement('p');
      p2.append(...el.childNodes);
      const num = /^(\d+)([.)])$/.exec(marker), let_ = /^([a-z])([.)])$/i.exec(marker);
      const base = { depth: levelOf(el) - 1, content: [p2] };
      if (num) return { ...base, ordered: true, kind: '1', delim: num[2] as '.' | ')', num: parseInt(num[1], 10) };
      if (let_) return { ...base, ordered: true, kind: 'a', delim: ')', num: let_[1].toLowerCase().charCodeAt(0) - 96 };
      return { ...base, ordered: false, kind: '1', delim: '.', num: 1 }; // ·, •, o, § and anything else
    });
    const lists = buildLists(doc, items);
    run[0].before(...lists);
    run.forEach(el => el.remove());
  }
}

// Nested lists (<ul><li>one<ul><li>two</li></ul></li></ul>, or Google Docs' <ul><li>one</li><ul>…</ul></ul>)
// become flat items with data-indent.
function flattenLists(doc: Document, body: HTMLElement): void {
  for (const list of [...body.querySelectorAll<HTMLElement>('ul, ol')]) {
    if (!list.isConnected || list.parentElement?.closest('ul, ol')) continue; // outermost lists only
    if (!list.querySelector('ul, ol')) {
      for (const li of list.querySelectorAll(':scope > li')) {
        const lv = parseInt(li.getAttribute('aria-level') ?? '', 10);
        if (!li.hasAttribute('data-indent') && lv > 0) li.setAttribute('data-indent', String(clampIndent(lv - 1)));
      }
      continue;
    }
    const items: Item[] = [];
    const walk = (l: HTMLElement, depth: number) => {
      const ordered = l.nodeName === 'OL';
      let n = parseInt(l.getAttribute('start') ?? '', 10);
      if (!Number.isFinite(n)) n = 1;
      for (const c of [...l.children]) {
        if (isList(c)) { walk(c, depth + 1); continue; }
        if (c.nodeName !== 'LI') continue;
        const nested = [...c.children].filter(isList);
        nested.forEach(x => x.remove());
        const v = parseInt(c.getAttribute('value') ?? '', 10), lv = parseInt(c.getAttribute('aria-level') ?? '', 10);
        if (Number.isFinite(v)) n = v;
        const alpha = /^a$/i.test(l.getAttribute('type') ?? '') || /(lower|upper)-(alpha|latin)/i.test((l.getAttribute('style') ?? '') + (c.getAttribute('style') ?? ''));
        items.push({ ordered, kind: alpha ? 'a' : '1', delim: alpha ? ')' : '.', num: n++, depth: lv > 0 ? lv - 1 : depth, content: [...c.childNodes] });
        nested.forEach(x => walk(x as HTMLElement, depth + 1));
      }
    };
    walk(list, 0);
    list.replaceWith(...buildLists(doc, items));
  }
}

// Markup has no line break inside a line: a <br> starts a new line (a new paragraph, heading or list item).
function splitAtBreaks(doc: Document, body: HTMLElement): void {
  for (const br of [...body.querySelectorAll('br')]) {
    if (!br.isConnected) continue;
    if (br.classList.contains('Apple-interchange-newline')) { br.remove(); continue; }
    let block: Element | null = br.parentElement;
    while (block && block !== body && !LINE.has(block.nodeName)) block = block.parentElement;
    if (block?.nodeName === 'P' && block.parentElement?.nodeName === 'LI') block = block.parentElement;
    if (!block || block === body) {
      // inline content straight in the page: gather its run of inline siblings into a paragraph first
      let top: Node = br;
      while (top.parentNode && top.parentNode !== body && !isBlock(top.parentNode)) top = top.parentNode;
      let a: Node = top, b: Node = top;
      while (a.previousSibling && !isBlock(a.previousSibling)) a = a.previousSibling;
      while (b.nextSibling && !isBlock(b.nextSibling)) b = b.nextSibling;
      if (a === br && b === br) { br.replaceWith(doc.createElement('p')); continue; } // between blocks: a blank line
      const r = doc.createRange();
      r.setStartBefore(a); r.setEndAfter(b);
      const p = doc.createElement('p');
      p.append(r.extractContents());
      r.insertNode(p);
      block = p;
    }
    const r = doc.createRange();
    r.setStartAfter(br); r.setEnd(block, block.childNodes.length);
    if (!r.toString().replace(/ /g, ' ').trim() && !r.cloneContents().querySelector('br')) { br.remove(); continue; } // nothing after it on its line
    const tail = r.extractContents();
    br.remove();
    const twin = block.cloneNode(false) as Element;
    twin.append(tail);
    block.after(twin);
  }
}

/** Pasted HTML, cleaned so it carries only the formatting it shows (wired as `editorProps.transformPastedHTML`). */
export function cleanPastedHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html'), body = doc.body;
  wordLists(doc, body); // reads mso-list from the style attribute, before the styles are rewritten
  cleanStyles(body);
  flattenLists(doc, body);
  splitAtBreaks(doc, body);
  return body.innerHTML;
}
