# Nib Milestone 4 (Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build spec §6 Export. It covers PDF, PNG and JPG, one ZIP for several images (on by default), All pages or Choose pages, the four looks and Slight camera tilt (off by default, remembered per document), Standard or Print quality, the file name with its extension, a Download button that says what it makes and its estimated size, and Share… through the system share sheet. Every file carries no metadata. The pages show exactly as they will download, and on phones the panel is a bottom sheet.

**Architecture:** A download takes a frozen copy of the document. Each chosen page goes through the engine's own `composePage` → `frameShot` → `applyLook` (unchanged) at the chosen size. Then the browser's encoder makes the image, and a byte-level scrubber in TypeScript keeps only the picture. Nib's own writers wrap the pages: a minimal PDF writer (one JPEG per A4 page, no `/Info`, a random `/ID`) and a store-only ZIP writer with CRC32 and a fixed 1980-01-01 timestamp. jsPDF is removed. Choices live in three small Zustand stores (device preferences, the page choice, the run in progress), so the panel can remount without losing anything. The look and the tilt stay in the document's settings (`S.look`, `S.tilt`), so they are undoable. The size estimate measures one real page.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind v4, shadcn-style components hand-written on `radix-ui` 1.8.1 in `src/components/ui`, `vaul` 1.1.2 (through M3's `drawer.tsx`), `lucide-react`, `sonner`, Zustand (`src/store/editor.ts`), `idb` (IndexedDB `nib`), Vitest + Testing Library + jsdom + fake-indexeddb, and Playwright (installed machine-wide) for `npm run smoke`. The smoke also uses `pdfjs-dist` 3.11.174 (already a dependency) and Node 22's `zlib.crc32` to read the downloads.

**Spec:** `docs/superpowers/specs/2026-11-06-nib-redesign-design.md`. This milestone implements §6 Export in full, with §1 for the realism rule, §2 for tokens and type, §7 for phones and §10 for what stays later (the Photo export look is not in M4). Layout and copy the spec leaves open come from the prototype (`git show prototype/nib-redesign:prototype/nib-prototype.html`: `estimate`, `exportPanel`, `renderExport`, `.exp-f`, `.excluded`). The roadmap row is in `docs/superpowers/plans/2026-11-06-nib-m1-foundation.md` (Roadmap after Milestone 1). Its exit check: **tests read the produced PDF and image bytes and find no metadata fields.**

**Branch:** `nib/m4-export`, cut from `main` after Milestone 3 is merged. Tasks run in worktrees off that branch. **The controller merges each task, and at the end merges `nib/m4-export` into `main` and pushes. No task merges, pushes or deploys.**

## Global Constraints

- Product name **Nib** in all copy. Copy is plain sentence case, quotes and apostrophes are curly, and every string comes from the Interface copy table below.
- **Realism is non-negotiable (spec §1).** Every exported pixel is the engine's own `applyLook(frameShot(composePage(i, pxW), i), i)`, as listed in the Export pipeline table below. No download uses CSS, the screen's canvases, a lower resolution, or a skipped step.
  - The **one engine edit** in M4 is `src/engine/config.js` `DEFAULTS.tilt: true` → `false` (spec: tilt is off by default). It is a default value, not realism code.
  - `core.js`, `doc.js`, `importers.js`, the `.d.ts` files and every other line of `config.js` stay byte-for-byte as they are.
  - The engine functions M4 calls (none of them change): `use`, `computeLayout`, `composePage`, `frameShot`, `applyLook` (render, Task 4), `cleanName` (file names, Tasks 3 and 9), and `fontsInUse`, `fontReady` (readiness, Tasks 7 and 9), plus `settings` and `framesOf` in tests.
  - Task 10 checks this with `git diff main -- src/engine`: only that line in `config.js` changes, plus one test in `engine.test.ts`.
- **No metadata (spec §6).** Every file Nib hands over (download or share) is made by `buildExport` (Task 6) and is written as the Metadata guarantees table says. Nothing else in the app's code encodes a canvas or saves a file: outside tests and `src/test/`, `toBlob` appears only in `src/features/export/render.ts`, and `createObjectURL` only in `src/features/export/run.ts`.
- Colour tokens and type follow spec §2. Tailwind: `bg-surface`, `bg-surface-2`, `bg-desk`, `border-line`, `text-muted` (grey **text**; never `bg-muted`), `bg-primary`/`text-primary` and `bg-primary-soft`.
  - UI parts come from `src/components/ui` (hand-written on `radix-ui`, because the network proxy blocks the shadcn CLI). Icons come from `lucide-react`, and messages go through `toast()` (`src/store/editor.ts`).
  - Figtree weights: 400 for text, 500 for controls, 600 for names and titles.
  - Every new control has a focus ring (`focus-visible:ring-2 focus-visible:ring-ring/50`).
- `wide:` (860 px) is the only layout breakpoint, and `useWide()` (`src/lib/media.ts`) is the only JS test for it.
- `vite.config.ts` keeps `base: './'`. TypeScript is `strict`. New code is `.ts`/`.tsx`, and the engine stays `.js` with `.d.ts`.
  - App code type-checks under `tsconfig.app.json`, which has **no Node types**: no `Buffer` or `node:*` in `src` outside tests. Use `Uint8Array`, `TextEncoder`, `crypto.getRandomValues`.
  - Byte arrays that reach `Blob` or `File` are typed `Uint8Array<ArrayBuffer>` (make them with `new Uint8Array(n)`), so TypeScript's DOM types accept them.
  - Test files and `src/test/**` type-check under `tsconfig.test.json` and may use `node:zlib` (`crc32`, `deflateSync`).
- **Undo** (the M2/M3 rule: every document change goes through `update(fn, { history })`, and a no-op records nothing):
  - **How it looks** and **Slight camera tilt** are the document's `S.look` and `S.tilt`. Each change is one step (`setS(k, v, { layout: false })`), and choosing the value already chosen records nothing.
  - **File name** is the document's `doc.fileName`. One edit, from the first keystroke to leaving the field, is one step (`gesture('file-name')`). An edit that changes nothing records nothing.
  - **Format, ZIP and quality** are device preferences (IndexedDB `prefs`, key `export`). They are not in the document and not in its history.
  - **The page choice** is UI state for the open document. It is not saved, has no undo, and starts again when another document is opened.
  - Download and Share change nothing in the document.
- **Storage.** IndexedDB `nib` stays at version 1. The one new `prefs` key is `export` → `{ format, zip, quality }`, and M4 writes nothing to `localStorage`.
- **Hidden stages.** `ExportPanel` subscribes to `version` only while its stage is active. The size estimate measures only while the stage is active. The phone sheet is open only while the stage is active. The M2 test `a hidden stage’s panel doesn’t redraw on every change` keeps passing.
- **Dependencies.** No new runtime dependency. `jspdf` is removed (Task 9: `npm uninstall jspdf`), and `npm ls jspdf` then lists nothing.
- **Tests.** Test-first, and the test output stays clean: no act warnings, no React, Radix or jsdom console errors. Task 1 gives jsdom a canvas encoder, so nothing logs `Not implemented: HTMLCanvasElement.prototype.toBlob`. Every commit leaves `npm test && npm run typecheck && npm run build && npm run smoke` passing.

## Export pipeline (realism)

What a downloaded page is made of, step by step. Steps 1–3 are the engine's own functions, unchanged, called by `renderPage` (Task 4) on a frozen copy of the document.

| # | Step | Function | What it adds |
|---|---|---|---|
| 1 | Compose | `composePage(i, pxW)` (core.js) | The paper from `paintPaper`: tone, grain, fibres, rules, margin, grid, spiral edge or punch holes, room lighting, show-through, fold crease, edges, or the photographed sheet. Then every block part's ink from `renderSegment` (real outlines, alternates, pen, pressure and ink flow, wobble, drift, mistakes, highlights), multiplied on top. |
| 2 | Camera tilt | `frameShot(canvas, i)` | With `S.tilt`: a turn of 0.3°–0.9° and an uneven crop, chosen per page from the seed and the page's own index. |
| 3 | Look | `applyLook(canvas, i)` | Scanned, Greyscale scan, Black and white: the sheet crooked on the glass, optics blur, flattened light, the look's tone curve, sensor noise, the lid shadow, toner specks. |
| 4 | Encode | `canvas.toBlob` | The browser's PNG encoder, or its JPEG encoder at the quality's JPEG setting. |
| 5 | Scrub | `scrubPng` / `scrubJpeg` | Keeps only the picture (see Metadata guarantees). |
| 6 | Wrap | `writePdf` / `writeZip` | One file. |

Sizes (`QUALITY`, Task 3):
- **Standard** is `pxW = PAGE_W * 2.2`, giving 1747 × 2471 px and JPEG 0.9. It is exactly the size every M1–M3 download had (`exportPage`).
- **Print quality** is `pxW = 2480`, giving 2480 × 3508 px (A4 at 300 dpi) and JPEG 0.95.

The engine draws at that scale. Nothing is scaled up afterwards, and every effect scales with it (`applyLook` works in page units, `k = W / PAGE_W`). A left-out page changes nothing for the others, because each page keeps its own index `i`, and with it its tilt and its scan randomness.

## Metadata guarantees

| Format | Made by | What the file holds, and nothing else | Tests |
|---|---|---|---|
| PDF | `writePdf` (Task 2), Nib's own | Header `%PDF-1.4` and a binary comment line. Catalog (`/Type /Catalog /Pages 2 0 R`), Pages, then for each page: a Page (MediaBox `[0 0 595.28 841.89]`), a content stream `q 595.28 0 0 841.89 0 0 cm /Im0 Do Q`, and one `/DCTDecode` `/DeviceRGB` image, which is a JPEG scrubbed as below. Then the xref, and a trailer with exactly `/Size`, `/Root` and `/ID [<id> <id>]`. **There is no `/Info` dictionary at all** (so no Producer, Creator, Author, Title, Subject, Keywords, CreationDate or ModDate), no `/Metadata` stream, and no other dictionary. The ID is 16 bytes from `crypto.getRandomValues`, written in upper-case hex, the same value in both places, and new for every file. | Tasks 2, 6; smoke (bytes and pdf.js) |
| PNG | `toBlob('image/png')` → `scrubPng` (Task 1) | Only the chunks `IHDR`, `PLTE`, `tRNS`, `sRGB`, `IDAT` and `IEND`, in their original order and bytes. Every other chunk is dropped, wherever it is: `tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`, `iCCP`, `pHYs`, `gAMA`, `cHRM`, `sBIT`, `bKGD`, `hIST`, `sPLT`, APNG chunks and any unknown ancillary chunk. Bytes after `IEND` go too. An unknown *critical* chunk makes the file refused (an error), never passed on. | Tasks 1, 6; smoke |
| JPG | `toBlob('image/jpeg', q)` → `scrubJpeg` (Task 1) | `SOI`, one bare JFIF `APP0` (`FF E0 00 10 'JFIF' 00 01 01 00 00 01 00 01 00 00`: version 1.01, no units, 1:1, no thumbnail), then only `DQT`, `SOF0–3/5–7/9–11/13–15`, `DHT`, `DAC`, `DRI`, `DNL`, `SOS` with its scan data copied exactly, and `EOI`. Every `APP0–APP15` (JFIF variants, JFXX, Exif, XMP, ICC profile, Photoshop, Adobe) and every `COM` is dropped, before, between or after scans. Everything else is dropped too, and so are the bytes after `EOI`. The original APP0 is replaced, not kept. | Tasks 1, 6; smoke (the PDF's images) |
| ZIP | `writeZip` (Task 2), Nib's own | Stored entries (method 0), each with a local header, its data, a central directory entry, then the end record. There are no extra fields, no file or archive comments, no data descriptors, and no attributes (internal 0, external 0). "Made by" is 20 (MS-DOS, 2.0) and "needed" is 20. Every time is `0x0000` and every date is `0x0021` (1980-01-01 00:00). The UTF-8 flag (`0x0800`) is set only for a name with bytes above 0x7F. | Tasks 2, 6; smoke |

"Pixels are the composed page only": each image is exactly the `QUALITY` size, nothing is drawn over the engine's output, and the PDF image fills its A4 page edge to edge.

## Interface copy

Exact strings, used verbatim. `{x}` is filled in. `{pages}` is `1 page` or `{n} pages` (`pagesWord`, M3 `src/features/style/fit.ts`). `{F}` is `PNG` or `JPG`.

| Where | Copy |
|---|---|
| Panel header | heading `Export`; under it, on wide screens only, `The pages are shown exactly as they will download.` |
| Format | heading `Format` · group `Format`: `PDF`, `PNG`, `JPG` · switch `Put the images in one ZIP`, shown only for PNG or JPG with more than one page chosen, with hint `One file to send or upload, instead of {n}.` |
| Pages | heading `Pages` · radio group `Pages`: `All pages ({n})`, `Choose pages` · with Choose pages, a hint: `Click a page to leave it out or put it back. {k} of {n} chosen.` |
| The pages (Choose pages) | each page is a checkbox `Include page {i}`; a left-out page's caption is `Page {i} of {n} · left out` (`Page 1 · left out` in a one-page document) |
| How it looks | heading `How it looks` · radio group `How it looks`: `As written`, `Scanned`, `Greyscale scan`, `Black and white` · switch `Slight camera tilt`, hint `Turned a fraction of a degree and cropped a little unevenly, like a quick photo.` |
| Quality | heading `Quality` · group `Quality`: `Standard`, `Print quality` · hint `1747 × 2471 pixels a page, for screens and uploads.` / `2480 × 3508 pixels a page (300 dpi), for printing.` |
| File name | heading `File name` · field `File name`; its placeholder is the document's title, cleaned (`exportBase('', title)`) · after the field, the ending (`suffixShown`): `.pdf`, `.zip`, `.png`, `.jpg`, or for separate images the first one's, e.g. `-page-1.png` |
| Download | `Download PDF · {pages}` · `Download ZIP · {n} {F}s` · `Download {n} {F}s` (ZIP off) · `Download {F}` (one image). Once estimated, a space and the size follow, e.g. `Download ZIP · 3 PNGs ~2.7 MB`. With no page chosen: `Choose at least one page` (disabled, no size). While files are being made: `Making page {k} of {n}…` (disabled). While a hand's file is arriving: disabled, with title `Waiting for the handwriting to load` (M3's). |
| Size | `~{n} KB` below 999,500 bytes; `~{n.n} MB` below 9,950,000; `~{n} MB` from there (KB and MB are 1000 and 1,000,000 bytes) |
| Share | button `Share…`, only where the browser can share files; disabled whenever Download is |
| Footer | `Made on this device. Nothing is uploaded.` |
| Messages | `Saved {file name}` (one file, M1's wording) · `Saved {n} images` · `Nib couldn’t make the {what}. Try again.` · `Nib couldn’t make the {what} at print quality. Try Standard quality.` (`{what}` is `PDF`, `ZIP`, `images`, `PNG` or `JPG`) · `Ready to share.` with action `Share` · `This browser can’t share these files. Use Download instead.` · `Nib couldn’t share that. Use Download instead.` |
| Phones | sheet title `Export` (visually hidden; the panel's heading shows), handle `Drag to show more or less of Export` |
| Style (M3 inventory) | `SETTING_CONTROLS.tilt.label` becomes `Slight camera tilt` (`look` stays `How it looks`) |

## Review Focus

1. **A change while the files are being made.** Ctrl+Z, a font file arriving, or typing in the file name between two pages must not give a PDF whose pages disagree. Expected: every file is made from the copy frozen when Download was pressed, and the engine is back on the open document afterwards. Test: Task 6 (`edits made while the files are being made don’t get into them`).
2. **Print quality on a phone that runs out of canvas memory.** There, `toBlob` hands back `null` or the canvas is lost. Expected: one clear message suggesting Standard, nothing half-made saved or shared, and the button usable again. Tests: Task 6 (the print message, nothing saved, run idle).
3. **Share after a slow build, in a browser that wants a fresh tap** (Safari's `NotAllowedError` once the tap's activation has expired). Expected: the files are kept, and the message's `Share` opens the sheet with them. Cancelling the sheet says nothing. Tests: Task 6.
4. **Choose pages, then the page count changes** (Fit back, a deleted page, or text taken out in Write). Expected: left-out pages past the end are ignored, the counts and the label follow, and if nothing is left it says `Choose at least one page`. Tests: Task 3 (`chosenPages`) and Task 9 (the label when the document gets shorter).
5. **Odd file names.** That covers an empty name, slashes and other reserved characters, a typed `.pdf`, a title in another script or with an accent, and a document with ten or more pages. Expected: a name every system can save, UTF-8 names in the ZIP with the flag set, and page numbers that sort (`-page-01` … `-page-12`). Tests: Task 3 (`exportBase`, names), Task 2 (UTF-8 flag), Task 6 (the names saved).

## Design decisions

1. **The download is a frozen copy.** `freeze()` takes `structuredClone`s of `S` and `doc`, the title, and the page count from the live layout. `renderPage(f, i, pxW)` runs synchronously: `use(f.S, f.doc)`, `computeLayout()`, steps 1–3, then in a `finally` it puts the engine back with `use(live.S, live.doc)` and `computeLayout()` (as M3's `fitPlan` leaves the engine on the document). `buildExport` yields to the event loop between pages, so the page stays responsive and the button can show progress. Nothing on screen ever draws while the engine holds the copy.
2. **Nib's own PDF writer, not jsPDF.** jsPDF 2.5.1's `putInfo` always writes `/Producer (jsPDF 2.5.1)` and `/CreationDate`. `buildDocument` calls the local function, so overriding `__private__.putInfo` doesn't reach it, and editing the bytes afterwards would mean rewriting the xref. A PDF of one full-page JPEG per page is about 100 lines with exact control of every byte, and removing jsPDF drops its lazy chunk.
3. **A store-only ZIP writer with CRC32, not a library.** PNG and JPEG are already compressed, so deflate would save almost nothing. A writer we own puts nothing in the archive beyond what ZIP requires. mammoth's `jszip` is only a transitive dependency, and it writes the current time by default. **The timestamp:** every ZIP header must carry an MS-DOS date and time, and there is no "unknown" value (date 0 is not a valid date, and some tools reject or misshow it). So every entry gets 1980-01-01 00:00, the earliest date the format can hold. It says nothing about when, where or on what the file was made, it makes the same pages give byte-identical archives, and it is the value reproducible-build tools use.
4. **Scrub after encoding, whatever the browser does.** Browsers differ in what their encoders add (Chromium's Skia may add `sRGB`, `iCCP` or an ICC `APP2`, and others add more). So M4 never trusts the encoder: every image goes through a whitelist scrubber that reads the actual bytes, and the PDF embeds only scrubbed JPEGs. The images carry no print size (no `pHYs`, JFIF density 1:1), because a PDF is the way to print at A4.
5. **The size estimate is measured, not guessed.** `useSizeEstimate(firstPage)` waits for a 600 ms pause while the stage is shown and the hands are loaded. Then it draws the first chosen page at Standard size and encodes it three ways: PNG, JPEG 0.9 and JPEG 0.95. The result is cached by the settings, the blocks and the page, so format, ZIP, quality and page changes cost nothing. `estimateBytes` multiplies by the page count, scales by the pixel ratio for Print quality (`PRINT_RATIO` = 2480·3508 / 1747·2471), and adds the container's own bytes. Drawing a page takes a moment on the main thread, which is why it waits for a pause and keeps what it measured.
6. **What is remembered where.**
   - Look and tilt are the document's settings (spec: "remembered per document"; already in `S`, and undoable).
   - Format, ZIP and quality are how this person likes to download, so they live on the device (`prefs` `export`). They are read when the Export panel first mounts, and a choice made before they arrive wins.
   - The page choice lives in `useExportPick`, which holds which pages are *left out* (so pages added later are included). It resets whenever `useEditor`'s `docId` changes.
   - The run in progress lives in `useExportRun`.

   Because every choice lives in a store or the document, the panel can unmount and mount again (the 860 px crossing, below) without losing anything.
7. **The pages as they will download.** The preview keeps M1's exact scan preview: the screen's own canvases go through `frameShot` and `applyLook` once editing pauses. In Export it now also runs for Slight camera tilt with As written. Today it doesn't, so a tilted download showed untilted. Write and Style never pass the tilt. In Choose pages each page is a checkbox (`Include page {i}`) laid over the paper, and a left-out page is dimmed to 35% with `· left out` in its caption.
8. **Share.** Share… builds the same files as Download, except that a ZIP is never shared: images go as images, because share targets (messages, mail, drive apps) take images and most can't open a ZIP. Then it calls `navigator.share({ files })` with nothing else (no title or text). The button shows only when `navigator.canShare` accepts a PDF file. The real files are checked with `canShare` before sharing. `AbortError` (closed sheet) is silent. `NotAllowedError` (the tap's activation expired while the files were made) gives `Ready to share.`, whose `Share` action is a fresh tap that shares the files already made.
9. **Phones.**
   - Below 860 px the Export stage shows its pages full width and the panel in a non-modal bottom sheet. That is M3's `drawer.tsx`, through `StageSheet`, which is M3's `StyleSheet` moved to `src/features/doc/StageSheet.tsx` and given a title, a handle label and its lowest height.
   - Its heights are `['168px', 0.55, '{height − stage top}px']`, starting at 0.55. At 168 px the handle, the panel's title and its footer (Download and Share…) show.
   - The top height stops just below the stage switcher (M3's rule, kept by the shared code).
   - The pages' bottom padding follows the sheet (`pb-[calc(var(--sheet-shown)+12px)]`), as in Style.
   - The panel is a flex column: header, a scrolling middle, and a pinned footer. Beside the pages the footer sits at the bottom of the 380 px column, and in the sheet it sits at the bottom of the visible part.

## Rulings on the spec, the prototype and M3's carry-overs

- **jsPDF goes.** Nib writes its own PDF (Design decision 2), and `jspdf` 2.5.1 is uninstalled.
- **ZIP is Nib's own, store-only, dated 1980-01-01 00:00** (Design decision 3). No new dependency.
- **PNG keeps `sRGB`** (one byte of colour intent, not metadata) and drops `iCCP`, `gAMA` and `cHRM`. Canvas pixels are sRGB, so dropping them changes nothing. **JPEG always gets the bare JFIF `APP0`**, even when the encoder wrote none.
- **Format, ZIP and quality are remembered on the device; look and tilt per document** (Design decision 6). The spec's "remembered per document" is under How it looks.
- **Tilt is off by default:** `DEFAULTS.tilt` becomes `false`. Documents already stored keep the tilt they have (no migration), because "the last choice is remembered per document".
- **The file name defaults to the document's title** (spec), cleaned with the engine's `cleanName`, and `Untitled` if that leaves nothing. M1's slug from the first heading (`autoName`) is no longer used. The field stays empty until typed in, so the default follows a renamed document.
- **Quality:** Standard is today's export size (1747 × 2471, JPEG 0.9). Print quality is A4 at 300 dpi (2480 × 3508, JPEG 0.95). PNG is lossless at both. PDF pages are A4 with one JPEG each, as today.
- **Labels:** a PDF's label says how many pages (`Download PDF · 3 pages`), so a Choose pages PDF says what it holds. One image is `Download PNG`.
- **Names:** separate images and ZIP entries are `{base}-page-{n}.{ext}`, where `n` is the page's number in the document, zero-padded to as many digits as the document's page count. One image is `{base}.{ext}`, a ZIP is `{base}.zip` and a PDF `{base}.pdf`.
- **ZIP off:** each image is its own download, about 250 ms apart. A browser may ask to allow several downloads, which is why ZIP is on by default.
- **Share sends images, never a ZIP, and is hidden where the browser can't share files** (Design decision 8).
- **How it looks stays a radio list, without the prototype's look thumbnails.** Those were CSS imitations (spec §1), and the pages beside the panel are the real preview.
- **Look and tilt apply to every page.** There is no per-page look, as before.
- **Download waits for the hands** (disabled while `fontsInUse()` has a hand that isn't `fontReady`), so a file is never drawn with a fallback font. A download already running when another document is opened finishes and saves, with its own name.
- **The Photo export look is later** (spec §10), not M4.
- **Phones (§7):** Export's sheet ships in this milestone (M3 ruled it), on the shared `StageSheet`. **Its top height stops below the stage switcher**, inherited from M3 through the moved `useSheetSnaps`, and Task 8 tests it for Export.
- **Crossing 860 px remounts the stage's panel:** Export inherits this, and it stays deferred to M6 with Style's. M4 makes it harmless: no Export state lives in the panel (Design decision 6). The only thing a crossing loses is the focus, for example in the file name field.

## Order and parallelism

A task starts once the tasks in its Needs column are merged. Tasks in the same wave touch disjoint files and can run in parallel worktrees.

| Wave | Tasks | Needs |
|---|---|---|
| 1 | **1** Image scrubbers ∥ **2** PDF and ZIP writers ∥ **3** Export choices: plan, copy and state ∥ **4** Pages drawn for download ∥ **5** The pages as they will download | — |
| 2 | **6** Making the files: Download and Share (1, 2, 3, 4) ∥ **7** The size estimate (3, 4) ∥ **8** The Export stage and the shared phone sheet (3, 5) | as listed |
| 3 | **9** The Export panel | 3, 4, 6, 7, 8 |
| 4 | **10** Smoke and README | all |

## File map (end of Milestone 4)

```
src/features/export/png.ts, jpeg.ts               scrubPng, scrubJpeg                               (Task 1)
src/test/images.ts; src/test/setup.ts              PNG/JPEG fixtures and readers; jsdom's toBlob       (Task 1)
src/features/export/crc32.ts, pdf.ts, zip.ts       crc32, writePdf, writeZip                          (Task 2)
src/test/pdf.ts, src/test/zip.ts                   readPdf, readZip                                   (Task 2)
src/features/export/plan.ts, state.ts              plan, names, copy, size arithmetic; the 3 stores   (Task 3)
src/features/export/render.ts                      freeze, renderPage, encodeCanvas                   (Task 4)
src/engine/config.js (DEFAULTS.tilt), engine.test.ts                                                  (Task 4)
src/features/pages/PageView.tsx, Sheet.tsx; src/styles/app.css   tilt preview, Choose pages          (Task 5)
src/features/export/build.ts, run.ts               buildExport; download, share, saveFiles            (Task 6)
src/features/export/estimate.ts                    measurePage, useSizeEstimate                       (Task 7)
src/features/doc/StageSheet.tsx (was style/StyleSheet.tsx); style/StyleStage.tsx; export/ExportStage.tsx (Task 8)
src/features/export/ExportPanel.tsx; −exporters.ts; package.json (−jspdf); stages.test.tsx; style/controls.ts; smoke locator (Task 9)
scripts/smoke.mjs, README.md                                                                          (Task 10)
```

---

### Task 1: Image scrubbers: PNG and JPEG keep only the picture

**Files:**
- Create: `src/features/export/png.ts`, `src/features/export/jpeg.ts`, `src/features/export/png.test.ts`, `src/features/export/jpeg.test.ts`, `src/test/images.ts`
- Modify: `src/test/setup.ts` (a canvas encoder for jsdom)

**Interfaces:**
- Consumes: nothing from other tasks. `node:zlib` (`crc32`, `deflateSync`) in `src/test/images.ts` only.
- Produces:
  - `png.ts`:
    - `PNG_KEEP = ['IHDR', 'PLTE', 'tRNS', 'sRGB', 'IDAT', 'IEND'] as const`.
    - `scrubPng(bytes: Uint8Array): Uint8Array<ArrayBuffer>`:
      - It checks the 8-byte signature, then walks the chunks (length, type, data, CRC) and copies the bytes of each kept chunk unchanged, in order. It stops after `IEND`.
      - It throws `Error('not a PNG')` for a bad signature, `Error('truncated PNG')` for a chunk running past the end or a missing `IEND`, and `Error('unknown critical PNG chunk {type}')` for a chunk whose type starts with an upper-case letter and isn't in `PNG_KEEP`.
      - The CRCs are not recomputed: kept chunks are byte-identical.
  - `jpeg.ts`:
    - `JFIF_APP0: Uint8Array` = `FF E0 00 10 4A 46 49 46 00 01 01 00 00 01 00 01 00 00` (18 bytes).
    - `scrubJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer>`. The output is `SOI`, then `JFIF_APP0`, then the input's kept segments in order, then `EOI`.
      - Kept markers: `DB`, `C0–C3`, `C5–C7`, `C9–CB`, `CD–CF`, `C4`, `CC`, `DD`, `DC`, and `DA`, which is copied with all of its scan data.
      - Scan data runs until `FF` followed by a byte that is not `00`, not `D0–D7` (RSTn) and not `FF` (fill). That marker is then handled like any other, so `APPn`/`COM` between scans of a progressive JPEG are dropped too.
      - Fill bytes (`FF FF …`) before a marker are skipped.
      - Everything after `EOI` is dropped.
      - It throws `Error('not a JPEG')` without `FF D8` at the start, and `Error('truncated JPEG')` for a segment past the end or no `EOI`.
  - `src/test/images.ts` (tests only):
    - `pngChunk(type: string, data: Uint8Array | string): Uint8Array` (a string becomes latin1 bytes; the CRC comes from `zlib.crc32`).
    - `pngFile(o: { width: number; height: number; before?: Uint8Array[]; after?: Uint8Array[]; idat?: number; trailing?: string }): Uint8Array<ArrayBuffer>`. It writes the signature, `IHDR` (8-bit RGBA, colour type 6), the `before` chunks, `idat` `IDAT` chunks (default 1; each holds `deflateSync` of a few bytes), the `after` chunks, `IEND`, then the `trailing` bytes.
    - `PNG_METADATA: Uint8Array[]`: `tEXt` (`Software\0Nib test`), `iTXt` (`XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>Nib test</x:xmpmeta>`), `zTXt` (`Comment\0\0` + deflate of `Nib test`), `eXIf` (`MM\0*` + `Nib test camera`), `tIME` (7 bytes), `iCCP` (`Display P3\0\0` + deflate bytes), `pHYs` (9 bytes), `gAMA` (4), `cHRM` (32), and a private ancillary `prVt` (`Nib test`). There is no `sRGB`.
    - `pngChunks(bytes): { type: string; data: Uint8Array; crcOk: boolean }[]`; `pngSize(bytes): { width: number; height: number }` (from `IHDR`).
    - `JFIF_BARE: Uint8Array`: the same 18 bytes as `JFIF_APP0`, written out separately so the tests don't trust the code.
    - `jpegFile(o: { width: number; height: number; head?: Uint8Array[]; between?: Uint8Array[]; trailing?: string }): Uint8Array<ArrayBuffer>`.
      - It writes `SOI`, then `head` (default `[JFIF_BARE]`), `DQT` (67 bytes), `SOF0` (8-bit, `height`, `width`, 3 components) and a `DHT` segment.
      - Then `SOS` (3 components) and scan data `12 34 FF 00 56 FF D0 78 9A FF 00`.
      - With `between`, those segments follow the first scan, and a second `SOS` and scan follow them.
      - Last come `EOI` and the `trailing` bytes.
    - `JPEG_METADATA: Uint8Array[]`, a `head`: a non-bare `APP0` JFIF (units 1, 300 × 300 dpi, a 1 × 1 thumbnail), a `JFXX` `APP0`, `APP1` `Exif\0\0MM\0*` + `Nib test camera`, `APP1` XMP (`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Nib test</x:xmpmeta>`), `APP2` `ICC_PROFILE\0` + bytes, `APP13` `Photoshop 3.0\0Nib test`, `APP14` `Adobe` + 7 bytes, and `COM` `Nib test machine`.
    - `jpegSegments(bytes): { marker: number; data: Uint8Array }[]`: every marker after `SOI` up to and including `EOI` (scan data not included; `data` is the segment's payload without the length).
    - `jpegScans(bytes): Uint8Array[]`: each scan's data.
    - `latin1(bytes): string`.
    - `NO_METADATA = /Nib test|Exif|ICC_PROFILE|Photoshop|ns\.adobe\.com|Adobe|JFXX|Display P3/`.
    - `stubCanvasEncoder(o?: { metadata?: boolean }): MockInstance`: `vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')`, answering on a microtask with `pngFile({ width: this.width, height: this.height, before: metadata ? PNG_METADATA : [], after: metadata ? [pngChunk('tEXt', 'Comment\0Nib test')] : [] })` for PNG (and any type it doesn't know), or with `jpegFile({ width, height, head: metadata ? JPEG_METADATA : undefined })` for `image/jpeg`. It records `(type, quality)` in its calls.
  - `src/test/setup.ts`: `HTMLCanvasElement.prototype.toBlob` is replaced with the clean form of the same encoder (no metadata), answering through `queueMicrotask`, which fake timers don't hold up. The comment says jsdom can't encode a canvas.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/export/png.test.ts
const types = (b: Uint8Array) => pngChunks(b).map(c => c.type);
test('a PNG keeps only the chunks that make the picture', () => {
  const src = pngFile({ width: 4, height: 3, before: [pngChunk('sRGB', Uint8Array.of(0)), ...PNG_METADATA], idat: 2, after: [pngChunk('tEXt', 'Comment\0Nib test after')], trailing: 'Nib test trailing' });
  const out = scrubPng(src);
  expect(types(out)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IDAT', 'IEND']);
  expect(pngChunks(out).every(c => c.crcOk)).toBe(true);
  expect(latin1(out)).not.toMatch(NO_METADATA);
  expect(pngChunks(out).filter(c => c.type === 'IDAT')).toEqual(pngChunks(src).filter(c => c.type === 'IDAT'));
});
test('a palette PNG keeps its palette and transparency', () => { const out = scrubPng(pngFile({ width: 2, height: 2, before: [pngChunk('PLTE', new Uint8Array(6)), pngChunk('tRNS', Uint8Array.of(0))] })); expect(types(out)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']); });
test('a PNG that is already bare comes back byte for byte', () => { const src = pngFile({ width: 4, height: 3 }); expect(scrubPng(src)).toEqual(src); });
test('what isn’t a whole PNG is refused', () => {
  expect(() => scrubPng(new Uint8Array(20))).toThrow('not a PNG');
  const src = pngFile({ width: 4, height: 3 }); expect(() => scrubPng(src.slice(0, src.length - 6))).toThrow('truncated PNG');
  expect(() => scrubPng(pngFile({ width: 1, height: 1, before: [pngChunk('ABCD', 'x')] }))).toThrow('unknown critical PNG chunk ABCD');
});
test('jsdom’s canvas encoder gives a clean picture of the canvas size', async () => {
  const c = document.createElement('canvas'); c.width = 30; c.height = 20;
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  expect(pngSize(new Uint8Array(await blob!.arrayBuffer()))).toEqual({ width: 30, height: 20 });
});
// src/features/export/jpeg.test.ts
const markers = (b: Uint8Array) => jpegSegments(b).map(s => s.marker);
test('a JPEG keeps a bare JFIF header and the picture, nothing else', () => {
  const src = jpegFile({ width: 8, height: 8, head: JPEG_METADATA, trailing: 'Nib test trailing' });
  const out = scrubJpeg(src);
  expect(markers(out)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);
  expect(out.slice(2, 20)).toEqual(JFIF_BARE);
  expect(latin1(out)).not.toMatch(NO_METADATA);
  expect(jpegScans(out)).toEqual(jpegScans(src));
  expect([...out.slice(-2)]).toEqual([0xff, 0xd9]);
});
test('a JPEG without JFIF gets the bare one', () => expect(scrubJpeg(jpegFile({ width: 8, height: 8, head: [] })).slice(2, 20)).toEqual(JFIF_BARE));
test('a bare JPEG comes back byte for byte', () => { const src = jpegFile({ width: 8, height: 8 }); expect(scrubJpeg(src)).toEqual(src); });
test('comments and APPn between the scans of a progressive JPEG go too', () => {
  const src = jpegFile({ width: 8, height: 8, between: [JPEG_METADATA[7], JPEG_METADATA[2], dht()] }); // COM, APP1 Exif, then a table the second scan needs
  expect(markers(scrubJpeg(src))).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xc4, 0xda, 0xd9]);
  expect(jpegScans(scrubJpeg(src))).toHaveLength(2);
});
test('fill bytes before a marker are skipped', () => { const src = jpegFile({ width: 8, height: 8 }); const i = src.indexOf(0xdb) - 1; const filled = new Uint8Array([...src.slice(0, i), 0xff, ...src.slice(i)]); expect(scrubJpeg(filled)).toEqual(src); });
test('what isn’t a whole JPEG is refused', () => { expect(() => scrubJpeg(new Uint8Array(10))).toThrow('not a JPEG'); const src = jpegFile({ width: 8, height: 8 }); expect(() => scrubJpeg(src.slice(0, 30))).toThrow('truncated JPEG'); });
```
(`dht()` is a small local helper in the test returning one `FF C4` segment; `src.indexOf(0xdb)` finds the DQT marker byte in the fixture.)

- [ ] **Step 2: Run** `npx vitest run src/features/export/png.test.ts src/features/export/jpeg.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `src/test/images.ts`, the `setup.ts` encoder, `png.ts` and `jpeg.ts` per the Interfaces. Read lengths with a `DataView`, big-endian.
- [ ] **Step 4: Run** `npm test` (PASS, all M1–M3 tests too, with no `toBlob` console error), `npm run typecheck` (0), `npm run build` (OK), `npm run smoke` (`smoke ok`).
- [ ] **Step 5: Commit** `feat(export): PNG and JPEG scrubbers that keep only the picture`

---

### Task 2: PDF and ZIP writers

**Files:**
- Create: `src/features/export/crc32.ts`, `src/features/export/pdf.ts`, `src/features/export/zip.ts`, `src/features/export/crc32.test.ts`, `src/features/export/pdf.test.ts`, `src/features/export/zip.test.ts`, `src/test/pdf.ts`, `src/test/zip.ts`

**Interfaces:**
- Consumes: nothing from other tasks. `node:zlib` `crc32` in tests only.
- Produces:
  - `crc32.ts`: `crc32(bytes: Uint8Array): number`, unsigned, reflected polynomial `0xEDB88320`, with a 256-entry table built once.
  - `pdf.ts`:
    - `interface PdfImage { jpeg: Uint8Array; width: number; height: number }` (a baseline or progressive 3-component JPEG, which is what canvas encoders write).
    - `A4 = { w: 595.28, h: 841.89 } as const`.
    - `writePdf(pages: PdfImage[], id: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Uint8Array<ArrayBuffer>`. It throws `RangeError` for no pages or an `id` that isn't 16 bytes. The layout, written with `\n` line ends:
      ```
      %PDF-1.4\n%<E2 E3 CF D3>\n
      1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n
      2 0 obj\n<< /Type /Pages /Kids [3 0 R 6 0 R …] /Count N >>\nendobj\n
      for page k (p = 3 + 3k):
        p 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 {p+2} 0 R >> >> /Contents {p+1} 0 R >>\nendobj\n
        {p+1} 0 obj\n<< /Length 36 >>\nstream\nq 595.28 0 0 841.89 0 0 cm /Im0 Do Q\nendstream\nendobj\n
        {p+2} 0 obj\n<< /Type /XObject /Subtype /Image /Width W /Height H /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length L >>\nstream\n<jpeg>\nendstream\nendobj\n
      xref\n0 {3+3N}\n0000000000 65535 f \n then one "{offset:10} 00000 n \n" per object (20 bytes each)
      trailer\n<< /Size {3+3N} /Root 1 0 R /ID [<HEX> <HEX>] >>\nstartxref\n{xref offset}\n%%EOF\n
      ```
      `HEX` is the 32 upper-case hex digits of `id`. There is no `/Info`, no `/Metadata` and nothing else.
  - `zip.ts`:
    - `DOS_TIME = 0x0000`, `DOS_DATE = 0x0021` (1980-01-01 00:00).
    - `writeZip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer>`. Stored entries, laid out as the Metadata guarantees table says: local header `PK\3\4` (30 bytes + name), data, central entries `PK\1\2` (46 bytes + name), end record `PK\5\6` (22 bytes, comment length 0).
    - Names are UTF-8 (`TextEncoder`), with flag `0x0800` when any name byte is ≥ 0x80, else 0.
    - It throws `RangeError` for no files, an empty or duplicate name, more than 65,535 files, or more than 0xFFFFFFFF bytes.
  - `src/test/pdf.ts` (tests only): `readPdf(bytes: Uint8Array): PdfRead`.
    - It starts at `startxref`, reads the xref table, and checks that each in-use offset starts with `{n} 0 obj` (`xrefOk`). It reads each object's dictionary and, by its `/Length`, its stream.
    - ```ts
      interface PdfRead {
        version: string; binaryLine: boolean; xrefOk: boolean;
        trailer: string; trailerKeys: string[]; id: [string, string] | null;
        outside: string; // the whole file as latin1 with every stream's bytes taken out
        pageCount: number; // /Count of the root /Pages
        pages: { mediaBox: number[]; content: string; image: { width: number; height: number; dict: string; bytes: Uint8Array } }[]; // in /Kids order
      }
      ```
    - `PDF_METADATA_KEYS = ['/Info', '/Producer', '/Creator', '/Author', '/Title', '/Subject', '/Keywords', '/CreationDate', '/ModDate', '/Metadata']`.
  - `src/test/zip.ts` (tests only): `readZip(bytes: Uint8Array): { entries: ReadZipEntry[]; commentLength: number; trailing: number }`.
    - It reads the end record (it must be the last 22 bytes), then the central directory, and each entry's local header and data.
    - ```ts
      interface ZipHeader { versionNeeded: number; flags: number; method: number; time: number; date: number; crc: number; csize: number; size: number; extraLength: number }
      interface ReadZipEntry {
        name: string; nameBytes: Uint8Array; data: Uint8Array;
        crcOk: boolean; // zlib.crc32(data) equals both headers' CRC
        local: ZipHeader;
        central: ZipHeader & { versionMadeBy: number; commentLength: number; internalAttrs: number; externalAttrs: number; disk: number; offset: number };
      }
      ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/export/crc32.test.ts
test('CRC-32 as ZIP and PNG use it', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array(0))).toBe(0);
  const big = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) & 255);
  expect(crc32(big)).toBe(zlib.crc32(big));
});
// src/features/export/pdf.test.ts
const jpeg = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255); // writePdf embeds the bytes; it doesn't read them
const P = [{ jpeg: jpeg(500), width: 1747, height: 2471 }, { jpeg: jpeg(300), width: 1747, height: 2471 }, { jpeg: jpeg(10), width: 2480, height: 3508 }];
const ID = Uint8Array.from({ length: 16 }, (_, i) => i);
test('one A4 page per picture, each picture filling its page', () => {
  const r = readPdf(writePdf(P));
  expect([r.version, r.binaryLine, r.xrefOk, r.pageCount]).toEqual(['1.4', true, true, 3]);
  expect(r.pages.map(p => p.mediaBox)).toEqual(Array(3).fill([0, 0, 595.28, 841.89]));
  expect(r.pages.map(p => p.content)).toEqual(Array(3).fill('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q'));
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1747, 2471], [1747, 2471], [2480, 3508]]);
  expect(r.pages[0].image.dict).toMatch(/\/Filter \/DCTDecode/); expect(r.pages[0].image.dict).toMatch(/\/ColorSpace \/DeviceRGB/); expect(r.pages[0].image.dict).toMatch(/\/BitsPerComponent 8/);
  expect(r.pages[1].image.bytes).toEqual(jpeg(300));
});
test('no document information and no XMP: only the size, the root and a file ID', () => {
  const r = readPdf(writePdf(P));
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  expect(r.trailerKeys).toEqual(['/Size', '/Root', '/ID']);
});
test('every PDF gets a random file ID, the same in both places', () => {
  const a = readPdf(writePdf(P)).id!, b = readPdf(writePdf(P)).id!;
  expect(a[0]).toMatch(/^[0-9A-F]{32}$/); expect(a[1]).toBe(a[0]); expect(b[0]).not.toBe(a[0]);
  expect(readPdf(writePdf(P, ID)).id).toEqual(['000102030405060708090A0B0C0D0E0F', '000102030405060708090A0B0C0D0E0F']);
});
test('the same pictures and ID give the same bytes', () => expect(writePdf(P, ID)).toEqual(writePdf(P, ID)));
test('a PDF needs a page and a 16-byte ID', () => { expect(() => writePdf([])).toThrow(RangeError); expect(() => writePdf(P, new Uint8Array(8))).toThrow(RangeError); });
// src/features/export/zip.test.ts
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31) & 255);
const F = [{ name: 'Notes-page-1.png', data: bytes(1000) }, { name: 'Notes-page-2.png', data: bytes(7) }];
test('a ZIP holds each file as it is, in order', () => {
  const z = readZip(writeZip(F));
  expect(z.entries.map(e => [e.name, e.central.method, e.central.size, e.central.csize, e.crcOk])).toEqual([['Notes-page-1.png', 0, 1000, 1000, true], ['Notes-page-2.png', 0, 7, 7, true]]);
  expect(z.entries[1].data).toEqual(F[1].data); expect(z.trailing).toBe(0);
});
test('nothing about when, where or on what it was made', () => {
  const z = readZip(writeZip(F)); expect(z.commentLength).toBe(0);
  for (const e of z.entries) {
    for (const h of [e.local, e.central]) expect([h.time, h.date, h.extraLength, h.flags & 0x08, h.versionNeeded]).toEqual([0, 0x21, 0, 0, 20]);
    expect([e.central.versionMadeBy, e.central.commentLength, e.central.internalAttrs, e.central.externalAttrs, e.central.disk]).toEqual([20, 0, 0, 0, 0]);
  }
});
test('names outside ASCII are kept in UTF-8 and say so', () => {
  const [e] = readZip(writeZip([{ name: 'Café-page-1.png', data: bytes(3) }])).entries;
  expect([e.name, e.nameBytes.length, e.central.flags, e.local.flags]).toEqual(['Café-page-1.png', 16, 0x0800, 0x0800]);
  expect(readZip(writeZip(F)).entries[0].central.flags).toBe(0);
});
test('the same files give the same bytes', () => expect(writeZip(F)).toEqual(writeZip(F)));
test('a ZIP needs files, each with a name of its own', () => { expect(() => writeZip([])).toThrow(RangeError); expect(() => writeZip([{ name: '', data: bytes(1) }])).toThrow(RangeError); expect(() => writeZip([F[0], F[0]])).toThrow(RangeError); });
```

- [ ] **Step 2: Run** `npx vitest run src/features/export/crc32.test.ts src/features/export/pdf.test.ts src/features/export/zip.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/test/pdf.ts` and `src/test/zip.ts` first (the readers the tests use), then `crc32.ts`, `pdf.ts` and `zip.ts`. Build each file as a list of `Uint8Array` parts, counting offsets as they are pushed, then copy them into one `new Uint8Array(total)`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(export): Nib’s own PDF writer and store-only ZIP writer, with no metadata`

---

### Task 3: Export choices: plan, names, copy, size arithmetic and state

**Files:**
- Create: `src/features/export/plan.ts`, `src/features/export/plan.test.ts`, `src/features/export/state.ts`, `src/features/export/state.test.ts`

**Interfaces:**
- Consumes: `cleanName` (`@/engine/core.js`), `PAGE_W`, `PAGE_H` (`@/engine/config.js`), `pagesWord` (`@/features/style/fit`), `getPref`/`setPref` (`@/store/documents`), `useEditor` (`@/store/editor`).
- Produces:
  - `plan.ts` (pure):
    - `type Format = 'pdf' | 'png' | 'jpg'`; `type Quality = 'standard' | 'print'`.
    - `QUALITY: Record<Quality, { pxW: number; w: number; h: number; jpeg: number }>`: `standard: { pxW: PAGE_W * 2.2, w: 1747, h: 2471, jpeg: 0.9 }` and `print: { pxW: 2480, w: 2480, h: 3508, jpeg: 0.95 }`. A test pins `w`/`h` to `Math.round(pxW)` and `Math.round(pxW * PAGE_H / PAGE_W)`.
    - `PRINT_RATIO = (2480 * 3508) / (1747 * 2471)` (≈ 2.01533).
    - `MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', zip: 'application/zip' }`.
    - `interface ExportPrefs { format: Format; zip: boolean; quality: Quality }`; `interface PagePick { choose: boolean; out: number[] }`.
    - `interface ExportPlan { format: Format; quality: Quality; zip: boolean; pages: number[]; pageCount: number; base: string }`.
    - `interface Sample { png: number; jpg: number; jpgPrint: number }`: bytes of one page at Standard size as PNG, as JPEG at Standard's quality, and as JPEG at Print's quality.
    - `chosenPages(choose: boolean, out: readonly number[], pageCount: number): number[]`: every page, or those not in `out`, ascending.
    - `exportBase(fileName: string, title: string): string` = `cleanName(fileName) || cleanName(title) || 'Untitled'`.
    - `planOf(prefs: ExportPrefs, pick: PagePick, pageCount: number, fileName: string, title: string): ExportPlan`.
    - `zipped(plan): boolean` = format isn't `pdf`, `zip` is on, and more than one page is chosen.
    - `pageFileName(plan, i: number): string` = `{base}-page-{i + 1, zero-padded to String(pageCount).length}.{format}`.
    - `downloadNames(plan): string[]`: `[{base}.pdf]`, or `[{base}.zip]`, or `[{base}.{png|jpg}]` for one image, or `pageFileName` per page. `zipNames(plan): string[]` gives the entries' names (`pageFileName` per page).
    - `suffixShown(plan): string`: `downloadNames(plan)[0]` without the base (`.pdf`, `.zip`, `.png`, `-page-1.png`). With no page chosen, it is the format's own ending (`.pdf`, `.png`, `.jpg`).
    - `downloadLabel(plan): string` and `whatIsMade(plan): 'PDF' | 'ZIP' | 'images' | 'PNG' | 'JPG'`, per Interface copy.
    - `failMessage(plan): string`; `savedMessage(names: string[]): string`.
    - `PDF_OVERHEAD = { base: 300, perPage: 480 }`.
    - `estimateBytes(plan, s: Sample): number`, rounded:
      - Per page: `png` → `s.png`, ×`PRINT_RATIO` at Print; `jpg` and `pdf` → `s.jpg`, or `s.jpgPrint × PRINT_RATIO` at Print.
      - Total: that × the page count, plus `PDF_OVERHEAD` for a PDF, or for a ZIP `Σ(76 + 2 × UTF-8 bytes of each entry name) + 22`.
    - `formatSize(bytes: number): string`, per Interface copy.
  - `state.ts` (Zustand):
    - `DEFAULT_PREFS: ExportPrefs = { format: 'pdf', zip: true, quality: 'standard' }`; `useExportPrefs` (initially `DEFAULT_PREFS`).
    - `loadExportPrefs(): Promise<void>`. It reads `getPref('export')` and keeps each field only when valid (format in the three, `zip` boolean, quality in the two). It applies them only if `setExportPrefs` hasn't run since it was called, and it never rejects.
    - `setExportPrefs(patch: Partial<ExportPrefs>): void`. When nothing changes, it does nothing. Otherwise it sets the store at once and writes `setPref('export', next)`, ignoring a failure.
    - `useExportPick: PagePick` (initially `{ choose: false, out: [] }`); `setChoose(on: boolean): void` (keeps `out`); `togglePage(i: number): void`. A module-level `useEditor.subscribe` resets the pick when `docId` changes.
    - `interface ExportRun { kind: 'download' | 'share' | null; done: number; total: number }`; `IDLE_RUN: ExportRun = { kind: null, done: 0, total: 0 }`; `useExportRun` (initially `IDLE_RUN`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/export/plan.test.ts
const P = (p: Partial<ExportPlan> = {}): ExportPlan => ({ format: 'pdf', quality: 'standard', zip: true, pages: [0, 1, 2], pageCount: 3, base: 'The Water Cycle', ...p });
const S: Sample = { png: 900_000, jpg: 300_000, jpgPrint: 420_000 };
test('the two qualities are the engine’s sizes', () => { for (const q of Object.values(QUALITY)) expect([q.w, q.h]).toEqual([Math.round(q.pxW), Math.round(q.pxW * PAGE_H / PAGE_W)]); expect([QUALITY.standard.w, QUALITY.print.w]).toEqual([1747, 2480]); });
test('chosen pages', () => {
  expect(chosenPages(false, [1], 3)).toEqual([0, 1, 2]);
  expect(chosenPages(true, [1], 3)).toEqual([0, 2]);
  expect(chosenPages(true, [5, 1], 3)).toEqual([0, 2]); // a page past the end is forgotten
  expect(chosenPages(true, [0, 1, 2], 3)).toEqual([]);
});
test('the file name: what was typed, else the title, made safe to save', () => {
  expect(exportBase('', 'The Water Cycle')).toBe('The Water Cycle');
  expect(exportBase('my/notes.pdf', 'X')).toBe('my notes');
  expect(exportBase('  ', 'a:b')).toBe('a b');
  expect(exportBase('', '')).toBe('Untitled');
  expect(exportBase('', 'Café ☕ 水の循環')).toBe('Café ☕ 水の循環');
});
test('names', () => {
  expect(downloadNames(P())).toEqual(['The Water Cycle.pdf']);
  expect(downloadNames(P({ format: 'png' }))).toEqual(['The Water Cycle.zip']);
  expect(zipNames(P({ format: 'png' }))).toEqual(['The Water Cycle-page-1.png', 'The Water Cycle-page-2.png', 'The Water Cycle-page-3.png']);
  expect(downloadNames(P({ format: 'jpg', zip: false, pages: [0, 2] }))).toEqual(['The Water Cycle-page-1.jpg', 'The Water Cycle-page-3.jpg']);
  expect(downloadNames(P({ format: 'png', pages: [1] }))).toEqual(['The Water Cycle.png']);
  expect(zipNames(P({ format: 'jpg', pages: [0, 9], pageCount: 12 }))).toEqual(['The Water Cycle-page-01.jpg', 'The Water Cycle-page-10.jpg']);
});
test('the ending shown after the file name', () => expect([P(), P({ format: 'png' }), P({ format: 'png', zip: false }), P({ format: 'jpg', pages: [2] }), P({ format: 'png', pages: [] })].map(suffixShown)).toEqual(['.pdf', '.zip', '-page-1.png', '.jpg', '.png']));
test('the Download button says what it makes', () => {
  expect([P(), P({ pages: [1] }), P({ format: 'png' }), P({ format: 'jpg', zip: false }), P({ format: 'png', pages: [2] }), P({ pages: [] })].map(downloadLabel))
    .toEqual(['Download PDF · 3 pages', 'Download PDF · 1 page', 'Download ZIP · 3 PNGs', 'Download 3 JPGs', 'Download PNG', 'Choose at least one page']);
});
test('messages', () => {
  expect(failMessage(P())).toBe('Nib couldn’t make the PDF. Try again.');
  expect(failMessage(P({ format: 'png', quality: 'print' }))).toBe('Nib couldn’t make the ZIP at print quality. Try Standard quality.');
  expect(failMessage(P({ format: 'jpg', zip: false }))).toBe('Nib couldn’t make the images. Try again.');
  expect([savedMessage(['A.pdf']), savedMessage(['A-page-1.png', 'A-page-2.png'])]).toEqual(['Saved A.pdf', 'Saved 2 images']);
});
test('the size estimate', () => {
  expect(estimateBytes(P({ format: 'png' }), S)).toBe(2_700_406); // 3 × 900,000 + 3 × (76 + 2 × 26) + 22
  expect(estimateBytes(P({ pages: [0, 1] }), S)).toBe(601_260);
  expect(estimateBytes(P({ format: 'jpg', zip: false, quality: 'print', pages: [0, 1] }), S)).toBe(Math.round(2 * 420_000 * PRINT_RATIO));
  expect(estimateBytes(P({ format: 'png', quality: 'print', pages: [0] }), S)).toBe(Math.round(900_000 * PRINT_RATIO));
});
test('sizes read the way people say them', () => expect([2_700_406, 601_260, 1_692_875, 12_400_000, 999_499, 999_500, 9_949_999, 9_950_000, 1_500].map(formatSize))
  .toEqual(['~2.7 MB', '~601 KB', '~1.7 MB', '~12 MB', '~999 KB', '~1.0 MB', '~9.9 MB', '~10 MB', '~2 KB']));
// src/features/export/state.test.ts (fake-indexeddb as in M3; `@/store/documents` mocked as { ...actual, setPref: vi.fn(actual.setPref) })
test('a new device downloads a PDF, with several images in one ZIP, at Standard quality', () => expect(useExportPrefs.getState()).toMatchObject(DEFAULT_PREFS));
test('format, ZIP and quality are remembered on the device', async () => {
  setExportPrefs({ format: 'jpg', quality: 'print' }); await vi.waitFor(() => expect(setPref).toHaveBeenCalled());
  vi.resetModules(); const st = await import('@/features/export/state'); await st.loadExportPrefs();
  expect(st.useExportPrefs.getState()).toMatchObject({ format: 'jpg', zip: true, quality: 'print' });
});
test('stored values of the wrong shape are ignored', async () => { await setPref('export', { format: 'gif', zip: 'yes', quality: 'print' }); await loadExportPrefs(); expect(useExportPrefs.getState()).toMatchObject({ format: 'pdf', zip: true, quality: 'print' }); });
test('a choice made before the stored ones arrive wins', async () => { await setPref('export', { format: 'png' }); const p = loadExportPrefs(); setExportPrefs({ format: 'jpg' }); await p; expect(useExportPrefs.getState().format).toBe('jpg'); });
test('choosing what is already chosen writes nothing', () => { vi.mocked(setPref).mockClear(); setExportPrefs({ format: useExportPrefs.getState().format }); expect(setPref).not.toHaveBeenCalled(); });
test('a refused write keeps the choice for now', async () => { vi.mocked(setPref).mockRejectedValueOnce(new Error('quota')); setExportPrefs({ format: 'png' }); await vi.waitFor(() => expect(setPref).toHaveBeenCalled()); expect(useExportPrefs.getState().format).toBe('png'); });
test('a page left out and put back', () => { setChoose(true); togglePage(1); expect(useExportPick.getState()).toEqual({ choose: true, out: [1] }); togglePage(1); expect(useExportPick.getState().out).toEqual([]); });
test('the page choice starts again when another document opens', () => { openDocument(rec('A', docOf(box()))); setChoose(true); togglePage(0); openDocument(rec('B', docOf(box()))); expect(useExportPick.getState()).toEqual({ choose: false, out: [] }); });
test('none of this is in the document or its undo history', () => { open(docOf(box())); setExportPrefs({ format: 'png' }); setChoose(true); togglePage(0); expect(get().canUndo).toBe(false); });
```
(Reset the three stores and clear `prefs` in `beforeEach`.)

- [ ] **Step 2: Run** `npx vitest run src/features/export/plan.test.ts src/features/export/state.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `plan.ts` and `state.ts`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(export): what a download makes, its names, labels and size, and where the choices live`

---

### Task 4: Pages drawn for download, and tilt off by default

**Files:**
- Create: `src/features/export/render.ts`, `src/features/export/render.test.ts`
- Modify: `src/engine/config.js` (`DEFAULTS.tilt: false`, nothing else), `src/engine/engine.test.ts` (one test)

**Interfaces:**
- Consumes: engine `use`, `computeLayout`, `composePage`, `frameShot`, `applyLook` (all unchanged); `layoutFor` (`src/features/doc/model.ts`); `useEditor`.
- Produces:
  - `interface Frozen { S: Settings; doc: EngineDoc; title: string; pages: number }`.
  - `freeze(): Frozen`: `structuredClone` of the store's `S` and `doc`, its `title`, and `pages` from `layoutFor(s.S, s.doc).pages` (that leaves the engine on the live document).
  - `renderPage(f: Frozen, i: number, pxW: number): HTMLCanvasElement` = `applyLook(frameShot(composePage(i, pxW), i), i)`. It runs on the copy (Design decision 1), and its `finally` puts the engine back on the live document and lays it out. It is synchronous.
  - `encodeCanvas(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Uint8Array<ArrayBuffer>>`. It wraps `canvas.toBlob(cb, type, quality)`, rejects with `Error('encode')` on a `null` blob, and reads the blob with `blob.arrayBuffer()`.
  - `config.js`: `DEFAULTS.tilt` is `false`.

- [ ] **Step 1: Write the failing tests** (`render.test.ts` mocks `@/engine/core.js` partially: `composePage`, `frameShot` and `applyLook` become `vi.fn(actual)`. The `applyLook` wrapper also pushes `actual.settings.look`, the engine's live `S` at that moment, onto `seen`, which `beforeEach` empties.)

```ts
// src/features/export/render.test.ts
const dims = (c: HTMLCanvasElement) => [c.width, c.height];
test('a page is drawn by the engine at the size asked', () => { open(docOf(box({ text: 'x' }))); const f = freeze(); expect(dims(renderPage(f, 0, PAGE_W * 2.2))).toEqual([1747, 2471]); expect(dims(renderPage(f, 0, 2480))).toEqual([2480, 3508]); });
test('every page goes through the camera tilt and the scan look, as downloads always have', () => {
  open(docOf(box({ text: 'x' }))); const c = renderPage(freeze(), 0, 2480);
  expect(composePage).toHaveBeenCalledWith(0, 2480);
  expect(frameShot).toHaveBeenCalledWith(vi.mocked(composePage).mock.results[0].value, 0);
  expect(applyLook).toHaveBeenCalledWith(vi.mocked(frameShot).mock.results[0].value, 0);
  expect(c).toBe(vi.mocked(applyLook).mock.results[0].value);
});
test('it draws the frozen copy, then puts the engine back on the open document', () => {
  open(docOf(box({ id: 'm', text: lines(40) }))); update(s => { s.S.look = 'scan'; }, { history: false });
  const f = freeze(); update(s => { s.S.look = 'bw'; s.doc.boxes[0].text = 'changed'; }, { history: false });
  renderPage(f, 1, 794);
  expect(seen).toEqual(['scan']);
  expect(settings).toBe(get().S);
  expect(framesOf(get().doc.boxes[0])[0].box).toBe(get().doc.boxes[0]);
});
test('freeze copies the settings, the document, the title and the page count', () => {
  open(docOf(box({ text: lines(40) }))); const f = freeze();
  expect(f.S).toEqual(get().S); expect(f.S).not.toBe(get().S); expect(f.doc).toEqual(get().doc); expect(f.doc).not.toBe(get().doc);
  expect([f.title, f.pages]).toEqual(['A', 2]);
});
test('encodeCanvas gives back the encoder’s bytes', async () => {
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob([Uint8Array.of(1, 2, 3)])));
  expect(await encodeCanvas(document.createElement('canvas'), 'image/jpeg', 0.9)).toEqual(Uint8Array.of(1, 2, 3));
  expect(spy).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
});
test('encodeCanvas fails when the browser can’t make the image', async () => { vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(null)); await expect(encodeCanvas(document.createElement('canvas'), 'image/png')).rejects.toThrow('encode'); });
// src/engine/engine.test.ts
test('a new document is As written, without camera tilt; a stored one keeps its tilt', () => { expect(cleanSettings(null, false)).toMatchObject({ look: 'none', tilt: false }); expect(cleanSettings({ tilt: true }, false).tilt).toBe(true); });
```

- [ ] **Step 2: Run** `npx vitest run src/features/export/render.test.ts src/engine/engine.test.ts`. Expected: FAIL (`render` missing; `tilt` is `true`).
- [ ] **Step 3: Implement** `render.ts` and change the one default in `config.js`.
- [ ] **Step 4: Run** `npm test` (any M1–M3 test that relied on tilt being on gets the value set explicitly, never a changed expectation about the drawing), `npm run typecheck`, `npm run build`, `npm run smoke`. Then `git diff --stat -- src/engine` shows only `config.js` and `engine.test.ts`, and `git diff -- src/engine/config.js` shows only the `tilt` value.
- [ ] **Step 5: Commit** `feat(export): pages drawn by the engine at download size from a frozen copy; camera tilt off by default`

---

### Task 5: The pages as they will download: tilt in the preview, and Choose pages

**Files:**
- Modify: `src/features/pages/PageView.tsx`, `src/features/pages/Sheet.tsx`, `src/styles/app.css`
- Create: `src/features/pages/exportPages.test.tsx`

**Interfaces:**
- Consumes: `frameShot`, `applyLook` (already used by the preview); `useEditor`.
- Produces:
  - `PageView`:
    - It reads `tilt` as `mode === 'export' ? s.S.tilt : false`.
    - The scanner runs when `look !== 'none' || tilt`. Pages already marked `scanned` lose the mark when both are off, or when their key changes. The key already includes `tilt`.
    - New prop `pick?: PagePickView | null`, where `interface PagePickView { out: ReadonlySet<number>; toggle(i: number): void }` (exported). With it, each `Sheet` gets `pick={{ left: pick.out.has(i), toggle: () => pick.toggle(i) }}`.
  - `Sheet`:
    - New prop `pick?: { left: boolean; toggle(): void }`. With it, the `.paper` holds, after `.scan`, a `<button type="button" role="checkbox" aria-checked={!left} aria-label="Include page {i+1}">`.
    - The button has classes `pick absolute inset-0 cursor-pointer rounded-[1px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2`, and `onClick={toggle}`.
    - A left-out page's `figure` gets class `left-out`, and its caption gets ` · left out` after the usual text.
  - `app.css`: `.sheet.left-out .paper { opacity: 0.35; transition: opacity 150ms; }`.

- [ ] **Step 1: Write the failing tests** (mocks `@/engine/core.js` partially with `frameShot` and `applyLook` as `vi.fn(actual)`. `clientWidth` is 1000 for `[data-pages]`, as in `pages.test.tsx`. `pageLayout()` is that file's helper.)

```ts
test('in Export, camera tilt shows on the pages, even As written', async () => {
  vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false });
  const { container } = render(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(frameShot).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0);
  expect(container.querySelector('.paper')).toHaveClass('scanned');
});
test('As written without tilt shows the pages as drawn, and turning tilt off takes the tilted preview away', async () => {
  vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false });
  const { container, rerender } = render(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  act(() => update(s => { s.S.tilt = false; }, { history: false })); rerender(<PageView layout={pageLayout()} mode="export" />);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(container.querySelector('.paper')).not.toHaveClass('scanned');
});
test('Write and Style never show the download’s tilt', async () => { vi.useFakeTimers(); open(docOf(box({ text: 'x' }))); update(s => { s.S.tilt = true; }, { history: false }); render(<PageView layout={pageLayout()} mode="style" />); await act(() => vi.advanceTimersByTimeAsync(500)); expect(frameShot).not.toHaveBeenCalled(); });
test('Choose pages: every page is a checkbox, and a left-out page is dimmed and says so', async () => {
  open(docOf(box({ text: lines(40) }))); const toggle = vi.fn();
  render(<PageView layout={pageLayout()} mode="export" pick={{ out: new Set([1]), toggle }} />);
  expect(screen.getByRole('checkbox', { name: 'Include page 1' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Include page 2' })).not.toBeChecked();
  expect(screen.getByText('Page 2 of 2 · left out').closest('figure')).toHaveClass('left-out');
  expect(screen.getByText('Page 1 of 2').closest('figure')).not.toHaveClass('left-out');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Include page 1' })); expect(toggle).toHaveBeenCalledWith(0);
  screen.getByRole('checkbox', { name: 'Include page 2' }).focus(); await userEvent.keyboard(' '); expect(toggle).toHaveBeenLastCalledWith(1);
});
test('without Choose pages, the pages are not checkboxes', () => { open(docOf(box({ text: lines(40) }))); render(<PageView layout={pageLayout()} mode="export" />); expect(screen.queryByRole('checkbox')).toBeNull(); });
test('a one-page document says Page 1 · left out', () => { open(docOf(box({ text: 'x' }))); render(<PageView layout={pageLayout()} mode="export" pick={{ out: new Set([0]), toggle: vi.fn() }} />); expect(screen.getByText('Page 1 · left out')).toBeInTheDocument(); });
```
(`afterEach`: `vi.useRealTimers()`.)

- [ ] **Step 2: Run** `npx vitest run src/features/pages`. Expected: the new tests FAIL, and every existing pages test passes.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(pages): Export shows camera tilt as it will download, and Choose pages makes each page a checkbox`

---

### Task 6: Making the files: Download and Share

**Files:**
- Create: `src/features/export/build.ts`, `src/features/export/run.ts`, `src/features/export/build.test.ts`, `src/features/export/run.test.ts`

**Interfaces:**
- Consumes: `scrubPng`, `scrubJpeg` (Task 1); `writePdf`, `writeZip` (Task 2); `QUALITY`, `MIME`, `ExportPlan`, `planOf`, `zipped`, `downloadNames`, `zipNames`, `pageFileName`, `failMessage`, `savedMessage`, `useExportPrefs`, `useExportPick`, `useExportRun`, `IDLE_RUN` (Task 3); `Frozen`, `freeze`, `renderPage`, `encodeCanvas` (Task 4); `toast` (store). Tests: `stubCanvasEncoder`, `pngChunks`, `pngSize`, `jpegSegments`, `JFIF_BARE`, `latin1`, `NO_METADATA` (Task 1), `readPdf`, `PDF_METADATA_KEYS`, `readZip` (Task 2).
- Produces:
  - `build.ts`:
    - `interface ExportFile { name: string; type: string; bytes: Uint8Array<ArrayBuffer> }`.
    - `buildExport(plan: ExportPlan, f: Frozen, onPage?: (done: number, total: number) => void): Promise<ExportFile[]>`. For each `i` of `plan.pages`, in order:
      - `c = renderPage(f, i, QUALITY[q].pxW)`.
      - The bytes are `scrubPng(await encodeCanvas(c, 'image/png'))`, or `scrubJpeg(await encodeCanvas(c, 'image/jpeg', QUALITY[q].jpeg))` for `jpg` and `pdf`.
      - Release `c` (`width = height = 0`), call `onPage(k + 1, n)`, and `await new Promise(r => setTimeout(r, 0))`.

      Then the files:
      - A PDF is one file, `writePdf(pages.map(… { jpeg, width: QUALITY[q].w, height: QUALITY[q].h }))`.
      - `zipped` gives one file, `writeZip` over `zipNames`.
      - Otherwise one file per page, named by `downloadNames`.

      `type` comes from `MIME`. Any failure rejects; nothing partial is returned.
  - `run.ts`:
    - `currentPlan(f: Frozen): ExportPlan` = `planOf(useExportPrefs.getState(), useExportPick.getState(), f.pages, f.doc.fileName, f.title)`.
    - `saveFiles(files: ExportFile[]): Promise<void>`: per file, an object URL of `new Blob([bytes], { type })` and an `<a download={name} rel="noopener">` clicked and removed. The URL is revoked after 30 s, and the files are about 250 ms apart.
    - `canShareFiles(): boolean`: `navigator.canShare` and `navigator.share` exist and `canShare({ files: [new File([new Uint8Array(1)], 'page.pdf', { type: 'application/pdf' })] })` is true. It is false on any throw.
    - `download(): Promise<void>`:
      - It returns at once while `useExportRun.getState().kind` is set, or when the plan has no pages.
      - Otherwise, before its first `await`, it sets `{ kind: 'download', done: 0, total: n }`, calls `buildExport` (with `onPage` updating `done`), `saveFiles`, then `toast(savedMessage(names))`.
      - On failure it gives `toast(failMessage(plan))`. It always ends at `IDLE_RUN`.
    - `share(): Promise<void>`: the same, with `kind: 'share'` and the plan's `zip` forced off.
      - It makes `File`s, and when `navigator.canShare({ files })` is false it says `This browser can’t share these files. Use Download instead.`
      - Otherwise it awaits `navigator.share({ files })`. `AbortError` is silent. `NotAllowedError` gives `toast('Ready to share.', { label: 'Share', fn })`, where `fn` calls `navigator.share` again with the same `{ files }` object, with the same handling. Anything else gives `Nib couldn’t share that. Use Download instead.`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/export/build.test.ts (stubCanvasEncoder({ metadata: true }) in beforeEach; core.js partially mocked so applyLook pushes actual.settings.look onto `seen`)
const plan = (p: Partial<ExportPlan> = {}): ExportPlan => ({ format: 'pdf', quality: 'standard', zip: true, pages: [0, 1], pageCount: 2, base: 'Notes', ...p });
beforeEach(() => open(docOf(box({ id: 'm', text: lines(40) }))));
test('a PDF: one A4 page per chosen page, at full size, and nothing but the pictures', async () => {
  const [f, ...rest] = await buildExport(plan(), freeze()); expect(rest).toEqual([]);
  expect([f.name, f.type]).toEqual(['Notes.pdf', 'application/pdf']);
  const r = readPdf(f.bytes);
  expect([r.xrefOk, r.pageCount]).toEqual([true, 2]);
  expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[1747, 2471], [1747, 2471]]);
  for (const k of PDF_METADATA_KEYS) expect(r.outside).not.toContain(k);
  for (const p of r.pages) { expect(jpegSegments(p.image.bytes).map(s => s.marker)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]); expect(p.image.bytes.slice(2, 20)).toEqual(JFIF_BARE); expect(latin1(p.image.bytes)).not.toMatch(NO_METADATA); }
});
test('Print quality is A4 at 300 dpi', async () => { const r = readPdf((await buildExport(plan({ quality: 'print', pages: [1] }), freeze()))[0].bytes); expect(r.pages.map(p => [p.image.width, p.image.height])).toEqual([[2480, 3508]]); expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95); });
test('a ZIP of PNGs: one per chosen page, named by page, and nothing but the pictures', async () => {
  const [z] = await buildExport(plan({ format: 'png' }), freeze()); expect([z.name, z.type]).toEqual(['Notes.zip', 'application/zip']);
  const r = readZip(z.bytes); expect(r.entries.map(e => e.name)).toEqual(['Notes-page-1.png', 'Notes-page-2.png']);
  for (const e of r.entries) { expect(e.crcOk).toBe(true); expect(pngChunks(e.data).map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']); expect(pngSize(e.data)).toEqual({ width: 1747, height: 2471 }); expect(latin1(e.data)).not.toMatch(NO_METADATA); }
});
test('JPGs, each on its own, carry only a bare JFIF header', async () => {
  const files = await buildExport(plan({ format: 'jpg', zip: false }), freeze());
  expect(files.map(f => [f.name, f.type])).toEqual([['Notes-page-1.jpg', 'image/jpeg'], ['Notes-page-2.jpg', 'image/jpeg']]);
  for (const f of files) { expect(f.bytes.slice(2, 20)).toEqual(JFIF_BARE); expect(latin1(f.bytes)).not.toMatch(NO_METADATA); }
});
test('one image is named after the document', async () => expect((await buildExport(plan({ format: 'png', pages: [1] }), freeze())).map(f => f.name)).toEqual(['Notes.png']));
test('edits made while the files are being made don’t get into them', async () => {
  const f = freeze();
  await buildExport(plan({ format: 'png' }), f, done => { if (done === 1) update(s => { s.S.look = 'bw'; }, { history: false }); });
  expect(seen).toEqual(['none', 'none']);
  expect(settings).toBe(get().S); // and the engine is on the open document again
});
test('pages are made one at a time, saying how far it has got', async () => { const onPage = vi.fn(); await buildExport(plan(), freeze(), onPage); expect(onPage.mock.calls).toEqual([[1, 2], [2, 2]]); });
test('an image the browser can’t make fails the whole export', async () => { vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(cb => cb(null)); await expect(buildExport(plan(), freeze())).rejects.toThrow(); });
// src/features/export/run.test.ts (sonner mocked as in M2; URL.createObjectURL/revokeObjectURL stubbed; anchor clicks recorded as `saved` names; stubCanvasEncoder(); real timers, so the two-image tests take a quarter of a second)
beforeEach(() => openDocument(rec('Seeded', docOf(box({ id: 'm', text: lines(40) })))));
test('Download saves the PDF under the document’s name and says so', async () => { await download(); expect(saved).toEqual(['Seeded.pdf']); expect(lastToast()).toBe('Saved Seeded.pdf'); });
test('a typed file name wins', async () => { update(s => { s.doc.fileName = 'Week 1'; }, { history: false }); await download(); expect(saved).toEqual(['Week 1.pdf']); });
test('several images without a ZIP are saved one by one', async () => { setExportPrefs({ format: 'png', zip: false }); await download(); expect(saved).toEqual(['Seeded-page-1.png', 'Seeded-page-2.png']); expect(lastToast()).toBe('Saved 2 images'); });
test('only the chosen pages are made', async () => { setExportPrefs({ format: 'png' }); setChoose(true); togglePage(0); await download(); expect(saved).toEqual(['Seeded.png']); });
test('while it works the run says how far it has got, and a second Download meanwhile does nothing', async () => { const p = download(); expect(useExportRun.getState()).toMatchObject({ kind: 'download', total: 2 }); await download(); await p; expect(saved).toHaveLength(1); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('a file Nib can’t make says so and saves nothing', async () => { vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(null)); await download(); expect(saved).toEqual([]); expect(lastToast()).toBe('Nib couldn’t make the PDF. Try again.'); expect(useExportRun.getState()).toEqual(IDLE_RUN); });
test('…and at print quality, it suggests Standard', async () => { setExportPrefs({ quality: 'print' }); vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(cb => cb(null)); await download(); expect(lastToast()).toBe('Nib couldn’t make the PDF at print quality. Try Standard quality.'); });
test('Share is offered only where the browser can share files', () => { expect(canShareFiles()).toBe(false); stubShare(); expect(canShareFiles()).toBe(true); });
test('Share sends the PDF to the share sheet, and nothing else', async () => { stubShare(); await share(); expect(navigator.share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'Seeded.pdf', type: 'application/pdf' })] }); });
test('images are shared as images, not in a ZIP', async () => { stubShare(); setExportPrefs({ format: 'png' }); await share(); expect(vi.mocked(navigator.share).mock.calls[0][0]!.files!.map(f => f.name)).toEqual(['Seeded-page-1.png', 'Seeded-page-2.png']); });
test('closing the share sheet says nothing', async () => { stubShare(new DOMException('', 'AbortError')); await share(); expect(lastToast()).toBeUndefined(); });
test('when the browser wants a fresh tap, the message offers Share with the same files', async () => {
  stubShare(new DOMException('', 'NotAllowedError')); await share(); expect(lastToast()).toBe('Ready to share.');
  await act(async () => lastToastAction()!()); expect(navigator.share).toHaveBeenCalledTimes(2);
  expect(vi.mocked(navigator.share).mock.calls[1][0]).toBe(vi.mocked(navigator.share).mock.calls[0][0]);
});
test('files this browser can’t share are said so', async () => { stubShare(undefined, false); await share(); expect(lastToast()).toBe('This browser can’t share these files. Use Download instead.'); expect(navigator.share).not.toHaveBeenCalled(); });
test('another share failure says so', async () => { stubShare(new Error('x')); await share(); expect(lastToast()).toBe('Nib couldn’t share that. Use Download instead.'); });
```
(`stubShare(rejectOnce?: unknown, canShareReal = true)` defines `navigator.canShare` (true for the probe; `canShareReal` for the real files) and `navigator.share` (rejecting once with `rejectOnce` when given) with `Object.defineProperty(…, { configurable: true })`, and `afterEach` deletes them. Reset the three stores in `beforeEach`.)

- [ ] **Step 2: Run** `npx vitest run src/features/export/build.test.ts src/features/export/run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `build.ts` and `run.ts`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(export): PDF, ZIP, PNG and JPG files made from a frozen copy with no metadata; Download and Share`

---

### Task 7: The size estimate

**Files:**
- Create: `src/features/export/estimate.ts`, `src/features/export/estimate.test.tsx`

**Interfaces:**
- Consumes: `QUALITY`, `Sample` (Task 3); `freeze`, `renderPage`, `encodeCanvas` (Task 4); `fontsInUse`, `fontReady` (engine); `useEditor`; `useStageActive`.
- Produces:
  - `ESTIMATE_DELAY = 600`.
  - `measurePage(f: Frozen, i: number): Promise<Sample>`. It calls `renderPage(f, i, QUALITY.standard.pxW)` and runs `encodeCanvas` three ways (`image/png`; `image/jpeg` at `QUALITY.standard.jpeg`; `image/jpeg` at `QUALITY.print.jpeg`), using the lengths. It releases the canvas in a `finally`.
  - `useSizeEstimate(firstPage: number | null): Sample | null`:
    - It subscribes to `version` only while the stage is active.
    - Its key is `JSON.stringify([S, doc.boxes, doc.pageCount, firstPage])` (the file name is left out, so typing a name measures nothing).
    - A cached key returns its sample at once. Otherwise, after `ESTIMATE_DELAY` with no change, while the stage is active, `firstPage !== null` and `fontsInUse().every(fontReady)`, it runs `measurePage(freeze(), firstPage)`.
    - It stores the result in a module `Map` holding the last 12 keys, and returns it if the key is still current. A failed measurement returns null and logs nothing.
    - Unmounting or a key change cancels the wait.
  - `clearSizeCache(): void` empties that `Map` (for tests).

- [ ] **Step 1: Write the failing tests** (`./render` mocked partially: `renderPage` returns a fresh 1747 × 2471 canvas; `encodeCanvas` resolves to `new Uint8Array(type === 'image/png' ? 900 : q === 0.9 ? 300 : 420)`. `beforeAll`: `fontsLoad(); await loadFont('labelle')`. `vi.useFakeTimers()`. `beforeEach` calls `clearSizeCache()`.)

```ts
test('one page is measured at Standard size, as a PNG and as a JPG at both qualities', async () => { open(docOf(box({ text: lines(40) }))); expect(await measurePage(freeze(), 1)).toEqual({ png: 900, jpg: 300, jpgPrint: 420 }); expect(renderPage).toHaveBeenCalledWith(expect.anything(), 1, PAGE_W * 2.2); expect(encodeCanvas).toHaveBeenCalledWith(expect.anything(), 'image/jpeg', 0.95); });
test('it waits for a pause, then measures the first chosen page once', async () => {
  open(docOf(box({ text: lines(40) }))); const { result, rerender } = renderHook(({ p }) => useSizeEstimate(p), { initialProps: { p: 0 as number | null } });
  expect(result.current).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(599)); expect(renderPage).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(result.current).toEqual({ png: 900, jpg: 300, jpgPrint: 420 });
  rerender({ p: 0 }); act(() => update(s => { s.doc.fileName = 'typed'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600));
  expect(renderPage).toHaveBeenCalledTimes(1);
});
test('a new look is measured again; going back uses what was measured', async () => {
  /* as above, measured once */ act(() => update(s => { s.S.look = 'bw'; }, { history: false })); await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(2);
  act(() => update(s => { s.S.look = 'none'; }, { history: false })); expect(result.current).toEqual({ png: 900, jpg: 300, jpgPrint: 420 }); await act(() => vi.advanceTimersByTimeAsync(600)); expect(renderPage).toHaveBeenCalledTimes(2);
});
test('a hidden stage measures nothing', async () => { /* renderHook with a wrapper: StageHost shown as export, then rerendered as write */ await act(() => vi.advanceTimersByTimeAsync(2000)); expect(renderPage).not.toHaveBeenCalled(); });
test('nothing is measured while a hand is still arriving, or with no page chosen', async () => { open(docOf(box({ text: 'x', style: { font: 'zeyada' } }))); renderHook(() => useSizeEstimate(0)); renderHook(() => useSizeEstimate(null)); await act(() => vi.advanceTimersByTimeAsync(2000)); expect(renderPage).not.toHaveBeenCalled(); });
test('a measurement that fails leaves no estimate', async () => { vi.mocked(encodeCanvas).mockRejectedValue(new Error('encode')); open(docOf(box({ text: 'x' }))); const { result } = renderHook(() => useSizeEstimate(0)); await act(() => vi.advanceTimersByTimeAsync(600)); expect(result.current).toBeNull(); });
```

- [ ] **Step 2: Run** `npx vitest run src/features/export/estimate.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `estimate.ts`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(export): the size estimate, measured from one real page after a pause`

---

### Task 8: The Export stage and the shared phone sheet

**Files:**
- Create: `src/features/doc/StageSheet.tsx` (M3's `src/features/style/StyleSheet.tsx`, moved with `git mv` and generalised), `src/features/export/ExportStage.test.tsx`
- Modify: `src/features/style/StyleStage.tsx` (imports the shared sheet), `src/features/export/ExportStage.tsx` (rewrite)
- Delete: `src/features/style/StyleSheet.tsx` (by the move)

**Interfaces:**
- Consumes: `Drawer`, `DrawerContent`, `DrawerHandle`, `DrawerTitle` (M3); `useWide`; `useStageActive`; `PageView` with `pick` (Task 5); `useExportPick`, `togglePage` (Task 3); `ExportPanel` (as it is: `{ pages: number }`, a `<section aria-label="Export">`; Task 9 rewrites it).
- Produces:
  - `StageSheet.tsx`:
    - `SheetSnaps` (unchanged).
    - `useSheetSnaps(stage, on, peek: string)`: M3's body, with points `[peek, 0.55, top]`, where the top is at least the peek.
    - `StageSheet({ title, handleLabel, snaps, scroll = true, children }: { title: string; handleLabel: string; snaps: SheetSnaps; scroll?: boolean; children: ReactNode })`: M3's `StyleSheet` with the title and the handle's label as props. With `scroll`, the body is M3's scrolling div. Without it, the body is `flex min-h-0 flex-1 flex-col`, and the child scrolls and pads for the safe area itself.
    - The comments say what the sheet is for both stages.
  - `StyleStage`: `useSheetSnaps(stage, !wide, '148px')` and `<StageSheet title="Style" handleLabel="Drag to show more or less of Style" snaps={snaps}>`. The behaviour is identical, and every M3 Style test passes unchanged.
  - `ExportStage({ layout }: { layout: PageLayout | null })`:
    - `EXPORT_PEEK = '168px'` (exported).
    - `pick = useMemo(() => choose ? { out: new Set(out), toggle: togglePage } : null, [choose, out])` from `useExportPick`, passed to `PageView mode="export"`. The panel is `<ExportPanel pages={layout?.pages ?? 1} />`.
    - `useWide()`: the grid `grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)] overflow-hidden`, holding `PageView` (`min-h-0 overflow-y-auto`) and `<aside className="flex min-h-0 flex-col border-l border-line bg-surface">`.
    - Otherwise: a `ref` div with `--sheet-shown`, holding `PageView` (`min-h-0 flex-1 overflow-y-auto pb-[calc(var(--sheet-shown)+12px)]`) and `<StageSheet title="Export" handleLabel="Drag to show more or less of Export" snaps={useSheetSnaps(stage, !wide, EXPORT_PEEK)} scroll={false}>`.

- [ ] **Step 1: Write the failing tests** (`phone()`, `width()`, `wideMatchMedia` and `stageButton` as in `StylePanel.test.tsx`. `openApp(stage, doc = sampleDoc(…))` creates a document and renders `App` at that stage. `pageLayout()` is `pages.test.tsx`'s helper. `fontsLoad()`.)

```ts
test('on a phone, Export is a sheet over the pages, and it goes with the stage', async () => {
  phone(); await openApp('export');
  const sheet = await screen.findByRole('dialog', { name: 'Export' });
  expect(sheet).toHaveAttribute('aria-modal', 'false'); expect(within(sheet).getByRole('region', { name: 'Export' })).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Pages' })).toBeInTheDocument();
  await userEvent.click(stageButton('Write')); expect(screen.queryByRole('dialog', { name: 'Export', hidden: true })).toBeNull();
});
test('on a phone, the sheet opens up to just below the stage switcher, rests as low as 168 px, and the pages make room for it', async () => {
  phone(); /* getBoundingClientRect: the export stage's element at (0, 89, 390, 679), as M3's test */ await openApp('export');
  const sheet = await screen.findByRole('dialog', { name: 'Export' });
  const room = () => screen.getByRole('main', { name: 'Pages' }).parentElement!.style.getPropertyValue('--sheet-shown');
  expect(room()).toBe('55dvh');
  const handle = screen.getByRole('button', { name: 'Drag to show more or less of Export' }); handle.focus();
  await userEvent.keyboard('{Enter}'); await waitFor(() => expect(sheet.style.getPropertyValue('--snap-point-height')).toBe('89px')); expect(room()).toBe('679px');
  await userEvent.keyboard('{Enter}'); await waitFor(() => expect(room()).toBe('168px'));
  expect(screen.getByRole('main', { name: 'Pages' })).toHaveClass('pb-[calc(var(--sheet-shown)+12px)]');
});
test('on a wide screen, the panel sits beside the pages', async () => { await openApp('export'); expect(await screen.findByRole('region', { name: 'Export' })).toBeInTheDocument(); expect(screen.queryByRole('dialog', { name: 'Export' })).toBeNull(); });
test('Choose pages makes the pages checkboxes; clicking one leaves it out', async () => {
  await openApp('export', docOf(box({ id: 'm', name: 'Main text', text: lines(40) }))); // 2 pages
  act(() => setChoose(true));
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Include page 2' }));
  expect(useExportPick.getState().out).toEqual([1]); expect(screen.getByText('Page 2 of 2 · left out')).toBeInTheDocument();
});
test('the choices outlive the panel, so crossing 860 px keeps them', () => {
  // The stage itself, on the open document (no App, so nothing reopens it): a phone tree, then a wide one.
  open(docOf(box({ id: 'm', text: lines(40) }))); phone();
  const first = render(<ExportStage layout={pageLayout()} />);
  act(() => { setChoose(true); togglePage(0); setExportPrefs({ format: 'png' }); }); first.unmount();
  window.matchMedia = wideMatchMedia; width(1200); render(<ExportStage layout={pageLayout()} />);
  expect(screen.getByRole('checkbox', { name: 'Include page 1' })).not.toBeChecked(); expect(useExportPrefs.getState().format).toBe('png');
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/export/ExportStage.test.tsx src/features/style`. Expected: the Export tests FAIL, and every Style test passes.
- [ ] **Step 3: Implement** `git mv src/features/style/StyleSheet.tsx src/features/doc/StageSheet.tsx`, generalise it, update `StyleStage.tsx`, and rewrite `ExportStage.tsx`.
- [ ] **Step 4: Run** `npm test` (the Style phone tests unchanged and passing), `npm run typecheck`, `npm run build`, `npm run smoke`.
- [ ] **Step 5: Commit** `feat(export): Export beside the pages, or as a bottom sheet on phones, on a sheet shared with Style`

---

### Task 9: The Export panel

**Files:**
- Modify (rewrite): `src/features/export/ExportPanel.tsx`
- Create: `src/features/export/ExportPanel.test.tsx`
- Delete: `src/features/export/exporters.ts`
- Modify: `package.json`, `package-lock.json` (`npm uninstall jspdf`), `src/features/stages.test.tsx` (the Export test), `src/features/style/controls.ts` (`tilt` label `Slight camera tilt`), `scripts/smoke.mjs` (one locator: `getByRole('button', { name: /^Download PDF/ })`, so the smoke keeps passing until Task 10)

**Interfaces:**
- Consumes: everything in Tasks 3, 4, 6, 7 and 8. `Group`, `Hint` (`@/features/style/parts`); `Segmented`, `SegButton` (`@/features/write/WriteBar`); `RadioGroup`, `RadioGroupItem`, `Switch`, `Input`, `Label`, `Button` (`ui/`); `setS` (`@/features/doc/actions`); `gesture`, `useEditor` (store); `useStageActive`; `cleanName`, `fontsInUse`, `fontReady` (engine); `pagesWord`; `Loader2`, `Download`, `Share2` icons.
- Produces: `ExportPanel({ pages }: { pages: number })`, laid out as `<section aria-label="Export" className="flex min-h-0 flex-1 flex-col">`:
  - **Header** (`flex-none border-b border-line px-5 py-3`): `h2` `Export`, and the line under it (`hidden wide:block`).
  - **Middle** (`min-h-0 flex-1 overflow-y-auto overscroll-contain`), with these `Group`s in order:
    - `Format`: `Segmented` `Format` with three `SegButton`s, calling `setExportPrefs({ format })`. The ZIP `Switch` and its `Hint` show when `format !== 'pdf'` and more than one page is chosen.
    - `Pages`: a `RadioGroup` `Pages` (`all` / `choose`) calling `setChoose`. With Choose pages, the counting `Hint`.
    - `How it looks`: M1's `RadioGroup`, calling `setS('look', v, { layout: false })` only when `v !== look`. Then the `Switch` `Slight camera tilt` (`setS('tilt', v, { layout: false })`) and its `Hint`.
    - `Quality`: `Segmented` `Quality`, calling `setExportPrefs({ quality })`, and the `Hint` for the chosen one.
    - `File name`: the `Input` (`aria-label="File name"`, `maxLength={80}`, `spellCheck={false}`, `autoComplete="off"`), with value `doc.fileName` and placeholder `exportBase('', title)`. Then a muted `<span>` with `suffixShown(plan)`.
      - The edit is `const edit = useRef<ReturnType<typeof gesture> | null>(null)`. `onChange` calls `(edit.current ??= gesture('file-name'))(s => { s.doc.fileName = v; }, { layout: false })`.
      - `onBlur` writes `cleanName(value)` through the same `edit.current` when it differs, then sets `edit.current = null`. Enter blurs.
  - **Footer** (`flex-none border-t border-line px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))]`):
    - A row with the primary `Button` (`size="lg"`, `flex-1`) and, when `canShareFiles()`, an outline `Button` `Share…`. Under it, the footer line (13 px, muted).
    - The Download button's content is `<span>{label}</span>{size && <>{' '}<span className="font-normal opacity-80">{size}</span></>}`. `label` is `downloadLabel(plan)`, or `Making page {done} of {total}…` with a spinner while `useExportRun.kind` is set. `size` is `formatSize(estimateBytes(plan, sample))` once `useSizeEstimate(plan.pages[0] ?? null)` gives a sample, and nothing with no pages.
    - Both buttons are disabled when no page is chosen, while running, or while a hand loads. In the last case they get the title `Waiting for the handwriting to load`.
    - The buttons call `download()` and `share()`.
  - The panel calls `void loadExportPrefs()` on mount, subscribes to `version` only while active (as today), and reads the plan with `planOf(prefs, pick, pages, fileName, title)`.

- [ ] **Step 1: Write the failing tests** (`./estimate` mocked: `useSizeEstimate: () => SAMPLE` with `SAMPLE = { png: 900_000, jpg: 300_000, jpgPrint: 420_000 }`. `./run` mocked: `download`, `share`, `canShareFiles` as `vi.fn`. `@/store/documents` mocked with in-memory prefs, and `sonner` as in M2. `Live` renders `<ExportPanel pages={layoutFor(get().S, get().doc).pages} />` and re-renders on `version`. `three()` opens `docOf(box({ id: 'm', text: lines(60) }))`, which is 3 pages titled `A`. `fontsLoad()` and `await loadFont('labelle')` in `beforeAll`, and the stores are reset in `beforeEach`.)

```ts
const dl = () => screen.getByRole('button', { name: /^(Download|Choose|Making)/ });
test('the panel, top to bottom', () => { three(); render(<Live />); expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Export'); expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Format', 'Pages', 'How it looks', 'Quality', 'File name']); expect(screen.getByText('Made on this device. Nothing is uploaded.')).toBeInTheDocument(); });
test('a new document downloads a PDF of every page, As written, without tilt, at Standard', () => {
  three(); render(<Live />);
  expect(screen.getByRole('button', { name: 'PDF' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('radio', { name: 'All pages (3)' })).toBeChecked(); expect(screen.getByRole('radio', { name: 'As written' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Slight camera tilt' })).not.toBeChecked(); expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1747 × 2471 pixels a page, for screens and uploads.')).toBeInTheDocument();
  expect(dl()).toHaveAccessibleName('Download PDF · 3 pages ~902 KB'); // 900,000 + 300 + 3 × 480
});
test('several PNGs go in one ZIP unless you say not', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'PNG' }));
  expect(screen.getByRole('switch', { name: 'Put the images in one ZIP' })).toBeChecked(); expect(screen.getByText('One file to send or upload, instead of 3.')).toBeInTheDocument();
  expect(dl()).toHaveAccessibleName('Download ZIP · 3 PNGs ~2.7 MB'); expect(screen.getByText('.zip')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('switch', { name: 'Put the images in one ZIP' }));
  expect(dl()).toHaveAccessibleName('Download 3 PNGs ~2.7 MB'); expect(screen.getByText('-page-1.png')).toBeInTheDocument(); expect(useExportPrefs.getState().zip).toBe(false);
});
test('no ZIP switch for a PDF, or for one image', async () => { three(); render(<Live />); expect(screen.queryByRole('switch', { name: 'Put the images in one ZIP' })).toBeNull(); await userEvent.click(screen.getByRole('button', { name: 'JPG' })); act(() => { setChoose(true); togglePage(0); togglePage(1); }); expect(screen.queryByRole('switch', { name: 'Put the images in one ZIP' })).toBeNull(); expect(dl()).toHaveAccessibleName('Download JPG ~300 KB'); });
test('Print quality', async () => { three(); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'Print quality' })); expect(screen.getByText('2480 × 3508 pixels a page (300 dpi), for printing.')).toBeInTheDocument(); expect(dl()).toHaveAccessibleName('Download PDF · 3 pages ~2.5 MB'); });
test('How it looks is the document’s: one undo step each, and choosing it again records nothing', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('radio', { name: 'As written' })); expect(get().canUndo).toBe(false);
  await userEvent.click(screen.getByRole('radio', { name: 'Black and white' })); expect(get().S.look).toBe('bw');
  await userEvent.click(screen.getByRole('switch', { name: 'Slight camera tilt' })); expect(get().S.tilt).toBe(true);
  undo(); expect(get().S.tilt).toBe(false); undo(); expect(get().S.look).toBe('none'); expect(get().canUndo).toBe(false);
});
test('the file name shows its ending, starts as the title, and one edit is one undo step', async () => {
  three(); render(<Live />); const f = screen.getByRole('textbox', { name: 'File name' });
  expect(f).toHaveValue(''); expect(f).toHaveAttribute('placeholder', 'A'); expect(screen.getByText('.pdf')).toBeInTheDocument();
  await userEvent.click(f); await userEvent.tab(); expect(get().canUndo).toBe(false); // looked at, not changed
  await userEvent.type(f, 'Week 1/notes.pdf'); await userEvent.tab(); expect(get().doc.fileName).toBe('Week 1 notes');
  undo(); expect(get().doc.fileName).toBe(''); expect(get().canUndo).toBe(false);
});
test('Choose pages: the count and the label follow what is chosen', async () => {
  three(); render(<Live />); await userEvent.click(screen.getByRole('radio', { name: 'Choose pages' }));
  expect(screen.getByText('Click a page to leave it out or put it back. 3 of 3 chosen.')).toBeInTheDocument();
  act(() => togglePage(1)); expect(screen.getByText('Click a page to leave it out or put it back. 2 of 3 chosen.')).toBeInTheDocument(); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages ~/);
  act(() => { togglePage(0); togglePage(2); }); expect(dl()).toHaveAccessibleName('Choose at least one page'); expect(dl()).toBeDisabled();
  await userEvent.click(screen.getByRole('radio', { name: 'All pages (3)' })); expect(dl()).toHaveAccessibleName(/^Download PDF · 3 pages/);
});
test('when the document gets shorter, a page left out past its end is forgotten', () => { three(); act(() => { setChoose(true); togglePage(2); }); const { rerender } = render(<ExportPanel pages={3} />); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages/); rerender(<ExportPanel pages={2} />); expect(dl()).toHaveAccessibleName(/^Download PDF · 2 pages/); expect(screen.getByText('Click a page to leave it out or put it back. 2 of 2 chosen.')).toBeInTheDocument(); });
test('format, ZIP and quality stay on the device, not in the document', async () => { three(); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'JPG' })); await userEvent.click(screen.getByRole('button', { name: 'Print quality' })); expect(get().canUndo).toBe(false); act(() => openDocument(rec('B', docOf(box())))); expect(screen.getByRole('button', { name: 'JPG' })).toHaveAttribute('aria-pressed', 'true'); });
test('Download and Share wait for the handwriting to load', () => { vi.mocked(canShareFiles).mockReturnValue(true); open(docOf(box({ text: 'x', style: { font: 'zeyada' } }))); render(<Live />); for (const b of [dl(), screen.getByRole('button', { name: 'Share…' })]) { expect(b).toBeDisabled(); expect(b).toHaveAttribute('title', 'Waiting for the handwriting to load'); } });
test('Share… shows only where the browser can share files', async () => { three(); const { unmount } = render(<Live />); expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull(); unmount(); vi.mocked(canShareFiles).mockReturnValue(true); render(<Live />); await userEvent.click(screen.getByRole('button', { name: 'Share…' })); expect(share).toHaveBeenCalled(); });
test('Download makes the files; while they are made, the button says how far it has got', async () => { three(); render(<Live />); await userEvent.click(dl()); expect(download).toHaveBeenCalled(); act(() => useExportRun.setState({ kind: 'download', done: 2, total: 3 })); expect(dl()).toHaveAccessibleName('Making page 2 of 3…'); expect(dl()).toBeDisabled(); });
// src/features/stages.test.tsx: 'Export shows the download controls' becomes
//   findByRole('button', { name: /^Download PDF · 1 page/ }), getByRole('group', { name: 'Format' }),
//   getByRole('textbox', { name: 'File name' }), getByRole('switch', { name: 'Slight camera tilt' }).
```

- [ ] **Step 2: Run** `npx vitest run src/features/export src/features/stages.test.tsx`. Expected: FAIL (the old panel).
- [ ] **Step 3: Implement** the panel, delete `exporters.ts`, run `npm uninstall jspdf`, update `stages.test.tsx`, `controls.ts` and the smoke locator.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`, then `npm ls jspdf` (empty) and `grep -rn "toBlob\|createObjectURL" src --include=*.ts --include=*.tsx --exclude=*.test.* --exclude-dir=test` (only `render.ts` and `run.ts`). Then a manual check with `npm run dev` in Playwright:
  - At 1280 × 860: the panel sits beside the pages with its footer pinned at the bottom, and the size appears about a second after opening Export. A tilted As written shows tilted pages.
  - At 390 × 844: the sheet starts at about half height. At its lowest height the title, Download and the footer line all show. If they don't fit, raise `EXPORT_PEEK` in `ExportStage.tsx` until they do, and report the value. Tapping a page above the sheet leaves it out.
- [ ] **Step 5: Commit** `feat(export): the Export panel as specified: format, ZIP, pages, look, quality, file name, Download with its size, and Share`

---

### Task 10: Smoke and README

**Files:**
- Modify: `scripts/smoke.mjs`, `README.md`

- [ ] **Step 1: Extend the smoke run** (1280 × 860; any console error fails it).
  - At the top of the script, add:
    - `zlib` from `node:zlib`.
    - Small readers: `pngChunks(buf)`, `jpegMarkers(buf)` (markers up to `EOI`), and `zipEntries(buf)` (end record → central directory → local headers, returning name, method, time, date, flags, extra lengths, CRC check with `zlib.crc32`, and data).
    - `pdfjs()`, which sets `globalThis.DOMMatrix ??= class {}` and `globalThis.Path2D ??= class {}` (so pdf.js stays quiet in Node) and returns `require(join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.js'))`.

  Replace the step `Export: Download PDF gives a .pdf file` with these two:
  1. **Export: a PDF of every page, with no metadata.**
     - Open Export, and let `n` = the number of `[data-stage="export"] .sheet`. Fail if `n < 2`, since the Outline steps made at least three pages.
     - Wait (20 s) for the button named `^Download PDF · ${n} pages ~[\d.]+ (KB|MB)$`, click it, and take the download (`waitForEvent('download')`). Its name must be `The Water Cycle.pdf`. Read `readFileSync(await download.path())`.
     - In the bytes as latin1, outside streams: none of `/Info /Producer /Creator /Author /Title /Subject /Keywords /CreationDate /ModDate /Metadata`. The trailer has `/ID [<X> <X>]` with `X` 32 hex digits, both equal. `/Count ${n}`. `n` image objects, each `/Width 1747 /Height 2471 … /DCTDecode`.
     - Each image's stream (its `/Length` bytes after `stream\n`) has JPEG markers that are only `E0` (exactly the bare 14-byte JFIF), `DB`, `C0–CF` except `C8`, `DD`, `DA`, `D9`.
     - pdf.js: `getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 })` gives `numPages === n`. Every key of `getMetadata().info` is one of `PDFFormatVersion, Language, EncryptFilterName, IsLinearized, IsAcroFormPresent, IsXFAPresent, IsCollectionPresent, IsSignaturesPresent`, `metadata` is `null`, and `fingerprints[0]` is `X` in lower case. Then `destroy()` it.
  2. **Export: a ZIP of PNGs, leaving page 1 out, with no metadata.**
     - In group `Format`, click `PNG`. The switch `Put the images in one ZIP` is checked.
     - Click the radio `Choose pages`, then the checkbox `Include page 1`, and wait for it to be unchecked.
     - Wait for `^Download ZIP · ${n - 1} PNGs ~`, click it, and take the download, named `The Water Cycle.zip`.
     - The entries are exactly `The Water Cycle-page-2.png` … `-page-${n}.png`. Each has method 0, time 0, date `0x21`, no extra field, flags 0 and a good CRC, and the archive comment is empty.
     - Each PNG's chunk types are a subset of `IHDR PLTE tRNS sRGB IDAT IEND`, starting with `IHDR` and ending with `IEND`, and its `IHDR` says 1747 × 2471.
     - Then click `All pages (${n})` and `PDF`, so the device preference is back to its default.

  The `Ctrl+Z` step and the Style upload step stay after these, as they are.
- [ ] **Step 2: Update the README.**
  - Add a `## Export` section after Style. It covers:
    - The pages shown exactly as they will download, with camera tilt and scan looks.
    - PDF, PNG or JPG, and one ZIP for several images (on by default).
    - All pages or Choose pages (click a page to leave it out).
    - The four looks and Slight camera tilt (off for new documents; both remembered by the document, and undoable).
    - Standard (1747 × 2471) or Print quality (2480 × 3508, 300 dpi).
    - The file name, from the title, with its ending.
    - The Download button with what it makes and its estimated size.
    - Share… where the browser can share files.
    - **No metadata:** what each kind of file holds and what is taken out, in two or three sentences from the Metadata guarantees table.
    - The bottom sheet on phones.
    - That format, ZIP and quality are remembered on the device.
  - In "What it does today", the Downloads bullet becomes PDF, PNG or JPG, ZIP, Choose pages, two qualities, Share, and no metadata.
  - In "How the code is laid out", describe `src/features/export`: `plan.ts`, `state.ts`, `render.ts`, `build.ts`, `run.ts`, `estimate.ts`, the scrubbers `png.ts`/`jpeg.ts`, and the writers `pdf.ts`/`zip.ts`/`crc32.ts`. Also describe `src/features/doc/StageSheet.tsx` (the phone sheet shared by Style and Export) in place of `StyleSheet.tsx`.
  - In Credits, remove jsPDF.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass, and the last line is `smoke ok`.
- [ ] **Step 4: Check**
  - `git diff main --stat -- src/engine` lists only `config.js` and `engine.test.ts`.
  - `git diff main -- src/engine/config.js` changes only `tilt:true` → `tilt:false`.
  - `git diff main -- src/engine/core.js` gives no output.
  - `npm ls jspdf` lists nothing.
  - `grep -rn "toBlob\|toDataURL\|createObjectURL" src --include=*.ts --include=*.tsx --include=*.js --exclude=*.test.* --exclude-dir=test` gives only `src/features/export/render.ts` (`toBlob`) and `src/features/export/run.ts` (`createObjectURL`).
- [ ] **Step 5: Commit** `test: smoke downloads a PDF and a ZIP of PNGs and finds no metadata in their bytes; README for Export`

The controller then merges `nib/m4-export` into `main` and pushes. This task does not merge, push or deploy.

---

## Exit check (roadmap)

**Tests read the produced PDF and image bytes and find no metadata fields:**
- Task 1: the scrubbers, on PNG and JPEG bytes carrying every kind of metadata.
- Task 2: the PDF's xref, objects and trailer (no `/Info`, no `/Metadata`, a random `/ID`), and the ZIP's headers (no dates, extras, comments or attributes).
- Task 6: the whole pipeline. The encoder is stubbed to hand back images stuffed with metadata, and the PDF, ZIP, PNG and JPG files made from them hold none.
- Task 10: the smoke downloads a real PDF and a real ZIP of PNGs from Chromium's own encoders and parses their bytes in Node. pdf.js reports no document information fields.
