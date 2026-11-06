# Nib: redesign of Longhand

Status: agreed with the product owner on 2026-11-06 over five rounds of questions and three rounds of clickable prototypes. The prototype is kept on the branch `prototype/nib-redesign` (`prototype/nib-prototype.html`) as the primary source for layout and interaction questions.

## 1. What Nib is

Nib turns text into realistic handwritten pages and downloads them as PDF or images. It is for students first (assignments, notes) and for anything else that should look handwritten (letters, journals, cards).

**The main path is Import.** Most people will bring in a PDF, Word or text file. It becomes one main block that flows across as many pages as it needs, one part per page. Typing from scratch is the secondary path.

**Realism is a hard requirement.** Everything the current engine does to make writing look human carries over into Nib unchanged: glyphs reshaped from real font outlines, per-letter shape variety and alternates, line drift and word tilt, pen pressure and ink flow, mistakes that are crossed out and rewritten, paper textures, show-through, lighting, scan looks and camera tilt. No milestone may simplify or replace the drawing engine to make the UI easier. The prototype's CSS imitation is not the product.

## 2. Brand

- Name: **Nib** everywhere in the product (title, copy, manifest, file names, storage keys). The repository is renamed to **`nib-engine`**; the site moves to `https://nvmaditya.github.io/nib-engine/`.
- Logo: the **ink page**: an ink-blue (`#1E2B7C`) rounded square with three white ruled lines at 28% opacity, a margin line in `#FF9B9B`, a joined-up white "n" and a white nib at writing angle. It is the app icon, favicon, top-bar mark and social image. A paper variant (same drawing on white paper, blue ink) exists for print and very dark backgrounds only.
- Wordmark: "nib", lowercase, Figtree 700, letter-spacing −0.045em.
- Interface look: **Studio**: quiet neutral surfaces so the handwritten page carries the colour.
- Accent: ink blue `#2F43D0` (light theme), `#8E9CFF` (dark theme).
- Type: **Figtree** only for the interface. Weights: 400 for text, 500 for controls, 600 for names and titles. Never bold labels everywhere.
- Light and dark themes, following the system by default, with a switch.

Colour tokens (light / dark):

| Token | Light | Dark |
|---|---|---|
| bg | `#F7F7F8` | `#0E0E11` |
| surface | `#FFFFFF` | `#16161A` |
| surface-2 | `#F1F1F3` | `#1F1F25` |
| fg | `#16161A` | `#EDEDF1` |
| muted | `#6C6C76` | `#9A9AA6` |
| line | `#E6E6EA` | `#27272E` |
| line-strong | `#D2D2D8` | `#36363F` |
| accent | `#2F43D0` | `#8E9CFF` |
| on-accent | `#FFFFFF` | `#0B0C1C` |
| accent-soft | `#ECEFFF` | `#1E2246` |
| marker | `#FFE266` | `#E6CD55` |
| desk | `#ECECEF` | `#08080A` |
| danger | `#D92D3A` | `#FF7B84` |
| logo-ink | `#1E2B7C` | `#1E2B7C` |

Block colours (fixed in both themes, in order): `#7A4DF0`, `#0B8F8A`, `#D9661F`, `#D6336C`, `#2F6FDB`, `#5C8A1E`.

## 3. Structure

Nib **always opens on Home**. Opening a document shows three stages, **Write → Style → Export**, in the top bar. They are free to move between; nothing is enforced.

Routes (hash based, so GitHub Pages needs no server rules): `#/` Home; `#/d/<docId>/write`, `#/d/<docId>/outline`, `#/d/<docId>/style`, `#/d/<docId>/export`.

Top bar in a document: logo (to Home), editable document name with "Saved" state, stage switcher, Undo, Redo, Export button.

### Home

- **Import is the hero**: a large drop zone ("Import a PDF, Word or text file") that also accepts a drop anywhere on the window.
- Templates below it: Blank page, Assignment, Class notes, Letter, Journal page, Card. Each starts with its own look and paper.
- Recent documents with a thumbnail, page count, look name and last edited time, and a menu: Rename, Duplicate, Delete (Delete asks first).
- "Everything is saved on this device. Nothing is uploaded."
- First visit: one example document ("The Water Cycle") appears in Recent. Saved Longhand work (localStorage keys `longhand.v2` / `longhand.v1`) is imported automatically as the first Nib document, once.

### Import

Choose or drop a file, see the headings, lists, bold, underline and crossed-out words as they will come across (rich preview, editable), choose: replace the pages or add after the last page; start a new page where the file does; a look; optionally add a Header block (Name, Class, Date). Result: one main block flowing page by page.

## 4. Write

Terms the interface uses: **Block** (never "text box"), kinds **Text**, **Header** (Name, Class, Subject, Roll no., Date fields; Date defaults to today), **Margin note** (small, tilted).

Each block has a name (defaults: "Main text", "Header", "Margin note", "Text block") and a colour from the block palette. Its outline and name tag on the page use that colour, and so does its entry in the Outline.

Two views with one switch:

- **Pages** (default): per page, a typed copy and the handwritten page side by side; a switch shows Side by side, Typed only or Handwritten only. Typed pages show blocks at their real positions with a name tag (drag handle, part label "2 of 3", ⋯ menu). Blocks are edited in place.
- **Outline**: left, pages and their blocks (name, part, own-style badge, first words); middle, the handwritten pages; right, the selected block's editor with page-break lines ("Page 2 starts here") that carry **Split here** and **Remove page 2 part**.

Editor: rich text (TipTap) that looks like Google Docs: a text-style menu (Normal, Title, Heading, Note), Bold, Underline, Cross out, Highlight, bulleted and numbered lists, Page break; markdown shortcuts (`# `, `## `, `- `, `1. `, `> `) and a `/` menu. It converts losslessly to and from the engine's markup (`# Title`, `## Heading`, `**bold**`, `*underline*`, `~~cross out~~`, `==highlight==`, `- `, `1. `, `> `, `\newpage`). Pasting from Google Docs or Word keeps that formatting.

Clicking a word on a handwritten page selects the block and puts the caret at that word in the editor.

### Layout rules

1. **Continuations follow their start.** A block that runs past the bottom of a page continues at the top of the page right after the one its previous part is on. Pages are added automatically when needed.
2. **Push down.** When a block grows (more text, bigger letters, wider spacing) and reaches a block below it on the same page that overlaps it horizontally, the lower block is pushed down. A pushed block that no longer fits moves to the top of the next page. Pushing happens at layout time: the stored position is where the person put the block, so shrinking the upper block lets the lower one return.
3. **Moving a page** moves the blocks that start on it. Their continuations follow onto the page after the new position, by rule 1.
4. **Moving a continuation part on its own is not allowed**: the interface says "Part 2 of Main text always follows the part before it. Split it off first to move it on its own."

### Restructuring (all undoable)

- Drag a block on the page (snaps to the ruled lines); arrow keys move it one line or a few units.
- Drag a page by its grip in Pages or Outline to reorder.
- In Outline, drag a block onto another page.
- **Split** a block where a page part begins: from there on it is a new block named "<name> (continued)" that remembers where it came from.
- **Join back into "<name>"** on a split block, and **Add to the end of "<other block>"** on any text block.
- **Remove the page N part**: deletes only the text shown on that page; text after it moves up.
- **Merge into previous page**: the page's blocks move onto the page before; text that runs on keeps flowing.
- Add page, delete page (and its blocks), add block (Text, Margin note, Header).

## 5. Style

The handwritten pages in the middle, one panel on the right.

- **Whole document / Only "<block>"** switch at the top of the panel (replaces the hidden "All text boxes / This text box" mode). Blocks with their own style show a badge; **Match document** removes the override. Paper, line spacing and paper effects are always document-wide.
- **New variation** re-rolls the random shapes (document, or the block when "Only" is on).
- **Looks**: one-tap combinations of hand, pen, ink, paper and realism: Exam answer, Neat notes, Letter, Quick scribble, Journal, School copy; **Save the current style as a look** (saved on the device, available in every document).
- **Handwriting**: shows the current hand writing the start of the document; **Change** opens a picker with search, filters (Joined-up, Print, Neat, Messy, Fun, ★ Favourites), favourites, editable preview text, and **Use your own font** (TTF, OTF, WOFF; stored in IndexedDB and available after reload).
- **Pen** (Fineliner, Ballpoint, Gel pen, Felt tip, Pencil) and line weight; **Ink** (Blue, Blue-black, Black, Red, Green, Purple, any colour). The "As drawn" pen is removed.
- **Paper**: Ruled, Spiral, Yellow pad, Grid, Plain, Photo; **Paper effects**: Room lighting, Show-through, Punch holes. The straight "Fold crease" is removed.
- **How natural**: Neat, Natural, Hurried, Messy; **Fine-tune**: Natural movement, Vary each letter, Letter wobble, Ink flow, Mistakes.
- **Size and spacing**: Letter size, Line spacing; folded: Letter spacing, Word spacing.
- **Page count notice**: when a style change changes the page count, the panel shows "Now 3 pages (was 2)" with **Fit back to 2 pages**, which lowers letter size (and then line spacing) in steps until the document fits again, or says it can't.

## 6. Export

The pages exactly as they will download, beside one panel:

- Format: **PDF**, **PNG**, **JPG**; for several images, **Put the images in one ZIP** (on by default).
- Pages: All pages, or Choose pages (click a page to leave it out or put it back).
- How it looks: **As written** (default for a new document), Scanned, Greyscale scan, Black and white; **Slight camera tilt** (off by default). The last choice is remembered per document.
- Quality: Standard, Print quality.
- File name, with the extension shown; defaults to the document's title.
- **Download** button labelled with what it makes and the estimated size ("Download ZIP · 3 PNGs ~2.7 MB"); **Share…** uses the system share sheet where available.
- **No metadata.** PDFs carry no Producer, Creator, Author, Title, Subject, Keywords, CreationDate or ModDate, and a random file ID; PNG and JPG files carry no text chunks, EXIF or other metadata. Pixels are the composed page only.

## 7. Phones

Below 860 px wide: the page is first; Write's Pages view becomes one page at a time with a Typed ⇄ Handwritten flip and swipe between pages; Outline, Style and Export panels open as bottom sheets; the stage switcher spans the width.

## 8. Technology

- React 19, TypeScript, Vite; Tailwind CSS v4; shadcn/ui components (Radix primitives, owned in `src/components/ui`); `cmdk` (command palette), `vaul` (bottom sheets), `sonner` (toasts), `lucide-react` (icons); TipTap (editor); Zustand (state); IndexedDB via `idb`; `vite-plugin-pwa` (install and offline); Vitest and Testing Library (tests).
- The drawing engine (`src/engine/*.js`) stays JavaScript behind TypeScript declaration files. Engine changes needed by the layout rules and document model are allowed; realism code is not removed.
- Fully client-side; GitHub Pages hosting; relative asset paths.

## 9. Delivery

One branch per milestone, merged into `main` and pushed when the milestone works; every merge redeploys. Milestones:

1. **Foundation**: repository rename, new stack, design system and logo, typed engine boundary, undo/redo, multiple documents in IndexedDB, Longhand migration, Home and the Write / Style / Export shell carrying today's features.
2. **Write**: blocks, TipTap editor, Pages and Outline views, layout rules, restructuring, dragging.
3. **Style**: the Style panel as specified, fonts in IndexedDB, Fit back.
4. **Export**: the Export stage as specified, metadata-free files, Share.
5. **Home, templates and Import**.
6. **Polish**: install and offline, first-visit tips (three, shown the first time a document opens), keyboard shortcut sheet, Ctrl+K command palette, theme switch, phone layouts finished.

## 10. Later (after Nib v1, deliberately open)

- A **Photo** export look: a little surface showing at the page borders and a natural camera rotation; the ink and paper treated as one surface so writing never looks pasted on.
- Real, random paper creases (never straight lines).
- No random objects around the page.
- Page sizes other than A4; images and diagrams on pages; redrawing a single word.
