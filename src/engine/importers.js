// Bringing documents in: PDF, Word (.docx) and text files become Nib's own simple markup
// (# headings, - lists, **bold**, *underline*, ~~crossed out~~). The readers load only when used.
import { cleanName } from './core.js';

async function pdfLib() {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
  const pdfjs = lib.default && lib.default.getDocument ? lib.default : lib;
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
async function docxLib() {
  const m = await import('mammoth/mammoth.browser.min.js');
  return m.default || m;
}

// PDF: rebuild lines from positioned text, then paragraphs, headings and lists from the gaps and sizes.
async function readPdf(buf) {
  const lib = await pdfLib();
  const pdf = await lib.getDocument({ data:new Uint8Array(buf), isEvalSupported:false, disableFontFace:true, useSystemFonts:false }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n);
    const tc = await pg.getTextContent();
    pages.push(pdfLines(tc.items));
    pg.cleanup();
  }
  const all = pages.flat();
  if (all.reduce((a, l) => a + l.text.length, 0) < 15) throw Object.assign(new Error('scan'), { code:'scan' });
  // Body size: the size most of the text is set in.
  const bySize = new Map(); for (const l of all) { const k = Math.round(l.size * 2) / 2; bySize.set(k, (bySize.get(k) || 0) + l.text.length); }
  const body = [...bySize].sort((a, b) => b[1] - a[1])[0][0];
  const left = Math.min(...all.map(l => l.x));
  return { parts:pages.map(lines => pdfParagraphs(lines, body, left)), pages:pdf.numPages };
}
function pdfLines(items) {
  const its = items.filter(i => i.str && i.str.trim() || i.hasEOL).map(i => ({ s:i.str, x:i.transform[4], y:i.transform[5], w:i.width, size:Math.hypot(i.transform[2], i.transform[3]) || i.height || 10 }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of its) {
    if (!it.s.trim()) continue;
    let ln = lines.find(l => Math.abs(l.y - it.y) < Math.max(l.size, it.size) * 0.45);
    if (!ln) { ln = { y:it.y, size:it.size, parts:[] }; lines.push(ln); }
    ln.parts.push(it); ln.size = Math.max(ln.size, it.size);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => {
    l.parts.sort((a, b) => a.x - b.x);
    let t = '', end = null;
    for (const p of l.parts) {
      if (end !== null && p.x - end > l.size * 0.12 && !/\s$/.test(t) && !/^\s/.test(p.s)) t += ' ';
      t += p.s; end = p.x + p.w;
    }
    return { text:t.replace(/\s+/g, ' ').trim(), x:l.parts[0].x, r:end, y:l.y, size:l.size };
  }).filter(l => l.text && !/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text)); // page numbers
}
function pdfParagraphs(lines, body, left) {
  const out = []; let para = null, prev = null;
  const gaps = []; for (let i = 1; i < lines.length; i++) { const d = lines[i - 1].y - lines[i].y; if (d > 0 && Math.abs(lines[i].size - body) < 1) gaps.push(d); }
  gaps.sort((a, b) => a - b);
  const lead = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.3;
  const maxR = Math.max(...lines.map(l => l.r || 0));
  const ind = l => l && l.x - left > body * 1.0 && Math.abs(l.size - body) < 1.5;
  const sameCol = (a, b) => ind(a) && ind(b) && Math.abs(a.x - b.x) < body * 0.6;
  const isItem = t => /^(- |\d{1,3}[.)] |[a-z][.)] )/.test(t);
  const flush = () => { if (para !== null) out.push(para); para = null; };
  lines.forEach((l, i) => {
    const t = l.text, gap = prev ? prev.y - l.y : 0;
    const bullet = t.match(/^[•●▪◦‣∙·○■□➢➤►–—\-*]\s*(.+)$/);
    const num = t.match(/^(\d{1,3}[.)]|[a-z][.)])\s+(.+)$/);
    const last = () => out[out.length - 1] || '';
    // a line that wraps a list item (indented, right after a line that ran to the margin) joins it
    const continues = prev && para === null && isItem(last()) && gap <= lead * 1.25 && ind(l) && (prev.r || 0) >= maxR - body * 3 && !bullet && !num;
    if (l.size >= body * 1.55) { flush(); if (out.length) out.push(''); out.push('# ' + t); }
    else if (l.size >= body * 1.18) { flush(); if (out.length) out.push(''); out.push('## ' + t); }
    else if (continues) out[out.length - 1] += ' ' + t;
    else if (bullet) { flush(); out.push('- ' + bullet[1]); }
    else if (num) { flush(); out.push(num[1] + ' ' + num[2]); }
    // indented lines in a column with their neighbours: a list whose bullets were drawn as shapes
    else if (sameCol(l, lines[i + 1]) || sameCol(l, prev)) { flush(); out.push('- ' + t); }
    else {
      const newPara = para === null || gap > lead * 1.45 || (l.x - left > body * 1.2 && /[.!?:"”]$/.test(prev ? prev.text : ''));
      if (newPara) { flush(); if (gap > lead * 1.45 && out.length && out[out.length - 1] !== '') out.push(''); para = t; }
      else para = /[A-Za-z]-$/.test(para) ? para.slice(0, -1) + t : para + ' ' + t; // re-join words split at line ends
    }
    prev = l;
  });
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Word: mammoth turns .docx into simple HTML, which is walked into Nib's own markup.
async function readDocx(buf) {
  const m = await docxLib();
  const r = await m.convertToHtml({ arrayBuffer:buf }, { styleMap:['u => u', 'strike => s', "p[style-name='Title'] => h1.title:fresh", "p[style-name='Subtitle'] => h2:fresh", "br[type='page'] => br.nib-page"], convertImage:m.images.imgElement(() => ({ src:'' })) });
  const dom = new DOMParser().parseFromString(r.value, 'text/html');
  // A page break starts a new part; each part loses its leading and trailing blank lines, and empty parts go.
  const parts = htmlToMarks(dom.body).split(PAGE).map(p => p.replace(/^(\s*\n)+/, '').replace(/\s+$/, '')).filter(Boolean);
  return { parts, pages:0 };
}
const PAGE = '\uE000'; // marks a Word page break in htmlToMarks's text (not \f, which trim() removes)
function htmlToMarks(root) {
  const lines = [];
  let partStart = 0; // where the current part's lines begin, so a heading's blank line counts only this part
  // Writes text that may hold page marks: each piece is one line of kind `mk`, and a mark ends the line there.
  const emit = (mk, text, clean) => text.split(PAGE).forEach((piece, i) => { if (i) { lines.push(PAGE); partStart = lines.length; } const t = clean(piece); if (t) lines.push(mk + t); });
  const flat = x => x.replace(/\n+/g, ' ').trim();
  // One main title is written centred (#); if the file has a Title or several top headings, they become ## sections.
  const shift = root.querySelector('h1.title') || root.querySelectorAll('h1').length > 1 ? 1 : 0;
  const inline = el => {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { t += n.nodeValue.replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { t += n.classList.contains('nib-page') ? '\n' + PAGE + '\n' : '\n'; continue; }
      if (tag === 'ul' || tag === 'ol' || tag === 'img') continue;
      const inner = inline(n);
      const wrapIn = mk => { const m2 = inner.match(/^(\s*)([\s\S]*?)(\s*)$/); return m2[2] ? m2[1] + mk + m2[2] + mk + m2[3] : inner; };
      if (tag === 'strong' || tag === 'b') t += wrapIn('**');
      else if (tag === 'u') t += wrapIn('*');
      else if (tag === 's' || tag === 'del' || tag === 'strike') t += wrapIn('~~');
      else t += inner;
    }
    return t;
  };
  const list = (el, depth) => {
    let i = 1;
    for (const li of el.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const mark = el.tagName.toLowerCase() === 'ol' ? `${i++}. ` : '- ';
      emit('  '.repeat(depth) + mark, inline(li), flat);
      for (const sub of li.children) if (/^(ul|ol)$/i.test(sub.tagName)) list(sub, depth + 1);
    }
  };
  const block = el => {
    for (const n of el.children) {
      const tag = n.tagName.toLowerCase();
      const h = tag.match(/^h([1-6])$/);
      if (h) { const lv = n.classList.contains('title') ? 1 : Math.min(3, +h[1] + shift); const mk = '#'.repeat(lv) + ' ', t = inline(n).replace(/\*\*/g, ''); if (lines.length > partStart && flat(t.split(PAGE)[0])) lines.push(''); emit(mk, t, flat); }
      else if (tag === 'p') { const t = inline(n).trim(); if (t) for (const x of t.split('\n').map(x => x.trim())) { lines.push(x); if (x === PAGE) partStart = lines.length; } }
      else if (tag === 'ul' || tag === 'ol') list(n, 0);
      else if (tag === 'blockquote') emit('> ', inline(n), flat);
      else if (tag === 'table') { for (const tr of n.querySelectorAll('tr')) { const cells = [...tr.children].map(c => inline(c).trim()).filter(Boolean); if (cells.length) emit('', cells.join(' | '), x => flat(x).replace(/^\|\s*|\s*\|$/g, '').trim()); } }
      else block(n);
    }
  };
  block(root);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}


const fail = code => Object.assign(new Error(code), { code });
// Read any supported file. Resolves { parts, pages, name, words }; parts are pages of text where the file has them.
// A refusal rejects with an Error whose `code` is an ImportCode (see importers.d.ts); importError(code) is its message.
export async function readDocument(file) {
  const name = file.name || 'file', ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  if (file.size > 40 * 1024 * 1024) throw fail('big');
  // The extension decides first, then the MIME type. Pictures and rich text come before text, so `text/rtf` is never read as text.
  const type = file.type || '';
  const kind = ext === 'pdf' || type === 'application/pdf' ? 'pdf'
    : ext === 'docx' || /wordprocessingml/.test(type) ? 'docx'
    : ext === 'doc' || type === 'application/msword' ? 'doc'
    : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg'].includes(ext) || /^image\//.test(type) ? 'image'
    : ext === 'rtf' || /rtf/.test(type) ? 'rtf'
    : ext === 'odt' || /opendocument\.text/.test(type) ? 'odt'
    : ['txt', 'md', 'markdown', 'text'].includes(ext) || (!ext && /^text\/(plain|markdown)$/.test(type)) ? 'text' : 'other';
  if (kind === 'other') throw fail('type');
  if (kind !== 'pdf' && kind !== 'docx' && kind !== 'text') throw fail(kind);
  let res;
  if (kind === 'text') {
    const t = (await file.text()).replace(/\r\n?/g, '\n');
    res = { parts:t.split('\f'), pages:t.includes('\f') ? t.split('\f').length : 0 };
  } else {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (kind === 'docx' && head.length === 4 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) throw fail('locked'); // an old Word file, or one with a password
    try { res = kind === 'pdf' ? await readPdf(buf) : await readDocx(buf); }
    catch (e) { if (e && e.name === 'PasswordException') throw fail('password'); if (e && typeof e.code === 'string') throw e; throw fail(/Failed to fetch|import/i.test(String(e && e.message)) ? 'lib' : 'read'); }
  }
  // Words are tokens with a letter or digit in them; a line's list or heading marker doesn't count.
  res.words = res.parts.join('\n').split('\n').reduce((n, ln) => n + ln.replace(/^\s*(#{1,3}\s|-\s|>\s|\d{1,3}[.)]\s|[a-z][.)]\s)/i, '').split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t)).length, 0);
  if (!res.words) throw fail('empty');
  res.name = cleanName(name.replace(/\.[a-z0-9]+$/i, ''));
  return res;
}
export const importError = code => ({
  scan:'This PDF has no text Nib can copy. If it’s a scan or a photo of pages, try the original document instead.',
  locked:'Nib can’t open that Word file. If it has a password, save a copy without one; if it’s an old .doc, save it as .docx.',
  rtf:'Rich text files (.rtf) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.',
  odt:'OpenDocument files (.odt) can’t be read here. Open it in LibreOffice, Word or Google Docs and save it as .docx or PDF first.',
  image:'That’s a picture. Nib can’t read the words in a picture: import a PDF, Word (.docx) or text file instead.',
  doc:'Old Word files (.doc) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.',
  type:'Nib can read PDF, Word (.docx) and text files.',
  empty:'There’s no text in that file.',
  big:'That file is over 40 MB. Try a smaller one.',
  password:'That PDF is password-protected. Save a copy without the password and try again.',
  lib:'The document reader couldn’t be loaded. Check your connection and try again.',
}[code] || 'That file couldn’t be read. It may be damaged; try saving it again or as a PDF.');
