# Developing Nib

How to run, test, build and deploy Nib, and how the code is laid out. For what Nib does, see the [README](../README.md) and the [user guide](USER_GUIDE.md).

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

## Project structure

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
- `public/fonts/` holds the handwriting fonts, which a page loads only when it uses them (the service worker keeps them all for offline use). Their licences are in `public/fonts/licenses/`, and [FONTS.md](../FONTS.md) lists them all.
- `public/paper/photo.webp` is the photographed sheet used by the Photo paper.

