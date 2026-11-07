import type { Mock } from 'vitest';
import pdfjs from 'pdfjs-dist';
import { readDocument, importError } from './importers.js';
import { RIVERS_PAGES, docxOf, essayDocx, w } from '../../scripts/fixtures.mjs';

// pdfjs-dist is mocked: `pdfFile(pages)` makes `getDocument` answer with those pages (items in pdf.js's shape).
// mammoth is the real browser build. The fetch stub records any request.
vi.mock('pdfjs-dist', () => ({ default: { GlobalWorkerOptions: {}, getDocument: vi.fn() } })); // the worker's `?url` import resolves to a URL under Vite and needs no mock
const lib = pdfjs as unknown as { getDocument: Mock };
const item = (size: number, y: number, str: string) => ({ str, transform: [size, 0, 0, size, 72, y], width: str.length * size * 0.5, height: size, hasEOL: false });
const pdfFile = (pages: [number, number, string][][]) => { vi.mocked(lib.getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: pages.length, getPage: async (n: number) => ({ getTextContent: async () => ({ items: pages[n - 1].map(l => item(...l)) }), cleanup() {} }) }) } as never); return new File([new Uint8Array(4)], 'Rivers.pdf', { type: 'application/pdf' }); };
const codeOf = (p: Promise<unknown>) => p.then(() => 'read ok', (e: { code?: string }) => e.code);
const ESSAY_1 = '# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.\n- Evaporation\n- Condensation\n1. First\n2. Second';
beforeEach(() => { lib.getDocument.mockReset(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

test('a Word file comes across with its title, headings, marks and lists, and its page break starts a new part', async () => {
  const r = await readDocument(new File([essayDocx()], 'Essay.docx'));
  expect(r).toEqual({ parts: [ESSAY_1, '## Conclusion\nThat is the water cycle.'], pages: 0, words: 24, name: 'Essay' });
});
test('a page break in the middle of a paragraph splits it between the parts', async () => {
  const r = await readDocument(new File([essayDocx({ breakInParagraph: true })], 'Essay.docx'));
  expect(r.parts).toEqual([ESSAY_1 + '\n\n## Conclusion\nThat is the', 'water cycle.']);
});
test('a PDF’s lines become a heading and a paragraph, one part per page', async () => {
  expect(await readDocument(pdfFile(RIVERS_PAGES))).toEqual({ parts: ['# Rivers and seas\nWater moves between rivers and seas all the time, and it rises into the air as vapour.', 'That is the water cycle.'], pages: 2, words: 25, name: 'Rivers' });
});
test('a PDF with no text in it says there is none to copy', async () => { expect(await codeOf(readDocument(pdfFile([[], []])))).toBe('scan'); expect(importError('scan')).toBe('This PDF has no text Nib can copy. If it’s a scan or a photo of pages, try the original document instead.'); });
test('a PDF that needs a password says so', async () => {
  vi.mocked(lib.getDocument).mockReturnValue({ promise: Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException', code: 1 })) } as never);
  expect(await codeOf(readDocument(new File([new Uint8Array(4)], 'Locked.pdf')))).toBe('password');
});
test('a text file is read as markup, and form feeds split its pages', async () => {
  expect(await readDocument(new File(['# Notes\r\n- a\f## Two\n- b'], 'notes.md', { type: 'text/markdown' }))).toEqual({ parts: ['# Notes\n- a', '## Two\n- b'], pages: 2, words: 4, name: 'notes' });
});
test.each([
  ['old.doc', '', 'doc'], ['letter.rtf', 'text/rtf', 'rtf'], ['notes.odt', '', 'odt'], ['IMG_0001.heic', '', 'image'], ['scan.png', 'image/png', 'image'],
  ['page.html', 'text/html', 'type'], ['deck.pages', '', 'type'], ['empty.txt', 'text/plain', 'empty'],
])('%s (%s) is refused with code %s', async (name, type, code) => expect(await codeOf(readDocument(new File([name === 'empty.txt' ? ' \n ' : 'x'], name, { type })))).toBe(code));
test('a Word file that is locked, or an old .doc renamed, says so', async () => expect(await codeOf(readDocument(new File([Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)], 'Essay.docx')))).toBe('locked'));
test('a Word file with no words in it says so', async () => expect(await codeOf(readDocument(new File([docxOf(w.p(w.pageBreak))], 'Blank.docx')))).toBe('empty'));
test('a file over 40 MB is refused before it is read', async () => { const f = new File(['x'], 'big.pdf'); Object.defineProperty(f, 'size', { value: 41 * 1024 * 1024 }); expect(await codeOf(readDocument(f))).toBe('big'); expect(lib.getDocument).not.toHaveBeenCalled(); });
test('every refusal has its own message', () => expect(['password', 'locked', 'doc', 'rtf', 'odt', 'image', 'type', 'empty', 'big', 'lib', 'read'].map(importError)).toEqual([
  'That PDF is password-protected. Save a copy without the password and try again.',
  'Nib can’t open that Word file. If it has a password, save a copy without one; if it’s an old .doc, save it as .docx.',
  'Old Word files (.doc) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.',
  'Rich text files (.rtf) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.',
  'OpenDocument files (.odt) can’t be read here. Open it in LibreOffice, Word or Google Docs and save it as .docx or PDF first.',
  'That’s a picture. Nib can’t read the words in a picture: import a PDF, Word (.docx) or text file instead.',
  'Nib can read PDF, Word (.docx) and text files.', 'There’s no text in that file.', 'That file is over 40 MB. Try a smaller one.',
  'The document reader couldn’t be loaded. Check your connection and try again.', 'That file couldn’t be read. It may be damaged; try saving it again or as a PDF.',
]));
test('reading a Word or text file asks the network for nothing', async () => { await readDocument(new File([essayDocx()], 'Essay.docx')); await readDocument(new File(['a'], 'a.txt')); expect(fetch).not.toHaveBeenCalled(); });

test.each([
  ['a 0-byte .docx', 'Blank.docx'], ['a 0-byte .pdf', 'Blank.pdf'], ['a 0-byte .txt', 'Blank.txt'],
])('%s says there is no text', async (_, name) => { expect(await codeOf(readDocument(new File([], name)))).toBe('empty'); expect(lib.getDocument).not.toHaveBeenCalled(); });
test.each([['application/msword', 'doc'], ['application/vnd.oasis.opendocument.text', 'odt']])('a file with no extension and type %s is refused with code %s', async (type, code) => expect(await codeOf(readDocument(new File(['x'], 'letter', { type })))).toBe(code));

const cell = (runs: string) => `<w:tc>${w.p(runs)}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;
const partsOf = async (body: string) => (await readDocument(new File([docxOf(body)], 'Doc.docx'))).parts;
test('a page break inside a heading ends the heading there, and the rest is a heading on the next page', async () => {
  expect(await partsOf(w.p(w.r('Intro text')) + w.p(w.r('Before') + w.pageBreak + w.r('After'), { style: 'Heading1' }) + w.p(w.r('Body')))).toEqual(['Intro text\n\n# Before', '# After\nBody']);
});
test('a page break inside a list item splits it, and the rest is a list item on the next page', async () => {
  expect(await partsOf(w.p(w.r('One'), { style: 'ListParagraph', num: 1 }) + w.p(w.r('Two') + w.pageBreak + w.r('three'), { style: 'ListParagraph', num: 1 }) + w.p(w.r('Four'), { style: 'ListParagraph', num: 1 }))).toEqual(['- One\n- Two', '- three\n- Four']);
});
test('a page break inside a quote splits it into a quote on each page', async () => {
  expect(await partsOf(w.p(w.r('Said') + w.pageBreak + w.r('more'), { style: 'Quote' }))).toEqual(['> Said', '> more']);
});
test('a page break inside a table row splits the row between the pages', async () => {
  expect(await partsOf(`<w:tbl>${row(cell(w.r('a')), cell(w.r('b')))}${row(cell(w.r('c')), cell(w.r('d') + w.pageBreak + w.r('e')))}</w:tbl>`)).toEqual(['a | b\nc | d', 'e']);
  expect(await partsOf(`<w:tbl>${row(cell(w.r('x')), cell(w.pageBreak + w.r('y')))}</w:tbl>`)).toEqual(['x', 'y']); // no dangling bar where the row was cut
});
