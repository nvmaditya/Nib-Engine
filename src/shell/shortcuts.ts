// Every keyboard shortcut in Nib, by where it works, as the shortcut sheet shows them. Each one is the app's own:
// useAppShortcuts (the palette and this sheet), useUndoShortcuts, DocumentView's Escape, a block's frame on a page
// (BoxFrame, drag.ts's nudge and Escape, TypedPage's grip), the editor's extensions (AppHistory, BlockKeys, Slash)
// and TipTap's own keys and typing rules for the extensions in schema.ts.

export interface ShortcutRow {
  what: string;
  /** Each alternative is a chord (`['Mod', 'Shift', 'Z']`, `Mod` being Ctrl, or ⌘ on Apple). */
  keys?: string[][];
  /** What is typed instead: a character, or marks around words. */
  typed?: string;
  /** The one stage it works in (a block on Style's pages can be moved, but not written in or deleted). */
  only?: 'Write';
  /** `notApple[k]` hides alternative `k` on Apple keyboards. */
  notApple?: boolean[];
}

export interface ShortcutGroup { title: string; note?: string; rows: ShortcutRow[] }

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      { what: 'Search commands and documents', keys: [['Mod', 'K']] },
      { what: 'Keyboard shortcuts', keys: [['?'], ['Mod', '/']] },
      { what: 'Close a dialog or menu', keys: [['Escape']] },
    ],
  },
  {
    title: 'In a document',
    rows: [
      { what: 'Undo', keys: [['Mod', 'Z']] },
      // Outside an editor Ctrl+Y is the Control key on Apple keyboards too, so it isn't listed there.
      { what: 'Redo', keys: [['Mod', 'Shift', 'Z'], ['Ctrl', 'Y']], notApple: [false, true] },
      { what: 'Leave the selected block', keys: [['Escape']] },
    ],
  },
  {
    title: 'A block on a handwritten page',
    note: 'Tab to a block, or click it.',
    rows: [
      { what: 'Move it a ruled line up or down', keys: [['ArrowUp'], ['ArrowDown']] },
      { what: 'Move it a little left or right', keys: [['ArrowLeft'], ['ArrowRight']] },
      { what: 'Write in it', keys: [['Enter']], only: 'Write' },
      { what: 'Delete it, or only this page’s part', keys: [['Delete'], ['Backspace']], only: 'Write' },
      { what: 'Cancel moving it', keys: [['Escape']] },
    ],
  },
  {
    title: 'In the text',
    rows: [
      { what: 'Bold', keys: [['Mod', 'B']] },
      { what: 'Underline', keys: [['Mod', 'U']] },
      { what: 'Cross out', keys: [['Mod', 'Shift', 'S']] },
      { what: 'Highlight', keys: [['Mod', 'Shift', 'H']] },
      { what: 'Normal', keys: [['Mod', 'Alt', '0']] },
      { what: 'Title', keys: [['Mod', 'Alt', '1']] },
      { what: 'Heading', keys: [['Mod', 'Alt', '2']] },
      { what: 'Note', keys: [['Mod', 'Shift', 'B']] },
      { what: 'Bulleted list', keys: [['Mod', 'Shift', '8']] },
      { what: 'Numbered list', keys: [['Mod', 'Shift', '7']] },
      { what: 'Indent a list item, or take it back out', keys: [['Tab'], ['Shift', 'Tab']] },
      { what: 'Page break', keys: [['Mod', 'Enter']] },
      { what: 'Text styles, lists and a page break', typed: '/' },
    ],
  },
  {
    title: 'As you type',
    note: 'At the start of a line, then a space; marks around words.',
    rows: [
      { what: 'Title', typed: '# ' },
      { what: 'Heading', typed: '## ' },
      { what: 'Bulleted list', typed: '- ' },
      { what: 'Numbered list', typed: '1. ' },
      { what: 'Note', typed: '> ' },
      { what: 'Bold', typed: '**words**' },
      { what: 'Underline', typed: '*words*' },
      { what: 'Cross out', typed: '~~words~~' },
      { what: 'Highlight', typed: '==words==' },
    ],
  },
];
