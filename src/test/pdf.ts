// A strict PDF reader, for tests. It follows a file the way a PDF reader does: from `startxref` to
// the xref table, from the table to each object, and from the trailer's /Root to the pages. Each
// stream is read by its /Length, so a wrong length shows. Anything it can't follow throws.

/** Keys that would carry document information or XMP. None may appear outside a stream. */
export const PDF_METADATA_KEYS = ['/Info', '/Producer', '/Creator', '/Author', '/Title', '/Subject', '/Keywords', '/CreationDate', '/ModDate', '/Metadata'];

export interface PdfRead {
  version: string; binaryLine: boolean; xrefOk: boolean;
  trailer: string; trailerKeys: string[]; id: [string, string] | null;
  outside: string; // the whole file as latin1 with every stream's bytes taken out
  pageCount: number; // /Count of the root /Pages
  pages: { mediaBox: number[]; content: string; image: { width: number; height: number; dict: string; bytes: Uint8Array } }[]; // in /Kids order
}

class Name { constructor(readonly name: string) {} } // with its slash, e.g. '/Type'
class Hex { constructor(readonly hex: string) {} } // the digits as written
class Str { constructor(readonly str: string) {} }
class Ref { constructor(readonly num: number, readonly gen: number) {} }
class Dict {
  constructor(readonly entries: [string, Value][], readonly text: string) {}
  get(key: string): Value | undefined { return this.entries.find(([k]) => k === key)?.[1]; }
}
type Value = number | boolean | null | Name | Hex | Str | Ref | Dict | Value[];

const fail = (why: string): never => { throw new Error(`readPdf: ${why}`); };
const WHITE = '\0\t\n\f\r ', DELIMS = '()<>[]{}/%';
const isRegular = (c: string | undefined) => c !== undefined && !WHITE.includes(c) && !DELIMS.includes(c);

/** Skips white space and comments. */
function skip(s: string, p: number): number {
  for (;;) {
    while (p < s.length && WHITE.includes(s[p])) p++;
    if (s[p] !== '%') return p;
    while (p < s.length && s[p] !== '\n' && s[p] !== '\r') p++;
  }
}

/** Parses one object at `p`, giving it and where it ends. */
function parse(s: string, p: number): [Value, number] {
  p = skip(s, p);
  if (s.startsWith('<<', p)) {
    const start = p, entries: [string, Value][] = [];
    p += 2;
    for (;;) {
      p = skip(s, p);
      if (s.startsWith('>>', p)) { p += 2; break; }
      if (s[p] !== '/') fail(`a dictionary key at ${p} is not a name`);
      const [key, q] = parse(s, p), [value, r] = parse(s, q);
      entries.push([(key as Name).name, value]);
      p = r;
    }
    return [new Dict(entries, s.slice(start, p)), p];
  }
  const c = s[p];
  if (c === '<') {
    const e = s.indexOf('>', p);
    if (e < 0) fail(`a hex string at ${p} doesn't end`);
    const digits = s.slice(p + 1, e).replace(/[\0\t\n\f\r ]/g, '');
    if (!/^[0-9A-Fa-f]*$/.test(digits)) fail(`a hex string at ${p} holds more than hex digits`);
    return [new Hex(digits), e + 1];
  }
  if (c === '[') {
    const items: Value[] = [];
    p++;
    for (;;) {
      p = skip(s, p);
      if (p >= s.length) fail('an array doesn\'t end');
      if (s[p] === ']') return [items, p + 1];
      const [item, q] = parse(s, p);
      items.push(item);
      p = q;
    }
  }
  if (c === '(') {
    let depth = 0, out = '';
    for (let q = p; q < s.length; q++) {
      const ch = s[q];
      if (ch === '\\') { out += s[++q]; continue; }
      if (ch === '(') { if (depth++ > 0) out += ch; continue; }
      if (ch === ')') { if (--depth === 0) return [new Str(out), q + 1]; out += ch; continue; }
      out += ch;
    }
    fail(`a string at ${p} doesn't end`);
  }
  if (c === '/') {
    let e = p + 1;
    while (isRegular(s[e])) e++;
    return [new Name(s.slice(p, e)), e];
  }
  const num = /[+-]?(?:\d+\.?\d*|\.\d+)/y;
  num.lastIndex = p;
  const m = num.exec(s);
  if (m && !isRegular(s[p + m[0].length])) {
    const end = p + m[0].length, n = Number(m[0]);
    const ref = /[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]+R/y;
    ref.lastIndex = end;
    const r = /^\d+$/.test(m[0]) ? ref.exec(s) : null;
    if (r && !isRegular(s[ref.lastIndex])) return [new Ref(n, Number(r[1])), ref.lastIndex];
    return [n, end];
  }
  for (const [word, value] of [['true', true], ['false', false], ['null', null]] as const)
    if (s.startsWith(word, p) && !isRegular(s[p + word.length])) return [value, p + word.length];
  return fail(`no object at ${p} (${JSON.stringify(s.slice(p, p + 12))})`);
}

interface PdfObject { value: Value; stream: Uint8Array | null; span: [number, number] | null }

export function readPdf(bytes: Uint8Array): PdfRead {
  const s = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

  const head = /^%PDF-(\d\.\d)(\r\n|\n|\r)/.exec(s) ?? fail('no %PDF- header');
  const version = head[1];
  const binaryLine = /^%[\x80-\xff]{4,}(\r\n|\n|\r)/.test(s.slice(head[0].length));

  // startxref, at the very end.
  const sx = s.lastIndexOf('startxref');
  if (sx < 0) fail('no startxref');
  const tail = /^startxref(?:\r\n|\n|\r)(\d+)(?:\r\n|\n|\r)%%EOF(?:\r\n|\n|\r)?$/.exec(s.slice(sx)) ?? fail('the file doesn\'t end with startxref, its offset and %%EOF');
  const xrefAt = Number(tail[1]);

  // The xref table: one or more subsections of 20-byte entries.
  const eol = /\r\n|\n|\r/y;
  eol.lastIndex = xrefAt + 4;
  if (!s.startsWith('xref', xrefAt) || !eol.exec(s)) fail(`startxref ${xrefAt} doesn't point at an xref table`);
  const table = new Map<number, { offset: number; gen: number; used: boolean }>();
  let p = eol.lastIndex;
  for (const sub = /(\d+) (\d+)(?:\r\n|\n|\r)/y; ; ) {
    sub.lastIndex = p;
    const m = sub.exec(s);
    if (!m) break;
    p = sub.lastIndex;
    for (let k = 0; k < Number(m[2]); k++, p += 20) {
      const e = /^(\d{10}) (\d{5}) ([nf])(?: \r| \n|\r\n)$/.exec(s.slice(p, p + 20)) ?? fail(`xref entry ${Number(m[1]) + k} isn't 20 bytes of offset, generation and n or f`);
      table.set(Number(m[1]) + k, { offset: Number(e[1]), gen: Number(e[2]), used: e[3] === 'n' });
    }
  }
  p = skip(s, p);
  if (!s.startsWith('trailer', p)) fail('no trailer after the xref table');
  const [trailerValue, trailerEnd] = parse(s, p + 7);
  if (!(trailerValue instanceof Dict)) return fail('the trailer is not a dictionary');
  if (skip(s, trailerEnd) !== sx) fail('something comes between the trailer and startxref');
  const trailer = trailerValue;

  // Each object, where the xref says it is.
  let xrefOk = table.get(0)?.gen === 65535 && table.get(0)?.used === false && table.get(0)?.offset === 0 && trailer.get('/Size') === table.size;
  const objects = new Map<number, PdfObject>();
  const spans: [number, number][] = [];
  const at = (n: number, offset: number): number | null => {
    const h = new RegExp(`${n} 0 obj(?=[\\0\\t\\n\\f\\r /<\\[(])`, 'y');
    h.lastIndex = offset;
    return h.exec(s) ? h.lastIndex : null;
  };
  const lengthOf = (v: Value | undefined): number => {
    if (v instanceof Ref) return lengthOf(load(v.num).value);
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fail('a stream has no /Length');
  };
  const load = (n: number): PdfObject => {
    const known = objects.get(n);
    if (known) return known;
    const entry = table.get(n);
    if (!entry?.used) return fail(`object ${n} isn't in the xref table`);
    let q = at(n, entry.offset);
    if (q === null) {
      // A reader would go looking for it; so do we, so the rest can be checked, but the xref is wrong.
      xrefOk = false;
      const found = new RegExp(`(?:^|[\\r\\n])${n} 0 obj(?=[\\0\\t\\n\\f\\r /<\\[(])`).exec(s) ?? fail(`object ${n} is nowhere in the file`);
      q = found.index + found[0].length;
    }
    const [value, r] = parse(s, q);
    let stream: Uint8Array | null = null, span: [number, number] | null = null;
    q = skip(s, r);
    if (s.startsWith('stream', q) && !isRegular(s[q + 6])) {
      if (!(value instanceof Dict)) fail(`object ${n}'s stream has no dictionary`);
      const start = s.startsWith('\r\n', q + 6) ? q + 8 : s[q + 6] === '\n' ? q + 7 : fail(`object ${n}'s stream keyword isn't followed by an end of line`);
      const stop = start + lengthOf((value as Dict).get('/Length'));
      eol.lastIndex = stop;
      const close = eol.exec(s) ? eol.lastIndex : stop;
      if (!s.startsWith('endstream', close)) fail(`object ${n}'s stream doesn't end after its /Length`);
      stream = bytes.slice(start, stop);
      span = [start, stop];
      q = skip(s, close + 9);
    }
    if (!s.startsWith('endobj', q)) fail(`object ${n} doesn't end with endobj`);
    const obj = { value, stream, span };
    objects.set(n, obj);
    if (span) spans.push(span);
    return obj;
  };
  for (const [n, entry] of table) if (entry.used) load(n);

  const resolve = (v: Value | undefined): Value | undefined => (v instanceof Ref ? load(v.num).value : v);
  const dict = (v: Value | undefined, what: string): Dict => {
    const d = resolve(v);
    return d instanceof Dict ? d : fail(`${what} is not a dictionary`);
  };
  const numbers = (v: Value | undefined, what: string): number[] => {
    const a = resolve(v);
    return Array.isArray(a) && a.every(x => typeof resolve(x) === 'number') ? a.map(x => resolve(x) as number) : fail(`${what} is not an array of numbers`);
  };
  const streamOf = (v: Value | undefined, what: string): { dict: Dict; bytes: Uint8Array } => {
    if (!(v instanceof Ref)) return fail(`${what} is not a reference to a stream`);
    const o = load(v.num);
    return o.stream && o.value instanceof Dict ? { dict: o.value, bytes: o.stream } : fail(`${what} is not a stream`);
  };
  const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

  // The page tree, from the trailer's /Root.
  const root = dict(trailer.get('/Root'), 'the /Root');
  const tree = dict(root.get('/Pages'), 'the root /Pages');
  const pageCount = resolve(tree.get('/Count'));
  if (typeof pageCount !== 'number') fail('the root /Pages has no /Count');
  const leaves: Dict[] = [];
  const walk = (node: Dict) => {
    const kids = resolve(node.get('/Kids'));
    if (!Array.isArray(kids)) fail('a /Pages node has no /Kids');
    for (const kid of kids as Value[]) {
      const d = dict(kid, 'a page');
      const type = resolve(d.get('/Type'));
      if (type instanceof Name && type.name === '/Pages') walk(d); else leaves.push(d);
    }
  };
  walk(tree);
  const pages = leaves.map((page, k) => {
    const what = `page ${k + 1}`;
    const contents = page.get('/Contents');
    const content = (Array.isArray(contents) ? contents : [contents]).map(c => latin1(streamOf(c, `${what}'s /Contents`).bytes)).join('\n');
    const xobjects = dict(dict(page.get('/Resources'), `${what}'s /Resources`).get('/XObject'), `${what}'s /XObject`);
    if (!xobjects.entries.length) fail(`${what} has no XObject`);
    const image = streamOf(xobjects.entries[0][1], `${what}'s image`);
    const size = (key: string) => {
      const v = resolve(image.dict.get(key));
      return typeof v === 'number' ? v : fail(`${what}'s image has no ${key}`);
    };
    return { mediaBox: numbers(page.get('/MediaBox'), `${what}'s /MediaBox`), content, image: { width: size('/Width'), height: size('/Height'), dict: image.dict.text, bytes: image.bytes } };
  });

  const ids = resolve(trailer.get('/ID'));
  const id: [string, string] | null = Array.isArray(ids) && ids.length === 2 && ids[0] instanceof Hex && ids[1] instanceof Hex ? [ids[0].hex, ids[1].hex] : null;

  spans.sort((a, b) => a[0] - b[0]);
  let outside = '', from = 0;
  for (const [a, b] of spans) { outside += s.slice(from, a); from = b; }
  outside += s.slice(from);

  return {
    version, binaryLine, xrefOk, trailer: trailer.text, trailerKeys: trailer.entries.map(([k]) => k), id,
    outside, pageCount: pageCount as number, pages,
  };
}
