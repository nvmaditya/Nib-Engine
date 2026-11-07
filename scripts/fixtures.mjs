// Test files made in code, for the importer's tests and the smoke run (Node only; never imported by app code).
// A ZIP the way Word writes one (deflated entries, dated 1980-01-01), a .docx on top of it, and a small text PDF.
import { crc32, deflateRawSync } from 'node:zlib';

const enc = new TextEncoder();
const bytesOf = d => (typeof d === 'string' ? enc.encode(d) : d);

export function zipOf(files) {
  const chunks = [], central = [];
  let offset = 0;
  const u16 = n => Uint8Array.of(n & 255, (n >>> 8) & 255);
  const u32 = n => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
  const cat = parts => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
  const DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  for (const f of files) {
    const name = enc.encode(f.name), raw = bytesOf(f.data), packed = deflateRawSync(raw), crc = crc32(raw);
    const common = [u16(20), u16(0), u16(8), u16(0), u16(DATE), u32(crc), u32(packed.length), u32(raw.length), u16(name.length), u16(0)];
    const local = cat([u32(0x04034b50), ...common, name, packed]);
    central.push(cat([u32(0x02014b50), u16(20), ...common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    chunks.push(local); offset += local.length;
  }
  const cd = cat(central);
  return cat([...chunks, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const w = {
  p: (runs, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.num}"/></w:numPr>` : ''}</w:pPr>${runs}</w:p>`,
  r: (text, o = {}) => `<w:r>${o.b || o.u || o.s ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.s ? '<w:strike/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`,
  pageBreak: '<w:r><w:br w:type="page"/></w:r>',
};

const style = (id, name, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}</w:style>`;
const level = (fmt, text) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/></w:lvl>`;

export function docxOf(bodyXml) {
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const R = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return zipOf([
    { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>` },
    { name: '_rels/.rels', data: `${XML}<Relationships ${R}>${rel('rId1', 'officeDocument', 'word/document.xml')}</Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `${XML}<Relationships ${R}>${rel('rId1', 'styles', 'styles.xml')}${rel('rId2', 'numbering', 'numbering.xml')}</Relationships>` },
    { name: 'word/document.xml', data: `${XML}<w:document ${NS}><w:body>${bodyXml}</w:body></w:document>` },
    { name: 'word/styles.xml', data: `${XML}<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${style('Title', 'Title')}${style('Heading1', 'heading 1')}${style('Heading2', 'heading 2')}${style('ListParagraph', 'List Paragraph')}${style('Quote', 'Quote')}</w:styles>` },
    { name: 'word/numbering.xml', data: `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0">${level('bullet', '•')}</w:abstractNum><w:abstractNum w:abstractNumId="1">${level('decimal', '%1.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>` },
  ]);
}

export function essayDocx(o = {}) {
  const li = (t, num) => w.p(w.r(t), { style: 'ListParagraph', num });
  return docxOf([
    w.p(w.r('A Short Essay'), { style: 'Title' }),
    w.p(w.r('Introduction'), { style: 'Heading1' }),
    w.p(w.r('Water moves between ') + w.r('rivers', { b: true }) + w.r(', ') + w.r('seas', { u: true }) + w.r(' and ') + w.r('lakes', { s: true }) + w.r(' all the time.')),
    li('Evaporation', 1), li('Condensation', 1), li('First', 2), li('Second', 2),
    o.breakInParagraph ? w.p(w.r('Conclusion'), { style: 'Heading1' }) : w.p(w.pageBreak + w.r('Conclusion'), { style: 'Heading1' }),
    o.breakInParagraph ? w.p(w.r('That is the') + w.pageBreak + w.r('water cycle.')) : w.p(w.r('That is the water cycle.')),
  ].join(''));
}

// pages: lines of [size, y, text]; Helvetica is a standard font, so nothing is embedded.
export function textPdf(pages) {
  const pdfStr = s => s.replace(/[\\()]/g, '\\$&');
  const objs = []; // 1-based object bodies
  const add = body => objs.push(body) && objs.length;
  const catalog = add(''), tree = add(''), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = pages.map(lines => {
    const content = lines.map(([size, y, text]) => `BT /F1 ${size} Tf 72 ${y} Td (${pdfStr(text)}) Tj ET`).join('\n');
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const at = [];
  objs.forEach((b, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

export const RIVERS_PAGES = [[[24, 760, 'Rivers and seas'], [12, 720, 'Water moves between rivers and seas all the time,'], [12, 705, 'and it rises into the air as vapour.']], [[12, 760, 'That is the water cycle.']]];
