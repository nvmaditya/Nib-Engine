# Nib Milestone 5 (Home, templates and Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build spec §3 Home and Import. Home opens with Import as its hero (a large drop zone, and a drop anywhere on the window), then six templates that each start with their own look, paper and content, then Recent documents with an engine-drawn thumbnail of page 1, the page count, the look's name, when each was last edited, and Rename, Duplicate and Delete (which asks first). Import reads a PDF, Word (.docx) or text file in the browser and shows it in a rich, editable preview with its headings, lists, bold, underline and crossed-out words. You choose to replace the pages or add after the last page, whether to start a new page where the file does, a look, and an optional Header block, and it is written out as one main block that flows page by page. Both work at 390 px.

**Architecture:** One `ImportDialog` serves two targets. In an open document, writing out is one undo step that also carries the look. From Home, the document is made only when you press Write it out. The preview is the M2 editor's schema and converter in a TipTap editor with its own undo history, never the document's, so Ctrl+Z there only undoes the preview. The separators between the file's pages are tracked through every edit, so "Start a new page where the file does" still works after editing. Templates and imports are built by one pure builder (`src/features/doc/build.ts`) into ordinary documents, which the engine then draws as it draws any document. Thumbnails are the engine's own `composePage(0, px)`, encoded through M4's `encodeCanvas` and kept on the device in IndexedDB `prefs`. Each is redrawn only when page 1's document changes, and it carries the laid-out page count.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind v4, shadcn-style components hand-written on `radix-ui` 1.8.1 in `src/components/ui`, TipTap 3.33.0 (`@tiptap/react`, `@tiptap/extensions` for `UndoRedo` and `Placeholder`, all already dependencies), `lucide-react`, `sonner`, Zustand (`src/store/editor.ts`), `idb` (IndexedDB `nib`), `mammoth` 1.8.0 and `pdfjs-dist` 3.11.174 (already dependencies, loaded only when used), Vitest + Testing Library + jsdom + fake-indexeddb, and Playwright (installed machine-wide) for `npm run smoke`. The test and smoke fixtures are made in Node with `node:zlib` (`deflateRawSync`, `crc32`).

**Spec:** `docs/superpowers/specs/2026-11-06-nib-redesign-design.md`. This milestone implements §3 Home and Import in full. It uses §1 for the main path (Import) and the realism rule, §4 for blocks, Header fields and layout rules 1 and 2, §5 for Looks (M3's `STYLE_LOOKS` in `src/features/style/looks.ts`), §7 for phones and §2 for tokens and type. Layout and copy the spec leaves open come from the prototype (`git show prototype/nib-redesign:prototype/nib-prototype.html`: `TEMPLATES`, `miniPage`, `renderHome`, `.tpls`, `.rrow`, `.dz`). The roadmap row is in `docs/superpowers/plans/2026-11-06-nib-m1-foundation.md` (Roadmap after Milestone 1). Its exit check: **Import of a .docx produces one flowing main block; each template opens with its look.**

**Branch:** `nib/m5-home-import`, cut from `main` after Milestone 4 is merged. Tasks run in worktrees off that branch. **The controller merges each task, and at the end merges `nib/m5-home-import` into `main` and pushes. No task merges, pushes or deploys.** M5 relies on M4's end state: `encodeCanvas` in `src/features/export/render.ts`, jsdom's canvas encoder in `src/test/setup.ts`, `toast(msg, action?, { duration? })`, and the smoke steps of M4 Task 10, which download a real PDF.

## Global Constraints

- Product name **Nib** in all copy. Copy is plain sentence case, quotes and apostrophes are curly, and every string comes from the Interface copy, Formats and Templates tables below.
- **Realism is non-negotiable (spec §1).** Templates and imports become ordinary documents, which the engine draws unchanged. Every page picture in M5 is drawn by the engine:
  - The Recent and template thumbnails are `composePage(0, px)`.
  - The look cards are M3's `HandSample`, through `drawSample`.
  - There is no CSS imitation of a page anywhere, including the template cards, where the prototype's CSS mini pages are not the product.
  - The **only engine code M5 changes** is `src/engine/importers.js` and its `importers.d.ts` (Task 1). That code reads files into markup and draws nothing. Within it, `readDocument`, `readDocx`, `htmlToMarks` and `importError` change, while `readPdf`, `pdfLines`, `pdfParagraphs`, `pdfLib` and `docxLib` stay as they are. The new `src/engine/importers.test.ts` is added.
  - `core.js`, `doc.js`, `config.js`, `types.ts` and their `.d.ts` files stay byte-for-byte as they are. Task 10 checks this with `git diff main -- src/engine`.
  - The engine functions M5 calls (none of them change):
    - `use`, `computeLayout`, `composePage`, `geom`, `snapY` (the builders in Task 2, the thumbnails in Task 3);
    - `loadFont`, `fontReady`, `fontStr` (thumbnails wait for the hands, Task 3);
    - `drawSample` through `HandSample` (look cards, Task 5);
    - `parseInline` and `parseLine` through M2's converter (the preview, Task 4);
    - `headerText`, `cleanSettings`, `DEFAULT_NAMES` (`doc.js`);
    - `readDocument`, `importError` (the dialog, Task 8);
    - `frameRange`, `framesOf` and `settings` in tests.
- **Nothing is uploaded (spec §3).** Files are read in the browser by `readDocument`. pdf.js runs in its own worker (a same-origin asset) without `cMapUrl` or `standardFontDataUrl`, and mammoth runs on the page. An import makes no network request except fetching the app's own reader chunks and font files. M4's rule still holds: outside tests and `src/test/`, `toBlob` appears only in `src/features/export/render.ts` and `createObjectURL` only in `src/features/export/run.ts`. Thumbnails use `encodeCanvas` and `data:` URLs.
- Colour tokens and type follow spec §2. Tailwind: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `border-line-strong`, `text-muted` (grey **text**; never `bg-muted`), `bg-primary`/`text-primary`, `bg-primary-soft`, `text-danger`.
  - UI parts come from `src/components/ui` (hand-written on `radix-ui`, because the network proxy blocks the shadcn CLI). Look cards use `radix-ui`'s `RadioGroup` items directly.
  - Icons come from `lucide-react`, and messages go through `toast()` (`src/store/editor.ts`).
  - Figtree weights: 400 for text, 500 for controls, 600 for names and titles.
  - Every new control has a focus ring (`focus-visible:ring-2 focus-visible:ring-ring/50`).
- `wide:` (860 px) is the only layout breakpoint. **Home and the Import dialog use no `useWide()` at all.** They switch layouts with `wide:` classes only, so crossing 860 px never remounts the preview editor, the options or a thumbnail.
- `vite.config.ts` keeps `base: './'`. TypeScript is `strict`. New code is `.ts`/`.tsx`, and the engine stays `.js` with `.d.ts`.
  - App code type-checks under `tsconfig.app.json`, which has **no Node types**: no `Buffer` or `node:*` in `src` outside tests. Use `Uint8Array`, `TextEncoder`, `btoa`.
  - Tests and `src/test/**` type-check under `tsconfig.test.json`.
  - The fixtures module `scripts/fixtures.mjs` (Task 1) is plain Node JavaScript with a `scripts/fixtures.d.mts` beside it. Only tests and `scripts/smoke.mjs` import it, never app code.
- **Undo** (the M2–M4 rule: every document change goes through `update(fn, { history })`, and a no-op records nothing):
  - **Writing an import into the open document is one undo step** (`step('import')`). It restores the settings (the look), the blocks and the title. Its message's **Undo** does the same (`undoToState`, Task 2).
  - Choosing options in the dialog, reading a file and Cancel record nothing.
  - **The preview has its own undo** (TipTap `UndoRedo`). Ctrl+Z inside it never reaches the document's history, and the page-break switch is not one of its steps.
  - **A template or an import from Home makes a new document.** It opens with no history (`canUndo` false), because there is nothing to join.
  - Rename, Duplicate and Delete on Home change stored records, as in M1. They are not in any document's history.
- **Storage.** IndexedDB `nib` stays at version 1. The one new kind of `prefs` key is `thumb:<owner>` → `{ sig: string; jpeg: Uint8Array; pages: number }`, where `owner` is `doc:<id>` or `tpl:<id>`. A thumbnail is removed when its document is deleted from Home. M5 writes nothing to `localStorage`. The first visit's example (The Water Cycle) and the once-only Longhand migration (`bootstrapDocuments`, M1) are unchanged and keep working.
- **Hidden stages.** The Import dialog is mounted outside `StageHost` (as today) and portalled. `HandSample` and `PageThumb` outside a stage count as active (`useStageActive()` is true there). The M2 test `a hidden stage’s panel doesn’t redraw on every change` keeps passing.
- **Dependencies.** No new dependency. `npm ls` shows the same direct dependencies as at the end of M4.
- **Tests.** Test-first, and the test output stays clean: no act warnings, no React, Radix, TipTap or jsdom console errors. Dialogs have a `DialogDescription`.
  - Tests that draw real pixels would be `*.browser.test.ts`, run only by `npm run test:browser`, which `npm run smoke` calls, and never by `npm test`, because CI has no Playwright. M5 adds none: its real-browser checks are in the smoke run.
  - Every commit leaves `npm test && npm run typecheck && npm run build && npm run smoke` passing.

## Formats and messages (Task 1)

What `readDocument(file)` does with each kind of file. A refusal rejects with an `Error` whose `code` is the one listed, and `importError(code)` gives the message. Detection uses the file name's extension first, then its MIME type.

| File | Detected by | What happens | Code and message |
|---|---|---|---|
| PDF with text | `.pdf`, `application/pdf` | pdf.js reads each page's text. Lines become `#`/`##` headings by size, `- `/`1. ` lists and paragraphs, and words split at line ends are joined again. Page numbers are dropped. **One part per page.** | — |
| PDF with no text (a scan, a photo, blank pages) | fewer than 15 characters in all | refused | `scan`: `This PDF has no text Nib can copy. If it’s a scan or a photo of pages, try the original document instead.` |
| PDF that needs a password to open | pdf.js `PasswordException` | Refused. (A PDF that only restricts printing or copying opens normally.) | `password`: `That PDF is password-protected. Save a copy without the password and try again.` |
| Word | `.docx`, `…wordprocessingml.document` | mammoth turns it into HTML, and `htmlToMarks` writes markup: the Title and headings, **bold**, underline, ~~strike~~, bulleted and numbered lists (nested by indent), quotes, and table rows as `a | b`. Images go. **A page break (`w:br w:type="page"`) starts a new part.** | — |
| Word file that is locked with a password, or an old `.doc` renamed `.docx` | `.docx` whose first bytes are `D0 CF 11 E0` | refused | `locked`: `Nib can’t open that Word file. If it has a password, save a copy without one; if it’s an old .doc, save it as .docx.` |
| Old Word | `.doc`, `application/msword` | refused | `doc`: `Old Word files (.doc) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.` (M1) |
| Rich text | `.rtf`, or a type containing `rtf` (`text/rtf` included) | refused, and never read as text | `rtf`: `Rich text files (.rtf) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.` |
| OpenDocument | `.odt`, `…opendocument.text` | refused | `odt`: `OpenDocument files (.odt) can’t be read here. Open it in LibreOffice, Word or Google Docs and save it as .docx or PDF first.` |
| Picture | `.png .jpg .jpeg .gif .webp .heic .heif .bmp .tif .tiff .svg`, or `image/*` | refused | `image`: `That’s a picture. Nib can’t read the words in a picture: import a PDF, Word (.docx) or text file instead.` |
| Text | `.txt .md .markdown .text`, or no extension with `text/plain` or `text/markdown` | Read as Nib's markup (`# `, `**`, `- `, …). Form feeds (`\f`) split parts. | — |
| Empty file, or no words | no word after reading | refused | `empty`: `There’s no text in that file.` (M1) |
| Over 40 MB | `file.size` | refused before reading | `big`: `That file is over 40 MB. Try a smaller one.` (M1) |
| Anything else (`.pages`, `.html`, `.csv`, `.key`, …) | — | refused | `type`: `Nib can read PDF, Word (.docx) and text files.` (M1) |
| Reader that can't load (offline, first use) | an import or fetch error | refused | `lib`: `The document reader couldn’t be loaded. Check your connection and try again.` (M1) |
| Damaged | any other failure | refused | `read`: `That file couldn’t be read. It may be damaged; try saving it again or as a PDF.` (M1) |

`words` counts tokens that hold a letter or digit, leaving out markup markers (`#`, `##`, `###`, `-`, `>`, `1.`, `a)`). `pages` is the PDF's page count, or the text's form-feed parts when it has any, else 0. A Word file's page breaks give it parts but `pages: 0`.

## Templates (Task 6)

`{today}` is `today(now)` from `src/features/doc/model.ts`, e.g. `7 November 2026`. Each look is from M3's `STYLE_LOOKS`. Settings are `{ ...cleanSettings(null, false), ...lookPatch(look, false), ...extra }`. Geometry is `geom()` for those settings: gap 34, top 110, and left 112 on ruled, spiral and yellow pad or 74 on grid and plain, with right 742.

| id | Card name | Card note | Look | Extra | New document's title | Blocks and starter text |
|---|---|---|---|---|---|---|
| `blank` | `Blank page` | `Ruled, nothing on it yet` | `exam` (Exam answer) | — | `Untitled` | Main text `''` on the top line |
| `assignment` | `Assignment` | `Header, title and headings` | `exam` | — | `Assignment` | Header at the top right (Name and Class empty, Date `{today}`), then Main text `# Title\n\n## Introduction\n` on the line below it |
| `notes` | `Class notes` | `Grid paper and lists` | `notes` (Neat notes) | `paper: 'grid'` | `Class notes` | Main text `# Notes\n\n## Topic\n- First point\n- Second point` |
| `letter` | `Letter` | `Plain paper, joined-up` | `letter` | — | `Letter` | Main text `Dear …,\n\n\n\nWith love,` |
| `journal` | `Journal page` | `Yellow pad, relaxed` | `journal` | — | `Journal page` | Main text `{today}\n\n` |
| `card` | `Card` | `One big message` | `letter` | `size: 38` | `Card` | Main text `# Happy birthday!` on `snapY(400)` (y 416), the middle of the page |

**New document** (the top bar on Home, and Home's empty state) makes a Blank page.

## Interface copy

Exact strings, used verbatim. `{x}` is filled in. `{pages}` is `1 page` or `{n} pages`. Numbers of words use `toLocaleString()`.

| Where | Copy |
|---|---|
| Home: hero | One button with three lines: `Import a PDF, Word or text file` (600, 18 px), `or drop it anywhere` (muted), `Headings, lists, bold, underline and crossed-out words come across.` (muted, 13 px) |
| Home: a file dragged over the window | `Drop to import this document` (M1's veil, the same as in a document) |
| Home: templates | heading `Start something new` · under it `Each template starts with its own look. You can change everything later.` · six cards, each its page drawn, then its name (600) and note (muted), from the Templates table |
| Home: Recent | heading `Recent`. Each row has a thumbnail, the title (600), and under it `{pages} · {look} · {edited}`. `{pages}` is left out, with its ` · `, until page 1 has been laid out with the document's hands. `{look}` is the matching look's name and is left out when none matches. `{edited}` is `Edited today`, `Edited yesterday` or `Edited {d} {Month} {yyyy}` (M1). The menu button is `More for {title}`, with items `Rename`, `Duplicate`, `Delete`. M1's Rename dialog: `Rename document`, field `Document name`, `Cancel`, `Rename`. M1's Delete: `Delete “{title}”? This can’t be undone.`, with description (screen readers) `The document is removed from this device.`, `Cancel`, `Delete`. A duplicate is `{title} (copy)`. Failures (M1): `That didn’t work. Try again.` and `This document was saved by a newer version of Nib. Reload the page to keep editing.` |
| Home: no documents | `No documents yet.` and the button `New document` · when storage can't be read (M1): `Nib can’t read your documents on this device right now.` |
| Home: footer | `Everything is saved on this device. Nothing is uploaded.` |
| Top bar on Home (M1) | `Import a file` · `New document` |
| Write bar (M1) | `Import`, title `Bring in a PDF, Word or text file` |
| Import: dialog | title `Import a document` · description (screen readers) `Choose a file, check its text, then write it out on the pages.` · the dialog's close button `Close` (screen readers) |
| Import: no file yet, or after a refusal | drop zone `Choose a PDF, Word (.docx) or text file` · `or drop it here. Headings, lists, bold, underline and crossed-out words come across.` (M1) |
| Import: reading | status `Reading {file name}…` |
| Import: read | status `{file name}: {n} words from {p} pages.` (`1 word`, `from 1 page`). The ` from …` part shows only when `pages > 0`, e.g. `Essay.pdf: 1,204 words from 3 pages.` or `Essay.docx: 24 words.` · button `Choose another file` |
| Import: preview | label `Check the text and change anything before it’s written out` (M1) · textbox `Imported text` · placeholder `Nothing to write out yet.` · M2's formatting toolbar (`Formatting`) |
| Import: where (open document only) | heading `Where it goes` · radio group `Where it goes`: `Replace what’s on the pages`, `Add after the last page` (M1) · with Add after, the hint `It carries on the writing that ends on the last page, from the top of a new page.` |
| Import: the file's pages (a file with more than one part only) | heading `Pages` · checkbox `Start a new page where the file does` (M1) |
| Import: look | heading `Look` · radio group `Look`: `Keep this document’s look` (open document only, first), then `Exam answer`, `Neat notes`, `Letter`, `Quick scribble`, `Journal`, `School copy`, then saved looks by name. Each card writes `Homework` in its look on its paper (M3's tiles). |
| Import: header (a new document, or Replace) | heading `Header` · checkbox `Add a header block` · fields `Name`, `Class`, `Date` · hint `At the top right of page 1.` |
| Import: footer | `Cancel` · `Write it out` |
| Import: refusals | the Formats table's messages · `There’s no text to write out.` (the preview was emptied) |
| After Write it out | Replace, or a new document: `Written out. Each page’s part can be moved, resized, edited or split off on its own.` (with `Undo` in an open document) · Add after: `Added after the last page, carrying on “{block}”.` or `Added after the last page as “{block}”.` (with `Undo`) · a document that can't be made (M1): `Nib can’t create documents on this device right now.` |

## Review Focus

1. **Ctrl+Z (or the browser's own undo) inside the Import preview.** Expected: it undoes the last edit in the preview, and the document behind the dialog and its history are untouched. The page-break switch is not undone by it. Tests: Task 4 (`Ctrl+Z undoes typing in the preview, never the document`, `the page-break switch isn’t a step of the preview’s undo`) and Task 8 (`Ctrl+Z in the preview leaves the document and its history alone`).
2. **A long file** (a 100-page PDF, a 60-page Word file). Expected: one Main text whose parts run page 1, 2, 3… in order with nothing pushed, written out as one undo step. Recent shows the laid-out page count, not the stored minimum (`doc.pageCount` stays 1 after an import). Tests: Task 2 (`a long import is one block that flows page by page, nothing pushed`, `a long import added after the last page pushes nothing`), Task 3 (`page 1 is drawn by the engine, at the size asked, with the page count`) and Task 7 (`the page count is the laid-out one, not the stored minimum`).
3. **A file Nib can't read, or one that looks like something else**: a `.doc` renamed `.docx`, an `.rtf` whose type is `text/rtf`, an `.odt`, a phone photo `.heic` with an empty type, an empty `.txt`, an image-only or password PDF, or an `.html`. Expected: that file's own message, no document made, and the dialog still lets you choose another file. Tests: Task 1 (each code) and Task 8 (`a file that can’t be read says why, and nothing can be written out`; `from Home, a refused file makes nothing`).
4. **Add after the last page when the end of the document isn't plain Main text**: a blank page added at the end, a last page that holds only a margin note, a Main text ending in blank lines or `\newpage`, or an empty Main text from a template. Expected: the text starts on the first fresh page at the end, carrying on the block that ends there, or as a new block, and never overlapping another block. Tests: Task 2 (from `Add after the last page carries on the text block that ends there` to `…or on the last page itself when that page is blank`).
5. **A thumbnail that is wrong or stale**: drawn while a hand's file is still missing (offline), not redrawn after an edit or a look change, or left behind after Delete. Expected: no thumbnail is kept until it can be drawn with the document's own hands. It is redrawn when page 1's settings or blocks change, and removed with the document. Tests: Task 3 (`it waits for the hands…`, `a thumbnail is kept on the device, and drawn again only when page 1’s document changes`) and Task 7 (`Delete forgets the thumbnail`).

## Design decisions

1. **One Import dialog, two targets.** `ImportDialog({ open, file, target, onClose })`. Both targets open through the editor store's existing UI state (`openImport(file)` sets `importOpen` and `importFile`, with no save and no history).
   - `target="open"` is mounted in `DocumentView`. The Write bar's Import button and a file dropped on a document open it.
   - `target="new"` is mounted on Home. The hero, the top bar's `Import a file` and a file dropped anywhere on Home open it.
   - **From Home nothing is made until Write it out.** Only then is a new document made and opened on Write. M1 made an Untitled document first, which Cancel left behind.
2. **The preview is the M2 editor, on its own.**
   - It is a TipTap editor with `previewExtensions()` (Task 4). That is the schema (`BLOCK_EXTENSIONS`), the converter sync, list markers, the `*underline*` rule and the block keys (Mod-Enter page break, Tab indent), plus TipTap's `UndoRedo` and a placeholder. Pasting goes through `cleanPastedHTML`.
   - It leaves out the app history (`AppHistory`), because the text isn't in the document yet, and the `/` menu, because the toolbar covers it.
   - M2's `FormatToolbar` is given this editor (a new `editor` prop) and never touches the global active editor, so Write's toolbar is unaffected.
   - Its content is each file part through `fromMarkup`, joined by **separator nodes**: an empty paragraph, or a `pageBreak` when "Start a new page where the file does" is on. That is exactly `fromMarkup(importText(parts, breaks))`.
   - A ProseMirror plugin (`FileBreaks`) keeps the separators' positions and maps them through every change. So the switch still works after editing: on swaps each empty separator for a page break (or puts one back where a deleted separator was), and off swaps page breaks back. It is a change outside the preview's undo history (`addToHistory: false`).
   - Write it out takes `toMarkup(editor.getJSON())`, and the engine draws exactly that markup.
3. **Writing an import out** (`importInto`, Task 2) is pure. It works on a copy and returns the new settings, the document, the block the text went into, and the page the text starts on.
   - **Replace:** the document becomes the Header block (only if asked for) and one **Main text** with the file's text, with `pageCount: 1`.
     - The Header keeps its own block (id, colour, place) if the document had one, with the fields from the dialog. Otherwise it is new, at the top right of page 1 (`x 446`, `y top − gap`, `w 320`).
     - Main text starts at the left margin, full width. Below a page-1 header it starts on the line after the header's last line (`y = header.y + lines × gap`, which is the example document's 178). Otherwise it starts on the first line (`snapY(top − gap)`, 76).
     - The export file name (`doc.fileName`) is kept.
   - **Add after the last page.** The text continues the **text block whose writing ends lowest on the last page**, after a `\newpage` line. It starts at the top of the page after the last one, which is always empty.
     - That block's trailing blank lines and trailing `\newpage` lines are trimmed first, so no empty page is left between.
     - An empty block (a Blank page's Main text) simply takes the text, where it is.
     - When no text block ends on the last page, the text becomes a **new block**. That happens when the last page is blank, or holds only a header or a margin note. The new block goes on the last page if that page holds nothing at all, else on a new page after it. It is named and coloured as any new block (`newBlockName`, `nextColor`).
     - The Header choice is hidden for Add after, because a header belongs at the top of page 1.
     - **Why continue a block rather than always add one:**
       - Spec §1 says an import "becomes one main block that flows across as many pages as it needs", and continuing the block that ends the document keeps it one block.
       - Spec §4 rule 1 ("continuations follow their start") then places the new text at the top of the next page by itself. Because that page is always empty, rule 2 (push down) never comes into play, which is also why M2's deferred pushed-block cases are not made more likely (Rulings).
       - The new text starts exactly where a page part begins, so Outline's `Page N starts here` line offers **Split here** to make it a block of its own, and Join back undoes that.
       - Always adding a block would leave a Blank page's empty Main text alone on page 1, and turn a second chapter into a second block.
   - **The title:** a document named `Untitled` takes the file's name (`res.name`). A named one keeps its name. A new document from Home is named after the file, or `Untitled`.
4. **Look and Header in the dialog.**
   - The look cards are the six built-in looks and the saved looks. An open document starts on `Keep this document’s look` (`look: null`), and a new document on Exam answer (the new-document defaults).
   - A look is applied as Style applies one to the whole document, with `{ ...S, ...lookPatch(look, false) }`, paper included. Blocks with their own style keep it.
   - The Header choice shows for a new document and for Replace. In an open document it starts ticked with the existing header's fields when there is one. Otherwise it starts unticked, and ticking it gives Name `''`, Class `''`, Date `today()`. Subject and Roll no. lines that the header already has are kept as they are.
5. **Templates** are built with the same `newDocument` builder as imports, from the Templates table.
   - Opening one makes a stored document, opens it on Write and puts the caret at the end of its Main text, so typing starts at once.
   - Cards on Home show the template's own page 1, drawn by the engine (Design decision 6) with the date of the day.
6. **Thumbnails** (Task 3).
   - `drawThumb(S, doc, px)` points the engine at that document (`use`), lays it out (`computeLayout`, which also gives the page count) and returns `composePage(0, px)`. That is the paper and every part's ink on page 1, as written, which is how Write and Style show it (scan looks and camera tilt are for downloads).
   - Then it puts the engine back on the store's document. It lays that document out again only while one is open (`docId !== null`). On Home no view reads the layout, and opening a document lays it out.
   - Sizes are `RECENT_PX = 156` (a 52 px wide tile on Home, at up to 3× density) and `TEMPLATE_PX = 360`. The canvas is encoded with M4's `encodeCanvas(canvas, 'image/jpeg', 0.82)` and released (`width = height = 0`). It is shown as a `data:` URL.
   - `thumbFor(owner, S, doc, px)` looks in memory, then in `prefs` under `thumb:<owner>`, and draws only when the stored `sig` differs. `sig` is the FNV-1a 32-bit hash of `JSON.stringify([THUMB_VERSION, px, S, doc])`, so a rename doesn't redraw it but any change to settings or blocks does.
   - Before drawing it waits for the document's hands (`loadFont` for `S.font` and every block's own font). If one can't be fetched there is no thumbnail and nothing is kept, so it is tried again the next time. Photo paper also waits for its picture (`img.decode()` of `PHOTO_URL`).
   - Drawing happens one at a time, with a `setTimeout(0)` before each, and only for tiles near the view (`useNearViewport(ref, '100%')`). A job (wait for the hands, draw, encode, keep) ends once its record is written, and only then does the next one start.
   - The record keeps the laid-out page count, which Recent shows.
   - Storage that refuses a write still shows the picture for this session. Delete on Home calls `forgetThumb('doc:<id>')`.
7. **Home** (`max-w-[1080px]`, one column, `gap-8`, padding `px-4 py-6 wide:px-8 wide:py-10`).
   - The **hero** is a full-width button (`rounded-2xl border-2 border-dashed border-line-strong bg-surface py-12 wide:py-16`, a `FileUp` icon at 32 px in `text-primary`). It turns `border-primary bg-primary-soft` while a file is over the window, and opens the file picker.
   - **Start something new** is a grid of six cards: `grid-cols-2`, `sm:grid-cols-3`, `wide:grid-cols-6`, `gap-4`. Each card shows its page (`aspect-[210/297]`, a 1 px shadow ring, lifted 3 px on hover with `motion-safe:`), name and note.
   - **Recent** is M1's list (`divide-y`, one card): a 52 px thumbnail, the title (truncated) with the meta line under it, and the `⋯` menu.
   - The **footer line** comes last.
   - Dragging a file over the window shows M1's veil, and a drop anywhere opens Import with the file. While Import is open, a drop goes to the dialog.
8. **Phones (spec §7).**
   - Home at 390 px is one column, with the template grid two cards wide, and the page never scrolls sideways.
   - **The Import dialog is full screen below 860 px**: `top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0`. Its header is at the top, then one scrolling column (the file line, the toolbar sticky at the top, the preview at least `45dvh`, then the options), and its footer (Cancel, Write it out) is pinned at the bottom above the safe area.
   - It is not a vaul sheet: a sheet's drag fights text selection, and the on-screen keyboard moves it.
   - On wide screens it is a centred panel, `wide:h-[min(52rem,calc(100dvh-4rem))] wide:w-[min(68rem,calc(100vw-4rem))]`. The preview is on the left and the options in a 340 px column on the right, each scrolling on its own.
   - Opening never puts the focus in the editor (`onOpenAutoFocus` focuses the dialog itself), so a phone's keyboard doesn't cover the preview at once.

## Rulings on the spec, the prototype and carried decisions

- **Import is the hero, above the templates** (spec), not a seventh template-sized card as in the prototype.
- **Recent stays a list with small thumbnails** (prototype and M1), not a grid of large cards. At 52 px a page shows its paper and the shape of the writing.
- **Thumbnails and template cards are drawn by the engine** (spec §1). The prototype's CSS mini pages are not the product.
- **Thumbnails are kept in `prefs` (`thumb:<owner>`)**, so the database stays at version 1, and Recent shows the laid-out page count from them. `doc.pageCount` is only a minimum and is wrong after an import.
- **The look named in Recent** is `matchLook(S, S, [...STYLE_LOOKS, ...saved], true)`. It matches on hand, pen, ink and realism and ignores paper, so a Class notes document reads `Neat notes`. When nothing matches, the look is left out of the line.
- **Templates:** the six in the Templates table, with the prototype's names, notes and looks. Class notes is Neat notes on Grid paper, and Card is Letter with letter size 38 and its message in the middle of the page. The starter text is short, real structure, written in handwriting like any text. New document is a Blank page.
- **Add after the last page continues the block that ends on the last page**, or makes a new block (Design decision 3).
- **Replace keeps the export file name** (M1 set it to the file's name; M4 made it default to the title). A document's title changes only if it is `Untitled`.
- **Import from Home makes the document on Write it out**, not before (Design decision 1).
- **Formats:** as in the Formats table. **Word page breaks count as the file's pages** for "Start a new page where the file does" (mammoth `br[type='page'] => br.nib-page`). **An `.rtf` is never read as plain text** (M1 read `text/rtf` as text and showed its source). **A password PDF says so** (M1 compared pdf.js's numeric `code` and fell through to "couldn’t be read").
- **The Import dialog is full screen on phones** (Design decision 8).
- **The preview has no `/` menu**: the toolbar and the markdown shortcuts cover it. It has its own undo.
- **Crossing 860 px remounts the stage's panel (M3, M4 deferred to M6): M5 is not affected.** Home and the Import dialog switch layout with `wide:` classes only and never call `useWide()`, so nothing of theirs remounts at the crossing. Task 8 tests that the preview keeps its edits across it. The Style and Export panels' remount stays with M6.
- **M2's two deferred cases where a pushed block moves pages stay with M6, and M5 doesn't make them more likely.**
  - An import never creates a pushed part. Replace puts Main text below the Header, the geometry of the example document, which is laid out in every smoke run. Add after continues onto an empty page or uses an empty last page. Templates have at most a header above a main block.
  - A long import makes Main text longer. That is rule 1 (continuations), not rule 2 (push down).
  - What stays possible is what was possible before: a block the person adds that a growing block pushes off a page, and that only per page.
  - Task 2's tests lay out a 600-line import below a Header, as a new document and added after the last page, and assert that no part is pushed.
- **The Photo export look, page sizes other than A4, and images on pages** stay later (spec §10). Images in a Word file are dropped.

## Order and parallelism

A task starts once the tasks in its Needs column are merged. Tasks in the same wave touch disjoint files and can run in parallel worktrees.

| Wave | Tasks | Needs |
|---|---|---|
| 1 | **1** Importers: formats, messages and Word page breaks ∥ **2** Writing an import out, and new documents ∥ **3** Thumbnails drawn by the engine ∥ **4** The rich import preview ∥ **5** Import options | — |
| 2 | **6** Templates (2, 3) ∥ **7** Recent with thumbnails (3) ∥ **8** The Import dialog (1, 2, 4, 5) | as listed |
| 3 | **9** Home assembled, and Import from Home | 6, 7, 8 |
| 4 | **10** Smoke and README | all |

## File map (end of Milestone 5)

```
src/engine/importers.js, importers.d.ts, importers.test.ts      kinds, messages, Word page breaks           (Task 1)
scripts/fixtures.mjs, scripts/fixtures.d.mts                     .docx and text PDF fixtures (Node)          (Task 1)
src/features/doc/build.ts, build.test.ts                         newDocument, importInto, withLook, …        (Task 2)
src/features/import/apply.ts, apply.test.ts                      importIntoOpenDocument, importAsNewDocument (Task 2)
src/store/editor.ts (stateSnapshot, undoToState); src/features/home/actions.ts (createAndOpen(init))         (Task 2)
src/features/home/thumbs.ts, PageThumb.tsx, thumbs.test.ts, PageThumb.test.tsx                               (Task 3)
src/features/import/preview.ts, ImportPreview.tsx, preview.test.ts, ImportPreview.test.tsx                   (Task 4)
src/features/editor/extensions.ts (previewExtensions); src/features/editor/FormatToolbar.tsx (editor prop)   (Task 4)
src/features/import/options.ts, ImportOptions.tsx, ImportOptions.test.tsx                                    (Task 5)
src/features/home/templates.ts, TemplateGrid.tsx, templates.test.tsx, TemplateGrid.test.tsx; src/shell/TopBar.tsx (Task 6)
src/features/home/recent.ts, RecentList.tsx, recent.test.ts; HomePage.tsx (uses RecentList); HomePage.test.tsx (Task 7)
src/features/import/ImportDialog.tsx, ImportDialog.test.tsx; src/features/doc/DocumentView.tsx; doc/actions.ts (−writeOut), actions.test.ts (Task 8)
src/features/home/HomePage.tsx, HomePage.test.tsx, HomeImport.test.tsx; src/features/home/actions.ts (openImportPicker) (Task 9)
scripts/smoke.mjs, README.md                                                                                 (Task 10)
```

---

### Task 1: Importers: formats, messages and Word page breaks

**Files:**
- Modify: `src/engine/importers.js` (`readDocument`, `readDocx`, `htmlToMarks`, `importError` only), `src/engine/importers.d.ts`
- Create: `src/engine/importers.test.ts`, `scripts/fixtures.mjs`, `scripts/fixtures.d.mts`

**Interfaces:**
- Consumes: nothing from other tasks. `node:zlib` (`deflateRawSync`, `crc32`) in `scripts/fixtures.mjs` only.
- Produces:
  - `importers.d.ts`: `export type ImportCode = 'scan' | 'password' | 'locked' | 'doc' | 'rtf' | 'odt' | 'image' | 'type' | 'empty' | 'big' | 'lib' | 'read'`. `readDocument(file: File): Promise<ReadResult>` rejects with an `Error` whose `code` is an `ImportCode` (say so in its comment). `importError(code: string): string` is unchanged in shape. `ReadResult` in `types.ts` is unchanged.
  - `importers.js`:
    - Kind detection as the Formats table says: extension first, then MIME, with images and `rtf` before text, so `text/rtf` is never read as text.
    - For a `.docx`, the first four bytes `D0 CF 11 E0` give `locked`.
    - The catch checks `e.name === 'PasswordException'` **before** `e.code`, because pdf.js's `PasswordException.code` is the number 1. That gives `password`.
    - `words` is counted as the Formats table says.
    - `importError` has the table's messages, new and changed.
  - `readDocx` adds `"br[type='page'] => br.nib-page"` to mammoth's style map (checked against mammoth 1.8.0: it writes `<br class="nib-page" />`, even inside a heading). It returns `{ parts, pages: 0 }`, where `parts` is `htmlToMarks(dom.body)` split on the page mark, each part with its leading and trailing blank lines trimmed, and empty parts dropped.
  - `htmlToMarks`:
    - `inline()` turns `br.nib-page` into `\n` + `PAGE` + `\n`, where `PAGE = '\uE000'` (not `\f`, which `trim()` removes).
    - A `PAGE` inside a heading, list item, quote or table row ends that line there. The text before it stays in this part and what follows starts the next part as the same kind of line (a heading stays a heading).
    - A paragraph already splits on `\n`, so `PAGE` stands as a line of its own.
    - The blank line before a heading counts only lines in the current part.
  - `scripts/fixtures.mjs` (Node only; `scripts/fixtures.d.mts` declares these):
    - `zipOf(files: { name: string; data: string | Uint8Array }[]): Uint8Array`: deflated entries (method 8), dated 1980-01-01, as Word writes them.
    - `docxOf(bodyXml: string): Uint8Array`. The package has `[Content_Types].xml`, `_rels/.rels`, `word/_rels/document.xml.rels`, `word/document.xml`, `word/styles.xml` (paragraph styles `Title`, `Heading1` named `heading 1`, `Heading2` named `heading 2`, `ListParagraph`) and `word/numbering.xml` (`numId` 1 bullets `•`, `numId` 2 decimal `%1.`).
    - `w = { p(runs: string, o?: { style?: string; num?: 1 | 2 }): string, r(text: string, o?: { b?: boolean; u?: boolean; s?: boolean }): string, pageBreak: string }`.
    - `essayDocx(o?: { breakInParagraph?: boolean }): Uint8Array`, in this order:
      - `Title` `A Short Essay`; `Heading1` `Introduction`;
      - a paragraph `Water moves between ` + bold `rivers` + `, ` + underlined `seas` + ` and ` + struck `lakes` + ` all the time.`;
      - bullets `Evaporation`, `Condensation`; numbers `First`, `Second`;
      - a page break at the start of the `Heading1` `Conclusion` paragraph;
      - a paragraph `That is the water cycle.`
      - With `breakInParagraph`, there is no break before Conclusion. The last paragraph is `That is the` + page break + `water cycle.` instead.
    - `textPdf(pages: [size: number, y: number, text: string][][]): Uint8Array`: a PDF 1.4 with Helvetica (`/Type1`, not embedded), one `BT /F1 {size} Tf 72 {y} Td ({text}) Tj ET` per line, on 595 × 842 pages, and a correct xref.
    - `RIVERS_PAGES` = `[[[24, 760, 'Rivers and seas'], [12, 720, 'Water moves between rivers and seas all the time,'], [12, 705, 'and it rises into the air as vapour.']], [[12, 760, 'That is the water cycle.']]]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/importers.test.ts
// pdfjs-dist is mocked: `pdfFile(pages)` makes `getDocument` answer with those pages (items in pdf.js's shape).
// mammoth is the real browser build. The fetch stub records any request.
vi.mock('pdfjs-dist', () => ({ default: { GlobalWorkerOptions: {}, getDocument: vi.fn() } })); // the worker's `?url` import resolves to a URL under Vite and needs no mock
const item = (size: number, y: number, str: string) => ({ str, transform: [size, 0, 0, size, 72, y], width: str.length * size * 0.5, height: size, hasEOL: false });
const pdfFile = (pages: [number, number, string][][]) => { vi.mocked(lib.getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: pages.length, getPage: async (n: number) => ({ getTextContent: async () => ({ items: pages[n - 1].map(l => item(...l)) }), cleanup() {} }) }) } as never); return new File([new Uint8Array(4)], 'Rivers.pdf', { type: 'application/pdf' }); };
const codeOf = (p: Promise<unknown>) => p.then(() => 'read ok', (e: { code?: string }) => e.code);
const ESSAY_1 = '# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.\n- Evaporation\n- Condensation\n1. First\n2. Second';
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

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
```
(`lib` is the mocked `pdfjs-dist` default export, typed as `{ getDocument: Mock }`. `RIVERS_PAGES`, `essayDocx`, `docxOf` and `w` come from `../../scripts/fixtures.mjs`. Reset the `getDocument` mock in `beforeEach`, and unstub globals in `afterEach`.)

- [ ] **Step 2: Run** `npx vitest run src/engine/importers.test.ts`. Expected: FAIL (the fixtures module is missing, then the new codes, the Word page break, the password code and the word count).
- [ ] **Step 3: Implement** `scripts/fixtures.mjs` and `.d.mts` first, then the `importers.js` changes in the Interfaces. Don't touch any other function in the file.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build` and `npm run smoke`. Then `git diff --stat -- src/engine` lists only `importers.js`, `importers.d.ts` and `importers.test.ts`.
- [ ] **Step 5: Commit** `feat(import): every kind of file says what happens to it; Word page breaks start a new page; password PDFs say so`

---

### Task 2: Writing an import out, and new documents

**Files:**
- Create: `src/features/doc/build.ts`, `src/features/doc/build.test.ts`, `src/features/import/apply.ts`, `src/features/import/apply.test.ts`
- Modify: `src/store/editor.ts` (two exports), `src/features/home/actions.ts` (`createAndOpen` takes what to create)

**Interfaces:**
- Consumes: `use`, `geom`, `snapY` (`@/engine/core.js`); `headerText`, `cleanSettings`, `DEFAULT_NAMES` (`@/engine/doc.js`); `layoutFor` (`@/features/doc/model`); `newBlockName`, `nextColor` (`@/features/doc/blocks`); `lookPatch`, `STYLE_LOOKS` (`@/features/style/looks`); `SavedLook` (`@/features/style/prefs`); `step` (`@/features/doc/actions`); `update`, `toast`, `useEditor`, `docAction` (store); `createDoc` (`@/store/documents`).
- Produces:
  - `build.ts`:
    - `interface ImportPlace { where: 'replace' | 'append'; look: SavedLook | null; header: HeaderFields | null }`.
    - `interface Imported { S: Settings; doc: EngineDoc; target: Box; firstPage: number; joined: boolean }`.
    - `geomFor(S: Settings): Geom`: `use(S, empty)`, `geom()`, then `use` back on the store's `S` and `doc`.
    - `withLook(S: Settings, look: SavedLook | null): Settings`: `look ? { ...S, ...lookPatch(look, false) } : S` (the same object when `null`).
    - `headerBlock(doc: EngineDoc, S: Settings, fields: HeaderFields): Box`. It is not added to `doc`. `kind 'header'`, name `DEFAULT_NAMES.header`, `color nextColor(doc)`, `page 0`, `x 446`, `y top − gap`, `w 320`, `fields` copied with each value at most 80 characters on one line, `text headerText(fields)`.
    - `mainBlock(doc: EngineDoc, S: Settings, text: string, below: Box | null): Box`. It is not added to `doc`. `kind 'text'`, name `newBlockName(doc, 'text')`, `color nextColor(doc)`, `page 0`, `x left`, `w right − left`. `y` is `below.y + lines(below.text) × gap` when `below?.page === 0`, else `snapY(top − gap)`.
    - `newDocument(S: Settings, text: string, header: HeaderFields | null): EngineDoc` = `{ pageCount: 1, fileName: '', boxes: [header?, main] }`.
    - `endingBlock(L: Layout, doc: EngineDoc): Box | null`: of the text blocks (`kind 'text'`) whose last part is on page `L.pages − 1`, the one whose last part's `bottom` is lowest.
    - `importInto(S: Settings, doc: EngineDoc, text: string, place: ImportPlace): Imported`, per Design decision 3. It works on `structuredClone(doc)` and never changes its arguments. It lays the copy out with the look applied, then puts the engine back with `use` on the store's document (the caller's `update` lays it out).
  - `editor.ts`:
    - `stateSnapshot(): string`, the same JSON `update` records (`S`, `doc`, `title`).
    - `undoToState(snap: string): ToastAction` = `docAction('Undo', …)`. It puts back `S`, `doc` (cleaned) and `title` as one step (`history: 'undo-to'`), clears a selection that is gone and the measure cache, as `restore` does. Refactor `restore` to take the history key, so both share it.
  - `home/actions.ts`: `CANT_CREATE` (exported, M1's text). `createAndOpen(init: { title?: string; settings?: Settings; doc?: EngineDoc } = {}): Promise<boolean>` creates through `createDoc(init)` and opens it on Write. On failure it says `CANT_CREATE` and gives `false`. M1's `importIntoNewDoc` keeps working until Task 9.
  - `apply.ts`:
    - `interface ImportRequest { text: string; name: string; place: ImportPlace }`.
    - `WRITTEN = 'Written out. Each page’s part can be moved, resized, edited or split off on its own.'`.
    - `addedMessage(block: string, joined: boolean): string`, per Interface copy.
    - `importIntoOpenDocument(r: ImportRequest): void`. It takes `stateSnapshot()`, then makes one `update` with `history: step('import')`, which sets `S`, `doc` and (if `Untitled` and `r.name`) `title`, sets `selectedId` to the target, `scope 'all'`, `scrollToPage` to `firstPage`, and clears the measure cache. Then `toast(replace ? WRITTEN : addedMessage(target.name, joined), undoToState(snap))`.
    - `importAsNewDocument(r: ImportRequest): Promise<boolean>`. With `S = withLook(cleanSettings(null, false), r.place.look)`, it calls `createAndOpen({ title: r.name || 'Untitled', settings: S, doc: newDocument(S, r.text, r.place.header) })`, then `toast(WRITTEN)` when that worked.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/doc/build.test.ts (the canvas stub's geometry: gap 34, top 110, left 112, right 742)
const S = cleanSettings(null, false), journal = STYLE_LOOKS.find(l => l.id === 'journal')!;
const partsOf = (L: Layout, id: string) => L.segs.filter(s => s.box.id === id).map(s => [s.page, s.idx]);
const append = (doc: EngineDoc, text = 'x', look: SavedLook | null = null) => importInto(S, doc, text, { where: 'append', look, header: null });
test('a new document is one main block, from the top line of page 1', () => {
  expect(newDocument(S, 'Hello', null)).toEqual({ pageCount: 1, fileName: '', boxes: [expect.objectContaining({ kind: 'text', name: 'Main text', color: 0, page: 0, x: 112, y: 76, w: 630, text: 'Hello', style: {}, frames: {}, shuffle: 0 })] });
});
test('with a header, Name, Class and Date sit at the top right of page 1 and the main block starts on the line below them', () => {
  const d = newDocument(S, 'Hello', { name: 'Asha', class: '8-B', date: '7 November 2026' });
  expect(d.boxes.map(b => [b.kind, b.name, b.color, b.page, b.x, b.y, b.w])).toEqual([['header', 'Header', 0, 0, 446, 76, 320], ['text', 'Main text', 1, 0, 112, 178, 630]]);
  expect([d.boxes[0].fields, d.boxes[0].text]).toEqual([{ name: 'Asha', class: '8-B', date: '7 November 2026' }, 'Name: Asha\nClass: 8-B\nDate: 7 November 2026']);
  expect(layoutOf(d, S).segs.some(s => s.pushed)).toBe(false);
});
test('a long import is one block that flows page by page, nothing pushed', () => {
  const d = newDocument(S, lines(600), { name: '', class: '', date: 'x' }), L = layoutOf(d, S), main = partsOf(L, d.boxes[1].id);
  expect(main.length).toBeGreaterThan(15); expect(main).toEqual(main.map((_, i) => [i, i])); expect(L.segs.some(s => s.pushed)).toBe(false);
});
test('a look comes with an import, paper and all, and the settings given are left alone', () => {
  const before = structuredClone(S);
  expect(withLook(S, journal)).toMatchObject({ font: 'caveat', tip: 'felt', ink: 'purple', paper: 'yellow', mess: 45 });
  expect(S).toEqual(before); expect(withLook(S, null)).toBe(S);
});
const withHeader = () => docOf(
  box({ id: 'h', kind: 'header', name: 'Header', x: 446, y: 76, w: 320, fields: { name: 'A', class: 'B', subject: 'Maths', date: 'C' }, text: 'Name: A\nClass: B\nSubject: Maths\nDate: C' }),
  box({ id: 'm', name: 'Main text', color: 1, y: 212, text: lines(40) }), box({ id: 'n', kind: 'note', name: 'Margin note', color: 2, page: 1, x: 520, w: 220, text: 'note' }));
test('Replace: the file’s text becomes the main text, and the header stays only if asked for, with the fields given', () => {
  const d = { ...withHeader(), fileName: 'week 1' }, given = JSON.stringify(d);
  const r = importInto(S, d, 'New', { where: 'replace', look: null, header: { name: 'Asha', class: 'B', subject: 'Maths', date: 'C' } });
  expect(r.doc.boxes.map(b => [b.id === 'h', b.kind, b.name])).toEqual([[true, 'header', 'Header'], [false, 'text', 'Main text']]);
  expect(r.doc.boxes[0].fields).toEqual({ name: 'Asha', class: 'B', subject: 'Maths', date: 'C' });
  expect(r.doc.boxes[1]).toMatchObject({ y: 76 + 4 * 34, text: 'New', color: 1 });
  expect([r.doc.pageCount, r.doc.fileName, r.firstPage, r.joined, r.target]).toEqual([1, 'week 1', 0, false, r.doc.boxes[1]]);
  expect(importInto(S, d, 'New', { where: 'replace', look: null, header: null }).doc.boxes.map(b => [b.kind, b.y])).toEqual([['text', 76]]);
  expect(JSON.stringify(d)).toBe(given);
});
test('Add after the last page carries on the text block that ends there, from the top of a new page', () => {
  const d = docOf(box({ id: 'm', name: 'Main text', text: lines(40) })), r = append(d, 'New\nmore');
  expect([r.joined, r.target.id, r.firstPage, r.doc.boxes.length, r.target.text]).toEqual([true, 'm', 2, 1, lines(40) + '\n\\newpage\nNew\nmore']);
  const L = layoutOf(r.doc, S);
  expect(partsOf(L, 'm')).toEqual([[0, 0], [1, 1], [2, 2]]); expect(r.target.text.slice(frameRange(r.target, 2)[0])).toBe('New\nmore');
  expect(L.segs.some(s => s.pushed)).toBe(false); expect(d.boxes[0].text).toBe(lines(40));
});
test('…the block whose writing ends lowest on the last page', () => expect(append(docOf(box({ id: 'a', name: 'Main text', w: 300, text: lines(5) }), box({ id: 'b', name: 'Text block', color: 1, x: 440, w: 300, text: lines(12) }))).target.id).toBe('b'));
test('…trailing blank lines and page breaks of its own leave no empty page', () => {
  expect(append(docOf(box({ id: 'm', text: 'abc\n\n' }))).target.text).toBe('abc\n\\newpage\nx');
  const r = append(docOf(box({ id: 'm', text: 'abc\n\\newpage\n' }))); expect([r.target.text, r.firstPage]).toEqual(['abc\n\\newpage\nx', 1]);
});
test('…an empty main block just takes the text, where it is', () => { const r = append(docOf(box({ id: 'm', name: 'Main text', text: '' }))); expect([r.target.id, r.target.text, r.firstPage, r.joined]).toEqual(['m', 'x', 0, true]); });
test('when no text block ends on the last page, the text is a new block on a new page after it', () => {
  const r = append(docOf(box({ id: 'm', name: 'Main text', text: 'short' }), box({ id: 'n', kind: 'note', name: 'Margin note', color: 1, page: 1, x: 520, w: 220, text: 'note' })));
  expect([r.joined, r.firstPage, r.doc.pageCount]).toEqual([false, 2, 3]);
  expect(r.target).toMatchObject({ kind: 'text', name: 'Text block', color: 2, page: 2, x: 112, y: 76, w: 630, text: 'x' });
});
test('…or on the last page itself when that page is blank', () => { const r = append({ ...docOf(box({ id: 'm', name: 'Main text', text: 'short' })), pageCount: 2 }); expect([r.target.page, r.firstPage, r.doc.pageCount]).toEqual([1, 1, 2]); });
test('Add after the last page takes no header, and brings the look', () => { const r = importInto(S, docOf(box({ id: 'm', text: 'a' })), 'x', { where: 'append', look: journal, header: { name: 'A', class: '', date: '' } }); expect([r.doc.boxes.map(b => b.kind), r.S.font]).toEqual([['text'], 'caveat']); });
test('a long import added after the last page pushes nothing', () => { const d = withHeader(); d.boxes.pop(); /* not the margin note, which Main text's page 2 part already pushes */ const r = append(d, lines(600)); const L = layoutOf(r.doc, r.S); expect(L.segs.some(s => s.pushed)).toBe(false); const m = partsOf(L, 'm'); expect(m).toEqual(m.map((_, i) => [i, i])); });

// src/features/import/apply.test.ts (sonner mocked as in M2; `@/store/documents` mocked as { ...actual, createDoc: vi.fn(actual.createDoc) }; fake-indexeddb; fontsLoad())
const req = (p: Partial<ImportPlace> = {}, text = '# Essay\nHello'): ImportRequest => ({ text, name: 'Essay', place: { where: 'replace', look: null, header: null, ...p } });
test('into the open document: one undo step, which puts back the settings, the blocks and the title', () => {
  openDocument(rec('Untitled', docOf(box({ id: 'm', text: 'old' })))); const before = JSON.stringify({ S: get().S, doc: get().doc });
  importIntoOpenDocument(req({ look: journal }));
  expect([get().title, get().S.font, get().doc.boxes.map(b => b.text), get().selectedId]).toEqual(['Essay', 'caveat', ['# Essay\nHello'], get().doc.boxes[0].id]);
  undo(); expect(JSON.stringify({ S: get().S, doc: get().doc })).toBe(before); expect([get().title, get().canUndo]).toEqual(['Untitled', false]);
});
test('a document with a name keeps it', () => { openDocument(rec('Week 1', docOf(box()))); importIntoOpenDocument(req()); expect(get().title).toBe('Week 1'); });
test('the message says what happened, and its Undo puts it all back', () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); importIntoOpenDocument(req({ where: 'append', look: journal }));
  expect([lastToast(), get().scrollToPage]).toEqual(['Added after the last page, carrying on “Main text”.', 2]);
  act(() => lastToastAction()!()); expect([get().doc.boxes[0].text, get().S.font]).toEqual([lines(40), 'labelle']);
  importIntoOpenDocument(req()); expect(lastToast()).toBe('Written out. Each page’s part can be moved, resized, edited or split off on its own.');
});
test('…and names a block of its own', () => { open({ ...docOf(box({ id: 'm', name: 'Main text', text: 'a' })), pageCount: 2 }); importIntoOpenDocument(req({ where: 'append' })); expect(lastToast()).toBe('Added after the last page as “Text block”.'); });
test('as a new document: opened on Write, named after the file, with its look and header, and nothing to undo', async () => {
  location.hash = '#/'; const notes = STYLE_LOOKS.find(l => l.id === 'notes')!;
  expect(await importAsNewDocument(req({ look: notes, header: { name: 'Asha', class: '', date: '7 November 2026' } }))).toBe(true);
  expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' });
  expect([get().title, get().S.font, get().S.paper, get().doc.boxes.map(b => b.kind), get().canUndo]).toEqual(['Essay', 'patrick', 'ruled', ['header', 'text'], false]);
  expect((await getDoc(get().docId!))?.doc.boxes[1].text).toBe('# Essay\nHello'); expect(lastToast()).toBe('Written out. Each page’s part can be moved, resized, edited or split off on its own.');
});
test('a file with no name of its own makes an Untitled document', async () => { await importAsNewDocument({ ...req(), name: '' }); expect(get().title).toBe('Untitled'); });
test('when this device can’t store documents, it says so and nothing opens', async () => {
  location.hash = '#/'; vi.mocked(createDoc).mockRejectedValueOnce(new Error('blocked'));
  expect(await importAsNewDocument(req())).toBe(false); expect([lastToast(), location.hash]).toEqual(['Nib can’t create documents on this device right now.', '#/']);
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/doc/build.test.ts src/features/import/apply.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `build.ts`, the two `editor.ts` exports, `createAndOpen(init)` and `apply.ts`. A line ends in `\newpage` when it matches `/^\\newpage[ \t]*$/`.
- [ ] **Step 4: Run** `npm test` (the M1 `writeOut` tests still pass, because Task 8 removes `writeOut`), `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(import): an import becomes one main block that replaces the pages or carries on from the last one, in one undo step with its look`

---

### Task 3: Thumbnails drawn by the engine

**Files:**
- Create: `src/features/home/thumbs.ts`, `src/features/home/PageThumb.tsx`, `src/features/home/thumbs.test.ts`, `src/features/home/PageThumb.test.tsx`

**Interfaces:**
- Consumes: `use`, `computeLayout`, `composePage`, `loadFont`, `fontStr`, `PHOTO_URL` (`@/engine/core.js`); `FONTS`, `PAGE_W`, `PAGE_H` (`@/engine/config.js`); `encodeCanvas` (`@/features/export/render`, M4); `getPref`, `setPref` (`@/store/documents`); `useEditor`; `useNearViewport` (`@/features/pages/useNearViewport`); `paperTint` (`@/features/style/HandSample`).
- Produces:
  - `thumbs.ts`:
    - Constants: `THUMB_VERSION = 1`, `RECENT_PX = 156`, `TEMPLATE_PX = 360`, `THUMB_JPEG = 0.82`.
    - `interface Thumb { url: string; pages: number }`.
    - `thumbSig(S: Settings, doc: EngineDoc, px: number): string`: an 8-digit hex FNV-1a of `JSON.stringify([THUMB_VERSION, px, S, doc])`.
    - `handsOf(S, doc): string[]`: `S.font`, then each block's own `style.font`, without repeats, kept only when in `FONTS`.
    - `drawThumb(S, doc, px): { canvas: HTMLCanvasElement; pages: number }`, synchronous, per Design decision 6, with the engine put back in a `finally`.
    - `peekThumb(owner: string, sig: string): Thumb | null`, from memory.
    - `thumbFor(owner, S, doc, px): Promise<Thumb | null>`. It never rejects. It goes memory → `getPref('thumb:' + owner)` (a stored value of the wrong shape is ignored) → a queued draw. A draw waits for every hand (`loadFont` and `document.fonts?.load(fontStr(cfg, 40))`) and gives `null` if one fails. It encodes the canvas, releases it, stores `{ sig, jpeg, pages }` (a refused write is ignored) and keeps the result in memory.
    - `forgetThumb(owner): Promise<void>`: from memory and `prefs` (a failure is ignored).
    - `clearThumbMemory(): void` (for tests).
    - `dataUrl(bytes: Uint8Array, type: string): string`: base64 through `btoa`, in chunks of 32,768 bytes.
  - `PageThumb.tsx`: `PageThumb({ owner, S, doc, px, onPages, className }: { owner: string; S: Settings; doc: EngineDoc; px: number; onPages?(pages: number): void; className?: string })`.
    - It renders `<span data-owner={owner}>` (`block aspect-[210/297] overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]`, background `paperTint(S.paper)`).
    - Inside, once it is drawn, it holds `<img src={url} alt="" draggable={false} className="block size-full">`. A kept thumbnail (`peekThumb`) shows at once.
    - It asks `thumbFor` only while near the view (`useNearViewport(ref, '100%')`) and calls `onPages` with the page count.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/home/thumbs.test.ts (`@/engine/core.js` partly mocked: composePage and computeLayout are vi.fn(actual);
// `actual` is `await vi.importActual('@/engine/core.js')`; `@/store/documents` mocked as { ...actual, setPref: vi.fn(actual.setPref) }; fake-indexeddb;
// beforeEach: clearThumbMemory(), clear prefs, fontsLoad(), mockClear; afterEach: vi.unstubAllGlobals() after a test stubs IntersectionObserver)
const S = cleanSettings(null, false), two = () => docOf(box({ id: 'm', text: lines(40) }));
test('page 1 is drawn by the engine, at the size asked, with the page count', () => {
  const { canvas, pages } = drawThumb(S, two(), 156);
  expect(composePage).toHaveBeenCalledWith(0, 156); expect([canvas.width, canvas.height, pages]).toEqual([156, 221, 2]);
});
test('drawing one leaves the engine on the open document, laid out', () => {
  open(docOf(box({ id: 'o', text: 'open' }))); drawThumb(S, two(), 156);
  expect(settings).toBe(get().S); expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('on Home, with no document open, it isn’t laid out again for nothing', async () => {
  open(docOf(box())); await closeDocument(); vi.mocked(computeLayout).mockClear();
  drawThumb(S, two(), 156); expect(computeLayout).toHaveBeenCalledTimes(1); expect(settings).toBe(get().S);
});
test('a thumbnail is kept on the device, and drawn again only when page 1’s document changes', async () => {
  const d = two();
  expect(await thumbFor('doc:x', S, d, 156)).toEqual({ url: expect.stringMatching(/^data:image\/jpeg;base64,/), pages: 2 });
  expect(await getPref('thumb:doc:x')).toEqual({ sig: thumbSig(S, d, 156), jpeg: expect.any(Uint8Array), pages: 2 });
  await thumbFor('doc:x', S, d, 156); clearThumbMemory(); await thumbFor('doc:x', S, structuredClone(d), 156);
  expect(composePage).toHaveBeenCalledTimes(1);
  await thumbFor('doc:x', { ...S, ink: 'red' }, d, 156); expect(composePage).toHaveBeenCalledTimes(2);
});
test('it waits for the hands, and with a hand that can’t be fetched there is none and nothing is kept', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
  const Z = { ...S, font: 'zeyada' };
  expect(await thumbFor('doc:y', Z, two(), 156)).toBeNull(); expect(composePage).not.toHaveBeenCalled(); expect(await getPref('thumb:doc:y')).toBeUndefined();
  fontsLoad(); expect(await thumbFor('doc:y', Z, two(), 156)).not.toBeNull(); // tried again next time
});
test('a block’s own hand counts too', () => expect(handsOf(S, docOf(box({ style: { font: 'caveat' } }), box({ id: 'b2', style: { font: 'caveat' } })))).toEqual(['labelle', 'caveat']));
test('storage that won’t keep it still shows it', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); expect(await thumbFor('doc:z', S, two(), 156)).not.toBeNull(); });
test('forgetThumb takes it off the device', async () => { const d = two(); await thumbFor('doc:w', S, d, 156); await forgetThumb('doc:w'); expect([await getPref('thumb:doc:w'), peekThumb('doc:w', thumbSig(S, d, 156))]).toEqual([undefined, null]); });
test('one at a time: the second is drawn after the first is kept', async () => {
  const events: string[] = [];
  vi.mocked(composePage).mockImplementation((i, px) => { events.push('draw'); return actual.composePage(i, px); }); vi.mocked(setPref).mockImplementation(async k => { events.push('keep ' + k); });
  await Promise.all([thumbFor('doc:a', S, two(), 156), thumbFor('doc:b', S, two(), 156)]);
  expect(events).toEqual(['draw', 'keep thumb:doc:a', 'draw', 'keep thumb:doc:b']);
});
test('the signature follows what page 1 is drawn from, not the title', () => { const d = two(); expect(thumbSig(S, d, 156)).toBe(thumbSig(S, structuredClone(d), 156)); expect(thumbSig(S, d, 360)).not.toBe(thumbSig(S, d, 156)); expect(thumbSig(S, { ...d, boxes: [{ ...d.boxes[0], text: 'x' }] }, 156)).not.toBe(thumbSig(S, d, 156)); });

// src/features/home/PageThumb.test.tsx (fake-indexeddb; fontsLoad(); clearThumbMemory() in beforeEach)
test('the paper’s colour until page 1 is drawn, then the picture, and the page count', async () => {
  const onPages = vi.fn(), { container } = render(<PageThumb owner="doc:p" S={S} doc={two()} px={156} onPages={onPages} />);
  const tile = container.querySelector<HTMLElement>('[data-owner="doc:p"]')!;
  expect(tile.style.background).toBe('rgb(251, 251, 247)'); expect(tile.querySelector('img')).toBeNull();
  await waitFor(() => expect(tile.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg;base64,/)));
  expect(tile.querySelector('img')).toHaveAttribute('alt', ''); expect(onPages).toHaveBeenCalledWith(2);
});
test('a thumbnail already kept shows at once', async () => { const d = two(); await thumbFor('doc:q', S, d, 156); const { container } = render(<PageThumb owner="doc:q" S={S} doc={d} px={156} />); expect(container.querySelector('img')).not.toBeNull(); });
test('one far out of view waits until it comes near', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} }); // never intersecting
  render(<PageThumb owner="doc:r" S={S} doc={two()} px={156} />); await act(() => new Promise(r => setTimeout(r, 50)));
  expect(await getPref('thumb:doc:r')).toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/home/thumbs.test.ts src/features/home/PageThumb.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `thumbs.ts` and `PageThumb.tsx`. The queue is a module-level promise chain: the memory and `prefs` look-ups happen before a job is queued, and a job ends once its record is written. Each job checks before drawing that its tile still wants it. A Photo paper document waits for `img.decode()` of `PHOTO_URL`; a failure gives `null`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`. Then `grep -rn "toBlob\|createObjectURL" src/features/home` gives no output.
- [ ] **Step 5: Commit** `feat(home): thumbnails of page 1 drawn by the engine, kept on the device and redrawn only when the page changes`

---

### Task 4: The rich import preview

**Files:**
- Create: `src/features/import/preview.ts`, `src/features/import/ImportPreview.tsx`, `src/features/import/preview.test.ts`, `src/features/import/ImportPreview.test.tsx`
- Modify: `src/features/editor/extensions.ts` (export `previewExtensions`), `src/features/editor/FormatToolbar.tsx` (an `editor` prop)

**Interfaces:**
- Consumes: `BLOCK_EXTENSIONS` (`./schema`); `fromMarkup`, `toMarkup` (`./markup`); `cleanPastedHTML` (`./paste`); `UndoRedo`, `Placeholder` (`@tiptap/extensions`); `EditorContent`, `useEditor as useTiptap` (`@tiptap/react`); `editor.css` (`nib-prose`).
- Produces:
  - `extensions.ts`: `previewExtensions(placeholder: string): AnyExtension[]` = `[...BLOCK_EXTENSIONS, UndoRedo, BlockKeys, UnderlineStar, ListMarkers, Placeholder.configure({ placeholder }), ConverterSync]`. That is today's pieces, minus `AppHistory` and `Slash`. `editorExtensions` is unchanged.
  - `FormatToolbar({ className, editor })`: with `editor` given (an `Editor` or `null`) it formats that editor. Without it, it formats the active editor, as now. Every M2 toolbar test passes unchanged.
  - `preview.ts`:
    - `cleanParts(parts: string[]): string[]`: each part without its leading blank lines and trailing whitespace (keeping the first line's indent), empty ones dropped.
    - `importText(parts: string[], breaks: boolean): string` = `cleanParts(parts).join(breaks ? '\n\\newpage\n' : '\n\n')`.
    - `previewContent(parts, breaks): { doc: JSONContent; seps: number[] }`: each cleaned part's `fromMarkup(part).content`, with a separator node between parts (an empty `paragraph`, or `pageBreak` with `breaks`). `seps` holds the separators' top-level indices.
    - `FileBreaks` (an `Extension` named `nibFileBreaks`): plugin state `number[]` (separator positions), set by a meta and mapped through every transaction with `assoc 1`.
    - `loadPreview(editor: Editor, parts: string[], breaks: boolean): void`: `setContent(doc, { emitUpdate: false })`, then the positions of `seps` (from the top-level children's offsets) through the meta. The load is a transaction with `addToHistory: false`, so the preview's first Ctrl+Z can't empty it.
    - `setFileBreaks(editor: Editor, on: boolean): void`: one transaction with `addToHistory: false`, from the last position to the first.
      - On: an empty paragraph at a position becomes a `pageBreak`. A `pageBreak` stays. Any other node gets a `pageBreak` put in before it.
      - Off: a `pageBreak` at a position becomes an empty paragraph.
  - `ImportPreview.tsx`:
    - `interface PreviewHandle { markup(): string; editor: Editor }`.
    - `ImportPreview({ parts, breaks, ref }: { parts: string[]; breaks: boolean; ref?: Ref<PreviewHandle> })`.
    - It loads when `parts` changes (identity) and calls `setFileBreaks` when `breaks` changes.
    - Layout: the label `<p>` (Interface copy), then `<FormatToolbar editor={editor} className="sticky top-0 z-10 flex-nowrap overflow-x-auto bg-surface" />`, then the editor in `nib-editor` (`min-h-[45dvh] flex-1 px-4 py-3 wide:min-h-0 wide:overflow-y-auto`).
    - The editor's attributes are `role textbox`, `aria-multiline`, `aria-label "Imported text"`, `class nib-prose`, `spellcheck true`, with `transformPastedHTML: cleanPastedHTML`, `immediatelyRender: true` and `shouldRerenderOnTransaction: false`. It never takes the focus by itself.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/import/preview.test.ts
test('the file’s pages are joined by a blank line, or by a page break', () => {
  expect(importText(['a\n', '\n\nb  ', '   ', 'c'], false)).toBe('a\n\nb\n\nc'); expect(importText(['a', 'b'], true)).toBe('a\n\\newpage\nb'); expect(importText(['  - x'], false)).toBe('  - x');
});
test('the preview’s content is the markup the import writes', () => {
  const P = ['# T\n- a\n- b', '- c\n1. d', '> q'];
  for (const b of [false, true]) expect(toMarkup(previewContent(P, b).doc)).toBe(importText(P, b));
  expect(previewContent(P, false).seps).toEqual([2, 5]);
});

// src/features/import/ImportPreview.test.tsx (sonner mocked; `handle` is the ref Harness passes)
const ESSAY = ['# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.\n- Evaporation\n- Condensation\n1. First\n2. Second', '## Conclusion\nThat is the water cycle.'];
let handle: RefObject<PreviewHandle | null>;
function Harness({ breaks = false }: { breaks?: boolean }) { handle = useRef<PreviewHandle>(null); return <ImportPreview parts={ESSAY} breaks={breaks} ref={handle} />; }
const md = () => handle.current!.markup();
/** The separator between the file's two parts: the node right after the numbered list (part 1 has a blank line of its own, which isn't one). */
const sepAt = (ed: Editor) => { let at = -1, prev = ''; ed.state.doc.forEach((n, off) => { if (prev === 'orderedList') at = off; prev = n.type.name; }); return at; };
test('the preview shows what will come across: a title, headings, bold, underline, crossed-out words and lists', () => {
  render(<Harness />); const tb = screen.getByRole('textbox', { name: 'Imported text' });
  expect(within(tb).getByRole('heading', { level: 1 })).toHaveTextContent('A Short Essay');
  expect(within(tb).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Introduction', 'Conclusion']);
  expect([tb.querySelector('strong')?.textContent, tb.querySelector('u')?.textContent, tb.querySelector('s')?.textContent]).toEqual(['rivers', 'seas', 'lakes']);
  expect(within(tb).getAllByRole('listitem')).toHaveLength(4); expect(md()).toBe(importText(ESSAY, false));
  expect(screen.getByText('Check the text and change anything before it’s written out')).toBeInTheDocument(); expect(document.activeElement).toBe(document.body);
});
test('Start a new page where the file does swaps the separators and keeps what was typed', () => {
  const { rerender } = render(<Harness />); rerender(<Harness breaks />); expect(md()).toBe(importText(ESSAY, true));
  act(() => { handle.current!.editor.commands.insertContentAt(1, 'Draft: '); }); rerender(<Harness breaks={false} />);
  expect(md()).toBe(importText(ESSAY, false).replace('# A Short Essay', '# Draft: A Short Essay'));
});
test('…and a separator that was deleted gets its page break where it was', () => {
  const { rerender } = render(<Harness />); const ed = handle.current!.editor, at = sepAt(ed);
  act(() => { ed.commands.deleteRange({ from: at, to: at + 2 }); }); rerender(<Harness breaks />);
  expect(md()).toContain('2. Second\n\\newpage\n## Conclusion');
});
test('the page-break switch isn’t a step of the preview’s undo', async () => {
  const user = userEvent.setup(), { rerender } = render(<Harness />); await user.click(screen.getByRole('textbox', { name: 'Imported text' }));
  rerender(<Harness breaks />); await user.keyboard('{Control>}z{/Control}'); expect(md()).toBe(importText(ESSAY, true));
});
test('Ctrl+Z undoes typing in the preview, never the document', async () => {
  const user = userEvent.setup(); open(docOf(box({ id: 'm', text: 'mine' }))); render(<Harness />);
  await user.click(screen.getByRole('textbox', { name: 'Imported text' })); await user.keyboard('xyz'); expect(md()).toContain('xyz');
  await user.keyboard('{Control>}z{/Control}'); expect(md()).toBe(importText(ESSAY, false));
  expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine', false]);
});
test('pasting from Word or Google Docs keeps the formatting markup can say', () => {
  render(<Harness />); const ed = handle.current!.editor; act(() => { ed.commands.setTextSelection(ed.state.doc.content.size - 1); ed.view.pasteHTML('<b style="font-weight:normal"><p><b>bold</b> <u>under</u></p></b>'); });
  expect(md()).toContain('**bold**'); expect(md()).toContain('*under*');
});
test('the formatting tools act on the preview', async () => {
  const user = userEvent.setup(); render(<Harness />); const ed = handle.current!.editor;
  act(() => { const p = posOfText(ed, 'Second'); ed.chain().focus().setTextSelection({ from: p, to: p + 6 }).run(); });
  await user.click(within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Bold' })); expect(md()).toContain('2. **Second**');
});
```
(`posOfText(ed, word)` is a small local helper that walks `ed.state.doc.descendants` to the text node holding `word` and returns its position.)

- [ ] **Step 2: Run** `npx vitest run src/features/import/preview.test.ts src/features/import/ImportPreview.test.tsx src/features/editor`. Expected: the new tests FAIL, and every editor test passes.
- [ ] **Step 3: Implement** `previewExtensions`, the toolbar's `editor` prop, `preview.ts` and `ImportPreview.tsx`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(import): a rich, editable preview with its own undo; page breaks where the file has them, even after editing`

---

### Task 5: Import options

**Files:**
- Create: `src/features/import/options.ts`, `src/features/import/ImportOptions.tsx`, `src/features/import/ImportOptions.test.tsx`

**Interfaces:**
- Consumes: `STYLE_LOOKS`, `lookPatch` (`@/features/style/looks`); `useStylePrefs`, `SavedLook` (`@/features/style/prefs`); `HandSample`, `paperTint` (`@/features/style/HandSample`); `Group`, `Hint` (`@/features/style/parts`); `today` (`@/features/doc/model`); `RadioGroup`, `RadioGroupItem`, `Checkbox`, `Input`, `Label` (`ui/`); `RadioGroup` from `radix-ui` for the look cards.
- Produces:
  - `options.ts`:
    - `type ImportTarget = 'new' | 'open'`.
    - `interface ImportOptionsValue { where: 'replace' | 'append'; breaks: boolean; look: string | null; header: HeaderFields | null }`.
    - `initialOptions(target: ImportTarget, doc: EngineDoc | null, now = new Date()): ImportOptionsValue`. For `new` it is `{ where: 'replace', breaks: false, look: 'exam', header: null }`. For `open` it is `{ where: 'replace', breaks: false, look: null, header: <a copy of the document's header fields> ?? null }`.
    - `lookById(id: string | null): SavedLook | null`: from `STYLE_LOOKS`, then the saved looks; `null` for `null` or an unknown id.
  - `ImportOptions({ target, value, onChange, fileParts, base }: { target: ImportTarget; value: ImportOptionsValue; onChange(v: ImportOptionsValue): void; fileParts: number; base: Settings })`, a controlled column of `Group`s (h3s) in this order:
    - `Where it goes` (`open` only): the radio group, and with Add after its hint.
    - `Start a new page where the file does` (when `fileParts > 1`): one checkbox under a group titled `Pages`.
    - `Look`: a `radix-ui` `RadioGroup.Root` (`aria-label="Look"`, `grid grid-cols-2 gap-2 sm:grid-cols-3 wide:grid-cols-2`). Each item is `RadioGroup.Item` with `aria-label={name}` and M3's card body: a paper tile `paperTint(look.v.paper ?? base.paper)` with `HandSample settings={{ ...base, ...lookPatch(look, false) }} text="Homework" height={30} fit="width"`, then the name. The checked item looks like M3's pressed card (`data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:ring-1 data-[state=checked]:ring-primary`). `Keep this document’s look` (value `keep`, meaning `null`) comes first for `open`, with `base` itself as its sample.
    - `Header` (when `target === 'new' || value.where === 'replace'`): the checkbox `Add a header block`. When ticked: `Name`, `Class` and `Date` inputs (`maxLength 80`, `autoComplete off`), and the hint. Unticking gives `header: null`. Ticking again brings back what was typed, or `{ name: '', class: '', date: today() }` the first time.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/import/ImportOptions.test.tsx (fontsLoad(); NOW = new Date(2026, 10, 7))
let value: ImportOptionsValue;
function Harness({ target, parts = 1 }: { target: ImportTarget; parts?: number }) {
  const [v, setV] = useState(() => initialOptions(target, target === 'open' ? get().doc : null, NOW)); value = v;
  return <ImportOptions target={target} value={v} onChange={setV} fileParts={parts} base={cleanSettings(null, false)} />;
}
const looks = () => within(screen.getByRole('radiogroup', { name: 'Look' })).getAllByRole('radio');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); useStylePrefs.setState({ looks: [] }); });
test('a new document: a look, Exam answer to start, and a header block; nothing about where', () => {
  render(<Harness target="new" />);
  expect(screen.queryByRole('radiogroup', { name: 'Where it goes' })).toBeNull();
  expect(looks().map(r => r.getAttribute('aria-label'))).toEqual(['Exam answer', 'Neat notes', 'Letter', 'Quick scribble', 'Journal', 'School copy']);
  expect(screen.getByRole('radio', { name: 'Exam answer' })).toBeChecked(); expect(screen.getByRole('checkbox', { name: 'Add a header block' })).not.toBeChecked();
  expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Look', 'Header']);
});
test('an open document: Replace to start, and its own look first and chosen', () => {
  open(docOf(box())); render(<Harness target="open" />);
  expect(screen.getByRole('radio', { name: 'Replace what’s on the pages' })).toBeChecked();
  expect(looks()[0]).toHaveAccessibleName('Keep this document’s look'); expect(looks()[0]).toBeChecked(); expect(value.look).toBeNull();
});
test('saved looks come after the built-in ones', () => { useStylePrefs.setState({ looks: [{ id: 'mine', name: 'My look', v: { font: 'caveat' } }] }); render(<Harness target="new" />); expect(looks().at(-1)).toHaveAccessibleName('My look'); });
test('Add after the last page: no header, and it says where the text goes', async () => {
  open(docOf(box())); render(<Harness target="open" />); await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' }));
  expect(value.where).toBe('append'); expect(screen.queryByRole('checkbox', { name: 'Add a header block' })).toBeNull();
  expect(screen.getByText('It carries on the writing that ends on the last page, from the top of a new page.')).toBeInTheDocument();
});
test('Start a new page where the file does: only for a file with pages of its own', async () => {
  const { unmount } = render(<Harness target="new" />); expect(screen.queryByRole('checkbox', { name: 'Start a new page where the file does' })).toBeNull(); unmount();
  render(<Harness target="new" parts={3} />); await userEvent.click(screen.getByRole('checkbox', { name: 'Start a new page where the file does' })); expect(value.breaks).toBe(true);
});
test('Add a header block: Name, Class and today’s Date, and what was typed comes back', async () => {
  render(<Harness target="new" />); const tick = screen.getByRole('checkbox', { name: 'Add a header block' }); await userEvent.click(tick);
  expect(screen.getByRole('textbox', { name: 'Date' })).toHaveValue('7 November 2026'); await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha');
  expect(value.header).toEqual({ name: 'Asha', class: '', date: '7 November 2026' }); expect(screen.getByText('At the top right of page 1.')).toBeInTheDocument();
  await userEvent.click(tick); expect(value.header).toBeNull(); await userEvent.click(tick); expect(value.header?.name).toBe('Asha');
});
test('an open document with a header starts with it, fields and all', () => {
  open(docOf(box({ kind: 'header', name: 'Header', fields: { name: 'Ravi', class: '9', subject: 'Art', date: '1 May 2026' }, text: 'x' }))); render(<Harness target="open" />);
  expect(screen.getByRole('checkbox', { name: 'Add a header block' })).toBeChecked(); expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ravi');
  expect(value.header).toEqual({ name: 'Ravi', class: '9', subject: 'Art', date: '1 May 2026' });
});
test('each look is written in its own hand on its own paper', () => {
  render(<Harness target="new" />); const card = screen.getByRole('radio', { name: 'Journal' });
  expect(card.querySelector<HTMLElement>('span[style]')!.style.background).toBe(paperTint('yellow')); expect(card.querySelector('canvas')).not.toBeNull();
});
test('arrow keys move between the looks', async () => { render(<Harness target="new" />); screen.getByRole('radio', { name: 'Exam answer' }).focus(); await userEvent.keyboard('{ArrowRight}'); expect(value.look).toBe('notes'); });
test('lookById finds built-in and saved looks', () => { useStylePrefs.setState({ looks: [{ id: 'mine', name: 'My look', v: {} }] }); expect([lookById('journal')?.name, lookById('mine')?.name, lookById(null), lookById('gone')]).toEqual(['Journal', 'My look', null, null]); });
```
(`afterEach`: `vi.useRealTimers()`.)

- [ ] **Step 2: Run** `npx vitest run src/features/import/ImportOptions.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `options.ts` and `ImportOptions.tsx`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(import): where it goes, the file’s pages, a look drawn in its own hand, and an optional header block`

---

### Task 6: Templates

**Files:**
- Create: `src/features/home/templates.ts`, `src/features/home/TemplateGrid.tsx`, `src/features/home/templates.test.tsx`, `src/features/home/TemplateGrid.test.tsx`
- Modify: `src/shell/TopBar.tsx` (`New document` makes a Blank page)

**Interfaces:**
- Consumes: `newDocument`, `geomFor` (Task 2); `createAndOpen` (Task 2); `PageThumb`, `TEMPLATE_PX` (Task 3); `STYLE_LOOKS`, `lookPatch`; `cleanSettings`; `snapY`; `today`; `placeCaret` (store).
- Produces:
  - `templates.ts`:
    - `type TemplateId = 'blank' | 'assignment' | 'notes' | 'letter' | 'journal' | 'card'`.
    - `interface Template { id: TemplateId; name: string; note: string; title: string; look: string; extra: Partial<Settings>; header: boolean; text(now: Date): string; middle: boolean }`.
    - `TEMPLATES: readonly Template[]`, the Templates table in its order.
    - `templateSettings(t: Template): Settings`.
    - `templateRecord(t: Template, now = new Date()): { title: string; settings: Settings; doc: EngineDoc }`. It is `newDocument(S, t.text(now), t.header ? { name: '', class: '', date: today(now) } : null)`, with the main block's `y = snapY(400, geomFor(S))` when `middle`.
    - `openTemplate(id: TemplateId, now = new Date()): Promise<boolean>` = `createAndOpen(templateRecord(…))`, then `placeCaret(main.id, main.text.length)` when it worked.
  - `TemplateGrid()`: a `<section aria-labelledby>` holding:
    - an `h2` `Start something new` (`text-base font-semibold`) and the muted line;
    - the grid (Design decision 7), with one `<button type="button">` per template: `PageThumb owner={'tpl:' + id} S={settings} doc={doc} px={TEMPLATE_PX}`, then the name (`text-[13.5px] font-semibold`) and the note (`text-[13px] text-muted`). Records come from `useMemo(() => TEMPLATES.map(t => templateRecord(t, now)), [day])`.
    - A click calls `openTemplate(id)`. While it runs every card is `disabled` (`aria-busy` on the grid).
  - `TopBar`: `New document` calls `openTemplate('blank')`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/home/templates.test.tsx (fake-indexeddb; sonner mocked; `@/store/documents` mocked as { ...actual, createDoc: vi.fn(actual.createDoc) })
const NOW = new Date(2026, 10, 7, 10), T = (id: TemplateId) => TEMPLATES.find(t => t.id === id)!;
test('six templates, in this order, with what each is', () => expect(TEMPLATES.map(t => [t.id, t.name, t.note])).toEqual([
  ['blank', 'Blank page', 'Ruled, nothing on it yet'], ['assignment', 'Assignment', 'Header, title and headings'], ['notes', 'Class notes', 'Grid paper and lists'],
  ['letter', 'Letter', 'Plain paper, joined-up'], ['journal', 'Journal page', 'Yellow pad, relaxed'], ['card', 'Card', 'One big message'],
]));
test('each starts with its own look and paper', () => {
  const v = (id: TemplateId) => { const S = templateSettings(T(id)); return [S.font, S.tip, S.ink, S.paper, S.mess, S.wobble, S.variety, S.flow, S.size]; };
  expect(TEMPLATES.map(t => v(t.id))).toEqual([
    ['labelle', 'ball', 'blue', 'ruled', 45, 30, 60, 55, 30], ['labelle', 'ball', 'blue', 'ruled', 45, 30, 60, 55, 30], ['patrick', 'gel', 'blueblack', 'grid', 15, 12, 35, 30, 30],
    ['cedarville', 'fine', 'black', 'plain', 45, 30, 60, 55, 30], ['caveat', 'felt', 'purple', 'yellow', 45, 30, 60, 55, 30], ['cedarville', 'fine', 'black', 'plain', 45, 30, 60, 55, 38],
  ]);
  for (const t of TEMPLATES) expect(matchLook(templateSettings(t), templateSettings(t), STYLE_LOOKS, true)?.id).toBe(t.look);
});
test('…and the content it implies', () => {
  const r = (id: TemplateId) => templateRecord(T(id), NOW).doc.boxes.map(b => [b.kind, b.name, b.text, b.x, b.y]);
  expect(r('blank')).toEqual([['text', 'Main text', '', 112, 76]]);
  expect(r('assignment')).toEqual([['header', 'Header', 'Name:\nClass:\nDate: 7 November 2026', 446, 76], ['text', 'Main text', '# Title\n\n## Introduction\n', 112, 178]]);
  expect(r('notes')).toEqual([['text', 'Main text', '# Notes\n\n## Topic\n- First point\n- Second point', 74, 76]]);
  expect(r('letter')).toEqual([['text', 'Main text', 'Dear …,\n\n\n\nWith love,', 74, 76]]);
  expect(r('journal')).toEqual([['text', 'Main text', '7 November 2026\n\n', 112, 76]]);
  expect(r('card')).toEqual([['text', 'Main text', '# Happy birthday!', 74, 416]]);
  expect(TEMPLATES.map(t => templateRecord(t, NOW).title)).toEqual(['Untitled', 'Assignment', 'Class notes', 'Letter', 'Journal page', 'Card']);
});
test('a template opens as a new document on Write, the caret at the end of its main text, with nothing to undo', async () => {
  location.hash = '#/'; expect(await openTemplate('assignment', NOW)).toBe(true);
  const main = get().doc.boxes[1];
  expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' }); expect(get().caret).toMatchObject({ boxId: main.id, offset: main.text.length });
  expect([get().title, get().canUndo, (await getDoc(get().docId!))?.settings.font]).toEqual(['Assignment', false, 'labelle']);
});
test('New document in the top bar is a Blank page', async () => {
  location.hash = '#/'; render(<TopBar route={{ name: 'home' }} ready={false} />); await userEvent.click(screen.getByRole('button', { name: 'New document' }));
  await waitFor(() => expect(get().doc.boxes.map(b => [b.name, b.text])).toEqual([['Main text', '']])); expect(get().title).toBe('Untitled');
});
test('a template this device can’t store says so', async () => { vi.mocked(createDoc).mockRejectedValueOnce(new Error('blocked')); expect(await openTemplate('letter')).toBe(false); expect(lastToast()).toBe('Nib can’t create documents on this device right now.'); });

// src/features/home/TemplateGrid.test.tsx (`./thumbs` mocked: thumbFor resolves { url: 'data:image/jpeg;base64,AAAA', pages: 1 }, peekThumb → null;
// `./templates` mocked as { ...actual, openTemplate: vi.fn() })
test('Start something new: six templates, each with its own page drawn', async () => {
  render(<TemplateGrid />);
  expect(screen.getByRole('heading', { level: 2, name: 'Start something new' })).toBeInTheDocument(); expect(screen.getByText('Each template starts with its own look. You can change everything later.')).toBeInTheDocument();
  expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(TEMPLATES.map(t => t.name + t.note));
  await waitFor(() => expect(document.querySelectorAll('img[src^="data:image/jpeg"]')).toHaveLength(6));
  expect(vi.mocked(thumbFor).mock.calls.map(c => [c[0], c[1].font, c[1].paper, c[3]])).toEqual([
    ['tpl:blank', 'labelle', 'ruled', 360], ['tpl:assignment', 'labelle', 'ruled', 360], ['tpl:notes', 'patrick', 'grid', 360],
    ['tpl:letter', 'cedarville', 'plain', 360], ['tpl:journal', 'caveat', 'yellow', 360], ['tpl:card', 'cedarville', 'plain', 360],
  ]);
});
test('a card makes that template’s document, and meanwhile the cards wait', async () => {
  let done!: (v: boolean) => void; vi.mocked(openTemplate).mockReturnValue(new Promise(r => { done = r; }));
  render(<TemplateGrid />); const letter = screen.getByRole('button', { name: /^Letter/ });
  await userEvent.click(letter); await userEvent.click(letter);
  expect(openTemplate).toHaveBeenCalledTimes(1); expect(openTemplate).toHaveBeenCalledWith('letter'); expect(letter).toBeDisabled();
  await act(async () => done(true)); expect(letter).toBeEnabled();
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/home/templates.test.tsx src/features/home/TemplateGrid.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `templates.ts`, `TemplateGrid.tsx` and the TopBar change. `TemplateGrid` isn't on Home yet: Task 9 puts it there.
- [ ] **Step 4: Run** `npm test` (App's `New document` tests still get an `Untitled` document), `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(home): six templates, each with its own look, paper and starting content, drawn by the engine`

---

### Task 7: Recent with thumbnails

**Files:**
- Create: `src/features/home/recent.ts`, `src/features/home/RecentList.tsx`, `src/features/home/recent.test.ts`
- Modify: `src/features/home/HomePage.tsx` (the Recent section becomes `<RecentList>`; `relativeTime` moves to `recent.ts`), `src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `PageThumb`, `RECENT_PX`, `forgetThumb` (Task 3); `matchLook`, `STYLE_LOOKS`; `useStylePrefs`; M1's Home dialogs, menu and `change()` handling (moved as they are).
- Produces:
  - `recent.ts`:
    - `relativeTime(t, now)`, M1's unchanged.
    - `lookNameOf(S: Settings, saved: readonly SavedLook[]): string | null` = `matchLook(S, S, [...STYLE_LOOKS, ...saved], true)?.name ?? null`.
    - `recentMeta(pages: number | null, look: string | null, updatedAt: number, now = Date.now()): string`, per Interface copy.
  - `RecentList({ docs, readOnly, onChange }: { docs: DocRecord[]; readOnly: boolean; onChange(): Promise<void> })`. This is M1's `<ul>`, with each `<li>` holding:
    - the open button, with `PageThumb owner={'doc:' + id} S={d.settings} doc={d.doc} px={RECENT_PX} className="w-[52px] flex-none"` and `onPages` kept per row;
    - then `<span className="min-w-0 flex-1">`, holding the title (`block truncate font-semibold`) and the meta (`block truncate text-sm text-muted`);
    - then, unless `readOnly`, the `⋯` menu.

    The Rename and Delete dialogs and the Duplicate handling move here unchanged. Delete also calls `forgetThumb('doc:' + id)` after `deleteDoc`. Every action ends with `onChange()`.
  - `HomePage`: as in M1, with `<RecentList docs={shown} readOnly={memory} onChange={reload} />` in its Recent section (the heading, the empty and unreadable states stay where they are).

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/home/recent.test.ts
const S = cleanSettings(null, false), NOW = new Date(2026, 10, 6, 12).getTime();
test('the look a document is in, by its hand, pen, ink and realism', () => {
  expect(lookNameOf(S, [])).toBe('Exam answer');
  expect(lookNameOf({ ...S, ...STYLE_LOOKS[1].v, paper: 'grid' }, [])).toBe('Neat notes');
  expect(lookNameOf({ ...S, font: 'zeyada' }, [])).toBeNull();
  expect(lookNameOf({ ...S, font: 'zeyada' }, [{ id: 'm', name: 'Mine', v: { font: 'zeyada' } }])).toBe('Mine');
});
test('the line under a document’s name', () => expect([
  recentMeta(2, 'Exam answer', NOW, NOW), recentMeta(1, null, NOW - 86_400_000, NOW), recentMeta(null, 'Letter', new Date(2026, 10, 3).getTime(), NOW),
]).toEqual(['2 pages · Exam answer · Edited today', '1 page · Edited yesterday', 'Letter · Edited 3 November 2026']));

// src/features/home/HomePage.test.tsx: M1's tests, with mk() giving real settings (cleanSettings(null, false)), the `@/store/documents` mock
// gaining getPref/setPref, and `./thumbs` mocked (thumbFor resolves { url: 'data:image/jpeg;base64,AAAA', pages: 2 }, peekThumb → null, forgetThumb vi.fn()). New:
test('each document shows its first page, how many pages it has, its look and when it was edited', async () => {
  render(<HomePage />); expect(await screen.findByText('2 pages · Exam answer · Edited today')).toBeInTheDocument();
  expect(screen.getByText('A').closest('li')!.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
  expect(thumbFor).toHaveBeenCalledWith('doc:a1', expect.objectContaining({ font: 'labelle' }), expect.objectContaining({ boxes: [] }), 156);
});
test('the page count is the laid-out one, not the stored minimum', async () => { mem.docs = [{ ...mk('a1', 'A'), doc: { pageCount: 1, boxes: [], fileName: '' } }]; vi.mocked(thumbFor).mockResolvedValue({ url: 'data:image/jpeg;base64,AAAA', pages: 5 }); render(<HomePage />); expect(await screen.findByText('5 pages · Exam answer · Edited today')).toBeInTheDocument(); });
test('until page 1 is drawn, the line leaves the page count out', async () => { vi.mocked(thumbFor).mockReturnValue(new Promise(() => {})); render(<HomePage />); expect(await screen.findAllByText('Exam answer · Edited today')).toHaveLength(1); });
test('Delete forgets the thumbnail', async () => {
  render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: 'More for A' })); await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' })); await waitFor(() => expect(forgetThumb).toHaveBeenCalledWith('doc:a1'));
});
```
(The second fixture document, `B`, is edited on 3 November with a different look (`{ ...S, font: 'zeyada' }`), so the `findAllByText(…)` count is exact. M1's `lists recent documents and opens one` now expects the lines `2 pages · Exam answer · Edited today` and `2 pages · Edited 3 November 2026` in place of `2 pages` twice; every other M1 Home test is unchanged.)

- [ ] **Step 2: Run** `npx vitest run src/features/home`. Expected: the new tests FAIL, and M1's Home tests pass.
- [ ] **Step 3: Implement** `recent.ts` and `RecentList.tsx`, and use the list on Home. Keep every M1 string and behaviour of the rows' menu.
- [ ] **Step 4: Run** `npm test` (`HomePage.fonts.test.tsx` and the App tests pass unchanged), `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(home): Recent shows each document’s first page, page count, look and when it was edited`

---

### Task 8: The Import dialog

**Files:**
- Modify (rewrite): `src/features/import/ImportDialog.tsx`
- Create: `src/features/import/ImportDialog.test.tsx`
- Modify: `src/features/doc/DocumentView.tsx` (`<ImportDialog open={importOpen} file={importFile} target="open" onClose={closeImport} />`), `src/features/doc/actions.ts` (remove `writeOut` and the imports only it used), `src/features/doc/actions.test.ts` (remove the `writeOut` tests and its row in the one-undo-step cases; Task 2's `apply.test.ts` covers them)

**Interfaces:**
- Consumes: `readDocument`, and `importError` with Task 1's messages (Task 1); `importIntoOpenDocument`, `importAsNewDocument`, `ImportRequest` (Task 2); `ImportPreview`, `PreviewHandle` (Task 4); `ImportOptions`, `initialOptions`, `lookById`, `ImportOptionsValue`, `ImportTarget` (Task 5); `cleanSettings`; `Dialog*` (`ui/dialog`); `Button`; `FileUp`, `Loader2` icons; `useEditor`.
- Produces: `ImportDialog({ open, file, target, onClose }: { open: boolean; file: File | null; target: ImportTarget; onClose(): void })`.
  - **State.** `read` is `{ status: 'idle' | 'reading' | 'ready' | 'error'; name: string; res: ReadResult | null; msg: string }`, plus `options` and `busy`. Opening resets everything, with `initialOptions(target, target === 'open' ? get().doc : null)`. A new `file` prop while open is read. M1's read counter means only the last file read wins.
  - **Layout** (Design decision 8; `DialogContent` with the class strings given there):
    - A header (`flex-none border-b border-line px-5 py-3`) with the title and the screen-reader description.
    - A body (`min-h-0 flex-1 overflow-y-auto wide:grid wide:grid-cols-[minmax(0,1fr)_340px] wide:overflow-hidden`).
      - Its left column has the status line, then either the drop zone (idle or error: M1's `label` with a hidden `input type="file"` whose `accept` is M1's) or, when ready, the file line with `Choose another file` (a label around the same hidden input) and `<ImportPreview parts={res.parts} breaks={options.breaks} ref={preview} />`.
      - Its right column (`wide:min-h-0 wide:overflow-y-auto wide:border-l wide:border-line`, ready only) holds `<ImportOptions target fileParts={res.parts.filter(p => p.trim()).length} base={target === 'open' ? get().S : cleanSettings(null, false)} …/>`.
    - A footer (`flex-none border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]`, buttons right-aligned, each `flex-1 wide:flex-none`) with `Cancel` and `Write it out`.
  - **The status line** is `role="status" aria-live="polite"` (muted), and `role="alert"` (`text-danger`) for an error. Reading shows a spinner.
  - **Drops.** `DialogContent` takes a dropped file anywhere (`onDragOver` prevents the default; `onDrop` reads the file and stops it going further). `onOpenAutoFocus` focuses the content itself (`tabIndex={-1}`).
  - **Write it out** is disabled unless `status === 'ready'` and not `busy`.
    1. It takes `markup = preview.markup().replace(/\s+$/, '')`. An empty one shows `There’s no text to write out.` as an error and writes nothing.
    2. It builds `req = { text: markup, name: res.name, place: { where: options.where, look: lookById(options.look), header: target === 'new' || options.where === 'replace' ? options.header : null } }`.
    3. With `target === 'open'` it runs `importIntoOpenDocument(req)` then `onClose()`. With `'new'` it runs `busy = true`, `await importAsNewDocument(req)`, then `busy = false` and, if that worked, `onClose()`.
  - **Cancel**, Escape and the close button call `onClose()` and write nothing.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/import/ImportDialog.test.tsx (`@/engine/importers.js` mocked as { ...actual, readDocument: vi.fn() }; sonner mocked as in M2;
// fake-indexeddb; fontsLoad(); `phone()`, `width()` and `wideMatchMedia` as in StylePanel.test.tsx)
const ESSAY = { parts: ['# A Short Essay\n\n## Introduction\nWater moves between **rivers**, *seas* and ~~lakes~~ all the time.', '## Conclusion\nThat is the water cycle.'], pages: 0, words: 24, name: 'Essay' };
const essay = () => new File(['x'], 'Essay.docx');
function Open({ file = essay() }: { file?: File | null }) { const o = useEditor(s => s.importOpen); return <ImportDialog open={o} file={file} target="open" onClose={closeImport} />; }
const dialog = () => screen.findByRole('dialog', { name: 'Import a document' }), writeIt = () => screen.getByRole('button', { name: 'Write it out' });
beforeEach(() => { vi.mocked(readDocument).mockResolvedValue(ESSAY); });
test('a chosen file is read and shown as it will come across', async () => {
  open(docOf(box({ id: 'm', text: 'old' }))); openImport(); render(<Open />); await dialog();
  expect(await screen.findByText('Essay.docx: 24 words.')).toBeInTheDocument();
  const tb = screen.getByRole('textbox', { name: 'Imported text' }); expect(within(tb).getByRole('heading', { level: 1 })).toHaveTextContent('A Short Essay');
  expect(screen.getByRole('checkbox', { name: 'Start a new page where the file does' })).toBeInTheDocument(); expect(writeIt()).toBeEnabled();
});
test('with no file yet, the dialog asks for one', async () => { open(docOf(box())); openImport(); render(<Open file={null} />); expect(await screen.findByText('Choose a PDF, Word (.docx) or text file')).toBeInTheDocument(); expect(writeIt()).toBeDisabled(); });
test('a file that can’t be read says why, and nothing can be written out', async () => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('rtf'), { code: 'rtf' })); open(docOf(box())); openImport(); render(<Open />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Rich text files (.rtf) can’t be read here. Open it in Word or Google Docs and save it as .docx or PDF first.');
  expect(writeIt()).toBeDisabled(); expect(screen.getByText('Choose a PDF, Word (.docx) or text file')).toBeInTheDocument();
});
test('the last file chosen wins', async () => {
  let first!: (r: ReadResult) => void; vi.mocked(readDocument).mockReturnValueOnce(new Promise(r => { first = r; })).mockResolvedValueOnce({ ...ESSAY, parts: ['Second file'], name: 'Two' });
  open(docOf(box())); openImport(); const { rerender } = render(<Open file={new File(['x'], 'One.txt')} />); rerender(<Open file={new File(['y'], 'Two.txt')} />);
  await screen.findByText('Two.txt: 24 words.'); await act(async () => first({ ...ESSAY, parts: ['First file'] }));
  expect(screen.getByRole('textbox', { name: 'Imported text' })).toHaveTextContent('Second file');
});
test('Write it out replaces the pages as one undo step, and the dialog closes', async () => {
  open(docOf(box({ id: 'm', text: 'old' }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(writeIt());
  expect(get().doc.boxes.map(b => [b.name, b.text])).toEqual([['Main text', ESSAY.parts.join('\n\n')]]); expect(get().importOpen).toBe(false);
  undo(); expect(get().doc.boxes.map(b => b.text)).toEqual(['old']); expect(get().canUndo).toBe(false);
});
test('the choices come with it: the file’s pages, Add after the last page and a look, all in the same step', async () => {
  open(docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Start a new page where the file does' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Add after the last page' })); await userEvent.click(screen.getByRole('radio', { name: 'Journal' }));
  await userEvent.click(writeIt());
  expect(get().doc.boxes).toHaveLength(1); expect(get().doc.boxes[0].text).toBe(lines(40) + '\n\\newpage\n' + ESSAY.parts.join('\n\\newpage\n')); expect(get().S.font).toBe('caveat');
  undo(); expect([get().doc.boxes[0].text, get().S.font]).toEqual([lines(40), 'labelle']);
});
test('a header block with Name, Class and today’s Date', async () => {
  open(docOf(box())); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Add a header block' })); await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha'); await userEvent.click(writeIt());
  expect(get().doc.boxes.map(b => b.kind)).toEqual(['header', 'text']); expect(get().doc.boxes[0].fields).toEqual({ name: 'Asha', class: '', date: today() });
});
test('edits in the preview are what is written', async () => {
  open(docOf(box())); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(within(tb).getByText('That is the water cycle.')); await userEvent.keyboard('{End} Really.'); await userEvent.click(writeIt());
  expect(get().doc.boxes[0].text).toContain('That is the water cycle. Really.');
});
test('Ctrl+Z in the preview leaves the document and its history alone', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(tb); await userEvent.keyboard('abc{Control>}z{/Control}'); expect([get().doc.boxes[0].text, get().canUndo]).toEqual(['mine', false]);
});
test('an emptied preview can’t be written out', async () => {
  open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); const tb = await screen.findByRole('textbox', { name: 'Imported text' });
  await userEvent.click(tb); await userEvent.keyboard('{Control>}a{/Control}{Backspace}'); await userEvent.click(writeIt());
  expect(screen.getByRole('alert')).toHaveTextContent('There’s no text to write out.'); expect(get().doc.boxes[0].text).toBe('mine');
});
test('Cancel writes nothing', async () => { open(docOf(box({ id: 'm', text: 'mine' }))); openImport(); render(<Open />); await screen.findByText('Essay.docx: 24 words.'); await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect([get().importOpen, get().doc.boxes[0].text, get().canUndo]).toEqual([false, 'mine', false]); });
test('from Home, Write it out makes a new document with its look and opens it', async () => {
  location.hash = '#/'; const onClose = vi.fn(); render(<ImportDialog open file={essay()} target="new" onClose={onClose} />);
  await screen.findByText('Essay.docx: 24 words.'); expect(screen.queryByRole('radiogroup', { name: 'Where it goes' })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: 'Neat notes' })); await userEvent.click(writeIt());
  await waitFor(() => expect(parseHash(location.hash)).toMatchObject({ name: 'doc', stage: 'write' }));
  expect([get().title, get().S.font, get().canUndo, onClose.mock.calls.length]).toEqual(['Essay', 'patrick', false, 1]);
});
test('from Home, a refused file makes nothing', async () => {
  vi.mocked(readDocument).mockRejectedValueOnce(Object.assign(new Error('image'), { code: 'image' })); const before = (await listDocs()).length;
  render(<ImportDialog open file={new File(['x'], 'IMG_0001.heic')} target="new" onClose={vi.fn()} />); await screen.findByRole('alert');
  expect(writeIt()).toBeDisabled(); expect((await listDocs()).length).toBe(before);
});
test('on a phone the dialog fills the screen, and crossing 860 px keeps the preview and its edits', async () => {
  phone(); open(docOf(box())); openImport(); render(<Open />);
  expect(await dialog()).toHaveClass('h-dvh', 'w-full', 'rounded-none', 'wide:h-[min(52rem,calc(100dvh-4rem))]', 'wide:w-[min(68rem,calc(100vw-4rem))]');
  const tb = await screen.findByRole('textbox', { name: 'Imported text' }); await userEvent.click(tb); await userEvent.keyboard('Draft ');
  act(() => { window.matchMedia = wideMatchMedia; width(1200); window.dispatchEvent(new Event('resize')); });
  expect(screen.getByRole('textbox', { name: 'Imported text' })).toBe(tb); expect(tb).toHaveTextContent('Draft');
});
```
(`afterEach`: `window.matchMedia = wideMatchMedia; width(1200); closeImport();`.)

- [ ] **Step 2: Run** `npx vitest run src/features/import src/features/doc`. Expected: the dialog tests FAIL, and the others pass.
- [ ] **Step 3: Implement** the dialog, the DocumentView mount, and the removal of `writeOut` and its tests.
- [ ] **Step 4: Run** `npm test` (`menus.test.tsx`'s Import button test still opens the dialog), `npm run typecheck`, `npm run build`, `npm run smoke`. Then a manual check with `npm run dev` in Playwright: at 1280 × 860 and 390 × 844, import a `.docx` made with `essayDocx()` from the Write bar. The two columns, or the full screen with its pinned footer, look right, and the toolbar formats the preview.
- [ ] **Step 5: Commit** `feat(import): the Import dialog with its rich preview and options; full screen on phones; one undo step into an open document`

---

### Task 9: Home assembled, and Import from Home

**Files:**
- Modify: `src/features/home/HomePage.tsx`, `src/features/home/actions.ts`, `src/features/home/HomePage.test.tsx`
- Create: `src/features/home/HomeImport.test.tsx`

**Interfaces:**
- Consumes: `TemplateGrid`, `openTemplate` (Task 6); `RecentList` (Task 7); `ImportDialog` (Task 8); `openImport`, `closeImport` (`@/features/doc/actions`); `useEditor` (`importOpen`, `importFile`).
- Produces:
  - `HomePage`, top to bottom (Design decision 7):
    - the hero `<button>` (Interface copy; `onClick={openImportPicker}`; lit while a file is over the window);
    - `<TemplateGrid />`;
    - the Recent section (heading, `<RecentList>`, or M1's empty state, whose `New document` calls `openTemplate('blank')`, or M1's unreadable state);
    - the footer line.
    - After them come `<ImportDialog open={importOpen} file={importFile} target="new" onClose={closeImport} />` and M1's veil while a file is over the window.

    The window's drag handlers are M1's, with the drop calling `openImport(file)`. While `importOpen` is true, enter and leave do nothing, so the dialog's own drop zone takes the file.
  - `home/actions.ts`: `openImportPicker()` opens M1's `input` (with the dialog's `accept`), and its `change` calls `openImport(file)`. `importIntoNewDoc` and the helpers only it used are removed. `createAndOpen(init)` and `CANT_CREATE` stay.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/home/HomePage.test.tsx (additions; mocks as in Task 7, plus `@/engine/importers.js` mocked as { ...actual, readDocument } with readDocument resolving
// { parts: ['# Essay\nHello'], pages: 0, words: 2, name: 'Essay' }; fontsLoad() for the look cards' hands)
const files = (f: File) => ({ dataTransfer: { files: [f], types: ['Files'] } });
test('Home, top to bottom: Import, the templates, Recent, then where things are kept', async () => {
  render(<HomePage />); await screen.findByText('A');
  const hero = screen.getByRole('button', { name: /^Import a PDF, Word or text file/ }), [tpl, recent] = screen.getAllByRole('heading', { level: 2 });
  expect([tpl.textContent, recent.textContent]).toEqual(['Start something new', 'Recent']);
  expect(hero.compareDocumentPosition(tpl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(hero).toHaveTextContent('Headings, lists, bold, underline and crossed-out words come across.');
  expect(screen.getByText('Everything is saved on this device. Nothing is uploaded.')).toBeInTheDocument();
});
test('dragging a file over Home says where to drop it and lights up the hero', async () => {
  render(<HomePage />); await screen.findByText('A'); fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
  expect(screen.getByText('Drop to import this document')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /^Import a PDF/ })).toHaveClass('border-primary');
  fireEvent.dragLeave(window, { dataTransfer: { types: ['Files'] } }); expect(screen.queryByText('Drop to import this document')).toBeNull();
});
test('No documents yet: New document makes a Blank page', async () => { mem.docs = []; render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: 'New document' })); await waitFor(() => expect(createDoc).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled', doc: expect.objectContaining({ boxes: [expect.objectContaining({ name: 'Main text', text: '' })] }) }))); });
// src/features/home/HomeImport.test.tsx (the same mocks)
test('a file dropped anywhere on Home opens Import with it, and nothing is made until Write it out', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'Essay.txt'))); });
  expect(await screen.findByRole('dialog', { name: 'Import a document' })).toBeInTheDocument(); expect(createDoc).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Write it out' }));
  await waitFor(() => expect(createDoc).toHaveBeenCalledWith(expect.objectContaining({ title: 'Essay' }))); expect(location.hash).toBe('#/d/new1/write');
});
test('Cancel leaves Home as it was', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'Essay.txt'))); });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' })); expect(createDoc).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull(); expect(location.hash).toBe('#/');
});
test('the hero and Import a file open the file picker, then Import with the chosen file', async () => {
  let input: HTMLInputElement | undefined; vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { input = this; });
  render(<HomePage />); await userEvent.click(await screen.findByRole('button', { name: /^Import a PDF/ }));
  Object.defineProperty(input!, 'files', { value: [new File(['x'], 'Essay.txt')] }); act(() => { input!.dispatchEvent(new Event('change')); });
  expect(await screen.findByText('Essay.txt: 2 words.')).toBeInTheDocument();
});
test('while Import is open, a file dropped on it goes to Import', async () => {
  render(<HomePage />); await screen.findByText('A'); act(() => { fireEvent.drop(window, files(new File(['x'], 'One.txt'))); }); await screen.findByText('One.txt: 2 words.');
  fireEvent.drop(await screen.findByRole('dialog', { name: 'Import a document' }), files(new File(['y'], 'Two.txt')));
  expect(await screen.findByText('Two.txt: 2 words.')).toBeInTheDocument(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
```
(Reset `importOpen` with `closeImport()` in `afterEach`. Every M1 Home test and Task 7's tests keep passing.)

- [ ] **Step 2: Run** `npx vitest run src/features/home`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `HomePage` and `openImportPicker`, and remove `importIntoNewDoc`.
- [ ] **Step 4: Run** `npm test` (the App tests, which use `New document` and Recent, pass unchanged), `npm run typecheck`, `npm run build`, `npm run smoke`. Then a manual check with `npm run dev` in Playwright:
  - At 1280 × 860: the hero, six template cards in one row with their pages drawn after a moment, and Recent with thumbnails.
  - At 390 × 844: the cards two to a row, and `document.documentElement.scrollWidth` is 390.
- [ ] **Step 5: Commit** `feat(home): Import is the hero, templates below it, Recent with thumbnails; Import from Home makes the document only on Write it out`

---

### Task 10: Smoke and README

**Files:**
- Modify: `scripts/smoke.mjs`, `README.md`

- [ ] **Step 1: Extend the smoke run** (1280 × 860 unless said; any console error fails it).
  - At the top: import `essayDocx`, `textPdf` and `RIVERS_PAGES` from `./fixtures.mjs`.
  - Helpers:
    - `idbDocs()`: `page.evaluate` opens IndexedDB `nib` and gives every `documents` record.
    - `inked(locator, min)`: the `img` is drawn onto a canvas in the page. Luminance is `0.299 R + 0.587 G + 0.114 B`. It passes when at least `min` pixels are 70 or more below the picture's median luminance. The paper's own rules and margin are lighter than that at these sizes, and the ink is darker.
    - `requests`: the method and URL of every request the page makes, recorded from `page.on('request')` (`data:` URLs are left out).
  - In M4's step `Export: a PDF of every page, with no metadata`, keep the downloaded bytes in a module-level `let exportedPdf`.

  After M4's last step (`Style: an uploaded font is still there after a reload`), add these steps:
  1. **Home: Import is the hero, six templates, Recent with a drawn first page.**
     - Click the link `Home`.
     - The button `^Import a PDF, Word or text file` is visible, and the heading `Start something new` is followed by six buttons named `^Blank page`, `^Assignment`, `^Class notes`, `^Letter`, `^Journal page`, `^Card`, in that order.
     - Within 20 s each template card's `img` has a `data:image/jpeg` `src` and a `naturalWidth` of 360, and is `inked(img, 20)`, except Blank page's, which is drawn but not inked.
     - The Recent row `The Water Cycle` has a thumbnail with `naturalWidth` 156 that is `inked(img, 5)`, and a line matching `^(\d+) pages? · (.+ · )?Edited today$`. That number equals `pages` in the stored `prefs` record `thumb:doc:<its id>`.
     - The footer line is visible.
  2. **Templates: each opens with its own look, paper and content.** For each template in the Templates table:
     - Click its card on Home, then wait for the URL `#/d/…/write` and the text `Saved`.
     - Read the newest record (`idbDocs()`, by `createdAt`). Its `settings` have the table's look values, paper and size (Task 6's expected rows). Its boxes' kinds and texts are the table's, with `{today}` as the date of the run.
     - Open Style: for every template except Class notes, the pressed look button starts with its look's name. For Class notes, `Patrick Hand` shows as the hand and the paper button `Grid` is pressed.
     - Go Home.
  3. **Import: a Word file from Home becomes one main block flowing page by page, with its look and a header.**
     - Clear `requests`.
     - Click the hero inside `page.waitForEvent('filechooser')`, and set `{ name: 'Essay.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(essayDocx()) }`.
     - The dialog `Import a document` shows `Essay.docx: 24 words.`. In its textbox `Imported text` there are the `h1` `A Short Essay`, the `h2`s `Introduction` and `Conclusion`, `strong` `rivers`, `u` `seas`, `s` `lakes`, and four list items.
     - Tick `Start a new page where the file does`, choose the look `Neat notes`, tick `Add a header block`, type `Asha` in `Name`, and click `Write it out`.
     - Expected: the URL `#/d/…/write`, and the field `Document name` is `Essay`.
     - In Outline, the item labels that start with `Main text` are exactly `Main text, part 1 of 2` and `Main text, part 2 of 2`, and there is one `Header`.
     - The stored record has boxes of kinds `['header', 'text']`, `fields.name` `Asha`, and a Main text that contains `\newpage\n## Conclusion`, with `settings.font` `patrick`.
     - Every entry in `requests` is a `GET` to `BASE`.
  4. **Import into the open document: a PDF added after the last page carries on Main text, and one Undo takes it away.**
     - In Write, click `Import`. On the dialog's file input (label `Choose a PDF, Word (.docx) or text file`), set `{ name: 'Rivers.pdf', mimeType: 'application/pdf', buffer: Buffer.from(textPdf(RIVERS_PAGES)) }`.
     - The status matches `^Rivers\.pdf: \d+ words from 2 pages\.$`, and the preview has the `h1` `Rivers and seas`.
     - Choose `Add after the last page`, click `Write it out`, and see `Added after the last page, carrying on “Main text”.`
     - Outline: the `Main text` parts are now `1 of 3` … `3 of 3`, still with no other text block.
     - Click the top bar's `Undo`. The parts are back to `1 of 2` and `2 of 2`.
  5. **Import: files Nib can't read say why.**
     - Open Import again and set `exportedPdf` as `Nib.pdf`. The alert reads the `scan` message.
     - Set `{ name: 'letter.rtf', mimeType: 'text/rtf', buffer: Buffer.from('{\\rtf1 Hello}') }`. The alert reads the `rtf` message.
     - `Write it out` is disabled. Click `Cancel`.
  6. **Phone: Home and Import at 390 px, and Longhand work brought over on a first visit.**
     - Open a new context (`viewport { width: 390, height: 844 }`, `hasTouch: true`), with an `addInitScript` that stores `localStorage['longhand.v2'] = JSON.stringify({ s: {}, doc: { pageCount: 1, fileName: '', boxes: [{ id: 'b1', page: 0, x: 112, y: 110, w: 630, text: '# My Longhand notes\nhello', style: {}, shuffle: 0, frames: {} }] } })`.
     - Go to `BASE`. Recent has `My Longhand notes`, the migrated work, with an `inked(img, 5)` thumbnail.
     - `document.documentElement.scrollWidth <= 390`.
     - The first two template cards share a `top`, and the third is lower.
     - Pick `Essay.docx` through the hero. The dialog's box is `0, 0, 390, 844` (±1 px), and `Write it out` is inside the viewport.
     - Click it, and the document opens with `Main text, page 1`.
     - Close the context.
- [ ] **Step 2: Update the README.**
  - In "What it does today", Home and Import become two bullets:
    - Home: Import first; six templates, each with its own look and paper; Recent with a drawn first page, page count, look and last edit, and Rename, Duplicate and Delete.
    - Import: PDF, Word or text into a rich, editable preview; Replace or Add after the last page; a new page where the file does; a look; an optional Header block; one main block flowing page by page.
  - Add a `## Home` section and an `## Import` section before `## Write`.
    - Home: the hero and dropping anywhere, the six templates with their looks (one line each, from the Templates table), and the Recent line and menu.
    - Import:
      - the formats and what happens with each (a short list from the Formats table);
      - the preview and its own undo;
      - the choices, and what Add after does (it carries on the writing that ends on the last page from a new page, or starts a block of its own; Split here at that page separates it);
      - the Header block;
      - full screen on phones;
      - that nothing is uploaded.
  - In "How the code is laid out", describe:
    - `src/features/home`: `HomePage.tsx`, `TemplateGrid.tsx` and `templates.ts`, `RecentList.tsx` and `recent.ts`, `PageThumb.tsx` and `thumbs.ts` (engine-drawn thumbnails kept in `prefs`), `actions.ts`;
    - `src/features/import`: `ImportDialog.tsx`, `ImportPreview.tsx` and `preview.ts`, `ImportOptions.tsx` and `options.ts`, `apply.ts`;
    - `src/features/doc/build.ts` (new and imported documents);
    - `scripts/fixtures.mjs` (the `.docx` and PDF the tests and the smoke run import).
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass, and the last line is `smoke ok`.
- [ ] **Step 4: Check**
  - `git diff main --stat -- src/engine` lists only `importers.js`, `importers.d.ts` and `importers.test.ts`.
  - `git diff main -- src/engine/core.js src/engine/doc.js src/engine/config.js src/engine/types.ts src/engine/core.d.ts src/engine/doc.d.ts src/engine/config.d.ts` gives no output.
  - `grep -rn "toBlob\|toDataURL\|createObjectURL" src --include=*.ts --include=*.tsx --include=*.js --exclude=*.test.* --exclude-dir=test` gives only `src/features/export/render.ts` (`toBlob`) and `src/features/export/run.ts` (`createObjectURL`).
  - `grep -rn "useWide" src/features/home src/features/import` gives no output.
  - `git diff main -- package.json` gives no output.
- [ ] **Step 5: Commit** `test: smoke imports a real .docx into one flowing main block, opens every template with its look, and checks Home and Import at 390 px; README for Home and Import`

The controller then merges `nib/m5-home-import` into `main` and pushes. This task does not merge, push or deploy.

---

## Exit check (roadmap)

**Import of a .docx produces one flowing main block:**
- Task 1: a real `.docx`, made by `essayDocx()`, comes across through the real mammoth as the expected markup, with its page break.
- Task 2: `newDocument` and `importInto` make one Main text whose parts run page by page, with nothing pushed, even for 600 lines.
- Task 8: the dialog writes it as one undo step, or as a new document.
- Task 10: the smoke run imports the same `.docx` in Chromium from Home. Outline shows exactly `Main text, part 1 of 2` and `part 2 of 2`, and the stored document holds one text block.

**Each template opens with its look:**
- Task 6: each template's settings, paper and content, and `matchLook` naming its look.
- Task 10: the smoke run opens all six from Home and checks the stored settings and the Style panel's pressed look or paper.
