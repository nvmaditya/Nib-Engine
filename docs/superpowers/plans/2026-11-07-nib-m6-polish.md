# Nib Milestone 6 (Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Nib v1 (spec §9, Milestone 6): Nib installs and works offline, says when a new version is ready and never reloads a tab by itself, shows three tips the first time a document opens, lists every keyboard shortcut on a sheet (`?` or Ctrl+/), opens a Ctrl+K command palette, switches between System, Light and Dark with no flash, and shows Outline as a bottom sheet on phones. It also settles everything earlier milestones deferred to M6 (the Deferred items table).

**Architecture:** `vite-plugin-pwa` generates the manifest and a Workbox service worker that precaches the whole app: the shell, the engine, every hand's font file, the paper photo, and the pdf.js and mammoth readers. Google's web copies of the hands are cached the first time they are fetched. Registration uses the plugin's `virtual:pwa-register` in prompt mode, with `onNeedReload`, so a new version is applied only in the tab whose Reload was pressed (`src/app/updates.ts`). The palette, the shortcut sheet and the app's own keys live in `src/shell` around one overlay store (`src/shell/overlays.ts`), mounted once outside the stages. The theme is decided by an inline script in `index.html` before anything is drawn, and by `src/lib/theme.ts` afterwards. Phone Outline reuses `StageSheet`, as Style and Export do.

**Tech Stack:** React 19, TypeScript (strict, `typescript` 7.0.2), Vite 8, Tailwind v4, shadcn-style components hand-written on `radix-ui` 1.8.1 in `src/components/ui`, `vaul` 1.1.2 (sheets), `sonner` 2.0.8 (messages), `lucide-react`, Zustand, `idb`, TipTap 3.33.0, Vitest 5 + Testing Library + jsdom + fake-indexeddb, and the machine's Playwright (Chromium at `/opt/pw-browsers`) for `npm run test:browser` and `npm run smoke`. **New:** `vite-plugin-pwa` **2.0.0** (devDependency; brings `workbox-build` and `workbox-window` 7.4.x) and `cmdk` **1.1.1** (dependency; it uses the same `@radix-ui/react-dialog` 1.3.1 that `radix-ui` and `vaul` already share).

**Spec:** `docs/superpowers/specs/2026-11-06-nib-redesign-design.md`. This milestone implements §9's Milestone 6 line in full, §7 (phones) for Outline, the theme switch of §2, and the manifest, app icon and social image of §2's brand. §8 names `cmdk` and `vite-plugin-pwa`. The roadmap row is in `docs/superpowers/plans/2026-11-06-nib-m1-foundation.md` (Roadmap after Milestone 1). Its exit check: **Lighthouse PWA installable; offline reload works; phone smoke at 390 px.** The deferred items come from `.superpowers/sdd/m6-deferred.md` (30 lines, triaged below).

**Branch:** `nib/m6-polish`, cut from `main` after Milestone 5 **and its final-review fixes** are merged. Those fixes change the Home layout (M5 Design decision 7), the Rename and Delete focus on Home, the act warnings, `reporters: ['default']` in `vite.config.ts`'s test block, the “{title}” was changed in another tab… message, the `openTemplate` de-dupe and the cached template-card pictures. **M6 plans no work on any of them**, and every task builds on them as they are. Tasks run in worktrees off the branch. **The controller merges each task, and at the end merges `nib/m6-polish` into `main` and pushes. No task merges, pushes or deploys.**

## Global Constraints

- Product name **Nib** in all copy. Copy is plain sentence case, with curly quotes and apostrophes, and every string comes from the Interface copy and Shortcuts tables below.
- **Realism is non-negotiable (spec §1).** The **only engine code M6 changes** is in `src/engine/core.js` and `core.d.ts`, in Task 7, for deferred item D60:
  - `frameShot` takes its angle from a new `shotAngle(rnd)`. This is the same expression on the same random numbers, so every downloaded page is byte for byte what it was.
  - A new export, `pageTilt(i)`, gives that angle as a value.
  - Nothing else in `src/engine` changes. Task 12 checks this with `git diff main --stat -- src/engine`, which must list only `core.js`, `core.d.ts` and `engine.test.ts`.
- **Dependencies.** There are exactly two new direct dependencies, pinned exactly: `vite-plugin-pwa` `2.0.0` in `devDependencies` and `cmdk` `1.1.1` in `dependencies`. `npm ls --depth=0` shows no other change. Lighthouse is run once with `npx` for the exit check (Task 12) and is never added.
- **Documents are safe across versions.** IndexedDB `nib` stays at version 1 and `DOC_SCHEMA` stays 3. So an M5 tab and an M6 tab read and write each other's records, under QA round 1's revision check.
  - New `localStorage` key: `nib.tips` (`'seen'`). Existing keys stay as they are: `nib.theme`, `nib.phoneFace` and the folds.
  - No new IndexedDB `prefs` keys.
- **The service worker exists only in a production build.** Development has none (`devOptions.enabled` false).
  - Tests have none either: the plugin is `disable`d while `process.env.VITEST` is set. This covers `npm test`, whether its settings are in `vite.config.ts` or `vitest.config.ts`, and the Vite builds that `*.browser.test.ts` make.
  - No test imports `src/app/pwa.ts`, because `virtual:pwa-register` is only real in a build. Update logic is tested through `startUpdates(register)` with a fake `register`.
- `vite.config.ts` keeps `base: './'`, and every path stays relative, so the site and the service worker work under `/nib-engine/`. The manifest's `start_url`, `scope` and `id` are `'./'`.
- Colour tokens and type follow spec §2:
  - Tailwind classes: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-muted` (grey text, never `bg-muted`), `bg-primary`, `text-primary`, `bg-primary-soft`, `text-danger`.
  - UI parts come from `src/components/ui`, hand-written on `radix-ui` (the shadcn CLI is blocked). `src/components/ui/command.tsx` wraps `cmdk` in the same style.
  - Icons are `lucide-react`. Messages go through `toast()` (`src/store/editor.ts`).
  - Figtree weights are 400 for text, 500 for controls and 600 for names and titles.
  - Every new control has `focus-visible:ring-2 focus-visible:ring-ring/50`.
  - Keys are shown in `<kbd>` (`rounded border border-line bg-surface-2 px-1.5 text-[12px] font-medium`).
- `wide:` (860 px) is the only layout breakpoint. **The new overlays (palette, shortcut sheet, tips, app menu) use `wide:` classes only, never `useWide()`.** The only new `useWide()` call is in phone Outline (Task 4), which needs a sheet.
- **Undo** (the M2–M5 rule: every document change goes through `update(fn, { history })`, and a no-op records nothing):
  - The palette's look command is one step, and a look that is already in place records nothing.
  - Opening overlays, the theme, the tips and `Export as…` (export prefs, as in M4) are not steps.
  - **A gesture that ends where it began leaves no step** (Task 7).
- **Keys.** Every shortcut in the app is in `SHORTCUTS` (`src/shell/shortcuts.ts`), and the sheet shows exactly that list. M6 adds Ctrl/⌘+K, Ctrl/⌘+/ and `?`.
  - Apple keyboards show ⌘, ⌥ and ⇧, through `isApple()` in `src/lib/keys.ts`.
  - A key is never taken from a field or an editor, except Ctrl/⌘+K and Ctrl/⌘+/.
  - With another dialog or menu open, the app's keys open nothing.
- **Hidden stages.** Overlays and tips are mounted outside `StageHost`. Phone Outline's sheet is inside its stage, as Style's is, so it is hidden with it.
- TypeScript is `strict`. App code type-checks under `tsconfig.app.json`, which has no Node types. Tests and `src/test/**` type-check under `tsconfig.test.json`. `scripts/*.mjs` are plain Node.
- **Tests.**
  - Write tests first, and keep the output clean: no act warnings and no React, Radix, cmdk, TipTap or jsdom console errors. Dialogs have a `DialogDescription`.
  - Real-pixel tests would be `*.browser.test.ts`, run by `npm run test:browser`, which `npm run smoke` calls, and never by `npm test`, because CI has no Playwright.
  - Every commit leaves `npm test && npm run typecheck && npm run build && npm run smoke` passing.
- **Commit messages carry no `Co-Authored-By` or `Claude-Session` lines.** The repository config sets the author and committer.

## Interface copy

Exact strings, used verbatim. `{x}` is filled in. `{Mod+K}` is `chordLabel(['Mod', 'K'])`: `Ctrl+K`, or `⌘K` on Apple keyboards.

| Where | Copy |
|---|---|
| Manifest (Task 1) | `name` and `short_name` `Nib`. `description` `Turn typed text into realistic handwritten pages, then download them as a PDF or images.` |
| Social image (Task 1) | the ink logo, the wordmark `nib`, and the line `Turn text into handwritten pages.` |
| The first install (Task 9) | message `Nib works offline now.` |
| A new version (Task 9) | message `A new version is ready.` with action `Reload`. It stays up until it is pressed or swiped away, and through a document opening or closing. |
| A newer version wrote this document (Task 9) | M1's `This document was saved by a newer version of Nib. Reload the page to keep editing.`, now with action `Reload`, in the editor and on Home |
| Top bar (Task 11) | icon button named and titled `Menu` (lucide `Menu`), after Undo and Redo in a document and after `New document` on Home |
| Menu (Task 11) | `Search commands and documents`, shortcut `{Mod+K}` · `Keyboard shortcuts`, shortcut `?` · separator · label `Theme`, radio items `System`, `Light`, `Dark` |
| Shortcut sheet (Task 3) | title `Keyboard shortcuts` · description (screen readers) `Every keyboard shortcut in Nib, by where it works.` · the Shortcuts table · M1's close button `Close` (screen readers) |
| Palette (Task 10) | title (screen readers) `Search commands and documents` · description (screen readers) `Open a document, go to a stage, use a look, export, or change the theme.` · field placeholder and name `Search commands and documents` · empty `Nothing matches that.` |
| Palette groups, in order (Task 10) | `Go to`: `Write`, `Outline`, `Style`, `Export`, `Home` (in a document; the stage on screen is left out) · `Documents`: each other document's title, with `{edited}` (M1's `Edited today`/`Edited yesterday`/`Edited {d} {Month} {yyyy}`) muted on the right · `Create`: `New document`, `Import a file…` · `Export` (in a document): `Export as PDF`, `Export as PNG`, `Export as JPG` · `Looks for the whole document` (in a document): the six looks, then saved looks, by name · `Theme`: `System theme`, `Light theme`, `Dark theme`, the current one with `Current` muted on the right · `Help`: `Keyboard shortcuts`, with `?` on the right |
| Tips (Task 8) | heading `Tips` · an ordered list of three: 1. `Click or tap a word on a handwritten page to put the caret there in its text.` 2. `Drag a block by its name tag to move it. Its ⋯ menu splits it, joins it back or removes one page’s part.` 3. `Press {Mod+K} to open a document, go to a stage or change the theme, and ? to see every shortcut.` On a touch-only device (`(hover: none) and (pointer: coarse)`), item 3 is `Swipe sideways on a page to turn to the next one.` · button `Got it` |
| Phone Outline (Task 4) | sheet name (screen readers) `Outline` · handle `Drag to show more or less of Outline` |
| Pages (Task 6) | merging into a full page: `Page {i} is full, so nothing on page {i+1} fits on it.` (no step) · a new block that lands on a later page: `Added a text block. Page {p} has no free line, so it starts on page {q}.` / `Added a margin note. Page {p} has no free line, so it starts on page {q}.` |
| Style (Task 5) | Fit back when nothing fits and another block has its own letter size: `This doesn’t fit on {pages}, even with the smallest letter size and line spacing. “{block}” has its own letter size, which Fit back leaves alone.` · a saved look whose removal couldn't be stored: `Removed “{name}” here, but this device couldn’t save that, so it may come back.` (with `Undo`) · an uploaded hand that can't be read: its note is `your font, which can’t be read on this device` |

## Shortcuts (Task 3)

`SHORTCUTS: ShortcutGroup[]` in `src/shell/shortcuts.ts`, shown by the sheet in this order. Each was checked against the code: `useUndoShortcuts.ts`, `DocumentView.tsx` (Escape), `BoxFrame.tsx` and `drag.ts` (`nudge`, Escape), `TypedPage.tsx` (grip arrows), `extensions.ts` (`AppHistory`, `BlockKeys`, `Slash`), and TipTap's defaults for the extensions in `schema.ts`. `Mod` is Ctrl, or ⌘ on Apple. `Ctrl+Y` is listed only off Apple, because outside an editor it is always the Control key.

| Group (note) | What it does | Keys |
|---|---|---|
| `Anywhere` | `Search commands and documents` | Mod+K |
| | `Keyboard shortcuts` | `?` · Mod+/ |
| | `Close a dialog or menu` | Esc |
| `In a document` | `Undo` | Mod+Z |
| | `Redo` | Mod+Shift+Z · Ctrl+Y (not on Apple) |
| | `Leave the selected block` | Esc |
| `A block on a handwritten page` (`Tab to a block, or click it.`) | `Move it a ruled line up or down` | ↑ · ↓ |
| | `Move it a little left or right` | ← · → |
| | `Write in it` (`In Write`) | Enter |
| | `Delete it, or only this page’s part` (`In Write`) | Delete · Backspace |
| | `Cancel moving it` | Esc |
| `In the text` | `Bold` | Mod+B |
| | `Underline` | Mod+U |
| | `Cross out` | Mod+Shift+S |
| | `Highlight` | Mod+Shift+H |
| | `Normal` | Mod+Alt+0 |
| | `Title` | Mod+Alt+1 |
| | `Heading` | Mod+Alt+2 |
| | `Note` | Mod+Shift+B |
| | `Bulleted list` | Mod+Shift+8 |
| | `Numbered list` | Mod+Shift+7 |
| | `Indent a list item, or take it back out` | Tab · Shift+Tab |
| | `Page break` | Mod+Enter |
| | `Text styles, lists and a page break` | `/` |
| `As you type` (`At the start of a line, then a space; marks around words.`) | `Title` | `# ` |
| | `Heading` | `## ` |
| | `Bulleted list` | `- ` |
| | `Numbered list` | `1. ` |
| | `Note` | `> ` |
| | `Bold` | `**words**` |
| | `Underline` | `*words*` |
| | `Cross out` | `~~words~~` |
| | `Highlight` | `==words==` |

`chordLabel(chord)`:
- Off Apple, it is the keys joined by `+`, as in `Ctrl+Shift+Z`.
- On Apple, it is the modifiers in the order ⌃ ⌥ ⇧ ⌘, then the key, with no separators, as in `⇧⌘Z`.
- Key names: `Escape` → `Esc`, and the arrows → `↑ ↓ ← →`. `Enter`, `Delete`, `Backspace` and `Tab` stay as they are.

## Review Focus

1. **A new deploy while someone types in another tab.** Expected: only the tab whose Reload was pressed reloads, and only after writing its last change. Every other tab keeps its text and caret and shows `A new version is ready.` It never reloads by itself. Tests: Task 9 (`a new version taking over from another tab never reloads this one`, `Reload writes the last change first, then reloads only this tab`) and Task 12's two-tab smoke step.
2. **Offline, with things never used before on this device**: a hand never chosen, or the first PDF or Word import. Expected: every hand draws, and both readers load, from the service worker's precache. Tests: Task 1 (`the service worker keeps every hand…`) and Task 12's offline step, which chooses an unused hand and imports a `.docx` and a PDF with the server stopped.
3. **The new keys where text is typed.** `?` in a field or the editor, Ctrl+K with the Import dialog, a picker or a menu open, and Ctrl+/ from inside the editor. Expected: `?` is typed. Ctrl+K opens nothing over another dialog. Ctrl+/ opens the sheet and gives the focus back to the editor when it closes. Tests: Task 3 (`? opens the shortcuts, but in a field it is just typed`, `with another dialog or a menu open, the app’s keys open nothing`, `closing the sheet gives the focus back`).
4. **The theme on first paint**: Dark stored on a light system and the reverse, storage blocked, and a change made in another tab. Expected: the first frame is already right, and other tabs follow. Tests: Task 2 (`index.html decides the theme before anything is drawn`, `a choice made in another tab is followed here`) and Task 12's delayed-bundle smoke check.
5. **Crossing 860 px** (a tablet turned, a window resized) with the handwriting picker open and a search typed, Save as a look half-named, or the page count notice showing. Expected: all of them are still there. Tests: Task 5 (`crossing 860 px keeps…`).

## Design decisions

1. **Precache everything a document can need; cache Google's copies when used.**
   - Workbox `generateSW` precaches `**/*.{js,css,html,svg,png,webp,woff,woff2,webmanifest}` from `dist`, leaving out `fonts/licenses/**` and `icons/social.png`. That is about 4.6 MB:
     - the app and engine bundle (1.3 MB);
     - pdf.js (342 KB) and its worker (1.09 MB);
     - mammoth (496 KB);
     - the CSS and Figtree;
     - all 33 hands (`public/fonts/*.woff`, 1.2 MB);
     - the paper photo and the icons.
   - **Why precache the hands instead of caching them as they are used:**
     - A page whose hand file is missing never draws. `usePageLayout` and the thumbnails wait for the file, so a document, a look or the picker's samples would stay blank offline for every hand not yet used on this device.
     - The hands are a quarter of the precache, less than the main bundle.
     - Each hand is revisioned, so an update fetches only the files that changed.
   - pdf.js and mammoth are precached because Import is the main path (spec §1). The lazy chunks still load only when a file is imported; offline they come from the cache.
   - `maximumFileSizeToCacheInBytes` is 3 MiB, above the 1.3 MB bundle and Workbox's 2 MiB default.
   - The two Google Fonts hosts (index.html's web copies of the hands, for scripts their files don't cover) are cached at runtime:
     - `https://fonts.googleapis.com/` with `StaleWhileRevalidate` into `nib-google-fonts-css` (`maxEntries: 4`);
     - `https://fonts.gstatic.com/` with `CacheFirst` into `nib-google-fonts` (`cacheableResponse.statuses: [0, 200]`, `maxEntries: 60`, one year).
   - `navigateFallback: 'index.html'`, `cleanupOutdatedCaches: true`, `clientsClaim: true`, `skipWaiting: false`.
2. **Updates are offered, never forced** (`src/app/updates.ts`, Task 9).
   - `registerType: 'prompt'` and `injectRegister: false`. `src/app/pwa.ts` calls `registerSW` from `virtual:pwa-register`.
   - `onNeedRefresh`: a new version is waiting. Every open tab says `A new version is ready.` with `Reload`. The message is `keep`, so it survives a document opening or closing, and it stays until pressed.
   - `Reload` does three things:
     - it writes the waiting change (`flushSave()`);
     - it asks the waiting service worker to take over (the update function, which sends `SKIP_WAITING`);
     - it reloads when this tab's `onNeedReload` fires, or after 3 s if that never happens.
   - `onNeedReload` in a tab that didn't press Reload changes nothing but the message. vite-plugin-pwa 2.0.0 calls `onNeedReload` instead of `location.reload()`; earlier versions reloaded every tab that had seen the prompt. **No tab ever reloads by itself.**
   - `onOfflineReady` (the first install only) says `Nib works offline now.`
   - `onRegisteredSW` checks for a new version every hour while the page is shown, and when it is shown again after an hour or more.
3. **Two versions, two tabs (QA round 1's rules).**
   - Tab A presses Reload and gets the new version. Tab B keeps running the old code under the new service worker, and its saves still pass or fail on the revision check. M6 changes neither the database version nor `DOC_SCHEMA`, so neither tab sees `SAVE_NEWER` because of the other.
   - Tab B's message stays up. Its old lazy chunks aren't in the new cache, so an import started there before reloading may say M1's `The document reader couldn’t be loaded…`. Accepted: the Reload is right there.
   - **SAVE_NEWER now offers `Reload`, and that Reload goes through `reloadToNewVersion()`.** A future deploy that raises the schema will refuse an old tab's save. A plain reload while the new service worker is still waiting would load the old version again from the old cache, and be refused again. Applying the waiting version first breaks that loop.
   - `editor.ts` takes the reloader through `setReloader(fn)`, so the store never imports `src/app`.
4. **One overlay at a time** (`src/shell/overlays.ts`).
   - `open: 'palette' | 'shortcuts' | null`, with `openOverlay`, `toggleOverlay` and `closeOverlay`.
   - `Overlays.tsx` (mounted once in `App`, before `TopBar`) renders the shortcut sheet and the palette, and runs `useAppShortcuts()`.
   - Each overlay is a modal Radix dialog marked `data-overlay`.
   - **The app's keys open nothing while another dialog or menu is open** (`otherModalOpen()`): any `[role="dialog"]:not([aria-modal="false"]):not([data-overlay])`, `[role="alertdialog"]` or `[role="menu"]` outside a hidden stage. It is the same test `DocumentView`'s Escape uses. For Ctrl+K and Ctrl+/, the browser's own action is still prevented.
   - Ctrl+K with the sheet open swaps it for the palette, and Ctrl+/ with the palette open swaps it for the sheet.
   - A dialog with no trigger gives the focus back to what had it, through Radix's FocusScope.
5. **The theme is decided before the first paint.**
   - An inline `<script data-theme-boot>` right after `<meta name="theme-color">` in `index.html` reads `nib.theme` (`'dark'`, or anything else but `'light'` with the system dark), sets `html.dark`, and sets the `theme-color` meta to `#16161A`. It never throws: blocked storage counts as System.
   - `theme.ts` takes over from there:
     - `applyTheme` also sets the meta;
     - a `storage` event from another tab is followed;
     - `useThemePref()` and `useDarkTheme()` let the menu, the palette and sonner's `<Toaster theme>` follow.
   - The bar colour is the theme's top-bar surface (`#FFFFFF` light, `#16161A` dark): spec §2's quiet Studio surfaces, not the logo ink (M1's `#1E2B7C`).
6. **Tips** (`src/features/doc/Tips.tsx`, Task 8).
   - The first time any document opens on this device, `DocumentView` calls `showTipsIfDue()`, which shows the card and stores `nib.tips = 'seen'` at once. They show once, however the person leaves them.
   - It is a `<aside aria-labelledby>` landmark with an `<h2>`, an `<ol>` and `Got it`. Nothing moves the focus to it.
   - Pressing `Got it` with the keyboard gives the focus back to what had it before the card (`relatedTarget` of the card's first `focusin`). If that is gone, it goes to the first focusable element in the stage on screen.
   - It is fixed at `bottom-4 left-4 w-80` on wide screens and `inset-x-3 bottom-3` (plus the safe area) below 860 px, at `z-30`. Sheets (`z-40`) and dialogs (`z-50`) cover it.
   - With storage blocked, an in-memory flag shows it once per page.
7. **Phone Outline is the pages under a sheet** (Task 4).
   - Below 860 px: the Write bar, then the handwritten pages (`PageView mode="write"` with Outline's tag menu), and over them a `StageSheet` titled `Outline`. The sheet holds the page list, capped at `max-h-[40dvh]` and scrolling on its own, then the selected block's inspector.
   - This keeps today's phone order (list above editor), so a long Main text never pushes the list out of reach.
   - The peek is `OUTLINE_PEEK = 148` px, and the sheet starts at about half.
   - Tapping a word on a page selects its block and puts the caret in the sheet's editor (M2's `wordClick` → `placeCaret`).
   - Wide screens are unchanged: three columns.
8. **Crossing 860 px keeps what you were doing** (Task 5). Style's panel remounts at the crossing, because a sheet and an aside are different trees. Instead of reparenting it through a portal, which would cut vaul's content drag and Radix's React handlers off from the panel, the state a person would lose moves into `useStylePanel`, M4's pattern for Export:
   - the picker's `open`, `q` and `filter`;
   - Save as a look's `asking` and `name`;
   - the page count notice's base.
   - The store resets itself whenever the open document changes.

## Rulings on the spec, the deferred items and carried decisions

- **Theme colour.** The manifest's `theme_color` is `#FFFFFF` and `background_color` is `#F7F7F8`, and the `theme-color` meta follows the theme (Design decision 5). The brand ink is in the icon.
- **App icon** (spec §2):
  - `icon-192.png` and `icon-512.png` are the ink page as in `favicon.svg`: a rounded square on a transparent background.
  - `maskable-512.png` and `apple-touch-icon.png` (180) are full-bleed `#1E2B7C` with the drawing at 80 % around the centre.
  - The **social image** (`icons/social.png`, 1200 × 630, spec §2 "social image") is drawn by the same script. It is linked as `og:image` with the site's absolute URL.
  - The PNGs are made once by `scripts/icons.mjs` with the machine's Playwright and committed, because CI has no Playwright.
- **Exit check without a Lighthouse dependency.** Lighthouse 12 dropped the PWA category, so the exit check runs `npx -y lighthouse@11.7.1`. Its `installable-manifest` audit asks Chromium's own installability check, `Page.getInstallabilityErrors`. That works here only in full Chromium's headless mode, `channel: 'chromium'`, in a persistent profile (it is empty there for a valid PWA, and lists errors for a broken one). The smoke run asks the same check over CDP on every run. Lighthouse is run once, by hand, in Task 12.
- **The smoke run serves the site at `/nib-engine/`** (`vite preview --base /nib-engine/`), as GitHub Pages does, so the service worker's scope and the manifest's paths are tested where they live. The M1–M5 steps run with `serviceWorkers: 'block'`, so they behave as before. The PWA steps use their own persistent context.
- **No "Show the tips again".** The tips are three short lines, and the shortcut sheet and the palette are always there.
- **The palette applies a look to the whole document**, whatever Style's scope is: its group says so. Style's Looks keep following the scope.
- **The palette leaves out the open document and the stage on screen**, so every item does something.
- **Crossing 860 px:** Style keeps its state (Design decision 8). Export already keeps its choices in stores (M4). Outline (new sheet) and Write's Pages view (spec §7: one page at a time on phones) remount by design. Text is in the store, and a block name being typed is saved on unmount (M2's `NameField`). Only the caret and scroll positions are lost, and that is accepted.

## Deferred items (`.superpowers/sdd/m6-deferred.md`)

Every item, by its source line, is ruled **scheduled** (with its task), **resolved** (already fixed, checked in the code today), or **accepted** (with the reason).

| # | Item | Ruling |
|---|---|---|
| D0 | Outline's bottom sheet on phones (OutlineView's own comment; spec §7) | scheduled, Task 4 |
| D1 | M2 T1: 'once per document' test passes on old code | accepted: the behaviour is pinned by QA round 1's App and store tests |
| D2 | M2 T1: no test for the newest-save retry with guard | accepted: QA round 1 rewrote saving with revision checks and their tests |
| D3 | M2 T1: no pagehide+visibilitychange single-write test | accepted: `installFlushOnHide` is covered by QA round 1's tab tests |
| D4 | M2 T1: actions.test mutates the store directly | accepted: test style only |
| D5 | M2 T1: Ctrl+Z active while the document isn't ready | accepted: it can only undo the previous document's own history, which an open clears |
| D6 | M2 T1: a closed document's failed save is silent | accepted: a plan-mandated tradeoff; Home shows what was stored |
| D7 | M2 T2: private-use U+E021–E07E input collides with escape sentinels | accepted: no keyboard or import produces them; engine markup is frozen |
| D8 | M2 T2: openMarks `_` false positives | accepted: plan-mandated |
| D9 | M2 T2: no direct tests for srcOffset/frameRange/textWithoutFrame edge cases | accepted: covered through the layout and converter tests; engine frozen |
| D10 | M2 T2: contentStart loop comment | accepted: a comment in frozen engine code |
| D11 | M2 T3: colour `''`/`true` accepted as integer | accepted: only Nib writes these fields; a bad one draws in colour 0 |
| D12 | M2 T3: `from` cycles a↔b survive | accepted: the interface can't make one, and Join back ignores an odd origin |
| D13 | M2 T3: no listDocs multi-record migration test | accepted: migration is a once-only path, covered by bootstrap tests |
| D14 | M2 T3: Home rename of a newer-schema document (check its message) | scheduled, Task 9: the message is right (`SAVE_NEWER`) and gets `Reload` |
| D15 | M2 T3: blank lines dropped and lines reordered on header conversion | accepted: brief-conformant, migration only |
| D16 | M2 T3: colour test cases `''`/`true` don't discriminate | accepted: test only |
| D17 | M2 T5: tall full-width notes at high mess may clip the right edge | accepted: engine realism code (`segBounds`), which M6 doesn't touch |
| D18 | M2 T5: inkKey lacks kind; duplicate order Map; clash test copies fixtures; Row as-any | accepted: code hygiene with no visible effect |
| D19 | M2 T5: TRANSITIONAL BoxFrame nudges from `sg.top` | resolved: `nudge` (drag.ts) moves `storedTop` |
| D20 | M2 T4: converter edge cases (column slip, merged same-style pieces, code-span space, `01.`, `<strong style=font-weight:normal>`) | accepted: lossless on everything Nib writes; rare paste inputs |
| D21 | M2 T7: two definitions of a block's page need a comment | resolved: the comment above `pageRefusal` in model.ts |
| D22 | M2 T7: a margin note on a full page is pushed off without saying so | scheduled, Task 6 (its own message) |
| D23 | M2 T7: names cut to 60, header fields to 80 | accepted: harmless limits |
| D24 | M2 T7: commit() swap lacks try/finally | accepted: theoretical |
| D25 | M2 T7: restructure run() could set selectedId before a no-op commit | accepted: no caller does |
| D26 | M2 T6: IME composition + outside change stale write | accepted: very hard to reach |
| D27 | M2 T6: widget div inside ul for breaks at list items | accepted: renders correctly |
| D28 | M2 T6: duplicated helpers; literal NBSP in paste.ts | accepted: hygiene |
| D29 | M2 T6: no beforeinput historyRedo test | accepted: historyUndo is tested and shares the path |
| D30 | M2 T6: caret after paste into a list; overlap-widened range shifts caret | accepted: caret only, text always right |
| D31 | M2 T8: Escape mid-press then release over a grip doesn't swallow the click | accepted: harmless click |
| D32 | M2 T8: no auto-scroll or listener-cleanup tests | accepted: checked in Chromium by the M2 reviews |
| D33 | M2 T8 carry: focus after Delete/Split/Remove part; gripClass on grips | resolved: `useFocusHandOff` (OutlineView), `gripClass` (TypedPage) |
| D34 | M2 T9: stale `down.current` reused within 3 px | accepted: negligible |
| D35 | M2 T11: Outline item names omit the snippet | scheduled, Task 4 (`aria-describedby`) |
| D36 | M2 T11: shared font fetch stub | resolved: `src/test/fonts.ts` |
| D37 | M2 T11: OutlineView/OutlineList re-render per keystroke | accepted: items are memoised; no visible cost |
| D38 | M2 T11: untested Add "else last page" and name-field Escape | accepted: small, visible paths |
| D39 | M2 T11: hand-off scrolls the list to the newly pressed block | accepted: intended |
| D40 | M2 T11: renameBlock lacks an unchanged-name check | resolved: `commit()` records nothing for an unchanged snapshot |
| D41 | M2 T11: no CSS overflow test in jsdom | scheduled, Task 12 (overflow checks at 390 and 320 px in Chromium) |
| D42 | M2 T12: a mouse drag selecting text turns a phone page | resolved: PhonePages ignores `pointerType === 'mouse'` |
| D43 | M2 T12: pager index after Move/Add/Undo | Move resolved (`onMoved`). Add and Merge scheduled, Task 6. After Undo, accepted: the page heading says which page shows |
| D44 | M2 T12: caret effect doesn't reset scrollTop | accepted: ProseMirror scrolls the caret into view |
| D45 | M2 T12: jsdom matchMedia stub reports wide | scheduled, Task 5 (`resizableWindow` in `src/test/media.ts`) |
| D46 | M2 T12: 36 px pager buttons | accepted: above WCAG 2.5.8's 24 px |
| D47 | M2 final A: merging a page whose only block is pushed onto a full page says "Merged…" | scheduled, Task 6 |
| D48 | M2 Fix C: Escape cancels move drags, not resizes | accepted: a resize shows its width live, and Ctrl+Z puts it back |
| D49 | M2: `pageRefusal` uses the stored page | scheduled, Task 6 |
| D50 | M2: `movePage` re-stores pushed blocks on unrelated pages | scheduled, Task 6 |
| D51 | M3 T4: a failed saved-look removal is silent | scheduled, Task 5 |
| D52 | M3 T9: drawer.tsx reuse limits; padding should follow snap height | drawer accepted (it serves three sheets now); padding resolved in M3 Fix B |
| D53 | M3 T9: crossing 860 px remounts a stage's panel | scheduled, Task 5 (Style). Outline, Pages and Export accepted (Rulings) |
| D54 | M3: 'nothing fits' can blame letter size (name the block) | scheduled, Task 5 |
| D55 | M3: a corrupt-but-signed stored font draws silently in a stand-in | scheduled, Task 5 |
| D56 | M3: prefs cross-tab same-ms race | accepted: two tabs changing looks in one millisecond; each change reads fresh |
| D57 | M3: Radix focus guards in phone sheets | accepted: two invisible guards cost one extra Tab at the page's ends; removing them would break the focus trap of the picker and Save as a look opened from the sheet |
| D58 | M4: a file name (or slider) edit back to its start records an empty step | scheduled, Task 7 |
| D59 | M4: Print size estimate with scan looks up to 1.6× high | scheduled, Task 7 (measured at Print size) |
| D60 | M4: the exact per-page tilt stand-in angle | scheduled, Task 7 (`pageTilt`, `frameShot`) |
| D61 | M5: undoing a deletion across a file page break loses that break | accepted: rare (delete across a file's page, undo, then flip the switch); the text is kept and Page break puts it back; a fix needs history-aware separator tracking |
| D62 | M5 final B: first-draw thumbnails stutter scrolling | scheduled, Task 11 |
| D63 | M5 final B: a message's action leaves the focus on `<body>` | scheduled, Task 9 |
| D64 | M5 final A: a message said again in sonner's exit window doesn't show | scheduled, Task 9 |
| D65 | M5 final A: putDoc `readAt` default | accepted: only `saveNow` calls it; make it required when a second caller appears |
| D66 | M5 final A: importer reader limits (LibreOffice bullets, quote/table run-in, nested List Bullet 2) | accepted: reader heuristics need a real-file corpus; the editable preview fixes them before writing out |

Totals: **67 items.**
- **20 scheduled:** D0, D14, D22, D35, D41, D43, D45, D47, D49–D51, D53–D55, D58–D60, D62–D64.
- **6 resolved:** D19, D21, D33, D36, D40, D42.
- **41 accepted.**

Two rows are split. D43's Move half is resolved and its Undo half accepted; the row is counted as scheduled. D52's padding half is resolved; the row is counted as accepted.

## Order and parallelism

A task starts once the tasks in its Needs column are merged. Tasks in a wave touch disjoint files. The few shared files are edited in separate places named in each task, so the controller's merge is mechanical: `index.html` (Tasks 1, 2), `App.tsx` (Tasks 2, 3), `smoke.mjs` (Tasks 1, 8, 12) and `editor.ts` (Tasks 7, 9).

| Wave | Tasks | Needs |
|---|---|---|
| 1 | **1** Install and offline ∥ **2** Theme ∥ **3** Shortcut sheet and the app's keys ∥ **4** Outline as a sheet on phones ∥ **5** Style keeps its state, and three silent failures ∥ **6** Pages and blocks that move ∥ **7** One step per real change; Export's estimate and tilt preview | — |
| 2 | **8** First-visit tips (3) ∥ **9** Updates and messages (1) ∥ **10** Command palette (2, 3) ∥ **11** App menu, and thumbnails off the scroll (2, 3) | as listed |
| 3 | **12** Phone pass, smoke, README and exit checks | all |

## File map (end of Milestone 6)

```
package.json, package-lock.json (vite-plugin-pwa 2.0.0); vite.config.ts; index.html (icons, og)        (Task 1)
src/app/pwaManifest.ts, pwaManifest.test.ts, pwa.ts; src/main.tsx; src/vite-env.d.ts                    (Task 1)
scripts/icons.mjs; public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon,social}.png            (Task 1)
src/lib/theme.ts, theme.test.ts; index.html (boot script, theme-color); src/app/themeBoot.test.ts; App.tsx (Toaster) (Task 2)
src/lib/keys.ts, keys.test.ts; src/shell/{overlays.ts,shortcuts.ts,useAppShortcuts.ts,ShortcutSheet.tsx,Overlays.tsx}  (Task 3)
src/shell/useAppShortcuts.test.tsx, ShortcutSheet.test.tsx; FormatToolbar.tsx (keys.ts); App.tsx (Overlays)           (Task 3)
src/features/write/OutlineView.tsx, OutlineList.tsx, Inspector.tsx, OutlineView.test.tsx                (Task 4)
src/features/style/{panelState.ts,HandSection.tsx,LooksSection.tsx,PageCountNotice.tsx,prefs.ts,fit.ts,fonts.ts,hands.ts}  (Task 5)
src/features/style/remount.test.tsx (+ fit/prefs/fonts/looks tests); src/test/media.ts                  (Task 5)
src/features/doc/model.ts, actions.ts (+ tests); src/features/write/PageMenu.tsx, PhonePages.tsx (+ phone/menus tests) (Task 6)
src/store/history.ts, editor.ts (gesture end); style/Range.tsx, PenInkSection.tsx, Range.test.tsx       (Task 7)
src/features/export/ExportPanel.tsx, estimate.ts, plan.ts (+ tests); src/engine/core.js, core.d.ts, engine.test.ts; pages/Sheet.tsx; app.css (Task 7)
src/features/doc/tips.ts, Tips.tsx, Tips.test.tsx; DocumentView.tsx; src/test/setup.ts; scripts/smoke.mjs (Task 8)
src/app/updates.ts, updates.test.ts, pwa.ts; src/lib/focus.ts, focus.test.ts; src/store/editor.ts (toast); App.tsx; home/RecentList.tsx (Task 9)
package.json (cmdk 1.1.1); src/components/ui/command.tsx; src/shell/commands.ts, CommandPalette.tsx (+ tests); Overlays.tsx; style/looks.ts (Task 10)
src/shell/AppMenu.tsx, AppMenu.test.tsx, TopBar.tsx; src/features/home/thumbs.ts, thumbs.test.ts       (Task 11)
scripts/smoke.mjs, README.md (+ any phone fixes found)                                                   (Task 12)
```

---

### Task 1: Install and offline: the service worker, manifest and icons

**Files:**
- Modify:
  - `package.json`, `package-lock.json` (`"vite-plugin-pwa": "2.0.0"` in `devDependencies`);
  - `vite.config.ts`;
  - `index.html`: insert before `</head>`, after the Google stylesheet line; nothing above it changes;
  - `src/main.tsx`;
  - `src/vite-env.d.ts`;
  - `scripts/smoke.mjs`: only the two `browser.newContext({...})` calls.
- Create:
  - `src/app/pwaManifest.ts`, `src/app/pwaManifest.test.ts`, `src/app/pwa.ts`, `scripts/icons.mjs`;
  - `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, `social.png`.

**Interfaces:**
- Consumes: `public/favicon.svg` (the ink-page drawing), and `node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2` (social image).
- Produces:
  - `pwaManifest.ts` (pure data, with type-only imports from `vite-plugin-pwa`):
    - `NIB_MANIFEST: Partial<ManifestOptions>` is `{ id: './', name: 'Nib', short_name: 'Nib', description: <Interface copy>, lang: 'en', dir: 'ltr', start_url: './', scope: './', display: 'standalone', background_color: '#F7F7F8', theme_color: '#FFFFFF', categories: ['education', 'productivity'], icons }`.
    - `icons` are, in order: `{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }`, the same for `icon-512.png` at `512x512`, and `{ src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }`.
    - `PWA_WORKBOX: NonNullable<VitePWAOptions['workbox']>` is exactly Design decision 1. The two `runtimeCaching` entries have `urlPattern` `/^https:\/\/fonts\.googleapis\.com\//` and `/^https:\/\/fonts\.gstatic\.com\//`.
  - `vite.config.ts` adds `VitePWA({ disable: process.env.VITEST !== undefined, registerType: 'prompt', injectRegister: false, manifest: NIB_MANIFEST, workbox: PWA_WORKBOX })` after `tailwindcss()`. `devOptions` stays at its default (off).
  - `pwa.ts`: `startPwa(): void` returns at once unless `import.meta.env.PROD && 'serviceWorker' in navigator`, and otherwise calls `registerSW({})` from `virtual:pwa-register`. Task 9 replaces the call.
  - `main.tsx` calls `startPwa()` after `createRoot(...).render(...)`.
  - `vite-env.d.ts` adds `/// <reference types="vite-plugin-pwa/client" />`.
  - `index.html` adds `<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`, `og:title` `Nib`, `og:description` (the manifest description), `og:type` `website`, `og:image` `https://nvmaditya.github.io/nib-engine/icons/social.png` and `<meta name="twitter:card" content="summary_large_image">`. The plugin adds `<link rel="manifest">` at build.
  - `scripts/icons.mjs` (Node, uses `require('playwright')` as smoke.mjs does) writes the five PNGs (Rulings: App icon). For the full-bleed variants it takes the drawing from `favicon.svg` without its `<rect>`, inside `<g transform="translate(32 32) scale(0.8) translate(-32 -32)">`, on an ink square. The social image is `#F7F7F8` with the logo at 280 px, the wordmark `nib` (Figtree 700, 200 px, letter-spacing −0.045em, `#16161A`) and the line in Figtree 400 at 44 px, `#6C6C76`. It renders each one with `page.setContent` and `screenshot({ omitBackground })` at device scale 1.
  - `scripts/smoke.mjs`: both existing contexts get `serviceWorkers: 'block'` (Rulings: smoke). Nothing else changes.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/pwaManifest.test.ts (Node: reads public/ from the repo root)
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pngSize = (file: string): [number, number] => {
  const b = readFileSync(join(ROOT, 'public', file));
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
test('the manifest names Nib, in its own colours, and installs where the page is', () =>
  expect(NIB_MANIFEST).toMatchObject({ id: './', name: 'Nib', short_name: 'Nib', start_url: './', scope: './', display: 'standalone', lang: 'en',
    background_color: '#F7F7F8', theme_color: '#FFFFFF', description: 'Turn typed text into realistic handwritten pages, then download them as a PDF or images.' }));
test('every icon is a PNG of the size it says, with one to mask', () => {
  expect(NIB_MANIFEST.icons!.map(i => [i.src, i.sizes, i.purpose])).toEqual([
    ['icons/icon-192.png', '192x192', 'any'], ['icons/icon-512.png', '512x512', 'any'], ['icons/maskable-512.png', '512x512', 'maskable']]);
  for (const i of NIB_MANIFEST.icons!) expect(pngSize(i.src).join('x')).toBe(i.sizes);
  expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  expect(pngSize('icons/social.png')).toEqual([1200, 630]);
});
test('the service worker keeps every hand, the paper photo and the app, and leaves the licences out', () => {
  const exts = /\{(.+)\}/.exec(PWA_WORKBOX.globPatterns![0])![1].split(',');
  const files = [...readdirSync(join(ROOT, 'public/fonts')).filter(f => f.endsWith('.woff')), 'paper/photo.webp', 'favicon.svg'];
  for (const f of files) expect(exts).toContain(f.split('.').pop());
  expect(exts).toEqual(expect.arrayContaining(['js', 'css', 'html', 'woff2', 'png', 'webmanifest']));
  expect(PWA_WORKBOX).toMatchObject({ globIgnores: ['fonts/licenses/**', 'icons/social.png'], navigateFallback: 'index.html', cleanupOutdatedCaches: true,
    clientsClaim: true, skipWaiting: false, maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 });
});
test('Google’s copies of the hands are kept once fetched, so a reload offline finds them', () =>
  expect(PWA_WORKBOX.runtimeCaching!.map(r => [String(r.urlPattern), r.handler, r.options?.cacheName])).toEqual([
    [String(/^https:\/\/fonts\.googleapis\.com\//), 'StaleWhileRevalidate', 'nib-google-fonts-css'],
    [String(/^https:\/\/fonts\.gstatic\.com\//), 'CacheFirst', 'nib-google-fonts']]));
```

- [ ] **Step 2: Run** `npx vitest run src/app/pwaManifest.test.ts`. Expected: FAIL (`./pwaManifest` is missing).
- [ ] **Step 3: Install and implement.**
  - Run `npm install --save-dev --save-exact vite-plugin-pwa@2.0.0`.
  - Write `pwaManifest.ts`, the `vite.config.ts` plugin, `pwa.ts`, `main.tsx`, `vite-env.d.ts` and `index.html` as in Interfaces.
  - Run `node scripts/icons.mjs` and commit the five PNGs.
  - Open each PNG with the Read tool and check it: the ink page is centred, nothing is cut off, and the maskable one is full-bleed.
- [ ] **Step 4: Run** `npx vitest run src/app/pwaManifest.test.ts`. Expected: PASS.
- [ ] **Step 5: Check the build.**
  - Run `npm run build`. Expected: the plugin reports `mode generateSW` with about 50 precache entries and about 4.6 MB.
  - Check `dist/sw.js` with grep. `fonts/zeyada.woff`, `assets/pdf.worker.min-`, `assets/mammoth.browser.min-` and `index.html` each appear. `fonts/licenses` and `social.png` don't.
  - `dist/index.html` has `<link rel="manifest" href="./manifest.webmanifest">`. `dist/manifest.webmanifest` has `"start_url":"./"`.
- [ ] **Step 6: Check it in Chromium.** This is a throwaway script in your scratchpad folder, not committed. Report what it prints.
  - Start `vite preview --base /nib-engine/ --port <free>`.
  - In `chromium.launchPersistentContext(tmpDir, { channel: 'chromium' })`, open `/nib-engine/` and wait for `navigator.serviceWorker.controller`.
  - Call `Page.getInstallabilityErrors` over CDP. Expected: `[]`.
  - Then `setOffline(true)`, stop the server, and reload. Expected: Home lists The Water Cycle, and opening it draws ink on page 1.
- [ ] **Step 7: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass. `git diff main -- src/engine` gives no output.
- [ ] **Step 8: Commit** `feat(pwa): Nib installs from its own manifest and icons, and its service worker keeps the app, every hand and the readers for offline use`

---

### Task 2: Theme: no flash, remembered, followed everywhere

**Files:**
- Modify:
  - `src/lib/theme.ts`, `src/lib/theme.test.ts`;
  - `index.html`: line 8's `<meta name="theme-color" content="#1E2B7C">` becomes `content="#FFFFFF"`, and the boot script is inserted right after it; nothing below the favicon link changes;
  - `src/app/App.tsx`: three places only:
    - an import after `import { Toaster } from 'sonner';`;
    - `const dark = useDarkTheme();` after `const openId = …`;
    - the `<Toaster …>` line.
- Create: `src/app/themeBoot.test.ts`.

**Interfaces:**
- Consumes: today's `getThemePref`, `applyTheme`, `setThemePref` and `initTheme` (M1). `main.tsx` keeps calling `initTheme()`.
- Produces (`theme.ts`):
  - `THEME_KEY = 'nib.theme'`, and `THEME_COLOR = { light: '#FFFFFF', dark: '#16161A' } as const`.
  - `applyTheme(p, isSystemDark)` also sets `meta[name="theme-color"]`'s content and tells subscribers.
  - `setThemePref(p)` stores the choice, applies it and tells subscribers, as now.
  - `initTheme()` also listens to `storage` events for `THEME_KEY` (another tab's choice), applies them and tells subscribers. It returns one remover for both listeners.
  - `useThemePref(): ThemePref` and `useDarkTheme(): boolean` are built on `useSyncExternalStore` over a module listener set. Their snapshots are `getThemePref()` and `document.documentElement.classList.contains('dark')`.
  - The `index.html` boot script, verbatim:

```html
<script data-theme-boot>
(function () { var p; try { p = localStorage.getItem('nib.theme'); } catch (e) {}
  var dark = p === 'dark' || (p !== 'light' && !!window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) { document.documentElement.classList.add('dark'); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#16161A'); } })();
</script>
```
  - `App.tsx`: `<Toaster theme={dark ? 'dark' : 'light'} position="bottom-center" expand visibleToasts={3} />`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/themeBoot.test.ts
const html = readFileSync(join(fileURLToPath(new URL('../..', import.meta.url)), 'index.html'), 'utf8');
const boot = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(html)![1];
function bootWith(stored: string | null | 'blocked', systemDark: boolean): [boolean, string] {
  document.documentElement.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  vi.stubGlobal('localStorage', { getItem: () => { if (stored === 'blocked') throw new Error('blocked'); return stored; } });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: systemDark && q === '(prefers-color-scheme: dark)' }));
  new Function(boot)();
  return [document.documentElement.classList.contains('dark'), document.querySelector('meta[name="theme-color"]')!.getAttribute('content')!];
}
afterEach(() => vi.unstubAllGlobals());
test.each([
  ['dark', false, true], ['light', true, false], ['system', true, true], ['system', false, false],
  [null, true, true], [null, false, false], ['pink', true, true], ['blocked', true, true], ['blocked', false, false],
] as const)('index.html decides the theme before anything is drawn: stored %s, dark system %s → dark %s', (stored, sys, dark) =>
  expect(bootWith(stored, sys)).toEqual([dark, dark ? '#16161A' : '#FFFFFF']));
test('the boot script comes after the theme-color meta and before every stylesheet and script', () => {
  const at = html.indexOf('<script data-theme-boot>');
  expect(at).toBeGreaterThan(html.indexOf('name="theme-color"'));
  expect(at).toBeLessThan(html.indexOf('rel="stylesheet"'));
  expect(at).toBeLessThan(html.indexOf('<script type="module"'));
});
```

  Add to `src/lib/theme.test.ts`:
  - `the browser bar takes the theme’s colour`: `setThemePref('dark')` sets the meta to `#16161A`, and `'light'` sets `#FFFFFF`.
  - `a choice made in another tab is followed here`: with `initTheme()` running and `renderHook(useThemePref)`, `window.dispatchEvent(new StorageEvent('storage', { key: 'nib.theme', newValue: 'dark' }))` (after `localStorage.setItem`) gives `html.dark` and the hook gives `'dark'`.
  - `useDarkTheme follows the system while the choice is System`: a `matchMedia` stub whose `change` listener the test fires flips `useDarkTheme()`.
  - `the boot script and applyTheme agree`: for each row of the table, the class from `bootWith` equals the class `applyTheme(p, systemDark)` gives.

- [ ] **Step 2: Run** `npx vitest run src/app/themeBoot.test.ts src/lib/theme.test.ts`. Expected: FAIL (no boot script; `useThemePref` missing).
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run the same tests.** Expected: PASS.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(theme): the theme is set before the first paint, the browser bar follows it, other tabs follow a change, and messages match it`

---

### Task 3: Shortcut sheet and the app's own keys

**Files:**
- Create:
  - `src/lib/keys.ts`, `src/lib/keys.test.ts`;
  - `src/shell/overlays.ts`, `src/shell/shortcuts.ts`, `src/shell/useAppShortcuts.ts`, `src/shell/ShortcutSheet.tsx`, `src/shell/Overlays.tsx`;
  - `src/shell/useAppShortcuts.test.tsx`, `src/shell/ShortcutSheet.test.tsx`.
- Modify:
  - `src/features/editor/FormatToolbar.tsx`: its `modKey()` is replaced by `chordLabel` from `@/lib/keys`, and its tooltips read as before;
  - `src/app/App.tsx`: two places only:
    - `import { Overlays } from '@/shell/Overlays';` after the `TopBar` import;
    - `<Overlays />` as the first child of the returned fragment.

**Interfaces:**
- Consumes: Radix `Dialog` (`@/components/ui/dialog`).
- Produces:
  - `keys.ts`:
    - `isApple(): boolean`, with M3's test: `/mac|iphone|ipad|ipod/i` on `userAgentData.platform || platform`;
    - `chordLabel(chord: string[]): string`, per the Shortcuts section;
    - `isModKey(e: KeyboardEvent): boolean`, which is `metaKey` on Apple and `ctrlKey` elsewhere.
  - `shortcuts.ts`:
    - `interface ShortcutRow { what: string; keys?: string[][]; typed?: string; only?: 'Write'; notApple?: boolean[] }`. In `keys`, each alternative is a chord. `notApple[k]` hides alternative `k` on Apple.
    - `interface ShortcutGroup { title: string; note?: string; rows: ShortcutRow[] }`.
    - `SHORTCUTS: ShortcutGroup[]` is exactly the Shortcuts table.
  - `overlays.ts`:
    - `type Overlay = 'palette' | 'shortcuts'`;
    - `useOverlays = create<{ open: Overlay | null }>()`;
    - `openOverlay(o: Overlay): void`, `toggleOverlay(o: Overlay): void`, `closeOverlay(): void`;
    - `otherModalOpen(): boolean`, per Design decision 4.
  - `useAppShortcuts(): void` installs one `keydown` listener on `window` (bubble phase) and skips events already `defaultPrevented`:
    - Mod+K: `preventDefault()`, then `toggleOverlay('palette')`, unless `otherModalOpen()`.
    - Mod+/: the same, with `'shortcuts'`.
    - `?` (no Ctrl, Meta or Alt) when the target isn't a field or an editor (M1's `typing()` rule): `openOverlay('shortcuts')`, unless `otherModalOpen()`.
  - `ShortcutSheet({ open, onOpenChange })`:
    - `DialogContent data-overlay="shortcuts"` with classes `max-h-[85dvh] overflow-y-auto wide:max-w-2xl`;
    - title and description from Interface copy;
    - each group is an `<h3>` with its note (muted) and a `<dl>`: `<dt>` is `what`, plus a muted ` In Write` when `only`; `<dd>` is each chord as `<kbd>{chordLabel}</kbd>`, alternatives joined by ` or `, and `typed` shown as `<kbd>` of the literal;
    - groups sit in `wide:columns-2` with `break-inside-avoid`.
  - `Overlays()` runs `useAppShortcuts()` and renders `<ShortcutSheet open={open === 'shortcuts'} onOpenChange={o => (o ? openOverlay('shortcuts') : closeOverlay())} />`. Task 10 adds the palette next to it.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/shell/useAppShortcuts.test.tsx
function Harness() { useAppShortcuts(); return <><input aria-label="Field" /><div contentEditable aria-label="Editor" /><button>Plain</button></>; }
const open = () => useOverlays.getState().open;
const press = (key: string, o: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key, bubbles: true, ...o });
beforeEach(() => { useOverlays.setState({ open: null }); render(<Harness />); screen.getByRole('button', { name: 'Plain' }).focus(); });
test('Ctrl+K opens the command palette and closes it again', () => {
  expect(press('k', { ctrlKey: true })).toBe(false); expect(open()).toBe('palette');
  press('k', { ctrlKey: true }); expect(open()).toBe(null);
});
test('? opens the shortcuts, but in a field it is just typed', () => {
  press('?', { shiftKey: true }); expect(open()).toBe('shortcuts'); act(() => closeOverlay());
  screen.getByRole('textbox', { name: 'Field' }).focus(); expect(press('?', { shiftKey: true })).toBe(true); expect(open()).toBe(null);
});
test('Ctrl+/ opens the shortcuts even from a field or the editor', () => {
  screen.getByLabelText('Editor').focus(); press('/', { ctrlKey: true }); expect(open()).toBe('shortcuts');
});
test('one overlay at a time: Ctrl+K swaps the shortcuts for the palette', () => { press('?', { shiftKey: true }); press('k', { ctrlKey: true }); expect(open()).toBe('palette'); });
test('with another dialog or a menu open, the app’s keys open nothing', () => {
  render(<Dialog open><DialogContent><DialogTitle>Import a document</DialogTitle><DialogDescription>x</DialogDescription></DialogContent></Dialog>);
  expect(press('k', { ctrlKey: true })).toBe(false); press('?', { shiftKey: true }); press('/', { ctrlKey: true }); expect(open()).toBe(null);
});
test('on an Apple keyboard ⌘ is the modifier', () => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true }); // (deleted again in afterEach)
  press('k', { ctrlKey: true }); expect(open()).toBe(null); press('k', { metaKey: true }); expect(open()).toBe('palette');
});
```

  - `src/lib/keys.test.ts`: off Apple, `chordLabel(['Mod', 'Shift', 'Z'])` is `Ctrl+Shift+Z`. On Apple it is `⇧⌘Z`, and `['Mod', 'Alt', '1']` is `⌥⌘1`. `['Escape']` is `Esc`.
  - `src/shell/ShortcutSheet.test.tsx`:
    - `the sheet lists every shortcut, by where it works`: with `open: 'shortcuts'`, render `<Overlays />`. The dialog `Keyboard shortcuts` has `h3`s `['Anywhere', 'In a document', 'A block on a handwritten page', 'In the text', 'As you type']`, and its `dt` texts equal the table's "What it does" column in order (33 rows, with ` In Write` on two).
    - `Ctrl+Y is listed only off Apple`.
    - `each text shortcut in the sheet does what it says`: table-driven, in a `BlockEditor` set up as `BlockEditor.test.tsx` does (`openDocument(rec('A', 'x'))`, select all). `fireEvent.keyDown(ed.view.dom, { key, keyCode, ctrlKey, shiftKey, altKey })` gives the block's text:

      | Chord | Text |
      |---|---|
      | Mod+B | `**x**` |
      | Mod+U | `*x*` |
      | Mod+Shift+S | `~~x~~` |
      | Mod+Shift+H | `==x==` |
      | Mod+Alt+1 | `# x` |
      | Mod+Alt+2 | `## x` |
      | Mod+Alt+0 (after `# x`) | `x` |
      | Mod+Shift+B | `> x` |
      | Mod+Shift+8 | `- x` |
      | Mod+Shift+7 | `1. x` |
      | Mod+Enter, caret at the start | `\newpage\nx` |

    - `closing the sheet gives the focus back`: with the editor focused, Ctrl+/ then Escape leaves `document.activeElement` inside `.ProseMirror`.
- [ ] **Step 2: Run** `npx vitest run src/shell src/lib/keys.test.ts`. Expected: FAIL (the modules are missing).
- [ ] **Step 3: Implement** the Interfaces. `FormatToolbar`'s tooltips stay `Bold (Ctrl+B)` / `Bold (⌘B)`, now through `chordLabel(['Mod', keys])`.
- [ ] **Step 4: Run** `npx vitest run src/shell src/lib/keys.test.ts src/features/editor`. Expected: PASS.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(shell): ? and Ctrl+/ show every keyboard shortcut in Nib; Ctrl+K is the palette's, and the app's keys never open over another dialog`

---

### Task 4: Outline as a bottom sheet on phones

**Files:**
- Modify:
  - `src/features/write/OutlineView.tsx` (the phone branch, and its header comment);
  - `src/features/write/OutlineList.tsx`: `OutlineItem`'s snippet gets an `id` and the item `aria-describedby` (D35);
  - `src/features/write/Inspector.tsx`: only its `className` handling for the sheet;
  - `src/features/write/OutlineView.test.tsx`.

**Interfaces:**
- Consumes: `StageSheet` and `useSheetSnaps` (`@/features/doc/StageSheet`, unchanged), `useWide` (`@/lib/media`), and `PageView` with `tagMenu` (as wide Outline uses them).
- Produces:
  - `OUTLINE_PEEK = 148`, exported.
  - `OutlineView({ layout })` on wide screens is exactly today's three columns.
  - Below 860 px:

```tsx
<div ref={root} className="flex min-h-0 flex-1 flex-col" {...handOff}>
  <WriteBar view="outline" page={addPage} />
  <div ref={stage} className="flex min-h-0 flex-1 flex-col" style={{ '--sheet-shown': snaps.shown } as CSSProperties}>
    <PageView layout={layout} mode="write" tagMenu={tagMenu}
      className="min-h-0 flex-1 overflow-y-auto after:block after:h-[calc(var(--sheet-shown)+12px)] after:content-['']" />
    <StageSheet title="Outline" handleLabel="Drag to show more or less of Outline" snaps={snaps}>
      <OutlineList layout={layout} className="max-h-[40dvh] overflow-y-auto overscroll-contain border-b border-line" />
      <Inspector layout={layout} className="flex-none" />
    </StageSheet>
  </div>
</div>
```
  Here `snaps = useSheetSnaps(stage, !wide, `${OUTLINE_PEEK}px`)`. The focus hand-off root still wraps the sheet: StageSheet doesn't portal.
- [ ] **Step 1: Write the failing tests** (a `describe('on a phone')` with phone.test.tsx's `matchMedia`/`clientWidth` stubs in `beforeAll`/`afterAll`, and a document whose Main text runs onto 2 pages):
  - `the handwritten pages come first, and Outline is a sheet over them`:
    - `getByRole('dialog', { name: 'Outline' })` has `aria-modal="false"`;
    - it contains `getByRole('region', { name: 'Outline' })` and `getByRole('region', { name: 'Selected block' })`;
    - `document.querySelectorAll('[data-stage="outline"] .sheet')` has 2 elements, none inside the dialog;
    - the button `Drag to show more or less of Outline` exists.
  - `a long Main text never pushes the page list out of reach`: the list region has `max-h-[40dvh]` and comes before the inspector in the dialog.
  - `choosing a part in the list shows its block in the sheet`: clicking the item `Main text, part 2 of 2` gives the textbox `Main text, all pages` in the dialog.
  - `on a wide screen nothing changes`: with the default stubs, there is no dialog named `Outline`, and the three regions are as before.
  - `an outline item’s description is its first words` (D35): the item `Main text, part 1 of 2` `toHaveAccessibleDescription` of the part's snippet.
- [ ] **Step 2: Run** `npx vitest run src/features/write/OutlineView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. Replace OutlineView's header comment ("Outline's bottom sheet for phones comes in Milestone 6") with a description of the sheet.
- [ ] **Step 4: Run** `npx vitest run src/features/write`. Expected: PASS.
- [ ] **Step 5: Check it in Chromium** at 390 and 320 px (throwaway script; report it):
  - at peek, about half, and the top, the sheet shows its handle, and the stage switcher stays reachable;
  - tapping a word on the handwriting puts the caret in the sheet's editor;
  - dragging a page grip in the sheet's list reorders pages;
  - `document.documentElement.scrollWidth` is at most the width.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 7: Commit** `feat(write): on phones Outline shows the handwritten pages, with the page list and the block's editor in a bottom sheet`

---

### Task 5: Style keeps its state across 860 px, and three silent failures speak

**Files:**
- Create: `src/features/style/panelState.ts`, `src/features/style/remount.test.tsx`, `src/test/media.ts`.
- Modify:
  - `src/features/style/HandSection.tsx`, `LooksSection.tsx`, `PageCountNotice.tsx`;
  - `prefs.ts` (`removeSavedLook`), `fit.ts` (`fitBack`'s nothing-fits message), `fonts.ts` (`handReadable`), `hands.ts` (`handNote`, `shapesNote`);
  - tests: `prefs.test.ts`, `fit.test.ts`, `fonts.test.ts`, `looks.test.tsx`.

**Interfaces:**
- Consumes: `useEditor` (`docId`), `engineFor` (`@/engine/core.js`, unchanged), `toast`.
- Produces:
  - `panelState.ts`:
    - `useStylePanel = create<{ picker: { open: boolean; q: string; filter: HandFilter }; saveLook: { asking: boolean; name: string }; notice: { base: number | null; active: boolean; docId: string | null } | null }>()`;
    - `resetStylePanel(): void`;
    - a module-level `useEditor.subscribe` that calls `resetStylePanel()` whenever `docId` changes.
    - Defaults: picker `{ open: false, q: '', filter: 'all' }`, saveLook `{ asking: false, name: 'My look' }`, notice `null`.
  - `HandSection`, `LooksSection` and `PageCountNotice` read and write that store instead of `useState`. `PageCountNotice` keeps its rules exactly, starting from `{ base: pages, active, docId }` when the store's notice is `null`.
  - `media.ts` (tests only): `resizableWindow(width: number): { resize(width: number): void; restore(): void }`:
    - it installs a `matchMedia` that answers `(min-width|max-width: …)` from the current width, and fires each registered `change` listener whose answer changed on `resize`;
    - it sets `window.innerWidth`;
    - `restore()` puts back the setup's stub.
  - `prefs.ts`: `removeSavedLook(id)` resolves `{ look, index, kept: boolean } | null`. `kept` is false when the stored write failed. The look is still taken off this page's list.
  - `LooksSection` says `kept ? M3's “Removed “{name}”.” : the Interface copy failure line`, both with the same Undo.
  - `fit.ts`: when `fitPlan` is null and some block other than the scoped one has `style.size` set, the message is the Interface copy line naming the first such block, in document order. Otherwise the M3 line is unchanged.
  - `fonts.ts`: `handReadable(cfg: FontCfg): boolean` is `!cfg.local || engineFor(cfg) !== null`. The engine caches the parse, so it costs one parse per hand.
  - `hands.ts`: for an uploaded hand where `handReadable` is false, `handNote` gives `your font, which can’t be read on this device` and `shapesNote` gives `null`. The picker row and Style's Handwriting line show it.
- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/style/remount.test.tsx: a wide window that turns into a phone and back (a tablet turned)
let win: ReturnType<typeof resizableWindow>;
beforeEach(async () => { win = resizableWindow(1280); await openSeeded('style'); }); // App at #/d/<id>/style, a 2-page document, hands loaded
afterEach(() => win.restore());
const turn = (w: number) => act(() => win.resize(w));
test('crossing 860 px keeps the hand picker open with its search and filter', async () => {
  await user.click(screen.getByRole('button', { name: 'Change handwriting' }));
  await user.type(screen.getByRole('searchbox', { name: 'Search handwriting' }), 'cav');
  await user.click(screen.getByRole('button', { name: 'Joined-up' }));
  for (const w of [390, 1280]) {
    turn(w);
    expect(screen.getByRole('dialog', { name: 'Handwriting' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search handwriting' })).toHaveValue('cav');
    expect(screen.getByRole('button', { name: 'Joined-up' })).toHaveAttribute('aria-pressed', 'true');
  }
});
test('…and Save as a look with the name typed so far', async () => { /* open Save as a look, type 'Mine', turn(390): the field still says 'Mine' */ });
test('…and the page count notice', async () => {
  act(() => setV({ size: 40 }));
  await screen.findByText(/^Now 3 pages \(was 2\)/);
  turn(390);
  expect(screen.getByText(/^Now 3 pages \(was 2\)/)).toBeInTheDocument();
});
test('another document starts with the picker closed and no notice', async () => { /* open picker, go Home, open a second document on Style: no dialog 'Handwriting' */ });
```
  - `prefs.test.ts`: `a removal the device can’t store still takes the look off, and says it wasn’t kept`. With `setPref` failing, it gives `kept: false` and the store's `looks` no longer has it.
  - `looks.test.tsx`: `…and Style says so, with Undo`, with the exact failure copy for a look named `Mine`.
  - `fit.test.ts`: `when nothing fits because another block keeps its own letter size, the message names it`. In Whole document scope, with a short Main text and a `Margin note` of `lines(60)` whose `style.size` is 44 (the most `LIMITS` allow), the note alone overflows the 1-page target. Then the message is exactly the Interface copy with `{pages}` `1 page` and `{block}` `Margin note`. Without an own size, the M3 line is unchanged.
  - `fonts.test.ts`: `a stored font that is signed but can’t be read is marked`. A record whose buffer starts with `wOFF` and is then garbage is registered by `loadUploadedFonts()`, `handReadable` gives false, and `handNote` gives the copy.
- [ ] **Step 2: Run** `npx vitest run src/features/style`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/features/style`. Expected: PASS.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `fix(style): turning a tablet keeps the picker, a look being named and the page count notice; a failed look removal, an unreadable font and a block with its own size now say so`

---

### Task 6: Pages and blocks that move

**Files:**
- Modify:
  - `src/features/doc/model.ts` (`pageRefusal`, `movePage`, `mergeIntoPrevious`), `src/features/doc/actions.ts` (`movePageTo`, `mergeIntoPreviousPage`, `addBlock`);
  - `src/features/write/PageMenu.tsx`, `src/features/write/PhonePages.tsx` (the `PageMenu` prop only);
  - tests: `model.test.ts`, `actions.test.ts`, `src/features/write/phone.test.tsx`, `menus.test.tsx`.

**Interfaces:**
- Consumes: `layoutFor`, `partOf` and `startPage` (model.ts internals).
- Produces:
  - `pageRefusal(L: Layout, page: number): Refused | null`. The `doc` parameter goes, and both callers change. A page that shows something, but no block's first part, is refused, naming its first continuation. A page that shows nothing, or any first part, isn't refused.
  - `movePage`: for each block, `shown` is where its first part is now and `b.page` is where it is stored.
    - If it shows on its stored page, or if `moved(shown) − shown === moved(b.page) − b.page`, then `b.page = moved(b.page)` and `y` is kept. The push happens again at layout.
    - Otherwise it is pinned where it shows: `b.y = seg.top` and `b.page = moved(shown)` (today's `place`).
  - `mergeIntoPrevious(S, doc, i): { ranOn: boolean } | 'full' | null`:
    - it merges a `structuredClone` first;
    - if the clone's layout shows on page `i` exactly the `(box.id, idx)` parts it showed before, it gives `'full'` and leaves `doc` untouched;
    - otherwise it does the merge on `doc`, as today.
  - `actions.ts`:
    - `mergeIntoPreviousPage` turns `'full'` into `refuse('Page {i} is full, so nothing on page {i+1} fits on it.')`, with `{i}` the 1-based previous page.
    - `addBlock(kind, page)` says the Interface copy line when the new block's first part is on a page other than `page`, and `ADDED[kind]` otherwise. The header is never pushed.
  - `PageMenu`: the prop `onMoved` becomes `onShow?: (page: number) => void`, "the page a pager should show next". It is called only when the document changed:
    - Move up/down → the new index;
    - Add a page after this one → `page + 1`;
    - Merge into previous page → `page - 1`.
  - `PhonePages` passes `onShow={setWant}`.
- [ ] **Step 1: Write the failing tests** (`S = cleanSettings(null, false)`; facts from today's layout, checked with the M2 re-review probe):

```ts
// src/features/doc/model.test.ts
const pushedOff = () => docOf(box({ id: 'a', name: 'Main text', text: lines(70) }), box({ id: 'n', page: 1, y: 900, w: 300, text: 'n' }));
test('a page that shows only a later part can’t move, even when a block stored on it was pushed off', () => {
  const d = pushedOff(), was = JSON.stringify(d); // page 2 shows only Main text part 2; n is stored there but shown on page 3
  expect(movePage(S, d, 1, 0)).toEqual({ ok: false, part: 2, name: 'Main text' });
  expect(JSON.stringify(d)).toBe(was);
});
test('moving unrelated pages leaves a pushed block where the person put it', () => {
  const d = { ...docOf(box({ id: 'a', text: lines(28) }), box({ id: 'n', y: 900, w: 300, text: 'n' }), box({ id: 'p', page: 2, text: 'p' }), box({ id: 'q', page: 3, text: 'q' })), pageCount: 4 };
  movePage(S, d, 3, 2);
  expect(d.boxes.map(b => [b.id, b.page, b.y])).toEqual([['a', 0, 110], ['n', 0, 900], ['p', 3, 110], ['q', 2, 110]]);
});
test('moving the page a pushed block shows on takes it along, pinned where it shows', () => { /* same doc, movePage(S, d, 1, 3): n → page 3, y 110 */ });
test('merging a page onto a full one changes nothing and says so', () => {
  const d = { ...docOf(box({ id: 'a', text: lines(28) }), box({ id: 'n', y: 900, w: 300, text: 'n' })), pageCount: 2 }, was = JSON.stringify(d);
  expect(mergeIntoPrevious(S, d, 1)).toBe('full'); expect(JSON.stringify(d)).toBe(was);
});
```
  - `actions.test.ts`:
    - `merging into a full page records nothing and says the page is full`: the message is `Page 1 is full, so nothing on page 2 fits on it.`, and `canUndo` is false.
    - `a margin note added to a full page says where it went`: with a full-width `lines(28)` on page 1, `addBlock('note', 0)` says `Added a margin note. Page 1 has no free line, so it starts on page 2.`
    - `pageRefusal` cases for Merge: the R2 document refuses `mergeIntoPreviousPage(1)` with the rule-4 message.
  - `phone.test.tsx`:
    - `Add a page after this one turns to the new page`: from `Page 1 of 2`, the ⋯ menu's `Add a page after this one` gives `Page 2 of 3`.
    - `Merge into previous page turns to the page it went to`: from `Page 2 of 2`, it gives `Page 1 of 1`.
- [ ] **Step 2: Run** `npx vitest run src/features/doc src/features/write/phone.test.tsx src/features/write/menus.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. Update the comment above `pageRefusal`: a page's own blocks are now the parts it shows.
- [ ] **Step 4: Run the same tests.** Expected: PASS. The layout snapshot (`src/engine/__snapshots__`) is unchanged.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass. The smoke run's page drag still says `Moved page 1 to position 2…`.
- [ ] **Step 6: Commit** `fix(write): a page showing only a later part can't move; unrelated moves leave pushed blocks where they were put; a full page and a block that lands elsewhere say so; the phone pager follows Add and Merge`

---

### Task 7: One step per real change; Export's estimate and tilt preview

**Files:**
- Modify:
  - `src/store/history.ts`, `src/store/history.test.ts`;
  - `src/store/editor.ts` (`gesture` only), `src/store/editor.test.ts`;
  - `src/features/style/Range.tsx`, `src/features/style/PenInkSection.tsx`;
  - `src/features/export/ExportPanel.tsx` (the file name's blur, and `useSizeEstimate`'s call), `ExportPanel.test.tsx`;
  - `src/features/export/estimate.ts`, `estimate.test.tsx`, `src/features/export/plan.ts`, `plan.test.ts`;
  - `src/engine/core.js`, `src/engine/core.d.ts`, `src/engine/engine.test.ts`;
  - `src/features/pages/Sheet.tsx`, `src/features/pages/exportPages.test.tsx`, `src/styles/app.css` (the camera tilt stand-in rule only).
- Create: `src/features/style/Range.test.tsx`.

**Interfaces:**
- Consumes: `stateSnapshot`, `sameState` and `historyTick` (editor.ts internals), `renderPage` and `encodeCanvas` (render.ts, unchanged), and `rng` (core.js).
- Produces:
  - `History.retract(): boolean` takes back the latest step `record` added. Its snapshot goes and the Redo steps it cleared come back. It returns false if anything happened to the history since: an undo, a redo, a clear, or another record.
  - `editor.ts`:
    - `interface Gesture { (fn: (s: EditorState) => void, opts?: Omit<UpdateOptions, 'history'>): void; end(): void }`, and `gesture(kind): Gesture`.
    - On its first change in a step it keeps `stateSnapshot()` from before.
    - `end()`: if the history hasn't moved since its last change and `sameState(stateSnapshot(), start)`, it calls `history.retract()`, bumps `historyTick` and updates `canUndo`/`canRedo`. Either way the next change starts a new step.
    - Every existing caller keeps working unchanged.
  - Callers that end:
    - `rangeSteps(kind).end()` calls the gesture's `end()`;
    - `PenInkSection`'s colour input `onBlur` calls `session.current?.end()`;
    - `ExportPanel`'s file name `onBlur` calls `edit.current?.end()`, then resets as today.
  - `plan.ts`:
    - `Sample` gains `at: Quality`, the size it was measured at;
    - `estimateBytes` scales by `PRINT_RATIO` only when `plan.quality === 'print' && s.at === 'standard'`;
    - `SCAN_LOOKS = ['scan', 'gray', 'bw']`.
  - `estimate.ts`:
    - `measurePage(f, i, at: Quality = 'standard')` draws at `QUALITY[at].pxW`, encodes PNG, JPG at Standard's quality and JPG at Print's quality, and gives `{ png, jpg, jpgPrint, at }`;
    - `useSizeEstimate(chosen, quality: Quality)` measures at `'print'` when `quality === 'print'` and `SCAN_LOOKS.includes(S.look)`, else at `'standard'`, and puts `at` in the cache key;
    - `ExportPanel` passes its `quality`.
  - `core.js`:
    - `const shotAngle = rnd => (0.3 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1) * Math.PI / 180;`
    - `frameShot`'s `const a = …` becomes `const a = shotAngle(rnd);`, with no other change.
    - `export const pageTilt = i => (S.tilt ? shotAngle(rng('tilt', S.seed, i)) : 0);`, the angle in radians.
    - `core.d.ts`: `export function pageTilt(i: number): number;`.
  - `Sheet.tsx`, in export mode with `S.tilt`: `.paper-art` gets the style `--shot-turn: {pageTilt(i)}rad` and `--shot-zoom: {cover(a)}`.
    - `cover(a) = max(cos|a| + (PAGE_H/PAGE_W)·sin|a|, cos|a| + (PAGE_W/PAGE_H)·sin|a|) + 0.004`, frameShot's own "no empty corner" zoom.
    - It reads `useEditor(s => (s.S.tilt ? s.S.seed : null))` so a Reshuffle redraws it.
  - `app.css`: the stand-in rule becomes `transform: rotate(var(--shot-turn, 0rad)) scale(var(--shot-zoom, 1.02));`, and its comment says it is each page's own angle.
- [ ] **Step 1: Write the failing tests**

```ts
// src/store/history.test.ts
test('retract takes back the latest step and gives Redo back', () => {
  const h = new History<string>(); h.record('a', 'k1', 0); h.record('b', 'k2', 5000); h.undo('c'); // redo holds 'c'
  h.record('b', 'g1', 9000); expect(h.canRedo).toBe(false);
  expect(h.retract()).toBe(true); expect(h.canRedo).toBe(true); expect(h.redo('b')).toBe('c');
  expect(h.retract()).toBe(false); // the history moved since
});
// src/store/editor.test.ts
test('a gesture that ends where it began leaves no step, and Redo stays', () => {
  openDocument(rec('A', 'x')); update(s => { s.S.size = 30; }); undo(); // Redo is now available
  const g = gesture('slider:size'); g(s => { s.S.size = 31; }); g(s => { s.S.size = 30; }); g.end();
  expect(get()).toMatchObject({ canUndo: false, canRedo: true });
});
```
  - `editor.test.ts`: `…but a gesture that changed something is one step`, where size 30 → 32, `end()` gives `canUndo` true.
  - `Range.test.tsx`: `a slider moved and moved back, then left, records nothing`: on `Letter size`, ArrowRight, ArrowLeft, then blur gives `canUndo` false. `…moved once is one step`.
  - `ExportPanel.test.tsx`: `typing in the file name and deleting it again records nothing`: type `x`, `{Backspace}`, blur gives `canUndo` false.
  - `estimate.test.tsx`:
    - `Print with a scan look is measured at Print size`: with `S.look = 'scan'` and quality `print`, `renderPage` is called with `2480`, and the estimate equals the measured JPG bytes × pages plus PDF overhead, with no `PRINT_RATIO`.
    - `As written at Print is still measured at Standard and scaled`.
  - `plan.test.ts`: `a sample measured at Print size isn’t scaled again`.
  - `engine.test.ts`: `pageTilt gives the angle frameShot turns each page by`. With `S.tilt` true, stub `HTMLCanvasElement.prototype.getContext` to a context that records `rotate`'s argument. For `i = 0..5`, `frameShot(src, i)` rotates by exactly `pageTilt(i)`. With tilt off, `pageTilt(i)` is 0. Restore the setup's stub after.
  - `exportPages.test.tsx`: `with Slight camera tilt each page’s stand-in turns by its own angle`. In Export with `S.tilt` true, `.paper-art` of page `i` has `--shot-turn` equal to `` `${pageTilt(i)}rad` ``. Two pages differ, and their signs follow the engine.
- [ ] **Step 2: Run** `npx vitest run src/store src/features/style/Range.test.tsx src/features/export src/engine/engine.test.ts src/features/pages`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. In `core.js`, touch only the `frameShot` line and the two new consts.
- [ ] **Step 4: Run the same tests.** Expected: PASS.
- [ ] **Step 5: Run** `npm run test:browser`. Expected: `render.browser.test.ts` passes unchanged. Its pages compare byte for byte with `exportPage`, tilt included.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass. `git diff --stat -- src/engine` lists only `core.js`, `core.d.ts` and `engine.test.ts`.
- [ ] **Step 7: Commit** `fix: a slider, ink colour or file name changed and changed back leaves no undo step; Print scans are estimated at Print size; the tilt preview turns each page its own way`

---

### Task 8: First-visit tips

**Files:**
- Create: `src/features/doc/tips.ts`, `src/features/doc/Tips.tsx`, `src/features/doc/Tips.test.tsx`.
- Modify:
  - `src/features/doc/DocumentView.tsx`: `useEffect(() => showTipsIfDue(), [])`, and `<Tips />` after `<StageHost …/>`;
  - `src/test/setup.ts`: a global `beforeEach` that sets `nib.tips` to `'seen'` (try/catch), so earlier tests are unaffected;
  - `scripts/smoke.mjs`: after the main context and after the phone context are made, `await <ctx>.addInitScript(() => { try { localStorage.setItem('nib.tips', 'seen'); } catch {} });`. Task 12 adds the tips step in a fresh context.

**Interfaces:**
- Consumes: `chordLabel`, `isApple` (`@/lib/keys`), `matches` (`@/lib/media`).
- Produces:
  - `tips.ts`:
    - `TIPS_KEY = 'nib.tips'`;
    - `useTips = create<{ open: boolean }>()`;
    - `showTipsIfDue(): void`, which opens the card and writes `'seen'` when the key isn't `'seen'` and the tips weren't shown on this page;
    - `dismissTips(): void`;
    - `tipLines(touch: boolean): [string, string, string]`, per Interface copy, with `{Mod+K}` from `chordLabel(['Mod', 'K'])`.
  - `Tips()`, per Design decision 6: `<aside aria-labelledby={id}>` with `<h2 id>Tips</h2>`, `<ol>` of `tipLines(matches('(hover: none) and (pointer: coarse)'))`, and `<Button>Got it</Button>`.
    - Classes: `fixed z-30 rounded-xl border border-line bg-surface p-4 shadow-lg inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] wide:inset-x-auto wide:bottom-4 wide:left-4 wide:w-80`.
    - The list is `list-decimal pl-5 text-[13px] text-muted`.
- [ ] **Step 1: Write the failing tests** (`beforeEach`: `localStorage.removeItem('nib.tips')`, a module reset of the session flag, and App at a seeded document):
  - `the first document to open shows three tips, and nothing takes the focus`: `findByRole('complementary', { name: 'Tips' })` has three `listitem`s with the exact copy (off Apple: `Press Ctrl+K …`). `document.activeElement` is the element focused before (or `body`), never inside the aside. `localStorage['nib.tips']` is `'seen'`.
  - `Got it puts them away, and they don’t come back`: after `Got it`, the aside is gone. Opening another document (navigate and `findByText`) shows no aside.
  - `pressing Got it from the keyboard gives the focus back to what had it`: focus the `Undo` button, Tab into the card, press Enter on `Got it`, and the focus is on `Undo`.
  - `with storage blocked they show once on this page`: with `localStorage.setItem`/`getItem` throwing, two document opens give the aside once.
  - `on a touch-only device the third tip is about swiping`: with `matchMedia` true for `(hover: none) and (pointer: coarse)`, the third item is `Swipe sideways on a page to turn to the next one.`
  - `on an Apple keyboard the shortcut reads ⌘K`.
- [ ] **Step 2: Run** `npx vitest run src/features/doc/Tips.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Any older test that clears `localStorage` and opens a document gets `nib.tips` set in its own `beforeEach`; list which ones in the report.
- [ ] **Step 5: Run** `npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(doc): three tips the first time a document opens, kept out of the way and never stealing the focus`

---

### Task 9: Updates and messages

**Files:**
- Create: `src/app/updates.ts`, `src/app/updates.test.ts`, `src/lib/focus.ts`, `src/lib/focus.test.ts`.
- Modify:
  - `src/app/pwa.ts`: `startPwa` calls `startUpdates(registerSW)`;
  - `src/store/editor.ts`: `toast`, `dismissMessages`, `takeDownUndoMessages`, `saveNow`'s `SAVE_NEWER` line, and the new reloader;
  - `src/store/editor.test.ts`;
  - `src/app/App.tsx`: `useEffect(() => installFocusMemory(), [])`, next to `installFlushOnHide`;
  - `src/features/home/RecentList.tsx`: its `SAVE_NEWER` toast gets `reloadAction()`. This builds on the M5 fix wave's version of the file.

**Interfaces:**
- Consumes:
  - `RegisterSWOptions` (type) from `vite-plugin-pwa/types`;
  - `registerSW` (`virtual:pwa-register`, in `pwa.ts` only);
  - `flushSave`, `toast` (editor.ts).
- Produces:
  - `editor.ts`:
    - `toast(msg, action?, o: { duration?: number; keep?: boolean } = {})`. A `keep` message isn't one of `messages`, so `dismissMessages()` (a document opening or closing) leaves it up.
    - **Ids (D64).** The id is `` `${msg}#${gen}` ``, with `gen` per text, bumped in sonner's `onDismiss` and `onAutoClose` for that toast. So the same text said while it shows still updates it in place, and said while it is leaving shows again. `messages` and `undoMessages` hold ids.
    - **Focus (D63).** An action runs as `() => { const back = rememberedFocus(); action.fn(); setTimeout(() => giveFocusBack(back), 0); }`.
    - `setReloader(fn: () => void): void` (default `() => location.reload()`), and `reloadAction(): ToastAction`, which is `{ label: 'Reload', fn: () => reloader() }`.
    - `saveNow` says `toast(SAVE_NEWER, reloadAction())`.
  - `focus.ts`:
    - `installFocusMemory(): () => void` listens to `focusin` on `document` and remembers its target unless it is inside `[data-sonner-toaster]`;
    - `rememberedFocus(): HTMLElement | null`;
    - `giveFocusBack(el)`: if `document.activeElement` is `body` or inside the toaster, it focuses `el` when `el.isConnected` and `el` isn't inside `[inert]` or `[hidden]`.
  - `updates.ts`:
    - `NEW_VERSION = 'A new version is ready.'`, `OFFLINE_READY = 'Nib works offline now.'`, `CHECK_EVERY = 3_600_000`, `RELOAD_FALLBACK = 3000`;
    - `type UpdateState = 'current' | 'waiting' | 'active'`;
    - `startUpdates(register: (o: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>, hooks: { reload(): void } = { reload: () => location.reload() }): void`, per Design decision 2. It calls `setReloader(() => { void reloadToNewVersion(); })`;
    - `reloadToNewVersion(): Promise<void>`;
    - `updateState(): UpdateState`;
    - `resetUpdatesForTests(): void`.
- [ ] **Step 1: Write the failing tests**

```ts
// src/app/updates.test.ts (render(<Toaster />); fake timers; a fake register keeps the options it was given)
let opts: RegisterSWOptions, applyUpdate: Mock, reload: Mock;
beforeEach(() => {
  resetUpdatesForTests(); applyUpdate = vi.fn(async () => {}); reload = vi.fn();
  startUpdates(o => { opts = o; return applyUpdate; }, { reload });
});
test('a new version waiting says so with Reload, and stays up', async () => {
  act(() => opts.onNeedRefresh!()); await screen.findByText('A new version is ready.');
  act(() => vi.advanceTimersByTime(60_000)); expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
});
test('Reload writes the last change first, then reloads only this tab', async () => {
  // A stored, open document (createDoc, then openDocument with getDoc's record) and putDoc mocked as in BlockEditor.test.tsx.
  await openStored('A', 'x'); update(s => { s.doc.boxes[0].text = 'xy'; }); // a change waiting for the debounce
  act(() => opts.onNeedRefresh!());
  await user.click(await screen.findByRole('button', { name: 'Reload' }));
  expect(putDoc).toHaveBeenCalled(); expect(applyUpdate).toHaveBeenCalledTimes(1); expect(reload).not.toHaveBeenCalled();
  act(() => opts.onNeedReload!()); expect(reload).toHaveBeenCalledTimes(1);
});
test('a new version taking over from another tab never reloads this one', async () => {
  act(() => opts.onNeedRefresh!()); act(() => opts.onNeedReload!());
  expect(reload).not.toHaveBeenCalled(); expect(await screen.findByText('A new version is ready.')).toBeInTheDocument();
});
```
  - `updates.test.ts`, also:
    - `Reload once the new version is in charge just reloads`: `onNeedReload` before any press, then Reload, calls `reload` and not `applyUpdate`.
    - `if the new version never takes over, Reload reloads anyway after 3 s`.
    - `the first install says Nib works offline now`.
    - `the message stays up when a document opens or closes`: `onNeedRefresh`, then `openDocument(rec)` and `closeDocument()`, and the text is still shown.
    - `a document a newer Nib saved offers Reload, which goes to the new version`: `putDoc` rejects `NewerDocumentError`, so `SAVE_NEWER` shows with `Reload`. After `onNeedRefresh`, clicking it calls `applyUpdate`.
    - `checks for a new version every hour while shown`: `onRegisteredSW('sw.js', { update })`, advance one hour, and `update` is called once. While `visibilityState` is `hidden` it isn't. A `visibilitychange` to visible after more than an hour calls it.
  - `editor.test.ts`:
    - `a message said again while the first one is leaving still shows`: `toast('X')`, dismiss it, `toast('X')` within 100 ms, run the timers, and `X` is on screen.
    - `a message’s action gives the focus back to what had it`: focus a button, `toast('Y', { label: 'Undo', fn })`, click `Undo`, run the timers, and the button has focus.
  - `focus.test.ts`: `remembers focus outside the messages, and gives it back only when it was lost`.
- [ ] **Step 2: Run** `npx vitest run src/app/updates.test.ts src/lib/focus.test.ts src/store/editor.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. Keep every existing toast behaviour: Undo messages taken down by undo/redo, and `duration`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including QA round 1's tab and toaster tests (`tabs.toaster.test.tsx`).
- [ ] **Step 5: Check the update flow in Chromium** (throwaway script, as Task 1's Step 6, served at `/nib-engine/`):
  - two pages in one persistent context; type in page B's editor and set `window.__stay = 1`;
  - append `\n// redeploy` to `dist/sw.js` and call `registration.update()` in both;
  - both show `A new version is ready.`;
  - Reload in A reloads A only, and B keeps `__stay`, its text and the message.
  - Report it.
- [ ] **Step 6: Run** `npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 7: Commit** `feat(pwa): a new version is offered with Reload and never reloads a tab by itself; Reload writes the last change first; messages keep the focus and show when said again`

---

### Task 10: Command palette

**Files:**
- Modify:
  - `package.json`, `package-lock.json` (`"cmdk": "1.1.1"` in `dependencies`);
  - `src/shell/Overlays.tsx`: it adds `<CommandPalette …/>`;
  - `src/features/style/looks.ts`: it adds `pickDocumentLook`.
- Create:
  - `src/components/ui/command.tsx`;
  - `src/shell/commands.ts`, `src/shell/commands.test.ts`;
  - `src/shell/CommandPalette.tsx`, `src/shell/CommandPalette.test.tsx`.

**Interfaces:**
- Consumes:
  - `useOverlays`, `openOverlay`, `closeOverlay` (Task 3), `chordLabel` (Task 3);
  - `useThemePref`, `setThemePref` (Task 2);
  - `listDocs` (`@/store/documents`), `relativeTime` (`@/features/home/recent`);
  - `STYLE_LOOKS`, `lookPatch`, `lookMatches` (`@/features/style/looks`), `useStylePrefs` (saved looks);
  - `openTemplate('blank')`, `openImportPicker` (Home), `openImport` (`@/features/doc/actions`), `setExportPrefs` (`@/features/export/state`);
  - `navigate`, `useRoute`, `MEMORY_ID` (`@/app/route`).
- Produces:
  - `command.tsx`: shadcn-style wrappers on `cmdk`: `Command`, `CommandInput` (lucide `Search` icon), `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut`. Selected items are `data-[selected=true]:bg-surface-2`.
  - `looks.ts`: `pickDocumentLook(look: SavedLook): void`. If `lookMatches(look, S, S, false)` it does nothing. Otherwise it is one step, `update(s => { Object.assign(s.S, lookPatch(look, false)); clearMeasureCache(); }, { history: step('look') })`.
  - `commands.ts`:
    - `type CommandGroupName = 'Go to' | 'Documents' | 'Create' | 'Export' | 'Looks for the whole document' | 'Theme' | 'Help'`;
    - `interface PaletteCommand { id: string; group: CommandGroupName; label: string; keywords: string[]; meta?: string; shortcut?: string; run(): void }`;
    - `interface CommandContext { route: Route; docs: { id: string; title: string; updatedAt: number }[]; looks: SavedLook[]; theme: ThemePref; now?: number }`;
    - `paletteCommands(ctx): PaletteCommand[]`, in the groups and order of Interface copy.
    - Ids: `stage:<stage>`, `home`, `doc:<id>`, `new`, `import`, `export:<fmt>`, `look:<id>`, `theme:<pref>`, `shortcuts`.
    - Keywords: `keywords` always starts with the `label` (the palette filters on keywords alone), followed by:
      - `Write` gets `pages typed handwritten`;
      - `Outline` gets `pages blocks structure`;
      - `Style` gets `hand pen ink paper looks`;
      - `Export` gets `download pdf png jpg`;
      - `Home` gets `documents recent templates`;
      - a document gets its title;
      - `New document` gets `blank page`;
      - `Import a file…` gets `pdf word docx text`.
    - Runs:
      - a stage: `navigate`;
      - `Home`: `navigate({ name: 'home' })`;
      - a document: `navigate({ name: 'doc', id, stage: 'write' })`;
      - `new`: `openTemplate('blank')`;
      - `import`: `openImport()` in a document, `openImportPicker()` on Home;
      - `export:<fmt>`: `setExportPrefs({ format })`, then `navigate` to `export`;
      - a look: `pickDocumentLook`;
      - a theme: `setThemePref`;
      - `shortcuts`: `openOverlay('shortcuts')`.
  - `CommandPalette({ open, onOpenChange })`:
    - `DialogContent data-overlay="palette" showCloseButton={false}`, with classes `top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl`;
    - the sr-only title and description;
    - `<Command loop filter={(v, s, k) => defaultFilter(k?.join(' ') ?? v, s)}>`;
    - on open it reads `listDocs()`; in memory mode the list is empty;
    - selecting an item calls `onOpenChange(false)`, then `cmd.run()` in the same handler, so the file picker keeps its user activation.
    - `onCloseAutoFocus`: if the element that had the focus is gone or in a hidden stage, prevent the default and, on the next frame, focus `nav[aria-label="Stages"] [aria-current="step"]`, else the `Home` link.
- [ ] **Step 1: Write the failing tests**

```ts
// src/shell/commands.test.ts
const NOW = new Date(2026, 10, 7, 12).getTime();
const ctx = (route: Route): CommandContext => ({ route, docs: [{ id: 'd1', title: 'The Water Cycle', updatedAt: NOW }, { id: 'd2', title: 'Essay', updatedAt: NOW - 86_400_000 }], looks: [], theme: 'system', now: NOW });
test('on Home: documents, create, theme and help', () => {
  const c = paletteCommands(ctx({ name: 'home' }));
  expect([...new Set(c.map(x => x.group))]).toEqual(['Documents', 'Create', 'Theme', 'Help']);
  expect(c.filter(x => x.group === 'Documents').map(x => [x.label, x.meta])).toEqual([['The Water Cycle', 'Edited today'], ['Essay', 'Edited yesterday']]);
  expect(c.find(x => x.id === 'theme:system')!.meta).toBe('Current');
});
test('in a document: the other stages, the other documents, export, looks for the whole document', () => {
  const c = paletteCommands(ctx({ name: 'doc', id: 'd1', stage: 'write' }));
  expect(c.filter(x => x.group === 'Go to').map(x => x.label)).toEqual(['Outline', 'Style', 'Export', 'Home']);
  expect(c.filter(x => x.group === 'Documents').map(x => x.label)).toEqual(['Essay']);
  expect(c.filter(x => x.group === 'Export').map(x => x.label)).toEqual(['Export as PDF', 'Export as PNG', 'Export as JPG']);
  expect(c.filter(x => x.group === 'Looks for the whole document').map(x => x.label)).toEqual(['Exam answer', 'Neat notes', 'Letter', 'Quick scribble', 'Journal', 'School copy']);
});
```
  - `CommandPalette.test.tsx`: App at a seeded document with two stored documents, plus `<Overlays />`:
    - `Ctrl+K, a few letters and Enter open a document`: type `Ess` and Enter, and the URL hash is `#/d/<essay>/write` and the `Document name` field says `Essay`.
    - `…a stage`: `Sty` and Enter gives `/style`, with the focus on the `2 Style` button.
    - `a look applies to the whole document as one step, and again does nothing`: `Neat notes` and Enter give `S.font` `patrick` and `canUndo` true. Doing it again records no step.
    - `Export as PNG chooses PNG and opens Export`: `useExportPrefs` `format` is `png`, and the route stage is `export`.
    - `Dark theme switches the theme`: `html.dark`.
    - `nothing matches says so`: `zzzz` shows `Nothing matches that.`
    - `with the Import dialog open, Ctrl+K opens nothing`.
    - `Escape closes it and gives the focus back`.
    - `on Home, Import a file… opens the file picker`: an `input[type=file]` `click` is spied.
- [ ] **Step 2: Run** `npx vitest run src/shell`. Expected: FAIL.
- [ ] **Step 3: Install and implement.** Run `npm install --save-exact cmdk@1.1.1`. `npm ls @radix-ui/react-dialog` must show a single `1.3.1`. Then implement the Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/shell src/features/style/looks.test.tsx`. Expected: PASS, with no console errors from cmdk.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(shell): Ctrl+K palette to open a document, go to a stage, use a look on the whole document, export, change the theme or see the shortcuts`

---

### Task 11: App menu, and Home's thumbnails off the scroll

**Files:**
- Create: `src/shell/AppMenu.tsx`, `src/shell/AppMenu.test.tsx`.
- Modify:
  - `src/shell/TopBar.tsx`;
  - `src/features/home/thumbs.ts` (`job`'s first wait only), `src/features/home/thumbs.test.ts`.

**Interfaces:**
- Consumes: `openOverlay` (Task 3), `chordLabel` (Task 3), `useThemePref`, `setThemePref` (Task 2), and the `dropdown-menu` parts (radio group, label, shortcut).
- Produces:
  - `AppMenu()`:
    - a `DropdownMenu` whose trigger is `Button variant="ghost" size="icon"`, named and titled `Menu`, with lucide `Menu`;
    - its items are those of Interface copy;
    - the radio group's value is `useThemePref()`, and choosing calls `setThemePref`;
    - an item that opens an overlay sets a ref that makes `onCloseAutoFocus` call `preventDefault()`, so the overlay keeps the focus.
  - `TopBar`:
    - `<AppMenu />` goes last on Home, and after the Undo/Redo group (before `Export`) in a document;
    - Home's `Import a file` becomes `hidden sm:inline-flex`, because the Import hero is the same action and the bar then fits one row at 320 px;
    - the header's `gap-x-3` becomes `gap-x-2 wide:gap-x-3`.
  - `thumbs.ts`:
    - `drawSlot(): Promise<void>` waits for `requestIdleCallback` (`timeout: 500`; `setTimeout(0)` where it is missing), then until no `scroll` event (window, capture) has come for `SCROLL_QUIET = 150` ms;
    - `job` awaits `drawSlot()` where it awaited `setTimeout(0)`. Nothing else in the file changes, so the M5 fix wave's cached template pictures are untouched.
- [ ] **Step 1: Write the failing tests**
  - `AppMenu.test.tsx`:
    - `the menu searches, shows the shortcuts and switches the theme`: open `Menu`, and its items are `Search commands and documents`, `Keyboard shortcuts`, `System`, `Light`, `Dark`, with `System` checked. Choosing `Dark` gives `html.dark`, and opening it again shows `Dark` checked.
    - `Keyboard shortcuts from the menu opens the sheet with the focus in it`: the dialog `Keyboard shortcuts` is open and `document.activeElement` is inside it.
    - `Search commands and documents opens the palette`: `useOverlays` is `'palette'`.
    - `the top bar has the menu on Home and in a document, and Home’s Import a file waits for wider screens`: `Import a file` has the class `hidden`.
  - `thumbs.test.ts`: `a thumbnail is drawn in idle time, never while the page scrolls`. With fake timers and a stubbed `requestIdleCallback`, `thumbFor` starts, a `scroll` fires every 100 ms for 1 s, and `drawThumb` (spied through `composePage`) isn't called until 150 ms after the last scroll.
- [ ] **Step 2: Run** `npx vitest run src/shell/AppMenu.test.tsx src/features/home/thumbs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/shell src/features/home src/features/write/phone.test.tsx`. Expected: PASS.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(shell): a top-bar menu for search, shortcuts and the theme; Home draws thumbnails only when idle and not while scrolling`

---

### Task 12: Phone pass, smoke, README and exit checks

**Files:**
- Modify: `scripts/smoke.mjs`, `README.md`, and any file a phone check below shows needs a fix (each fix with a failing test first, in the file's own test).

- [ ] **Step 1: Serve the smoke run where GitHub Pages does.**
  - The preview server runs `vite preview --base /nib-engine/ --port <free> --strictPort`, and `BASE` is `` `http://localhost:${PORT}/nib-engine/` ``.
  - `waitForServer(BASE)`.
  - Every existing step keeps using `BASE`, and the main and phone contexts keep `serviceWorkers: 'block'` (Task 1).
- [ ] **Step 2: Add these steps** after M5's last step, in this order. As now, any console error fails a step.
  1. **Shortcuts: `?` and Ctrl+/ open the sheet, which lists the real shortcuts.**
     - In the open document, blur the active element and press `?`.
     - The dialog `Keyboard shortcuts` has the five `h3` headings.
     - Escape. Click into the `Main text` editor and press `Control+/`, then Escape, and the focus is back inside `.ProseMirror`.
  2. **Palette: Ctrl+K finds a stage, a look and a document, and never opens over the Import dialog.**
     - `Control+K` gives the dialog `Search commands and documents`. Type `Style` and Enter, and the URL ends `/style`.
     - `Control+K`, `Neat notes`, Enter, and the Style panel's pressed look starts with `Neat notes`.
     - `Control+K`, `Water`, Enter, and the `Document name` is `The Water Cycle`.
     - Click `Import`, press `Control+K`, wait 300 ms, and there is no dialog `Search commands and documents`. Cancel.
  3. **Theme: Dark from the menu, kept with no flash, and followed by another tab.**
     - `Menu` → `Dark` gives `html.dark`, a body background of `rgb(14, 14, 17)`, and the `theme-color` meta `#16161A`.
     - Open a second page in the same context. Route `**/assets/index-*.js` with a 1500 ms delay before `continue()`, then `goto(BASE, { waitUntil: 'domcontentloaded' })`. While `#root` is still empty, it has `html.dark` and the dark body background.
     - In page 1, `Control+K` → `Light theme`. Within 2 s page 2 has no `html.dark`.
     - `Menu` → `System`, and close page 2.
  4. **Tips: shown the first time a document opens, without taking the focus.**
     - In a new context without the tips init script: go to `BASE` and open The Water Cycle.
     - The `complementary` region `Tips` has three items with the desktop copy, and `document.activeElement` is outside it.
     - Click `Got it`, reload, open the document again, and after 1 s there is no `Tips`.
  5. **Phone: every stage at 390 px, and nothing wider than 320 px.**
     - Context `{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }`, without the tips init script. Open The Water Cycle.
     - The `Tips` box is inside 0–390 and its third item is the touch copy. Press `Got it`.
     - Then, for Write (`Page 1 of`), Outline, Style and Export:
       - `document.documentElement.scrollWidth <= 390`;
       - the `Menu` button's box is inside the viewport;
       - Outline has the dialog `Outline` with `aria-modal="false"`, a `.sheet` page above it, and the handle;
       - Style and Export have their sheets, and Export's `Download` button is inside the viewport.
     - Through `Menu` → `Search commands and documents`, the palette's box is inside 0–390. Escape.
     - `Menu` → `Keyboard shortcuts` gives a sheet inside 0–390. Escape.
     - `setViewportSize({ width: 320, height: 640 })`. Home and the four stages each have `scrollWidth <= 320` (D41).
  6. **Update: a new deploy is offered in every tab, and Reload reloads only the tab that asked.**
     - In `chromium.launchPersistentContext(<mkdtemp>, { channel: 'chromium' })`, with the tips init script (steps 6 and 7 click near the card's corner): page A goes to `BASE`, waits for `navigator.serviceWorker.controller` and sees `Nib works offline now.`
     - Page B goes to `BASE`, opens The Water Cycle, types ` (still typing)` at the end of Main text, and sets `window.__stay = 1`.
     - Append `\n// redeploy ${Date.now()}` to `dist/sw.js`, and run `(await navigator.serviceWorker.getRegistration()).update()` in both pages.
     - Both show `A new version is ready.` within 20 s.
     - Click `Reload` in A, and A navigates, then shows no `A new version is ready.`
     - B still has `window.__stay === 1`, the typed text and the message.
     - Click `Reload` in B, and B reloads.
  7. **Install and offline: installable under `/nib-engine/`, and with the network off it still opens, draws an unused hand and imports.**
     - Same persistent context. CDP `Page.getInstallabilityErrors` gives `[]`.
     - `Page.getAppManifest` has `url` `` `${BASE}manifest.webmanifest` `` and `errors` `[]`, and its data has `name` `Nib` and `start_url` `./`.
     - Reload once online, which warms the Google Fonts runtime cache.
     - Then `ctx.setOffline(true)`, stop the preview server (and wait for it to exit), and reload. Home lists The Water Cycle.
     - Open it, and page 1 is inked (M1's painted check).
     - Style → `Change handwriting` → `Zeyada`, and page 1 is inked again.
     - Write → `Import`. The `.docx` fixture shows `Essay.docx: 24 words.`, and `textPdf(RIVERS_PAGES)` shows `^Rivers\.pdf: \d+ words from 2 pages\.$`. Cancel. Close the context.
  - `finally` stops the server only if it is still running.
- [ ] **Step 3: Fix anything the phone pass finds**, test-first, in the owning file.
- [ ] **Step 4: Update the README.**
  - In "What it does today", add bullets for:
    - install and offline;
    - the theme switch;
    - the keyboard shortcut sheet and the Ctrl+K palette;
    - the first-visit tips;
    - Outline as a sheet on phones.
  - Add a `## Install and offline` section:
    - what is kept on the device (Design decision 1);
    - the `A new version is ready.` flow, and that no tab reloads by itself;
    - two tabs on two versions (Design decision 3).
  - Add a `## Keyboard` section: the Shortcuts table, shortened, and the palette's commands.
  - Add `### On phones` lines for Outline.
  - Under "How the code is laid out", describe:
    - `src/app/pwa.ts`, `updates.ts`, `pwaManifest.ts`;
    - `src/shell/` (`overlays.ts`, `Overlays.tsx`, `useAppShortcuts.ts`, `shortcuts.ts`, `ShortcutSheet.tsx`, `commands.ts`, `CommandPalette.tsx`, `AppMenu.tsx`);
    - `src/lib/theme.ts`, `keys.ts`, `focus.ts`;
    - `src/features/doc/Tips.tsx` and `tips.ts`;
    - `scripts/icons.mjs` (run by hand; needs the machine's Playwright).
  - Under "Checks and build", add the Lighthouse command from Step 6.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass, and the last line is `smoke ok`.
- [ ] **Step 6: Exit checks** (report each command's output):
  - **Lighthouse.** Start `node node_modules/vite/bin/vite.js preview --base /nib-engine/ --port 4321 --strictPort`. In a scratch folder, run `CHROME_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome | head -1) npx -y lighthouse@11.7.1 http://localhost:4321/nib-engine/ --only-categories=pwa --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lh.json --quiet`.
    - Expected: the audits `installable-manifest`, `splash-screen`, `themed-omnibox` and `maskable-icon` score 1.
  - `git diff main --stat -- src/engine` lists only `core.js`, `core.d.ts` and `engine.test.ts`. `git diff main -- src/engine/core.js` shows only `shotAngle`, its use in `frameShot` and `pageTilt`.
  - `git diff main -- package.json` adds only `cmdk` `1.1.1` and `vite-plugin-pwa` `2.0.0`.
  - `git diff main -- src/store/db.ts` gives no output, and `grep -n "DOC_SCHEMA = 3" src/store/documents.ts` finds it.
  - `grep -rn "useWide" src/shell src/features/doc/Tips.tsx` gives no output.
  - `grep -rn "location.reload" src --include=*.ts --include=*.tsx --exclude=*.test.*` gives only `src/app/updates.ts` and editor.ts's default reloader.
- [ ] **Step 7: Commit** `test: smoke serves Nib at /nib-engine/, checks the palette, shortcut sheet, theme, tips and every stage at 390 and 320 px, a two-tab update, installability and an offline reload; README for Milestone 6`

The controller then merges `nib/m6-polish` into `main` and pushes. This task does not merge, push or deploy.

---

## Exit check (roadmap)

**Lighthouse PWA installable:**
- Task 1: the manifest, icons and service worker, with Chromium's installability check run by hand.
- Task 12: the smoke run asks Chromium's own check (`Page.getInstallabilityErrors`) under `/nib-engine/` on every run, and Lighthouse 11.7.1's `installable-manifest` audit is run once and reported.

**Offline reload works:**
- Task 1: the precache list and the runtime caches, with an offline reload by hand.
- Task 12: with the server stopped and the network off, the smoke run reloads, opens a document, draws a hand never used before, and imports a `.docx` and a PDF.

**Phone smoke at 390 px:**
- Task 4: Outline's sheet, in jsdom and in Chromium.
- Task 12: every stage, the menu, the palette, the shortcut sheet and the tips at 390 px, and no stage wider than 320 px at 320 px.
