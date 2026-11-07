// The editor's document model: exactly what engine markup can say, one leaf block per markup line.
import { getSchema, mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Highlight } from '@tiptap/extension-highlight';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';
import { isBlankBackground } from './paste';

const clampIndent = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(3, Math.trunc(n))) : 0);

// A list item holds one paragraph; nesting is a flat indent (0–3), as in markup.
const NibListItem = ListItem.extend({
  content: 'paragraph',
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: {
        default: 0,
        parseHTML: el => clampIndent(parseInt(el.getAttribute('data-indent') ?? '0', 10)),
        renderHTML: attrs => ({ 'data-indent': String(attrs.indent ?? 0) }),
      },
    };
  },
});

// Numbers or letters, closed with '.' or ')': `1.`, `1)`, `a)`.
const NibOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      start: {
        default: 1,
        parseHTML: el => { const n = parseInt(el.getAttribute('start') ?? '', 10); return Number.isFinite(n) ? n : 1; },
      },
      kind: {
        default: '1',
        parseHTML: el => {
          const k = el.getAttribute('data-kind');
          if (k === '1' || k === 'a') return k;
          return el.getAttribute('type') === 'a' || /lower-(alpha|latin)/i.test(el.getAttribute('style') ?? '') ? 'a' : '1';
        },
        renderHTML: attrs => ({ 'data-kind': attrs.kind }),
      },
      delim: {
        default: '.',
        parseHTML: el => (el.getAttribute('data-delim') === ')' ? ')' : '.'),
        renderHTML: attrs => ({ 'data-delim': attrs.delim }),
      },
    };
  },
});

// A note (quote) holds paragraphs only.
const NibBlockquote = Blockquote.extend({ content: 'paragraph+' });

// Highlight also comes from pasted backgrounds (Google Docs, Word): any but transparent, none or near white,
// by the same rule pasting cleans with.
const NibHighlight = Highlight.extend({
  parseHTML() {
    const colour = (v: string) => (isBlankBackground(v) ? false : null);
    return [
      ...(this.parent?.() ?? []),
      { style: 'background-color', getAttrs: colour },
      { style: 'background', getAttrs: colour },
      { style: 'mso-highlight', getAttrs: (v: string) => (v.trim() && !/^(none|auto)$/i.test(v.trim()) ? null : false) },
    ];
  },
});

// `\newpage`: the next line starts on a new page.
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '' })]; },
});

export const BLOCK_EXTENSIONS: AnyExtension[] = [
  StarterKit.configure({
    italic: false, code: false, codeBlock: false, link: false, hardBreak: false, undoRedo: false, trailingNode: false,
    listItem: false, orderedList: false, blockquote: false,
    heading: { levels: [1, 2, 3] },
  }),
  NibListItem,
  NibOrderedList,
  NibBlockquote,
  NibHighlight,
  PageBreak,
];

export const nibSchema = getSchema(BLOCK_EXTENSIONS);
