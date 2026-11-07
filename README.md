# Nib

Turn typed text into realistic handwritten pages, then download them as a PDF or images.

Nib was previously called Longhand.

Live site: https://nvmaditya.github.io/nib-engine/

Until the repository is renamed to `nib-engine`, the site is at https://nvmaditya.github.io/longhand/.

## What it does today

- **Home** lists your documents. They are saved on the device, in the browser's own storage.
- **Import** reads a PDF, Word (.docx) or text file; headings, lists, bold, underline and crossed-out words come across.
- **Write, Style and Export** are the three stages of a document. Write is for the text and where it sits on the pages, Style is for the hand, pen, ink and paper, and Export downloads the result.
- **Hands and pens**: 33 hands, or upload your own font (TTF, OTF, WOFF), which Nib remembers on the device. Fineliner, ballpoint, gel, felt tip and pencil, drawn at the pen's real line width.
- **Realism**: each letter bends a little differently, lines climb and sag, the pen presses harder on downstrokes, and the ink runs darker and lighter. Optional mistakes are crossed out and written again.
- **Paper**: ruled, spiral, yellow pad, grid, plain, or a photographed sheet, with room lighting, show-through and punch holes.
- **Blocks** (Text, Header and Margin note) can be placed anywhere. A long block flows onto the next pages, and each page's part can be moved, resized, edited, deleted or split off. Any block can have its own style. See Write, below.
- **Downloads** are PDF or PNG, as written, scanned, scanned in greyscale, or black and white, with an optional slight camera tilt.
- **Simple markup** in the editor: `# Title`, `## Heading`, `**bold**`, `*underline*`, `==highlight==`, `~~cross out~~`, `- lists`, `> notes`, `\newpage`.

Everything happens in the browser. Nothing is uploaded.

## Write

Write has two views, switched at the top: **Pages** and **Outline**. Blocks are the units you work with. There are three kinds: **Text**, **Header** (Name, Class, Subject, Roll no. and Date fields, with Date filled in as today) and **Margin note** (small and tilted). Each block has a name (`Main text`, `Text block`, `Header`, `Margin note`) and a colour. The colour shows on its outline and name tag and in the Outline.

- **Pages** shows each page as a typed copy beside the handwritten one. A switch shows Side by side, Typed or Handwritten alone. On the typed page every block sits at its real position under a name tag (grip, part label such as `2 of 3`, and a ⋯ menu), and you type in it directly. Clicking a word on a handwritten page selects its block and puts the caret at that word. The Show choice is remembered on the device.
- **Outline** lists the pages and the blocks on them (name, part, an `Own style` badge, the first words), with the handwritten pages in the middle and the selected block's whole text on the right. That editor draws a line where each later page's part starts (`Page 2 starts here`), with `Split here` and `Remove page 2 part` on it.

The editor is rich text with a text style menu (Normal, Title, Heading, Note), Bold, Underline, Cross out, Highlight, bulleted and numbered lists and Page break. Markdown shortcuts (`# `, `## `, `- `, `1. `, `> `) and a `/` menu work as well. Pasting from Google Docs or Word keeps the formatting. Underneath it is still the markup listed above, and it converts both ways without loss.

### How blocks are laid out

1. **A continuation follows its start.** A block that runs past the bottom of a page carries on at the top of the page right after the one its previous part is on. Pages are added as needed.
2. **Blocks push down.** If a block grows (more text, bigger letters, wider spacing) and reaches a block below it that overlaps it sideways, the lower one is pushed down, and moves to the top of the next page if it no longer fits. This happens when the pages are laid out. The stored position stays where you put the block, so the lower block comes back when the upper one shrinks.
3. **Moving a page moves the blocks that start on it.** Their continuations follow onto the page after the new position, by rule 1.
4. **A continuation can't be moved on its own.** Nib says `Part 2 of Main text always follows the part before it. Split it off first to move it on its own.`

### Changing the structure

All of these can be undone, from the message's **Undo** or with Ctrl+Z.

- Drag a block on the page (it snaps to the ruled lines), or move it with the arrow keys.
- Drag a page by its grip, in Pages or Outline, to reorder. In Outline, drag a block onto another page.
- **Split** a block where a page's part begins. From there on it is a new block named `<name> (continued)` that remembers where it came from. **Join back** on that block puts it back at the end of the original, and **Add to the end of…** appends any text block to another. The joined text goes in as lines, without the page break, so the text is no longer split at that page.
- **Remove the page N part** deletes only the text that page shows; the text after it moves up. **Delete block** removes the whole block.
- **Merge into previous page**, **Delete page** (and its blocks), **Add a page after this one**, and **Add** for a Text block, Margin note, Header or Page. A document has at most one Header.

### On phones

Below 860 px the Pages view shows one page at a time, with Previous page and Next page buttons, a swipe to turn the page, and a flip between the typed and handwritten copy. Outline shows the page list above the editor and leaves out the handwritten pages; bottom sheets for it come later.

## Style

Style changes how the writing looks. The panel has Looks, Handwriting, Pen, Ink, Paper, How natural, and Size and spacing, with its title, **New variation**, the page count notice and the scope switch pinned at the top.

- **Scope.** With no block selected, changes apply to the whole document. Click a block on a page and a switch appears: **Whole document** or **Only “<block name>”**. In the block's scope, the hand, pen, ink, line weight, letter size, realism and spacing sliders set that block's own style; a block with its own style says so, and **Match document** drops it. Paper and its effects, and Line spacing, are always document-wide and say `shared by every page` while a block is chosen. When the switch is on Whole document, the header names the blocks that keep their own style.
- **New variation** draws every letter again with new random shapes (for the selected block, in its scope).
- **Looks** set the hand, pen, ink, paper and realism in one tap: Exam answer, Neat notes, Letter, Quick scribble, Journal and School copy. In a block's scope a Look leaves paper alone. **Save the current style as a look** keeps your own under a name you give it; saved looks are kept on the device, appear in Looks in every document, and can be removed (with Undo).
- **Handwriting** shows the current hand writing the start of your document. **Change** opens the picker: every hand drawn writing the preview text, a search box (it also finds a hand by its font's name), one filter at a time (All, Joined-up, Print, Neat, Messy, Fun, Favourites), a star to favourite a hand, and a **Preview** field to try other words. Favourites and the preview text are remembered on the device. On wide screens the picker is a panel on the right; on phones it is a bottom sheet.
- **Use your own font** takes a TTF, OTF or WOFF file. It is kept in the browser's storage, is back in the picker (under `your font`, first in the list) after a reload, and is reshaped from its own outlines like every built-in hand, so the pen and realism settings work on it too. Adding the same file twice finds the first copy. If the browser won't store it, Nib says it goes when you close the page.
- **Pen and Ink.** Five pens (Fineliner, Ballpoint, Gel pen, Felt tip, Pencil), a Line weight slider, six inks, and a colour picker for any ink colour.
- **Paper** is ruled, spiral, yellow pad, grid, plain or photo. **Paper effects** are Room lighting, Show-through, Punch holes and Fold crease (crease only while it is on). A switch greys out with `Not on this paper` when the paper can't show it.
- **How natural** has four presets: Neat, Natural, Hurried and Messy. **Fine-tune** opens the sliders under them: Natural movement, Vary each letter, Letter wobble, Ink flow and Mistakes. Moving one by hand says `Fine-tuned by you.`
- **Size and spacing** has Letter size and Line spacing, and, folded away, Letter spacing and Word spacing.
- **Page count notice.** When a change makes the document take more or fewer pages, the header says `Now 4 pages (was 3)`. When it grew, **Fit back to 3 pages** lowers the letter size (the block's, in Only scope) as far as needed, then the line spacing if that is not enough, never below the sliders' limits, as one undo step with an Undo on its message. If it can't fit even then, it says so and changes nothing. It waits until the hands' files have loaded, so the pages it promises are the ones you get.
- **On phones** the panel is a sheet over the pages that rests at three heights (the header only, about half, and nearly full). The pages above it stay live.

## Run it locally

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Checks and build

```bash
npm test             # unit and component tests (Vitest)
npm run typecheck    # TypeScript
npm run build        # type check, then build the site into dist/
npm run smoke        # browser smoke test
```

`npm run smoke` drives the built app in a real browser, so it needs Chromium and Playwright available on the machine.

The built site uses relative paths, so it works from any folder or web address.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` installs, runs the tests, builds the site and publishes it on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once. The site is served at https://nvmaditya.github.io/nib-engine/ (the repository is `nib-engine`).

## How the code is laid out

- `src/engine/` is the drawing engine, written in plain JavaScript with no React in it. Each engine `.js` file has a `.d.ts` beside it, and `types.ts` holds the shared types.
  - `core.js`: the glyph engine, layout, ink, paper, scan looks and camera tilt.
  - `doc.js`: loading, checking and saving the document and settings.
  - `importers.js`: reading PDF, Word and text files.
  - `config.js`: hands, pens, inks, papers and defaults.
  - `engine.test.ts`: tests for the engine.
- `src/store/` holds the app state (Zustand) and storage: `documents.ts` (the saved documents), `editor.ts` (the open document), `history.ts` (undo and redo), `db.ts` (IndexedDB through idb) and `bootstrap.ts` (start-up, including moving data over from Longhand's old storage).
- `src/app/` holds the root component and the route between Home and the document stages.
- `src/main.tsx` starts the app: it applies the saved theme, adds a `@font-face` for each hand (the browser downloads a file only when something on screen uses it) and renders `App`.
- `src/shell/` holds the top bar, the stage navigation and the undo shortcuts.
- `src/features/` holds one folder per part of the app: `home`, `import`, `write`, `style`, `export`, `doc`, `editor` (the rich-text block editor and its toolbar) and `pages` (the handwritten page views, block frames and dragging). `write` holds the Pages and Outline views, menus and page dragging, and `doc` holds the actions that change blocks and pages.
  - `style` holds the Style panel: `StylePanel.tsx` with its sections (`ScopeBar`, `LooksSection`, `HandSection` and `HandPicker`, `PenInkSection`, `PaperSection`, `NaturalSection`, `SizeSection`), `StyleSheet.tsx` (the phone sheet), `looks.ts`, `hands.ts` (the picker's search and filters), `fonts.ts` (uploaded fonts: reading, registering and storing them), `prefs.ts` (saved looks, favourites and preview text, kept on the device), and `fit.ts` (the page count and Fit back, which tries sizes on copies laid out by the engine). `HandSample.tsx` draws a sample of any hand, look or paper through the engine's `drawSample`.
- `src/components/ui/` holds the shared interface components (Radix primitives styled in the shadcn way). `drawer.tsx` is the bottom sheet (vaul) that Style uses on phones.
- `src/brand/` holds the Nib logo; `src/lib/` holds small helpers such as the theme and `media.ts` (the 860 px `wide:` breakpoint as a `useWide()` hook, which switches Write between its wide and phone layouts); `src/styles/app.css` holds the Tailwind setup and design tokens.
- `scripts/smoke.mjs` is the browser smoke test.
- `public/fonts/` holds the handwriting fonts, which load only when used. Their licences are in `public/fonts/licenses/`, and [FONTS.md](FONTS.md) lists them all.
- `public/paper/photo.webp` is the photographed sheet used by the Photo paper.

## Credits

The handwriting fonts are open-licensed fonts from Google Fonts, via Fontsource; see [FONTS.md](FONTS.md). Nib also uses [opentype.js](https://github.com/opentypejs/opentype.js), [jsPDF](https://github.com/parallax/jsPDF), [PDF.js](https://github.com/mozilla/pdf.js) and [mammoth](https://github.com/mwilliamson/mammoth.js).

The interface is built with [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Radix](https://www.radix-ui.com) components in the style of [shadcn/ui](https://ui.shadcn.com), [Zustand](https://github.com/pmndrs/zustand) and [idb](https://github.com/jakearchibald/idb).
