# Nib

Turn typed text into realistic handwritten pages, then download them as a PDF or images.

Nib was previously called Longhand.

Live site: https://nvmaditya.github.io/nib-engine/

Until the repository is renamed to `nib-engine`, the site is at https://nvmaditya.github.io/longhand/.

## What it does today

- **Home** lists your documents. They are saved on the device, in the browser's own storage.
- **Import** reads a PDF, Word (.docx) or text file; headings, lists, bold, underline and crossed-out words come across.
- **Write, Style and Export** are the three stages of a document. Write is for the text and where it sits on the pages, Style is for the hand, pen, ink and paper, and Export downloads the result.
- **Hands and pens**: 33 hands, or upload your own font (TTF, OTF, WOFF). Fineliner, ballpoint, gel, felt tip and pencil, drawn at the pen's real line width.
- **Realism**: each letter bends a little differently, lines climb and sag, the pen presses harder on downstrokes, and the ink runs darker and lighter. Optional mistakes are crossed out and written again.
- **Paper**: ruled, spiral, yellow pad, grid, plain, or a photographed sheet, with room lighting, show-through and punch holes.
- **Blocks** of text can be placed anywhere. A long block flows onto the next pages, and each page's part can be moved, resized, edited, deleted or separated. Any block can have its own style.
- **Downloads** are PDF or PNG, as written, scanned, scanned in greyscale, or black and white, with an optional slight camera tilt.
- **Simple markup** in the editor: `# Title`, `## Heading`, `**bold**`, `*underline*`, `==highlight==`, `~~cross out~~`, `- lists`, `> notes`, `\newpage`.

Everything happens in the browser. Nothing is uploaded.

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
- `src/shell/` holds the top bar, the stage navigation and the undo shortcuts.
- `src/features/` holds one folder per part of the app: `home`, `import`, `write`, `style`, `export`, `doc` and `pages` (the page views, blocks and dragging).
- `src/components/ui/` holds the shared interface components (Radix primitives styled in the shadcn way).
- `src/brand/` holds the Nib logo; `src/lib/` holds small helpers such as the theme; `src/styles/app.css` holds the Tailwind setup and design tokens.
- `scripts/smoke.mjs` is the browser smoke test.
- `public/fonts/` holds the handwriting fonts, which load only when used. Their licences are in `public/fonts/licenses/`, and [FONTS.md](FONTS.md) lists them all.
- `public/paper/photo.webp` is the photographed sheet used by the Photo paper.

## Credits

The handwriting fonts are open-licensed fonts from Google Fonts, via Fontsource; see [FONTS.md](FONTS.md). Nib also uses [opentype.js](https://github.com/opentypejs/opentype.js), [jsPDF](https://github.com/parallax/jsPDF), [PDF.js](https://github.com/mozilla/pdf.js) and [mammoth](https://github.com/mwilliamson/mammoth.js).

The interface is built with [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Radix](https://www.radix-ui.com) components in the style of [shadcn/ui](https://ui.shadcn.com), [Zustand](https://github.com/pmndrs/zustand) and [idb](https://github.com/jakearchibald/idb).
