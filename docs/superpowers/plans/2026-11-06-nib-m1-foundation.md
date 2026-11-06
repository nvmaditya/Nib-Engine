# Nib Milestone 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Longhand onto the new stack and brand as Nib (repo `nib-engine`): Home with multiple documents saved in IndexedDB, a Write / Style / Export shell that still carries every feature the app has today, undo/redo everywhere, and the old work migrated, with the drawing engine untouched.

**Architecture:** The engine (`src/engine/*.js`) stays JavaScript and gains `.d.ts` declarations. A Zustand store owns the open document (settings `S` and `doc`, mutated in place as the engine expects, with a `version` counter for React), records snapshots for undo, and saves to IndexedDB through a small repository module. A hash router picks Home or a document stage. Today's React components are ported to TypeScript and restyled with Tailwind v4 and shadcn/ui; Milestones 2–4 later replace the stage internals.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (Radix), `sonner`, `lucide-react`, Zustand, `idb`, `@fontsource-variable/figtree`, Vitest + Testing Library + jsdom + `fake-indexeddb`, Playwright (pre-installed) for the smoke script.

**Spec:** `docs/superpowers/specs/2026-11-06-nib-redesign-design.md`

## Global Constraints

- Product name in all copy, titles, storage keys and file names: **Nib** (lowercase `nib` in the wordmark). Repository: `nib-engine`.
- Interface copy says **Block**, never "text box", in anything this milestone adds or ports.
- The engine's realism code is not simplified, removed or bypassed (spec §1). Engine files change only where a task says so.
- Colour tokens, block colours, accent and logo exactly as spec §2. Interface font Figtree only; weights 400 text, 500 controls, 600 names/titles.
- `vite.config.ts` keeps `base: './'` (relative paths for GitHub Pages).
- TypeScript `strict: true`. New code is `.ts`/`.tsx`; engine stays `.js`.
- Every merge to `main` must leave a working, deployable app.
- Storage: IndexedDB database `nib`, object stores `documents` (keyPath `id`) and `prefs`; theme preference in `localStorage['nib.theme']`.
- Longhand localStorage keys `longhand.v2` and `longhand.v1` are read once and never deleted.

## Review Focus

1. **Bootstrap runs twice** (two tabs, or a reload mid-migration): saved Longhand work must become exactly one Nib document. Test in Task 3.
2. **IndexedDB unavailable** (private window, blocked storage): the app must still open a working document in memory and say "Nib can't save on this device right now", not show a blank screen. Test in Task 3.
3. **Undo across documents:** after opening another document, Undo must not bring back the previous document's content. Test in Task 4.
4. **Link to a document that isn't there** (`#/d/<deleted id>/write`): go to Home and say "That document isn't on this device." Test in Task 5.
5. **Fonts arriving after a stage switch:** pages must redraw once the handwriting font loads (keep the `fontTick` path). Covered by the smoke script in Task 6.

---

## File map (end of Milestone 1)

```
index.html                         Nib title, meta, favicon, Figtree via package (no Atkinson)
components.json                    shadcn config
vite.config.ts, tsconfig*.json     TS, alias @ -> src, Tailwind, Vitest
scripts/smoke.mjs                  Playwright smoke run against `vite preview`
public/favicon.svg                 ink-page logo
src/main.tsx                       mounts <App/>, imports styles and Figtree
src/styles/app.css                 Tailwind, tokens (light/dark), base, sheet/canvas rules
src/lib/utils.ts                   cn()
src/lib/theme.ts                   system/light/dark theme
src/brand/Logo.tsx                 <Logo/>, <Wordmark/>
src/components/ui/*                shadcn components
src/engine/*.js                    unchanged engine
src/engine/*.d.ts, types.ts        typed boundary
src/store/db.ts                    IndexedDB open
src/store/documents.ts             document repository
src/store/bootstrap.ts             first-run: migrate Longhand or seed example
src/store/history.ts               undo/redo snapshots
src/store/editor.ts                open-document store (Zustand)
src/app/route.ts                   hash routes
src/app/App.tsx                    bootstrap + routing
src/shell/TopBar.tsx, StageNav.tsx
src/features/home/HomePage.tsx
src/features/doc/actions.ts        ported from src/actions.js
src/features/pages/PageView.tsx, Sheet.tsx, BoxFrame.tsx   ported from Pages.jsx
src/features/write/WriteStage.tsx, WritePanel.tsx
src/features/style/StyleStage.tsx, StylePanel.tsx
src/features/export/ExportStage.tsx, ExportPanel.tsx, exporters.ts
src/features/import/ImportDialog.tsx
src/test/setup.ts                  jest-dom, canvas stub, fake-indexeddb
```

Removed by the end: `src/App.jsx`, `src/main.jsx`, `src/store.js`, `src/actions.js`, `src/exporters.js`, `src/styles.css`, `src/components/*`.

---

### Task 0: Rename the repository (done by the controller, not a subagent)

- [ ] `gh api -X PATCH repos/nvmaditya/LongHand -f name=nib-engine` → JSON with `"name":"nib-engine"`.
- [ ] Attach `nvmaditya/nib-engine` to the session, `git remote set-url origin https://github.com/nvmaditya/nib-engine`, `git fetch origin main` succeeds.

---

### Task 1: TypeScript, React 19, Vite, Tailwind v4 and Vitest

**Files:**
- Modify: `package.json`, `vite.config.js` → `vite.config.ts`, `index.html`, `.gitignore` (add `coverage/`, `test-results/`)
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/engine/types.ts`, `src/engine/core.d.ts`, `src/engine/doc.d.ts`, `src/engine/config.d.ts`, `src/engine/importers.d.ts`, `src/engine/engine.test.ts`
- Rename: `src/main.jsx` → `src/main.tsx` (body unchanged apart from types; still renders the existing `App.jsx`)

**Interfaces:**
- Produces `src/engine/types.ts`:
  - `Settings` (every key of `DEFAULTS` in `config.js`, typed: `font: string; ink: string; customInk: string; tip: string; weight: number; size: number; gap: number; mess: number; wobble: number; variety: number; flow: number; track: number; words: number; mistakes: number; paper: string; holes: boolean; lighting: boolean; ghost: boolean; crease: boolean; look: 'none'|'scan'|'gray'|'bw'; tilt: boolean; seed: number`)
  - `Box { id: string; page: number; x: number; y: number; w: number; text: string; style: Partial<Settings>; shuffle: number; frames: Record<number, { x?: number; y?: number; w?: number }> }`
  - `EngineDoc { pageCount: number; boxes: Box[]; fileName: string }`
  - `Seg { box: Box; page: number; idx: number; x: number; w: number; top: number; bottom: number; rows: unknown[] }`, `Layout { segs: Seg[]; pages: number }`
  - `FontCfg`, `PenCfg`, `InkCfg`, `PaperCfg`, `PresetCfg` matching `config.js` entries.
- Produces `.d.ts` files declaring every export of `core.js`, `doc.js`, `config.js`, `importers.js` with those types.
- Dependencies installed now for the whole milestone (so parallel tasks never touch `package.json`): `react@19 react-dom@19 zustand idb sonner lucide-react clsx tailwind-merge class-variance-authority radix-ui @fontsource-variable/figtree` and dev `typescript @types/react @types/react-dom @types/node vite @vitejs/plugin-react tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb`. Pin exact resolved versions in `package.json`, as the repo does today.
- Scripts: `dev`, `build` = `tsc -b && vite build`, `preview`, `test` = `vitest run`, `typecheck` = `tsc -b`, `smoke` = `node scripts/smoke.mjs`.

- [ ] **Step 1: Write the failing test** `src/engine/engine.test.ts`

```ts
import { cleanDoc, cleanSettings } from '@/engine/doc.js';
import { DEFAULTS } from '@/engine/config.js';

test('engine modules load in tests and clean a document', () => {
  const d = cleanDoc({ boxes: [{ text: 'a' }] })!;
  expect(d.pageCount).toBe(1);
  expect(d.boxes[0].text).toBe('a');
  expect(typeof d.boxes[0].id).toBe('string');
});
test('settings fall back to defaults', () => {
  expect(cleanSettings({ font: 'nope' }, false).font).toBe(DEFAULTS.font);
});
```

- [ ] **Step 2: Run** `npx vitest run src/engine/engine.test.ts` → FAIL (no Vitest config / TS).
- [ ] **Step 3:** Install the dependencies above; add the tsconfigs (`strict`, `jsx: react-jsx`, `moduleResolution: bundler`, `allowJs: true`, `checkJs: false`, `paths: { "@/*": ["./src/*"] }`), `vite.config.ts` (`base: './'`, React and Tailwind plugins, `resolve.alias['@']`, `test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], globals: true }`), `src/test/setup.ts` (import `@testing-library/jest-dom/vitest`, `fake-indexeddb/auto`, and stub `HTMLCanvasElement.prototype.getContext` to return an object whose methods are no-ops and whose `measureText` returns `{ width: text.length * 8 }`), the engine types and declarations, `src/vite-env.d.ts`.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run typecheck` → exit 0; `npm run build` → `dist/index.html` exists; `npm run dev` and load `/` in Playwright → the existing app renders pages (no console errors).
- [ ] **Step 5: Commit** `chore: move to TypeScript, React 19, Vite and Vitest; type the engine boundary`

---

### Task 2: Design system and brand

**Files:**
- Create: `src/styles/app.css`, `src/lib/utils.ts`, `src/lib/theme.ts`, `src/lib/theme.test.ts`, `src/brand/Logo.tsx`, `src/brand/Logo.test.tsx`, `components.json`, `src/components/ui/{button,input,label,dialog,alert-dialog,dropdown-menu,tooltip,separator,slider,switch,toggle-group,select,radio-group,checkbox}.tsx`
- Modify: `public/favicon.svg` (ink-page logo, static colours), `index.html` (`<title>Nib</title>`, description "Turn typed text into realistic handwritten pages, then download them as a PDF or images.", `theme-color` `#1E2B7C`, drop the Atkinson Hyperlegible family from the Google Fonts link but keep the handwriting families)

**Interfaces:**
- Produces `cn(...inputs: ClassValue[]): string`.
- Produces `type ThemePref = 'system' | 'light' | 'dark'`; `getThemePref(): ThemePref` (reads `localStorage['nib.theme']`, default `'system'`); `setThemePref(p: ThemePref): void` (stores, applies); `applyTheme(p: ThemePref, systemDark: boolean): void` (toggles class `dark` on `<html>`); `initTheme(): () => void` (applies now, follows `prefers-color-scheme` changes while `'system'`, returns unsubscribe).
- Produces `<Logo size?: number = 30, variant?: 'ink' | 'paper' = 'ink', className?: string />` (SVG, `role="img"`, `aria-label="Nib"`, drawing from the prototype's `logo()` function) and `<Wordmark className?: string />` ("nib", Figtree 700, `tracking-[-0.045em]`).
- Produces Tailwind colour utilities from the spec tokens: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-line`, `border-line-strong`, `bg-desk`, `bg-marker`, `bg-primary-soft`, `text-logo-ink`, plus the shadcn names mapped onto them (`background`→bg, `foreground`→fg, `card`/`popover`→surface, `primary`→accent, `primary-foreground`→on-accent, `secondary`/`muted`/`accent`→surface-2, `muted-foreground`→muted, `destructive`→danger, `border`→line, `input`→line-strong, `ring`→accent). Dark values under `.dark`. `--font-sans: 'Figtree Variable', system-ui, sans-serif`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/theme.test.ts
test('system preference follows the OS', () => { applyTheme('system', true); expect(document.documentElement).toHaveClass('dark'); applyTheme('system', false); expect(document.documentElement).not.toHaveClass('dark'); });
test('explicit choice wins and is stored', () => { setThemePref('dark'); expect(localStorage.getItem('nib.theme')).toBe('dark'); expect(getThemePref()).toBe('dark'); expect(document.documentElement).toHaveClass('dark'); });
test('unknown stored value falls back to system', () => { localStorage.setItem('nib.theme', 'pink'); expect(getThemePref()).toBe('system'); });
// src/brand/Logo.test.tsx
test('ink logo is labelled and uses the ink background', () => { render(<Logo size={16} />); const svg = screen.getByRole('img', { name: 'Nib' }); expect(svg).toHaveAttribute('width', '16'); expect(svg.querySelector('rect')!.getAttribute('style')).toContain('#1E2B7C'); });
test('paper variant uses paper', () => { render(<Logo variant="paper" />); expect(screen.getByRole('img', { name: 'Nib' }).querySelector('rect')!.getAttribute('style')).toContain('#FBFBF7'); });
```

- [ ] **Step 2: Run** `npx vitest run src/lib src/brand` → FAIL (modules missing).
- [ ] **Step 3:** Implement `theme.ts`, `utils.ts`, `Logo.tsx` (literal colours in the SVG: ink `#1E2B7C`, rules `rgba(255,255,255,.28)`, margin `#FF9B9B`, pen `#FFFFFF`; paper variant: paper `#FBFBF7`, rules `#A7C1E2`, margin `#E58C8C`, pen `#20389A`), `app.css` with the tokens, then add the shadcn components with `npx shadcn@latest add <names> --yes` (or hand-write them in the shadcn style if the CLI can't run) and check they use the mapped tokens. Main entry imports `@fontsource-variable/figtree` and `./styles/app.css` and calls `initTheme()`.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run typecheck` → 0; `npm run build` → OK.
- [ ] **Step 5: Commit** `feat: Nib design tokens, Figtree, logo, theme and shadcn components`

---

### Task 3: Documents in IndexedDB and first-run bootstrap

**Files:**
- Create: `src/store/db.ts`, `src/store/documents.ts`, `src/store/documents.test.ts`, `src/store/bootstrap.ts`, `src/store/bootstrap.test.ts`

**Interfaces:**
- Consumes: `Settings`, `EngineDoc` (Task 1); `cleanDoc`, `cleanSettings`, `loadSaved`, `sampleDoc` from `@/engine/doc.js`.
- Produces:
  - `interface DocRecord { id: string; title: string; createdAt: number; updatedAt: number; settings: Settings; doc: EngineDoc }`
  - `newId(): string` (`'d' + time36 + random36`)
  - `listDocs(): Promise<DocRecord[]>` newest `updatedAt` first
  - `getDoc(id: string): Promise<DocRecord | undefined>` (settings and doc passed through `cleanSettings`/`cleanDoc`)
  - `putDoc(rec: DocRecord): Promise<void>`
  - `createDoc(init?: { title?: string; settings?: Settings; doc?: EngineDoc }): Promise<DocRecord>` (defaults: title `'Untitled'`, settings `cleanSettings(null, false)`, doc `{ pageCount: 1, boxes: [], fileName: '' }`)
  - `duplicateDoc(id: string): Promise<DocRecord>` (title `"<title> (copy)"`, new id, deep copy)
  - `deleteDoc(id: string): Promise<void>`
  - `getPref<T>(key: string): Promise<T | undefined>`, `setPref(key: string, value: unknown): Promise<void>`
  - `storageAvailable(): Promise<boolean>`
  - `titleFromDoc(doc: EngineDoc): string`: the first `# ` heading in any block, markup stripped; else the first non-empty line cut to 60 characters; else `'Untitled'`
  - `bootstrapDocuments(): Promise<{ ok: boolean }>`: runs at most once per device: inside a single `readwrite` transaction on `prefs`, checks and sets `bootstrapped`; if `localStorage` holds `longhand.v2` or `longhand.v1`, creates one document from `loadSaved()` titled with `titleFromDoc`; otherwise creates the example from `sampleDoc(cleanSettings(null, false))` titled `'The Water Cycle'`. Returns `{ ok: false }` when IndexedDB can't be opened (no throw).

- [ ] **Step 1: Write the failing tests** (fresh `fake-indexeddb` per test via `new IDBFactory()` swap in `beforeEach`)

```ts
test('documents list newest first', async () => { const a = await createDoc({ title: 'A' }); const b = await createDoc({ title: 'B' }); await putDoc({ ...a, updatedAt: b.updatedAt + 10 }); expect((await listDocs()).map(d => d.title)).toEqual(['A', 'B']); });
test('duplicate copies deeply and names the copy', async () => { const a = await createDoc({ title: 'Notes' }); const c = await duplicateDoc(a.id); expect(c.title).toBe('Notes (copy)'); expect(c.id).not.toBe(a.id); c.doc.boxes.push({} as any); expect((await getDoc(a.id))!.doc.boxes).toHaveLength(0); });
test('delete removes it', async () => { const a = await createDoc(); await deleteDoc(a.id); expect(await getDoc(a.id)).toBeUndefined(); });
test('title comes from the first # heading', () => { expect(titleFromDoc({ pageCount: 1, fileName: '', boxes: [{ text: 'Name: A\n# The **Water** Cycle' } as any] })).toBe('The Water Cycle'); });
test('first run with Longhand work migrates it once', async () => {
  localStorage.setItem('longhand.v2', JSON.stringify({ s: { font: 'caveat' }, doc: { pageCount: 1, boxes: [{ id: 'b1', page: 0, x: 100, y: 100, w: 300, text: '# Old work' }] } }));
  await Promise.all([bootstrapDocuments(), bootstrapDocuments()]);
  await bootstrapDocuments();
  const docs = await listDocs();
  expect(docs).toHaveLength(1); expect(docs[0].title).toBe('Old work'); expect(docs[0].settings.font).toBe('caveat');
  expect(localStorage.getItem('longhand.v2')).not.toBeNull();
});
test('first run without Longhand work seeds the example', async () => { await bootstrapDocuments(); expect((await listDocs()).map(d => d.title)).toEqual(['The Water Cycle']); });
test('blocked IndexedDB reports ok:false instead of throwing', async () => { vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); }); await expect(bootstrapDocuments()).resolves.toEqual({ ok: false }); });
```

- [ ] **Step 2: Run** `npx vitest run src/store` → FAIL.
- [ ] **Step 3:** Implement `db.ts` (`openDB('nib', 1)` with `documents` keyPath `id` and `prefs`; memoised promise; resets the memo when opening fails), `documents.ts`, `bootstrap.ts`.
- [ ] **Step 4: Run** `npx vitest run src/store` → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `feat: documents saved in IndexedDB, Longhand migration and example document`

---

### Task 4: Undo history and the open-document store

**Files:**
- Create: `src/store/history.ts`, `src/store/history.test.ts`, `src/store/editor.ts`, `src/store/editor.test.ts`
- Modify: `src/store.js` becomes a re-export shim of `src/store/editor.ts` (same export names: `state`, `update`, `useStore`, `selectedBox`, `toast`, `snapshot`, `undoTo`) so today's components keep working until Task 6.

**Interfaces:**
- Consumes: `DocRecord`, `putDoc` (Task 3, mock it in tests with `vi.mock('@/store/documents')`); `use`, `clearMeasureCache` from `@/engine/core.js`; `cleanDoc`, `cleanSettings`.
- Produces:
  - `class History<T> { constructor(limit = 100); record(snapshot: T, key?: string, now?: number): void; undo(current: T): T | null; redo(current: T): T | null; clear(): void; readonly canUndo: boolean; readonly canRedo: boolean }`: `record` pushes onto the undo stack and clears redo, except when `key` equals the previous call's key and less than 1000 ms have passed (one snapshot per burst of typing); the oldest entries drop past `limit`.
  - `useEditor` (Zustand) with state `{ docId: string | null; title: string; S: Settings; doc: EngineDoc; version: number; layoutTick: number; fontTick: number; selectedId: string | null; scope: 'all' | 'box'; tab: string; saving: 'saved' | 'saving' | 'unsaved'; canUndo: boolean; canRedo: boolean; importOpen: boolean; importFile: File | null; focusEditor: number; pendingSelect: [number, number] | null; touchedId: string | null; scrollToPage: number | null }`
  - `openDocument(rec: DocRecord): void` (sets everything, clears history, calls engine `use`)
  - `update(fn: ((s: EditorState) => void) | null, opts?: { save?: boolean; layout?: 'now' | 'soon' | false; history?: string | false }): void`: when `save !== false` and `history !== false`, records a snapshot `{ S, doc }` (JSON) under key `opts.history ?? 'edit'` before running `fn`; then the same layout/version behaviour as today's `store.js`; saving is debounced 400 ms into `putDoc` with `updatedAt = Date.now()` and `title`.
  - `undo(): void`, `redo(): void` (restore through `cleanSettings`/`cleanDoc`, keep `selectedId` if that block still exists, bump layout, save)
  - `renameDocument(title: string): void` (trimmed; empty becomes `'Untitled'`; saved; recorded in history under `'rename'`)
  - `toast(msg: string, action?: { label: string; fn: () => void }): void` (calls `sonner`'s `toast`)
  - `snapshot(): string`, `undoTo(snap: string, sel: string | null)`: same contract as today, now also recorded in history
  - `selectedBox(): Box | null`, `useStore()` alias returning the state object (compat)

- [ ] **Step 1: Write the failing tests**

```ts
// history.test.ts
test('undo and redo walk snapshots', () => { const h = new History<number>(); h.record(1); h.record(2, undefined, 5000); expect(h.undo(3)).toBe(2); expect(h.undo(2)).toBe(1); expect(h.redo(1)).toBe(2); });
test('typing bursts coalesce', () => { const h = new History<string>(); h.record('a', 'type:b1', 0); h.record('ab', 'type:b1', 500); h.record('abc', 'type:b1', 2000); expect(h.undo('abcd')).toBe('abc'); expect(h.undo('abc')).toBe('a'); expect(h.canUndo).toBe(false); });
test('a new change clears redo', () => { const h = new History<number>(); h.record(1); h.undo(2); h.record(3); expect(h.canRedo).toBe(false); });
test('limit drops the oldest', () => { const h = new History<number>(3); [1, 2, 3, 4].forEach((n, i) => h.record(n, undefined, i * 2000)); expect(h.undo(5)).toBe(4); h.undo(4); h.undo(3); expect(h.canUndo).toBe(false); });
// editor.test.ts
test('an edit can be undone and redone', () => { openDocument(rec('A', 'hello')); update(s => { s.doc.boxes[0].text = 'changed'; }); undo(); expect(useEditor.getState().doc.boxes[0].text).toBe('hello'); redo(); expect(useEditor.getState().doc.boxes[0].text).toBe('changed'); });
test('opening another document clears undo', () => { openDocument(rec('A', 'a')); update(s => { s.doc.boxes[0].text = 'a2'; }); openDocument(rec('B', 'b')); undo(); expect(useEditor.getState().doc.boxes[0].text).toBe('b'); expect(useEditor.getState().canUndo).toBe(false); });
test('saves are debounced into the repository', async () => { vi.useFakeTimers(); openDocument(rec('A', 'a')); update(s => { s.doc.boxes[0].text = 'x'; }); update(s => { s.doc.boxes[0].text = 'y'; }); await vi.advanceTimersByTimeAsync(450); expect(putDoc).toHaveBeenCalledTimes(1); expect(vi.mocked(putDoc).mock.calls[0][0].doc.boxes[0].text).toBe('y'); });
test('renaming to nothing gives Untitled', () => { openDocument(rec('A', 'a')); renameDocument('   '); expect(useEditor.getState().title).toBe('Untitled'); });
```
(`rec(title, text)` builds a `DocRecord` with one block.)

- [ ] **Step 2: Run** `npx vitest run src/store/history.test.ts src/store/editor.test.ts` → FAIL.
- [ ] **Step 3:** Implement `history.ts`, `editor.ts`, and the shim in `src/store.js`. Initial store state before any document opens: `cleanSettings(null, false)` and an empty doc.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `feat: undo/redo history and the open-document store with IndexedDB saving`

---

### Task 5: Hash routes, top bar and Home

**Files:**
- Create: `src/app/route.ts`, `src/app/route.test.ts`, `src/app/App.tsx`, `src/shell/TopBar.tsx`, `src/shell/StageNav.tsx`, `src/shell/useUndoShortcuts.ts`, `src/features/home/HomePage.tsx`, `src/features/home/HomePage.test.tsx`
- Modify: `src/main.tsx` renders `src/app/App.tsx`

**Interfaces:**
- Consumes: Tasks 2–4 (`Logo`, `Wordmark`, ui components, documents API, `bootstrapDocuments`, `openDocument`, `undo`, `redo`, `renameDocument`, `useEditor`).
- Produces:
  - `type Stage = 'write' | 'outline' | 'style' | 'export'`; `type Route = { name: 'home' } | { name: 'doc'; id: string; stage: Stage }`
  - `parseHash(hash: string): Route` (`''`, `'#'`, `'#/'`, unknown → home; `#/d/<id>` → stage `write`; unknown stage → `write`); `formatRoute(r: Route): string`; `navigate(r: Route): void`; `useRoute(): Route`
  - `App`: shows a quiet "Opening Nib…" until `bootstrapDocuments` resolves; if `{ ok: false }`, opens an in-memory document from `sampleDoc` and shows a persistent notice "Nib can't save on this device right now. Your work stays until you close this tab."; for a doc route loads `getDoc(id)` → `openDocument`, or navigates Home and toasts "That document isn't on this device." when missing.
  - `TopBar` (props `{ route: Route }`): Home: Logo + Wordmark, "Import a file", "New document" (primary). Document: Logo (link `#/`), title input (`aria-label="Document name"`, renames on blur/Enter), save state ("Saving…" / "Saved"), `StageNav`, Undo and Redo icon buttons (disabled when unavailable; titles "Undo (Ctrl+Z)", "Redo (Ctrl+Shift+Z)"), "Export" primary button.
  - `StageNav`: buttons "1 Write", "2 Style", "3 Export"; `aria-current="step"` on the active stage (`outline` counts as Write).
  - `useUndoShortcuts()`: Ctrl/Cmd+Z → `undo`, Ctrl/Cmd+Shift+Z and Ctrl+Y → `redo`, ignored when focus is in an input, textarea, select or contenteditable.
  - `HomePage`: an import drop zone ("Import a PDF, Word or text file", "or drop it anywhere"), which creates a new document, opens it on Write and opens the import dialog with the file; "New document" creates `'Untitled'` and opens it; "Recent" lists documents (title, "N pages", relative time "Edited today/yesterday/<date>"), each opening on click; row menu: Rename (dialog with input), Duplicate, Delete (AlertDialog "Delete “<title>”? This can’t be undone." with Cancel / Delete); footer "Everything is saved on this device. Nothing is uploaded."

- [ ] **Step 1: Write the failing tests**

```ts
// route.test.ts
test.each([['', { name: 'home' }], ['#/', { name: 'home' }], ['#/nope', { name: 'home' }], ['#/d/abc', { name: 'doc', id: 'abc', stage: 'write' }], ['#/d/abc/style', { name: 'doc', id: 'abc', stage: 'style' }], ['#/d/abc/zzz', { name: 'doc', id: 'abc', stage: 'write' }]])('parse %s', (h, r) => expect(parseHash(h)).toEqual(r));
test('format round-trips', () => { const r = { name: 'doc', id: 'x1', stage: 'export' } as const; expect(parseHash(formatRoute(r))).toEqual(r); });
// HomePage.test.tsx (documents module mocked with an in-memory list)
test('lists recent documents and opens one', async () => { /* two docs → both titles visible; click first → location.hash === '#/d/<id>/write' */ });
test('delete asks first', async () => { /* open row menu → Delete → dialog text 'Delete “A”? This can’t be undone.' → Cancel keeps it; Delete removes it */ });
// App test (in route.test.ts or App.test.tsx)
test('a missing document goes home with a message', async () => { location.hash = '#/d/missing/write'; render(<App />); await waitFor(() => expect(location.hash).toBe('#/')); expect(await screen.findByText('That document isn’t on this device.')).toBeInTheDocument(); });
```

- [ ] **Step 2: Run** `npx vitest run src/app src/features/home` → FAIL.
- [ ] **Step 3:** Implement. While Task 6 is pending, the document route renders today's `App.jsx` body inside the new shell (`TopBar` above it), so the app keeps working.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run typecheck` → 0; dev server: Home shows "The Water Cycle", opening it shows pages.
- [ ] **Step 5: Commit** `feat: Home, hash routes and the Nib top bar`

---

### Task 6: Write, Style and Export stages carrying today's features

**Files:**
- Create: `src/features/doc/actions.ts` (port of `src/actions.js`, block wording in copy), `src/features/pages/PageView.tsx`, `src/features/pages/Sheet.tsx`, `src/features/pages/BoxFrame.tsx` (port of `Pages.jsx`, minus the export controls; prop `readOnly?: boolean` hides block tools and disables dragging), `src/features/write/WriteStage.tsx`, `src/features/write/WritePanel.tsx`, `src/features/style/StyleStage.tsx`, `src/features/style/StylePanel.tsx`, `src/features/export/ExportStage.tsx`, `src/features/export/ExportPanel.tsx`, `src/features/export/exporters.ts`, `src/features/import/ImportDialog.tsx`, `src/features/stages.test.tsx`, `scripts/smoke.mjs`
- Modify: `src/app/App.tsx` (document route renders the stage for `route.stage`; `outline` renders Write until Milestone 2), `src/styles/app.css` (sheet/canvas rules ported from `styles.css`)
- Delete: `src/App.jsx`, `src/main.jsx` (if still present), `src/store.js`, `src/actions.js`, `src/exporters.js`, `src/styles.css`, `src/components/`

**Interfaces:**
- Consumes: everything above; engine functions exactly as today's components call them.
- Produces:
  - `WriteStage`: panel (left, 400 px; full width under 860 px) with the editing label ("Block 2 on page 1"), "Add block", formatting toolbar, textarea editor and formatting help; `PageView` on the right.
  - `StyleStage`: `PageView` (middle) and `StylePanel` (right, 380 px) with today's controls restyled (scope switch labelled "Whole document" / "Only this block"; handwriting chips, pens, inks, realism presets and sliders, size and spacing, paper and toggles). The "As drawn" pen option and the "Fold crease" toggle are hidden.
  - `ExportStage`: `PageView readOnly` (middle) showing the scan look preview, `ExportPanel` (right): Look (As written, Scanned, Greyscale scan, Black and white), Camera tilt switch, File name with `.pdf`, "Download PDF" (primary), "Download page N as PNG" (page select + button).
  - `savePdf(): Promise<string>` and `savePng(i: number): Promise<string>` (moved unchanged into `exporters.ts`).
  - Toasts through `sonner` (`<Toaster position="bottom-center" />` in `App`).
  - Window-wide file drop on a document opens `ImportDialog`; on Home it creates a document first.

- [ ] **Step 1: Write the failing test** `src/features/stages.test.tsx`: render `App` at `#/d/<id>/write`, `#/d/<id>/style` and `#/d/<id>/export` for a seeded document and assert each stage's landmark: the editor textarea with label "Block contents"; the "Whole document" button; the "Download PDF" button.
- [ ] **Step 2: Run** `npx vitest run src/features/stages.test.tsx` → FAIL.
- [ ] **Step 3:** Port the components and wire the stages. Keep every engine call and behaviour (drag, resize, keyboard moves, separate, delete part, scan preview, font loading, drop-to-import).
- [ ] **Step 4: Write** `scripts/smoke.mjs` (uses `require('playwright')`/`import('playwright')`, starts `vite preview --port 4317`, waits for it): opens `/`, sees "The Water Cycle", opens it, waits until the first page canvas has a non-white pixel, switches to Style and clicks the "Gel pen" option, switches to Export, clicks "Download PDF" and expects a download whose name ends `.pdf`, then presses Ctrl+Z on the page and expects no error; exits non-zero on any failure or console error.
- [ ] **Step 5: Run** `npm test` → PASS, `npm run typecheck` → 0, `npm run build` → OK, `npm run smoke` → "smoke ok".
- [ ] **Step 6: Commit** `feat: Write, Style and Export stages in the new shell; remove the old UI`

---

### Task 7: Nib everywhere, merge and deploy

**Files:**
- Modify: `README.md` (Nib, new URL, how the code is laid out now, credits kept), `FONTS.md` (product name), `package.json` (`"name": "nib"`, description), `.github/workflows/deploy.yml` (Node 22; add `npm test` before build).

- [ ] **Step 1:** `grep -rn "Longhand\|longhand" src index.html README.md package.json` → only the migration code and comments that name the old storage keys remain.
- [ ] **Step 2:** `npm test && npm run typecheck && npm run build && npm run smoke` → all pass.
- [ ] **Step 3: Commit** `docs: Nib README and deploy checks`
- [ ] **Step 4: Merge and push** `git checkout main && git merge --no-ff nib/m1-foundation -m "Milestone 1: Nib foundation" && git push -u origin main nib/m1-foundation`
- [ ] **Step 5: Verify** `gh run list --repo nvmaditya/nib-engine --limit 1` shows the Pages deploy succeeded, and `curl -sI https://nvmaditya.github.io/nib-engine/` returns 200.

---

## Roadmap after Milestone 1

Each milestone gets its own detailed plan (`docs/superpowers/plans/2026-11-06-nib-m<N>-*.md`) written when it starts, against the code as it stands then. Branch per milestone: `nib/m2-write`, `nib/m3-style`, `nib/m4-export`, `nib/m5-home-import`, `nib/m6-polish`.

| Milestone | Delivers (spec section) | Exit check |
|---|---|---|
| 2 Write | Block model in `doc.js` (`kind`, `name`, `color`, `fields`, `from` kept by `cleanDoc`); TipTap editor with lossless markup conversion; Pages and Outline views; layout rules 1–4 in `computeLayout` (push down at layout time); split, join back, add to the end of, remove part, merge page, page drag, block drag between pages; click a word to place the caret (§4) | Unit tests for markup round-trip and every layout rule; smoke drags a page and joins a split block |
| 3 Style | Style panel (§5): scope switch, looks and saved looks, handwriting picker with favourites and preview text, uploaded fonts in IndexedDB, pens and inks, paper and effects (no fold crease, no As drawn pen), How natural with Fine-tune, size and spacing, page-count notice and Fit back | Fit back test on a document that grows from 2 to 3 pages; uploaded font survives reload |
| 4 Export | Export stage (§6): PDF/PNG/JPG, ZIP, page choice, looks, tilt (off by default), quality, file name, size estimate, Share; metadata-free output | Tests read the produced PDF and image bytes and find no metadata fields |
| 5 Home, templates, Import | Import hero, rich import preview with look and optional Header, six templates, Recent thumbnails (§3) | Import of a .docx produces one flowing main block; each template opens with its look |
| 6 Polish | PWA install and offline, three first-visit tips, shortcut sheet, Ctrl+K palette, theme switch, phone layouts (§7) | Lighthouse PWA installable; offline reload works; phone smoke at 390 px |
