# Nib

Turn typed text into realistic handwritten pages, then download them as a PDF or images, with no metadata in the files.

Nib was previously called Longhand.

Live site: https://nvmaditya.github.io/nib-engine/

The repository was renamed from `longhand` to `nib-engine`, so the old address (https://nvmaditya.github.io/longhand/) no longer works. Work saved there is still in the browser: it belongs to `nvmaditya.github.io`, and opens at the new address.

## What it does today

- **Home** puts Import first, then six templates, each with its own look and paper, then Recent: your documents, each with its first page drawn, its page count, look and last edit, and Rename, Duplicate and Delete. They are saved on the device, in the browser's own storage.
- **Import** reads a PDF, Word or text file into a rich, editable preview. Replace what is on the pages or Add after the last page; start a new page where the file does; pick a look; add a Header block if you like. The text becomes one main block that flows page by page.
- **Write, Style and Export** are the three stages of a document. Write is for the text and where it sits on the pages, Style is for the hand, pen, ink and paper, and Export downloads the result.
- **Hands and pens**: 33 hands, or upload your own font (TTF, OTF, WOFF), which Nib remembers on the device. Fineliner, ballpoint, gel, felt tip and pencil, drawn at the pen's real line width.
- **Realism**: each letter bends a little differently, lines climb and sag, the pen presses harder on downstrokes, and the ink runs darker and lighter. Optional mistakes are crossed out and written again.
- **Paper**: ruled, spiral, yellow pad, grid, plain, or a photographed sheet, with room lighting, show-through and punch holes.
- **Blocks** (Text, Header and Margin note) can be placed anywhere. A long block flows onto the next pages, and each page's part can be moved, resized, edited, deleted or split off. Any block can have its own style. See Write, below.
- **Downloads** are a PDF, PNGs or JPGs (in one ZIP if you like), of every page or only the ones you choose, at Standard or Print quality, as written, scanned, scanned in greyscale, or black and white, with an optional slight camera tilt. Share… sends them on where the browser can. The files carry no metadata.
- **Simple markup** in the editor: `# Title`, `## Heading`, `**bold**`, `*underline*`, `==highlight==`, `~~cross out~~`, `- lists`, `> notes`, `\newpage`.
- **Install and offline**: Nib installs as an app and, once it has loaded, works with no connection, every hand and both file readers included. A new version is offered with **Reload**, and no tab ever reloads by itself. See Install and offline, below.
- **Light and dark**: System, Light or Dark from the Menu, remembered on the device and followed by every open tab, with no flash of the other one as a page opens.
- **Keyboard**: `?` (or Ctrl+/) shows every shortcut on one sheet, and Ctrl+K opens a palette that opens a document, goes to a stage, puts a look on the whole document, exports or changes the theme. See Keyboard, below.
- **Tips**: three short tips the first time a document opens on a device, out of the way and never taking the focus.
- **Phones**: Outline, Style and Export are bottom sheets over the handwritten pages, and Write's Pages view shows one page at a time.

Everything happens in the browser. Nothing is uploaded.

## Home

Home is where you start. The big **Import a PDF, Word or text file** button comes first, and you can also drop a file anywhere on the page. Under it, **Start something new** has six templates. Each one is an ordinary document with its own look, so you can change everything later:

- **Blank page**: Exam answer on ruled paper, nothing on it yet.
- **Assignment**: Exam answer, with a Header block (today's date filled in), a title and a heading.
- **Class notes**: Neat notes on grid paper, with a heading and a list.
- **Letter**: the Letter look on plain paper, with `Dear …,` and `With love,`.
- **Journal page**: Journal on a yellow pad, starting with today's date.
- **Card**: the Letter look at a large size, with one message in the middle of the page.

**Recent** lists your documents. Each row shows page 1 as the engine draws it, the title, and a line such as `2 pages · Neat notes · Edited today` (the page count appears once page 1 has been laid out, and the look only when one matches). The ⋯ menu has Rename, Duplicate and Delete. Everything is saved on the device and nothing is uploaded.

### Working in more than one tab

Tabs follow each other: a document you rename, duplicate or delete in one tab changes in the Home of another, and an open document picks up edits made in another tab. If both tabs changed the same document, Nib keeps the newer version and offers **Copy your text**, so what you wrote in the other one is not lost.

## Import

Import (Home's big button, the top bar's **Import a file**, or Write's **Import**) reads the file in the browser and shows its text in a preview before anything is written.

- **PDF**: the text of each page, with headings by size, lists, joined-up lines, and no page numbers. One part per page. A PDF with no text (a scan or a photo) or with a password is refused, with a message that says why.
- **Word (.docx)**: headings, bold, underline, crossed-out words, lists, quotes and table rows come across; images do not. A page break starts a new part. An old `.doc`, a locked file, `.rtf`, `.odt` and pictures are refused with their own messages.
- **Text and Markdown** (`.txt`, `.md`): read as Nib's markup. A form feed starts a new part.
- Anything else, an empty file, or one over 40 MB says so, and the dialog lets you choose another file.

The preview is the same rich editor as Write: fix anything before it is written out. It has its own undo (Ctrl+Z inside it never touches the document behind). The choices:

- **Where it goes** (in an open document): **Replace what's on the pages**, or **Add after the last page**. Add after carries on the writing that ends on the last page, from the top of a new page, or starts a block of its own when nothing ends there. **Split here** at that page separates it again.
- **Pages**: **Start a new page where the file does**, for files with more than one part.
- **Look**: Keep this document's look (open documents only), one of the built-in looks or one you saved, each drawn in its own hand.
- **Header**: **Add a header block** with Name, Class and Date, at the top right of page 1.

**Write it out** makes one main block that flows page by page. In an open document it is one undo step. From Home it makes a new document. If it has to wait (for the hand of the look you chose, say), the preview and the choices are locked until it is done, so what is written is what you saw when you pressed it. On phones the dialog is full screen. The file is read on the device: nothing is uploaded.

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

Below 860 px the Pages view shows one page at a time, with Previous page and Next page buttons, a swipe to turn the page, and a flip between the typed and handwritten copy.

Outline is the handwritten pages with a sheet over them, as in Style and Export. The sheet holds the page list (it scrolls on its own, so a long text never pushes it out of reach) and, under it, the selected block's text. It rests at three heights: its top only (148 px), about half, and up to just below the Write bar. On a short phone about half is lowered so at least 200 px of the pages still show. Tapping a word on a page selects its block and puts the caret there in the sheet's editor. Drag the handle, or press it, to change the height.

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

## Export

Export shows the pages exactly as they will download, camera tilt and scan look included, and turns them into files on the device.

- **Format.** PDF, PNG or JPG. With PNG or JPG and more than one page, **Put the images in one ZIP** is on by default; turn it off to get the images one by one.
- **Pages.** **All pages**, or **Choose pages**: click a page to leave it out, click it again to put it back. A left-out page is marked `left out`, and the others keep their own tilt and scan, so they come out the same as they would have.
- **How it looks.** As written, Scanned, Greyscale scan or Black and white, and **Slight camera tilt**. Tilt is off for new documents. Both are kept by the document, so Ctrl+Z undoes them, and Style shows them too.
- **Quality.** **Standard** is 1747 × 2471 pixels a page, for screens and uploads. **Print quality** is 2480 × 3508 pixels (A4 at 300 dpi). The pages are drawn at that size by the same engine, never scaled up afterwards.
- **File name.** Starts from the document's title, with the ending beside it (`.pdf`, `.zip`, or `-page-1.png` for separate images). Edit it and the change is one undo step.
- **Download** says what it will make and about how big it is, such as `Download ZIP · 3 PNGs ~2.7 MB` (the size is an estimate from the first chosen page). While the files are made it counts the pages, and it waits if a hand's font file is still arriving.
- **Share…** appears where the browser can share files, and sends the same files.
- **No metadata.** A PDF has no Info dictionary and no XMP stream: no producer, author, title or dates, just the pages, each one a JPEG, and a random file ID. A PNG keeps only its picture chunks (header, palette, transparency, sRGB, pixels, end). A JPG keeps its picture and one bare JFIF header, with no Exif, no thumbnail, no ICC profile, no XMP and no comments. A ZIP stores its files plainly, with a fixed date of 1980-01-01 and no comments. Nib writes the PDF and ZIP itself and cleans the PNG and JPEG bytes itself, so no library adds a stamp of its own. The smoke test downloads a PDF and a ZIP and checks their bytes, and PDF.js reads the PDF too.
- **On phones** the panel is a bottom sheet over the pages, like Style's, so Download shows even at its lowest height.
- **Remembered on the device:** the format, the ZIP switch and the quality. Which pages are chosen is not saved.

Everything is made on the device. Nothing is uploaded.

## Keyboard

Press `?` anywhere outside a text field, or Ctrl+/ anywhere, to see every shortcut. On a Mac, iPhone or iPad keyboard, Ctrl is ⌘ (and the sheet shows ⌘, ⌥ and ⇧).

| Where | Keys |
|---|---|
| Anywhere | Ctrl+K searches commands and documents · `?` or Ctrl+/ shows the shortcuts · Esc closes a dialog or menu |
| In a document | Ctrl+Z undo · Ctrl+Shift+Z, or Ctrl+Y (not on Apple), redo · Esc leaves the selected block |
| A block on a handwritten page (Tab to it, or click it) | ↑ ↓ move it a ruled line · ← → move it a little · Enter writes in it (Write) · Delete or Backspace deletes it, or only this page's part (Write) · Esc cancels a move |
| In the text | Ctrl+B bold · Ctrl+U underline · Ctrl+Shift+S cross out · Ctrl+Shift+H highlight · Ctrl+Alt+0, 1, 2 Normal, Title, Heading · Ctrl+Shift+B note · Ctrl+Shift+8, 7 bulleted and numbered lists · Tab, Shift+Tab indent a list item or take it back out · Ctrl+Enter page break · `/` text styles, lists and a page break |
| As you type | `# ` title, `## ` heading, `- ` and `1. ` lists, `> ` note, at the start of a line · `**bold**`, `*underline*`, `~~cross out~~`, `==highlight==` around words |

The keys never open anything over another dialog or menu, and `?` in a text field is just typed. The Menu at the end of the top bar has the palette, the shortcuts and the theme too.

**The palette** (Ctrl+K) finds, as you type:

- **Go to**: Write, Outline, Style, Export or Home (in a document; the stage on screen is left out).
- **Documents**: every other document on the device, with when it was last edited.
- **Create**: New document, Import a file…
- **Export** (in a document): Export as PDF, PNG or JPG, which opens Export with that format chosen.
- **Looks for the whole document** (in a document): the six looks, then the ones you saved. One undo step, whatever Style's scope is.
- **Theme**: System theme, Light theme, Dark theme, with `Current` beside the one in use.
- **Help**: Keyboard shortcuts.

## Install and offline

Nib is a web app that installs: the browser's **Install** button (Chrome, Edge) or **Add to Home Screen** (Safari on iPhone and iPad). Installed or not, it works with no connection once it has loaded once.

- **What is kept on the device.** On the first visit Nib keeps the whole app, about 4 MB: the interface and the drawing engine, all 33 hands' font files, the paper photo, the icons, and the PDF and Word readers (PDF.js and mammoth). So a hand never chosen before draws, and a first import reads, with no connection. Google's web copies of the older hands (for letters, such as Devanagari, that their own files don't cover) are kept the first time they are used. Your documents, saved looks, uploaded fonts and settings are in the browser's storage as before. When it is ready Nib says `Nib works offline now.`
- **New versions are offered, never forced.** Nib looks for a new version when it opens, every hour while it is shown, and when you come back to it after an hour or more. When there is one, every open tab says `A new version is ready.` with **Reload**, and the message stays (through opening and closing documents) until you press it or swipe it away. **Reload** writes your last change, then reloads that tab only, in the new version. No tab ever reloads by itself: the others keep their text and caret, and their message.
- **Two tabs on two versions.** After Reload in one tab, another can go on running the old version beside it until you reload it too. Both read and write the same documents (the storage format is unchanged), under the usual rules for two tabs (see Working in more than one tab). An import started in the old tab may say `The document reader couldn’t be loaded. Check your connection and try again.`, because the old version's files are gone: press Reload there. If a later version ever saves a document an older one can't read, the older tab says `This document was saved by a newer version of Nib. Reload the page to keep editing.` with **Reload**, which applies the waiting version first, so the reload doesn't come back to the old one.

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

`npm run smoke` drives the built app in a real browser, so it needs Chromium and Playwright available on the machine. It serves the build at `/nib-engine/`, as GitHub Pages does, and also checks the palette, the shortcut sheet, the theme, the tips, every stage at 390 and 320 px wide, a new version in two tabs, Chromium's own installability check, and a reload, a hand never used before and both imports with the network off and the server stopped.

The built site uses relative paths, so it works from any folder or web address.

The PWA audit of Lighthouse 11.7.1 (Lighthouse 12 dropped it) is run by hand, against the build served at `/nib-engine/`:

```bash
npm run build
node node_modules/vite/bin/vite.js preview --base /nib-engine/ --port 4321 --strictPort
# in another terminal, in a scratch folder:
CHROME_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome | head -1) npx -y lighthouse@11.7.1 http://localhost:4321/nib-engine/ --only-categories=pwa --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lh.json --quiet
```

Its `installable-manifest`, `splash-screen`, `themed-omnibox` and `maskable-icon` audits should each score 1. (`CHROME_PATH` is any Chromium; the one above is Playwright's.)

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
- `src/app/` holds the root component and the route between Home and the document stages, and the installed app:
  - `pwaManifest.ts`: the web app manifest and the Workbox settings (what is precached, and Google's copies of the hands cached when used) that `vite.config.ts` gives vite-plugin-pwa.
  - `pwa.ts`: registers the service worker, in a production build only (development and tests have none).
  - `updates.ts`: `Nib works offline now.`, and each new version offered with Reload, which writes the last change and reloads only the tab that asked.
- `index.html` sets light or dark before anything is drawn (its `data-theme-boot` script). `src/main.tsx` starts the app: it takes the theme over, adds a `@font-face` for each hand (the browser downloads a file only when something on screen uses it), renders `App` and starts the service worker.
- `src/shell/` holds the top bar (`TopBar.tsx`), the stage navigation (`StageNav.tsx`), the undo shortcuts (`useUndoShortcuts.ts`) and the Menu (`AppMenu.tsx`: the palette, the shortcuts and the theme). The app's own overlays, mounted once outside the stages:
  - `overlayStore.ts`: which overlay is open (one at a time), where the focus goes back when it closes, and whether another dialog or menu is open, so the app's keys open nothing over it.
  - `Overlays.tsx`: mounts the palette and the shortcut sheet, and runs `useAppShortcuts.ts` (Ctrl+K, Ctrl+/ and `?`).
  - `shortcuts.ts`: every shortcut in Nib, as `ShortcutSheet.tsx` shows them.
  - `commands.ts`: what the palette offers, in its groups and order; `CommandPalette.tsx` shows it (cmdk, through `src/components/ui/command.tsx`).
- `src/features/home/` is Home: `HomePage.tsx`, `TemplateGrid.tsx` and `templates.ts` (the six templates), `RecentList.tsx` and `recent.ts`, `PageThumb.tsx` and `thumbs.ts` (page 1 drawn by the engine and kept in `prefs`), and `actions.ts`.
- `src/features/import/` is the Import dialog: `ImportDialog.tsx`, `ImportPreview.tsx` and `preview.ts`, `ImportOptions.tsx` and `options.ts`, and `apply.ts` (writing it out).
- `src/features/doc/build.ts` builds new and imported documents.
- `src/features/` holds one folder per part of the app: `home`, `import`, `write`, `style`, `export`, `doc`, `editor` (the rich-text block editor and its toolbar) and `pages` (the handwritten page views, block frames and dragging). `write` holds the Pages and Outline views, menus and page dragging, and `doc` holds the actions that change blocks and pages.
  - `style` holds the Style panel: `StylePanel.tsx` with its sections (`ScopeBar`, `LooksSection`, `HandSection` and `HandPicker`, `PenInkSection`, `PaperSection`, `NaturalSection`, `SizeSection`), `looks.ts`, `hands.ts` (the picker's search and filters), `fonts.ts` (uploaded fonts: reading, registering and storing them), `prefs.ts` (saved looks, favourites and preview text, kept on the device), and `fit.ts` (the page count and Fit back, which tries sizes on copies laid out by the engine). `HandSample.tsx` draws a sample of any hand, look or paper through the engine's `drawSample`.
  - `doc/StageSheet.tsx` is the phone sheet that Style, Export and Outline share: it rests at three heights, keeps the pages above it live, and has messages rise above it.
  - `doc/Tips.tsx` is the first-visit tips card, and `doc/tipsSeen.ts` remembers on the device (`nib.tips`) that they have shown.
  - `export` holds the Export panel (`ExportPanel.tsx`, `ExportStage.tsx`) and the pipeline behind it:
    - `plan.ts`: what a download is (format, ZIP, quality, chosen pages), its file names, button label and size text.
    - `state.ts`: the device preferences and the page choice.
    - `render.ts`: draws one page with the engine's `composePage`, `frameShot` and `applyLook`, and encodes it.
    - `png.ts` and `jpeg.ts`: the scrubbers that keep only the picture; `pdf.ts`, `zip.ts` and `crc32.ts`: the writers.
    - `build.ts`: renders the pages and wraps them into the file. `run.ts`: Download and Share. `estimate.ts`: the size estimate.
- `src/components/ui/` holds the shared interface components (Radix primitives styled in the shadcn way). `drawer.tsx` is the bottom sheet (vaul) that Style, Export and Outline use on phones.
- `src/brand/` holds the Nib logo; `src/styles/app.css` holds the Tailwind setup and design tokens. `src/lib/` holds small helpers:
  - `theme.ts`: System, Light or Dark, kept in `nib.theme`, applied to the page and its `theme-color`, and followed when another tab changes it.
  - `keys.ts`: Ctrl or ⌘, and how a shortcut is written (`Ctrl+Shift+Z`, or `⇧⌘Z` on Apple keyboards).
  - `focus.ts`: a message's button (its Undo, say) gives the focus back to what had it.
  - `media.ts`: the 860 px `wide:` breakpoint as a `useWide()` hook, which switches the stages between their wide and phone layouts.
- `scripts/smoke.mjs` is the browser smoke test. It picks a free port, so two runs can go side by side. `scripts/fixtures.mjs` makes the `.docx` and PDF that the tests and the smoke run import. `scripts/icons.mjs` draws the app icons and the social image in `public/icons/` from `public/favicon.svg`: it is run by hand (`node scripts/icons.mjs`), needs the machine's Playwright, and its PNGs are committed, because CI has no Playwright.
- `public/fonts/` holds the handwriting fonts, which a page loads only when it uses them (the service worker keeps them all for offline use). Their licences are in `public/fonts/licenses/`, and [FONTS.md](FONTS.md) lists them all.
- `public/paper/photo.webp` is the photographed sheet used by the Photo paper.

## Credits

The handwriting fonts are open-licensed fonts from Google Fonts, via Fontsource; see [FONTS.md](FONTS.md). Nib also uses [opentype.js](https://github.com/opentypejs/opentype.js), [PDF.js](https://github.com/mozilla/pdf.js) and [mammoth](https://github.com/mwilliamson/mammoth.js). Nib writes its own PDF and ZIP files.

The interface is built with [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Radix](https://www.radix-ui.com) components in the style of [shadcn/ui](https://ui.shadcn.com), [Zustand](https://github.com/pmndrs/zustand) and [idb](https://github.com/jakearchibald/idb). The palette uses [cmdk](https://cmdk.paco.me), and the offline copy is made by [vite-plugin-pwa](https://vite-pwa-org.netlify.app) with [Workbox](https://developer.chrome.com/docs/workbox).
