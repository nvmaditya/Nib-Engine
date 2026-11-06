# Longhand

Turn typed text into realistic handwritten pages, then download them as a PDF or images.

Longhand draws every letter from a real handwriting font's outlines, then makes it look written by hand: each letter bends a little differently, lines climb and sag, the pen presses harder on downstrokes, and the ink runs darker and lighter. It all happens in the browser; nothing is uploaded.

## Features

- **33 hands**: 21 realistic pen hands plus neat, school and marker styles, or upload your own font (TTF, OTF, WOFF).
- **Real pens**: fineliner, ballpoint, gel, felt tip and pencil. Any font is redrawn at the pen's real line width.
- **Realism controls**: natural movement, letter variety, wobble, ink flow, and optional mistakes that are crossed out and written again.
- **Paper**: ruled, spiral, yellow pad, grid, plain, or a photographed sheet, with room lighting, show-through, fold crease and punch holes.
- **Text boxes**: place them anywhere; a long box flows onto the next pages, and each page's part can be moved, resized, edited, deleted or separated on its own. Any box can have its own style.
- **Import**: bring in a PDF, Word (.docx) or text file; headings, lists, bold, underline and crossed-out words come across.
- **Downloads**: PDF or PNG, as written, scanned, scanned in greyscale, or black and white, with an optional slight camera tilt. Choose the file name.
- **Simple markup** in the editor: `# Title`, `## Heading`, `**bold**`, `*underline*`, `==highlight==`, `~~cross out~~`, `- lists`, `> notes`, `\newpage`.

## Run it locally

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Build

```bash
npm run build
```

The finished site is in `dist/`. It uses relative paths, so it works from any folder or web address.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site and publishes it on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## How the code is laid out

- `src/engine/` is the drawing engine, written in plain JavaScript with no React in it.
  - `core.js`: the glyph engine, layout, ink, paper, scan looks and camera tilt.
  - `doc.js`: loading, checking and saving the document and settings.
  - `importers.js`: reading PDF, Word and text files.
  - `config.js`: hands, pens, inks, papers and defaults.
- `src/store.js` holds the app state. React components subscribe to it.
- `src/actions.js` holds what people do: select, move, split, style and import.
- `src/components/` holds the React interface: the header, the Write and Style panels, the pages with their text boxes, the import dialog and the toast.
- `public/fonts/` holds the handwriting fonts, which load only when used. Their licences are in `public/fonts/licenses/`, and [FONTS.md](FONTS.md) lists them all.
- `public/paper/photo.webp` is the photographed sheet used by the Photo paper.

## Credits

The handwriting fonts are open-licensed fonts from Google Fonts, via Fontsource; see [FONTS.md](FONTS.md). Longhand also uses [opentype.js](https://github.com/opentypejs/opentype.js), [jsPDF](https://github.com/parallax/jsPDF), [PDF.js](https://github.com/mozilla/pdf.js) and [mammoth](https://github.com/mwilliamson/mammoth.js).
