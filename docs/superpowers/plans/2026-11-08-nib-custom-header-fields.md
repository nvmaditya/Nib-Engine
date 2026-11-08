# Nib Custom Header Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Header block's fields become an ordered list of 1–12 fields that people add, rename, remove and reorder, with one undo step each, edited by one field editor on the typed page, in Outline and in Import. New headers start from the last header changed on the device. Converted documents draw exactly the same pages.

**Architecture:** The engine's `doc.js` keeps a header's text derived from its `fields`, now a `HeaderField[]`. `cleanDoc` converts the fixed-key object of schema ≤ 3 into that list in the old order, so the text stays byte-identical, and `DOC_SCHEMA` becomes 4. Pure list operations live in `src/features/doc/headerFields.ts`. `model.ts` applies them to a header box and keeps its text derived, and `actions.ts` makes each one an undo step. `src/features/doc/headerDefault.ts` remembers the device's default header in `prefs` (`header-default`). It watches the open document's header through the editor store and keeps a copy in memory, so new headers are made synchronously. `FieldEditor` (in `src/features/write/HeaderFields.tsx`) is presentational: it gets a list and a `FieldOps` object. The typed page and Outline bind it to the store, and Import binds it to its own options.

**Tech Stack:** React 19, TypeScript (strict), Vite 8, Tailwind v4, shadcn-style components hand-written on `radix-ui` 1.8.1 in `src/components/ui`, `lucide-react`, `sonner` through `toast()`, Zustand, `idb`, Vitest 5 + Testing Library + jsdom + fake-indexeddb. The machine's Playwright (Chromium at `/opt/pw-browsers`) runs `npm run test:browser` and `npm run smoke`. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-11-08-nib-custom-header-fields-design.md` (approved: approach A, full control, remembered default). Its Interface copy table is binding and is repeated below.

**Branch:** `nib/custom-headers`, cut from `main` at `e8e0610` (Milestones 1–6 merged). Tasks run in worktrees off the branch. **The controller merges each task, and at the end merges the branch into `main` and pushes. No task merges, pushes or deploys.**

## Global Constraints

- Product name **Nib**. Copy is plain sentence case, with curly quotes and apostrophes (“ ” ’ and the single-character …). Every new string comes from the Interface copy table below.
- **Realism is non-negotiable.** In `src/engine`, only `doc.js`, `doc.d.ts`, `types.ts` and `doc.test.ts` change, and only the header helpers in them (`HEADER_FIELDS`, `HEADER_LIMITS`, `headerLabel`, `headerText`, `cleanFields`, `migrateDoc`'s use of them, `cleanDoc`'s header line, `sampleDoc`'s header).
  - No drawing, layout or realism code changes.
  - `src/engine/__snapshots__/layout.test.ts.snap` is unchanged.
  - Converted documents give byte-identical header text and identical pages (Task 1's tests).
- **Engine JS stays behind `.d.ts`.** Every new `doc.js` export is declared in `doc.d.ts`.
- **Dependencies:** none added. `package.json`, `package-lock.json` and `npm ls --depth=0` are unchanged.
- **Storage.**
  - `DOC_SCHEMA` goes from 3 to 4.
  - IndexedDB `nib` stays at version 1, and `src/store/db.ts` is unchanged.
  - One new `prefs` key, `header-default`. No new `localStorage` keys.
- TypeScript is `strict`. App code type-checks under `tsconfig.app.json` (no Node types). Tests and `src/test/**` type-check under `tsconfig.test.json`.
- Colour tokens and type follow the M6 rules:
  - Tailwind classes: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-muted` (grey text, never `bg-muted`), `bg-primary`, `text-primary`, `bg-primary-soft`, `text-danger`.
  - UI parts come from `src/components/ui`, hand-written on `radix-ui` (the shadcn CLI is blocked).
  - Icons are `lucide-react` (`Plus`, `GripVertical`, and `MoreHorizontal` through `OptionsButton`).
  - Messages go through `toast()` (`src/store/editor.ts`).
  - Figtree weights: 400 for text, 500 for controls.
  - Every new control has `focus-visible:ring-2 focus-visible:ring-ring/50`.
- `wide:` (860 px) is the only breakpoint. The field editor uses `wide:` classes, never `useWide()`.
- **Undo.** Every document change goes through `update(fn, { history })`, and a change that changes nothing records nothing.
  - Add, rename, remove and each move are one step each.
  - Consecutive typing in one field's value is one step (key `field:{boxId}:{fieldId}`).
  - Editing Import's header options is not a document change (no step) until Write it out.
- **Keys.** No new shortcut: `src/shell/shortcuts.ts` is unchanged. The grip is pointer-only, and the keyboard path for reordering is the row menu's Move up / Move down. Enter and Esc in the field-name input belong to that input, as they do in the block name field.
- **Tests.**
  - Write tests first, and keep the output clean. Run each task's files with `npx vitest run <files> --reporter=default`: no `act(` warning, no `Warning:` line, and no React, Radix or jsdom console error.
  - Tests that draw real pixels or run two builds are `*.browser.test.ts`. `npm run test:browser` runs them (`npm run smoke` calls it), never `npm test`, because CI has no Playwright.
  - Every commit leaves `npm test && npm run typecheck && npm run build && npm run smoke` passing.
- **Commit messages carry no `Co-Authored-By` or `Claude-Session` lines.** The repository config sets the author and committer.

## Interface copy

Verbatim from the spec. `<label>` is the field's current label.

| Where | Text |
|---|---|
| Add button | `Add field` (with a + icon) |
| Add button, at the limit (tooltip) | `A header holds up to 12 fields.` |
| Add menu items | `Name`, `Class`, `Section`, `Subject`, `Roll no.`, `Registration no.`, `Date`, `Teacher`, `School`, separator, `Custom field…` |
| A custom field's starting label | `Field` (selected, ready to type) |
| Label, as a button (accessible name) | `Rename “<label>”` |
| Label input (accessible name) | `Field name` |
| Value input (accessible name) | `<label>` |
| Row menu trigger (accessible name) | `More for “<label>”` |
| Row menu | `Rename`, `Move up`, `Move down`, `Remove` |
| Last field's Remove (tooltip) | `A header needs at least one field.` |
| Grip (accessible name) | `Move “<label>”` |
| Message after Remove | `Removed “<label>”.` with `Undo` |

Existing copy this plan touches:
- Outline's header hint drops its second sentence (Add Subject or Roll no. from ⋯ no longer exists) and becomes `New documents fill in today’s date.`
- `Add a header block`, `At the top right of page 1.` and M1's `This document was saved by a newer version of Nib. Reload the page to keep editing.` (with `Reload`) stay as they are.

## Accessibility (spec)

| Rule | Where it is built | Test |
|---|---|---|
| Every control reachable by keyboard, with a visible focus ring | Task 3 | `Tab goes name, value, ⋯ along each row, then Add field` |
| Reorder without a pointer: Move up / Move down, off at the ends | Task 3 | `the row menu…`, `Move up and Move down keep the focus…` |
| After Remove: the next row's value, or the previous row's if it was last | Task 3 | `Remove: the focus goes to the next row’s value…` |
| After Add: the new value. After Custom field…: the new name, `Field` selected | Task 3 | `Adding a common field focuses its value…`, `Custom field… adds Field…` |
| After a move: the moved row's ⋯ | Task 3 | `Move up and Move down keep the focus on the moved row’s ⋯` |
| After rename (Enter or Esc): the label button | Task 3 | `rename: … Enter keeps it…`, `Esc puts the old name back…` |
| Phones: 44 px touch targets for the ⋯ and the grip | Task 3 (classes), Task 5 (measured at 390 px) | `on phones the ⋯ and the grip are 44 px`, smoke step 2 |

## Two tabs, two versions

- **A tab on the previous version (schema 3) never writes a schema-4 record.** Its `rewrite` refuses with `NewerDocumentError`, and it says M1's message with **Reload**, which applies the waiting version (M6 `reloadAction`). This is shipped code. Task 1 pins it by running e8e0610's own `documents.ts` and `doc.js` against a record this version wrote (`versions.browser.test.ts`).
- Until it reloads, that tab shows a schema-4 header as Name, Class and Date with no values, because its `cleanFields` can't read a list. Its saves are refused, so the record stays as it is. Accepted: shipped code can't change, and Reload fixes it.
- That tab's Home **Duplicate** of a schema-4 document makes a new schema-3 copy whose header is blank Name, Class and Date (its `createDoc` writes a new record, so no refusal applies). The original is never touched. Accepted for the same reason (found in Task 1's review).
- **This version reads every older record.**
  - `cleanDoc` turns an object-shaped `fields` into the list: old order, only the keys present, ids `name`/`class`/`subject`/`roll`/`date`, and `today: true` on `date`. The header text comes out the same.
  - Its first save writes schema 4.
  - Home's Rename stamps 4 on a schema ≥ 2 record without cleaning it (M5 rule, unchanged). Reading such a record still converts.
- Two tabs on this version: QA round 1's revision rules are unchanged.
- The remembered default is shared by all tabs through `prefs`. Each tab keeps a copy, read at start and again when the tab is shown or its window is focused, and written by that tab's own changes. The last write wins.
- Recent's kept pictures are drawn once more per document after the upgrade, because a picture's signature includes the document and the fields are now a list. Accepted.

## Rulings on the spec

1. **`migrateDoc` (schema 1)** passes the header it finds through `cleanFields`, so its result is already a list. `cleanDoc` still accepts both shapes wherever they come from: records, undo snapshots, another tab's write.
2. **Label escaping.** A label is escaped with `escapeValue`, and a label starting with a line marker also gets a backslash before it (`#`, `>`, `-`, `+`, and the `.` or `)` after a leading number or letter). A label begins its line, so `escapeValue` alone would let `# Notes` or `1. Part` become a heading or a list, and the spec says markup shows as typed. Old labels have no such start, so converted text is unchanged.
3. **Tooltips** are a `title` on the disabled control, with pointer events kept so it shows on hover. This is Export's Download pattern. The unused Radix tooltip stays unused.
4. **The grip is pointer-only** (`role="img"`, like Outline's page grip). Keyboard reordering is Move up / Move down, so no shortcut is added.
5. **"Fields the header does not already have"** is matched by label, trimmed, ignoring case. **Add menu → Date** adds a date-marked field with today's date as its value.
6. **Custom field…** is two steps: the add (label `Field`), then the rename.
7. **"Read when a new header is made"** reads the tab's copy of the default in memory, so Add → Header, the templates and Import stay synchronous.
8. **"A header change in an open document"** is any change to the open document's header while the same document stays open. That covers typing, the four changes, Undo and Redo, a message's Undo, an import that replaces the header, and another tab's version shown in place. Opening or closing a document is not a change.
9. **Typed page:** `Add field` sits just under the header's fields, the way the name tag sits above the block, laid over the next line. It shows while the editor has the focus, the pointer, or an open menu, or while the header is selected. The typed lines stay one to a ruled line.
10. **Import:** every new header starts from the default: a new document's header, and an open document without one. An open document with a header starts from a copy of its fields.
11. **New headers' fields get ids `f1`…`fN`** (unique within the header) so a template's picture keeps its signature from one visit to Home to the next. Fields added later get `uid()`, as the spec says.

## Review Focus

1. **A label that starts like markup** (`# Notes`, `1. Part`, `- Name`, `> Quote`, `\newpage`). Expected: it is written on the page exactly as typed. Test: Task 1, `a label that starts like a heading, a list, a note or a page break is written as typed`.
2. **The previous version and this one open on the same device.** Expected: the old tab never overwrites a schema-4 record and says to reload. This version reads the old tab's record with the same header text and writes it as 4. Tests: Task 1, `versions.browser.test.ts` (three tests).
3. **A rename left open when its row goes**: another block pressed in Outline, the stage hidden, or Undo taking the field away. Expected: what was typed is kept if the field is still there, and nothing breaks if it isn't. Test: Task 3, `a name being typed is kept when the editor goes, and nothing happens when its field went first`.
4. **Esc in a field's name inside the Import dialog.** Expected: the old name comes back and the dialog stays open. Test: Task 4, `Esc in a field’s name puts the old name back and leaves the dialog open`.
5. **On a phone's typed page there is no hover.** Expected: `Add field` can be found once the header is selected or a field is tapped, and it stays on screen. Tests: Task 4, `the typed header’s Add field shows while the header is selected or has the focus`, and Task 5's 390 px smoke step.

## Order and parallelism

A task starts once the tasks in its Needs column are merged. Tasks in a wave touch disjoint files.

| Wave | Tasks | Needs |
|---|---|---|
| 1 | **1** Header fields as a list, end to end (engine, schema 4, every user) | — |
| 2 | **2** Changing a header's fields, and the remembered default ∥ **3** The field editor | 1 |
| 3 | **4** The editor everywhere: typed page, Outline, Import | 2, 3 |
| 4 | **5** Smoke, README and user guide | 4 |

## File map

```
src/engine/doc.js, doc.d.ts, types.ts, doc.test.ts                                              (Task 1)
src/store/documents.ts, documents.test.ts; src/store/versions.browser.test.ts (new)             (Task 1)
src/test/docs.ts (fieldsOf)                                                                       (Task 1)
src/features/doc/headerFields.ts, headerFields.test.ts (new)       (Task 1: today, fieldValue, fieldsFrom, listSetValue; Task 2: listAdd/Rename/Remove/Move)
src/features/doc/headerDefault.ts (new)                             (Task 1: defaultHeaderFields; Task 2: the memory), headerDefault.test.ts (Task 2)
src/features/doc/model.ts, actions.ts (+ tests)                     (Task 1: the list; Task 2: the four changes)
src/features/doc/build.ts, build.test.ts                                                          (Task 1)
src/features/write/HeaderFields.tsx                                 (Task 1: list rows; Task 3: FieldEditor; Task 4: HeaderFields on FieldEditor)
src/features/write/HeaderFields.test.tsx (new)                                                    (Task 3)
src/features/write/BlockMenu.tsx, Inspector.tsx, OutlineList.tsx (snippet)                        (Task 1)
src/features/write/menus.test.tsx, OutlineView.test.tsx, PagesView.test.tsx                       (Task 1 fixtures; Task 4 tests)
src/features/pages/BoxFrame.test.tsx (fixture)                                                    (Task 1)
src/features/write/dnd.ts, dnd.test.ts; OutlineList.tsx (dragGhost import)                        (Task 3)
src/features/import/options.ts                                                                    (Task 1)
src/features/import/ImportOptions.tsx, ImportOptions.test.tsx, ImportDialog.test.tsx              (Task 1: the list; Task 4: the editor)
src/features/import/ImportDialog.tsx (Esc)                                                        (Task 4)
src/features/home/templates.ts                                                                    (Task 1)
src/features/home/templates.test.tsx, TemplateGrid.tsx, TemplateGrid.test.tsx; src/app/App.tsx    (Task 2)
scripts/smoke.mjs                                                   (Task 1: two field reads; Task 5: two steps)
README.md, docs/USER_GUIDE.md, docs/DEVELOPMENT.md                                                (Task 5)
```

---

### Task 1: Header fields as a list, end to end

The data shape changes everywhere at once, so every commit type-checks. The engine converts old headers. `DOC_SCHEMA` becomes 4. Every user of `fields` reads and writes the list, with today's controls. The header ⋯ menu's Add/Remove Subject and Roll no. items go now: Task 4's editor replaces them, and the branch reaches `main` only after Task 5.

**Files:**
- Modify:
  - `src/engine/doc.js`, `src/engine/doc.d.ts`, `src/engine/types.ts`, `src/engine/doc.test.ts`;
  - `src/store/documents.ts` (`DOC_SCHEMA`, the `schema` doc comment), `src/store/documents.test.ts`;
  - `src/test/docs.ts`;
  - `src/features/doc/model.ts`, `model.test.ts`, `actions.ts`, `actions.test.ts`, `build.ts`, `build.test.ts`;
  - `src/features/write/HeaderFields.tsx`, `BlockMenu.tsx`, `Inspector.tsx`, `OutlineList.tsx` (`partSnippet` only);
  - `src/features/import/options.ts`, `ImportOptions.tsx`;
  - `src/features/home/templates.ts`;
  - `scripts/smoke.mjs` (two field reads only);
  - fixtures and expectations in `menus.test.tsx`, `OutlineView.test.tsx`, `PagesView.test.tsx`, `BoxFrame.test.tsx`, `ImportOptions.test.tsx`, `ImportDialog.test.tsx`.
- Create: `src/features/doc/headerFields.ts`, `headerFields.test.ts`, `src/features/doc/headerDefault.ts`, `src/store/versions.browser.test.ts`.

**Interfaces:**
- Consumes: `escapeValue`, `HEADER_LINE`, `uid` (doc.js internals); `parseLine` and `parseInline` (core.js, tests only).
- Produces:
  - `types.ts`:
    - `export interface HeaderField { id: string; label: string; value: string; today?: true }`;
    - `Box.fields?: HeaderField[]`;
    - `HeaderKey` stays, documented as "the fixed fields' keys before schema 4 (converting only)";
    - `HeaderFields` (the object type) is deleted.
  - `doc.js` / `doc.d.ts`:
    - `HEADER_FIELDS: [HeaderKey, string][]` is unchanged (it is used to convert).
    - `HEADER_LIMITS: { readonly fields: 12; readonly label: 30; readonly value: 80 }`.
    - `headerLabel(raw: unknown): string`: one line (each run of `\r`/`\n` becomes a space), trimmed, cut to 30 and trimmed again. Empty, or not a string, gives `Field`.
    - `headerText(fields: HeaderField[]): string`: `Label: value`, or `Label:` when the value is empty, one line per field, joined by `\n`. The value goes through `escapeValue`. The label goes through `escapeValue` plus the line-start escape (Ruling 2).
    - `cleanFields(f: unknown): HeaderField[]`:
      - **A list**: object entries only; at most 12; `label` through `headerLabel`; `value` a string made one line, trimmed and cut to 80 (exactly today's value rule), or `''`; `today: true` only when it was `true`. An `id` that is missing, not a string, empty or already used becomes the first of `f{n}`, `f{n+1}`… not taken, where `n` is the entry's 1-based place. Keys are always in the order `{ id, label, value, today? }`.
      - **An object** (schema ≤ 3): the `HEADER_FIELDS` order, string values only (same value rule), ids the keys, `today: true` on `date`.
      - **Anything else, or nothing left**: the three blanks `name`/`Name`, `class`/`Class`, `date`/`Date` (`today`), all with empty values.
    - `migrateDoc` and `cleanDoc` use `cleanFields`. `sampleDoc`'s header is the list `name` `Aarav Mehta`, `class` `8-B`, `date` `29 October 2026` (`today`). Its text is still `SAMPLE_HEAD`.
  - `documents.ts`: `DOC_SCHEMA = 4`. The `schema` comment adds "4 since a header's fields are a list".
  - `headerFields.ts` (pure, imports only the engine):
    - `today` and `fieldValue` move here from `model.ts`, unchanged. `model.ts` re-exports both, so existing imports keep working.
    - `interface RememberedField { label: string; value: string; today?: true }`.
    - `newFieldId(list: HeaderField[]): string` gives `uid()`s until one isn't in `list`.
    - `fieldsFrom(src: RememberedField[] | null, now: Date = new Date()): HeaderField[]`. With `null` it gives the built-in Name, Class and Date (`today`). Ids are `f1`…`fN` (Ruling 11). A `today` field's value is `today(now)`, and other values are copied.
    - `listSetValue(list: HeaderField[], id: string, value: string): HeaderField[] | null`. The value goes through `fieldValue`. It returns null for an unknown id or the same value.
  - `headerDefault.ts`: `defaultHeaderFields(now: Date = new Date()): HeaderField[]` returns `fieldsFrom(null, now)`. Task 2 puts the remembered default behind it, and its callers don't change.
  - `model.ts`:
    - `setHeaderField(box: Box, fieldId: string, value: string): void`, through `listSetValue`, then `box.text = headerText(box.fields)`.
    - `showHeaderField` is deleted.
    - `newBlock(S, doc, kind, page, fields?: HeaderField[])`: a header takes `fields`, or `cleanFields(null)` when none is given.
  - `actions.ts`:
    - `setField(boxId: string, fieldId: string, value: string): void`, with history key `field:{boxId}:{fieldId}` and layout `'soon'`.
    - `showField` is deleted.
    - `addBlock('header', …)` passes `defaultHeaderFields()`.
  - `build.ts`:
    - `ImportPlace.header: HeaderField[] | null`.
    - `oneLine(fields: HeaderField[]): HeaderField[]` takes the first 12, each label through `headerLabel` and each value through `fieldValue`, and keeps ids and marks.
    - `headerBlock(doc, S, fields: HeaderField[])`, `newDocument(S, text, header: HeaderField[] | null)`, and `replaced`'s kept header all use it.
  - `options.ts`: `ImportOptionsValue.header: HeaderField[] | null`. An open document's header is copied with `structuredClone`.
  - `src/test/docs.ts`: `fieldsOf(o: Partial<Record<HeaderKey, string>>): HeaderField[]` returns `cleanFields(o)`, a schema-3 header as it converts.
  - Call sites, each a few lines:
    - `HeaderFields.tsx` makes rows from the list (keyed by `id`) and calls `setField(boxId, f.id, …)`. The labels look as they do today.
    - `BlockMenu.tsx` loses `OPTIONAL`, its four items and the `HEADER_FIELDS`/`showField` imports.
    - `Inspector.tsx`'s hint becomes `New documents fill in today’s date.`
    - `OutlineList.tsx`'s header snippet is `b.fields?.map(f => f.value.trim()).filter(Boolean).join(' · ') ?? ''`.
    - `ImportOptions.tsx` makes rows from `value.header`, keyed by id, with a `Label htmlFor` and an `Input`. Ticking the box with nothing typed gives `defaultHeaderFields()`.
    - `templates.ts`: `tpl.header ? defaultHeaderFields(now) : null`.
    - `smoke.mjs`: `header.fields.find(f => f.today)?.value` and `rec.doc.boxes[0].fields.find(f => f.label === 'Name')?.value`.

- [ ] **Step 1: Write the failing engine tests** (`src/engine/doc.test.ts`). The previous version's rule is copied into the test as the reference:

```ts
// e8e0610's header text, verbatim: what every earlier Nib wrote for an object-shaped header.
const ESC = (v: string) => v.replace(/[\\*_~=`\[]/g, '\\$&');
function oldText(f: Record<string, unknown> | undefined): string {
  const o: Record<string, string> = {};
  if (f && typeof f === 'object') for (const [k] of HEADER_FIELDS) if (typeof f[k] === 'string') o[k] = (f[k] as string).replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  const g = Object.keys(o).length ? o : { name: '', class: '', date: '' };
  return HEADER_FIELDS.filter(([k]) => typeof g[k] === 'string').map(([k, l]) => (g[k] ? `${l}: ${ESC(g[k])}` : `${l}:`)).join('\n');
}
const head = (fields: unknown) => cleanDoc({ boxes: [{ id: 'h', text: 'stale', kind: 'header', fields }] })!.boxes[0];
/** Every subset of the five keys, with values and with empty values, and the odd ones. */
const OLD_SHAPES: (Record<string, unknown> | undefined)[] = [
  ...Array.from({ length: 64 }, (_, n) => Object.fromEntries(HEADER_FIELDS.filter((_, i) => n & (1 << i)).map(([k]) => [k, n & 32 ? '' : `v ${k} 2*3_a`]))),
  { name: 'Aarav Mehta', class: '8-B', date: '29 October 2026', bogus: 'x' }, { name: '2*3*4', roll: 'a_b~~c`d=e\\f' },
  { name: ' Asha\r\nK ', class: 'x'.repeat(90), subject: 5 }, undefined,
];

test('every old shape converts to the text the previous version wrote', () => {
  for (const f of OLD_SHAPES) expect(head(f).text).toBe(oldText(f));
});
test('an old header’s fields become a list in the old order: ids are the keys, and Date is marked as today', () => {
  expect(head({ date: 'd', subject: 's', name: 'n', class: 'c', roll: 'r' }).fields).toEqual([
    { id: 'name', label: 'Name', value: 'n' }, { id: 'class', label: 'Class', value: 'c' }, { id: 'subject', label: 'Subject', value: 's' },
    { id: 'roll', label: 'Roll no.', value: 'r' }, { id: 'date', label: 'Date', value: 'd', today: true }]);
  for (const f of [undefined, {}, [], 'junk', { bogus: 'x' }]) expect(head(f).fields).toEqual([
    { id: 'name', label: 'Name', value: '' }, { id: 'class', label: 'Class', value: '' }, { id: 'date', label: 'Date', value: '', today: true }]);
});
test('converted documents lay out exactly as before', () => {
  const S = cleanSettings(null, false), main = { id: 'm', page: 0, x: 112, y: 178, w: 630, text: 'Hello there', style: {}, shuffle: 0, frames: {}, kind: 'text', name: 'Main text', color: 1 };
  const sig = (d: EngineDoc) => { use(S, d); return computeLayout().segs.map(s => [s.box.id, s.page, s.idx, s.x, s.w, s.top, s.rows.length, segSig(s)]); };
  for (const f of OLD_SHAPES) {
    const converted = cleanDoc({ boxes: [{ id: 'h', kind: 'header', name: 'Header', page: 0, x: 446, y: 76, w: 320, text: '', fields: f }, main] })!;
    const before = structuredClone(converted);
    Object.assign(before.boxes[0], { fields: f, text: oldText(f) }); // the box as the previous version had it and drew it
    expect(sig(converted)).toEqual(sig(before));
  }
});
test('a list is cleaned: one-line labels of at most 30 (empty is Field), one-line values of at most 80, at most 12, unique ids, today only when true', () => {
  const f = head([
    { id: 'a', label: '  Section\nA ', value: ' 8\r\nB ' }, { id: 'a', label: '', value: 5 }, { label: 'L'.repeat(40) }, 'junk', null,
    { id: 'd', label: 'Due', value: '1 May', today: 'yes' }, { id: 'e', label: 'Date', value: '', today: true },
    ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, label: 'X' + i, value: '' })),
  ]).fields!;
  expect(f).toHaveLength(12);
  expect(f.slice(0, 5)).toEqual([{ id: 'a', label: 'Section A', value: '8 B' }, { id: 'f2', label: 'Field', value: '' }, { id: 'f3', label: 'L'.repeat(30), value: '' },
    { id: 'd', label: 'Due', value: '1 May' }, { id: 'e', label: 'Date', value: '', today: true }]);
});
test('a cleaned list is kept as it is', () => { const d = cleanDoc({ boxes: [{ text: '', kind: 'header', fields: [{ id: 'q', label: 'Teacher', value: 'Ms Rao' }, { id: 'w', label: 'Due', value: '', today: true }] }] })!; expect(cleanDoc(JSON.parse(JSON.stringify(d)))).toEqual(d); expect(d.boxes[0].text).toBe('Teacher: Ms Rao\nDue:'); });
test('a label that starts like a heading, a list, a note or a page break is written as typed', () => {
  for (const label of ['# Notes', '## Part', '- Name', '+ x', '1. Roll', '12) Part', 'a) Part', '> Quote', '2*3', 'a_b_', '\\newpage', '---']) {
    const L = parseLine(headerText([{ id: 'x', label, value: '' }]));
    expect([label, L.kind]).toEqual([label, 'text']);
    expect(parseInline(L.content).map(p => p.text).join('')).toBe(label + ':');
  }
  expect(headerText([{ id: 'x', label: 'Roll no.', value: '1. a' }])).toBe('Roll no.: 1. a');
});
```
  - Update these existing tests:
    - `a header’s text is written from its fields`: the `fields` expectation becomes the three-entry list.
    - `a header without fields gets the three blanks`: the blanks list.
    - `header fields keep their order…` and `header values are escaped…`: call `headerText` with lists, for the same strings.
    - `the example has a Header and Main text`: also `fields` toEqual the example list.
    - `a schema-1 document gets its Header and Main text` and `an old header keeps the text it showed`: `fields` toEqual lists (`[{ id: 'name', label: 'Name', value: 'a*b' }, { id: 'class', label: 'Class', value: '2*3' }]`).
- [ ] **Step 2: Write the failing store, helper and fixture tests.**
  - `documents.test.ts`:
    - `documents are written with schema 4` (the 3s become 4).
    - `a schema-3 record’s header is read as a list in the old order, and written back as schema 4`. Put `{ ...a, schema: 3, doc: { …, boxes: [{ id: 'h', kind: 'header', text: 'x', fields: { date: '1 May 2026', roll: '12', name: 'Riya', class: '8' } }] } }`. `getDoc` gives fields `[name Riya, class 8, roll 12, date 1 May 2026 (today)]` and text `Name: Riya\nClass: 8\nRoll no.: 12\nDate: 1 May 2026`. `putDoc` of it stores schema 4.
    - `Home’s rename stamps 4 on a schema-3 record without cleaning it, and its header still reads as a list`. The stored `fields` is still the object, and `getDoc` gives the list.
  - `headerFields.test.ts`:
    - `fieldsFrom: the built-in Name, Class and today’s Date, or a remembered list, with date-marked values as today`. `fieldsFrom(null, new Date(2026, 10, 7))` equals `[{ id: 'f1', label: 'Name', value: '' }, { id: 'f2', label: 'Class', value: '' }, { id: 'f3', label: 'Date', value: '7 November 2026', today: true }]`. A remembered `[{ label: 'Name', value: 'Asha' }, { label: 'Due', value: '1 May 2026', today: true }]` gives `Asha` and `7 November 2026`.
    - `a value is one line of at most 80, spaces kept as typed; the same value or an unknown field changes nothing`.
    - `a new field’s id is never one the header has`.
  - The `today` test moves from `model.test.ts`, unchanged.
- [ ] **Step 3: Write the failing browser test** (`src/store/versions.browser.test.ts`). Build its harness as `render.browser.test.ts` builds its own: Vite `build` with `write: false`, Playwright's Chromium, and pages served from `http://nib.test/` with `public/` routed.
  - **Two probes** from one `PROBE_CODE`:
    - it imports `cleanDoc`, `migrateDoc`, `cleanSettings` (`@/engine/doc.js`), `use`, `computeLayout`, `exportPage`, `loadFont` (`@/engine/core.js`), and `DOC_SCHEMA`, `createDoc`, `getDoc`, `putDoc`, `renameDoc` (`@/store/documents`), and sets `window.probe`;
    - the **old** probe's build has a plugin whose `load(id)` returns `git show e8e0610:src/engine/doc.js` for `<root>/src/engine/doc.js`, and `git show e8e0610:src/store/documents.ts` for `<root>/src/store/documents.ts` (compare `id.split('?')[0]`);
    - if `git show` fails, throw `needs commit e8e0610 (the last Nib with fixed header fields) in this clone`.
  - **One browser context**, two pages (`old`, `new`), same origin, so they share IndexedDB. A page error fails the test.
  - **Page hash.** `exportPage(0)`'s pixels hashed with cyrb53 over `getImageData().data`. `http://nib.test` isn't a secure context, so there is no `crypto.subtle`.
  - Tests:
    - `a converted header draws the page the previous version drew, pixel for pixel`.
      - Shapes: the example's fields; all five with markup (`{ name: '2*3*4', class: 'a_b', subject: '~~x~~ ==y==', roll: '`12`', date: '[d](u) \\' }`); `{ name: '', roll: '12' }`; no `fields`; and a schema-1 text block holding `SAMPLE_HEAD`.
      - In each page, after `loadFont('labelle')`: `doc = cleanDoc(migrateDoc(cleanDoc(raw), schema))`, the read path and then `openDocument`'s clean. Then `use(S, doc)`, then `computeLayout` (boxes given as ids), the header text and the page hash.
      - Old and new are equal for every shape, and the five hashes all differ from each other (no blank pages).
    - `the previous version refuses to write a schema-4 record, and leaves it as it was`.
      - New: `createDoc` with a header list `[Name Riya, Section 8-B, Registration no. 12345, Date 1 May 2026 (today)]`, then one `putDoc`.
      - Old: `getDoc`, then `putDoc` and `renameDoc` both reject with `name === 'NewerDocumentError'`. Its copy's header fields are `{ name: '', class: '', date: '' }` (Two tabs: accepted).
      - New: `getDoc` still has the title, the revision and the four fields.
    - `this version reads what the previous one wrote, fields in their old order, and writes it as schema 4`.
      - Old: `createDoc` with `fields: { date: '1 May 2026', roll: '12', name: 'Riya', class: '8' }`.
      - New: `getDoc` gives the list in the old order and text `Name: Riya\nClass: 8\nRoll no.: 12\nDate: 1 May 2026`. `putDoc` resolves, and the stored `schema` is 4 (read with `indexedDB` in the page).
      - Old: `putDoc` of its first copy rejects with `NewerDocumentError`.
- [ ] **Step 4: Run** `npx vitest run src/engine/doc.test.ts src/store/documents.test.ts src/features/doc/headerFields.test.ts`. Expected: FAIL (lists, `HEADER_LIMITS`, `headerFields.ts` missing; schema 3).
- [ ] **Step 5: Implement the engine, `DOC_SCHEMA`, `headerFields.ts`, `headerDefault.ts` and `fieldsOf`** as in Interfaces. The line-start escape: a label matching `^[#>+-]` gets a `\` in front, and one matching `^(\d{1,3}|[A-Za-z])[.)]` gets a `\` before that `.` or `)`.
- [ ] **Step 6: Move every user to the list** (Interfaces → Call sites). Then update every test fixture `fields: { … }` to `fields: fieldsOf({ … })`, and every `fields` expectation to a list. The non-mechanical changes:
  - `menus.test.tsx`:
    - `a header offers its extra fields` becomes `a header’s ⋯ menu has no field items`: items are exactly `['Rename', 'Give it its own style', 'Delete block']`.
    - `a header on two pages can’t be split or lose a part` expects the same three.
    - `header fields write the header`: by label, as now.
  - `actions.test.ts`: `header fields: typing is one step per field` keeps only the typing and undo half, with `const nameId = head().fields!.find(f => f.label === 'Name')!.id`. `setField('m', 'name', 'x')` on a text block still changes nothing.
  - `model.test.ts`:
    - `new blocks`: `newBlock(S, d, 'header', 0, defaultHeaderFields())` still writes `Name:\nClass:\nDate: ${today()}`.
    - `header fields`: by id (`setHeaderField(h, 'f1', 'Riya ')` gives `Name: Riya `; a newline in Class becomes a space). The show/hide half goes.
  - `OutlineView.test.tsx`: the hint is `New documents fill in today’s date.`
  - `ImportOptions.test.tsx` / `ImportDialog.test.tsx`: compare `value.header!.map(f => [f.label, f.value])` and `fields!.map(f => [f.label, f.value])`. For example, `[['Name', 'Asha'], ['Class', ''], ['Date', '7 November 2026']]`.
- [ ] **Step 7: Run** `npx vitest run src/engine src/store src/features --reporter=default`. Expected: PASS, the layout snapshot unchanged, and clean output.
- [ ] **Step 8: Run** `npm run test:browser`. Expected: `versions.browser.test.ts`'s three tests pass, and `render.browser.test.ts` and `write.browser.test.ts` still pass.
- [ ] **Step 9: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass. `git diff e8e0610 --stat -- src/engine` lists only `doc.js`, `doc.d.ts`, `doc.test.ts` and `types.ts`. `grep -rn "showField\|showHeaderField\|HeaderFields\b" src --include=*.ts` finds nothing.
- [ ] **Step 10: Commit** `feat(engine): a header's fields are an ordered list; older headers convert to the same text and pages, and documents are saved as schema 4`

---

### Task 2: Changing a header's fields, and the remembered default

**Files:**
- Modify:
  - `src/features/doc/headerFields.ts`, `headerFields.test.ts`, `headerDefault.ts`;
  - `src/features/doc/model.ts`, `model.test.ts`, `actions.ts`, `actions.test.ts`;
  - `src/app/App.tsx`: two places only, the `Promise.all` and one `useEffect`;
  - `src/features/home/TemplateGrid.tsx`, `TemplateGrid.test.tsx`, `templates.test.tsx`.
- Create: `src/features/doc/headerDefault.test.ts`.

**Interfaces:**
- Consumes: Task 1's `HeaderField`, `HEADER_LIMITS`, `headerLabel`, `headerText`, `cleanFields`, `fieldsFrom`, `newFieldId`, `today`, `RememberedField`; `commit`, `restructure` and `step` (actions.ts internals); `getPref`/`setPref` (documents.ts); `useEditor` (editor.ts).
- Produces:
  - `headerFields.ts` (pure; each returns a new list, or null when nothing would change):
    - `interface NewField { label: string; today?: true }`;
    - `listAdd(list, field: NewField, now: Date = new Date()): HeaderField[] | null`: at the end, id `newFieldId(list)`, label through `headerLabel`, value `today(now)` when `today` and `''` otherwise. Null at 12;
    - `listRename(list, id, label): HeaderField[] | null`: through `headerLabel`, keeps `today`. Null for an unknown id or the same label once cleaned;
    - `listRemove(list, id): { list: HeaderField[]; field: HeaderField; index: number } | null`: null for an unknown id or the only field;
    - `listMove(list, id, to: number): HeaderField[] | null`: the field ends at index `to`. Null for an unknown id, a `to` outside `0…length−1`, or its own place.
  - `model.ts` (each one does nothing to a box that isn't a header, and sets `box.text = headerText(box.fields)` after a change):
    - `addHeaderField(box: Box, field: NewField, now?: Date): HeaderField | null`;
    - `renameHeaderField(box: Box, fieldId: string, label: string): boolean`;
    - `removeHeaderField(box: Box, fieldId: string): { field: HeaderField; index: number } | null`;
    - `moveHeaderField(box: Box, fieldId: string, to: number): boolean`.
  - `actions.ts`:
    - `addField(boxId: string, field: NewField): string | null`: the new field's id, through `commit(before, { history: step('field-add') })`;
    - `renameField(boxId: string, fieldId: string, label: string): void`: `step('field-rename')`;
    - `moveField(boxId: string, fieldId: string, to: number): void`: `step('field-move')`;
    - `removeField(boxId: string, fieldId: string): void`: `restructure('field-remove', …)`, which says `Removed “<label>”.` with `undoTo`'s `Undo`.
  - `headerDefault.ts`:
    - `HEADER_DEFAULT = 'header-default'`;
    - `useHeaderDefault = create<{ fields: RememberedField[] | null }>(…)`, starting with `null`;
    - `cleanRemembered(v: unknown): RememberedField[] | null`: when `v.fields` is an array with at least one object, `cleanFields(v.fields)` without ids. Otherwise null;
    - `loadHeaderDefault(): Promise<void>`: `getPref(HEADER_DEFAULT)` → `cleanRemembered`. It never rejects; anything unreadable leaves `null`;
    - `rememberHeader(fields: HeaderField[]): void`: sets the store at once (fields without ids), and writes `{ fields }` with `setPref`, at most once a second (the first change starts a 1000 ms timer, and the latest value is written when it fires). A failed write is ignored;
    - `flushHeaderDefault(): Promise<void>`: writes a waiting value now;
    - `defaultHeaderFields(now?: Date)` now returns `fieldsFrom(useHeaderDefault.getState().fields, now)`;
    - `installHeaderMemory(): () => void` subscribes to `useEditor`. It keeps `{ docId, json }` of the open document's header (JSON of its fields without ids).
      - When `docId` changes, it only takes the new baseline.
      - With the same non-null `docId`, a header whose JSON changed is passed to `rememberHeader`. A document with no header changes nothing.
      - It flushes on `pagehide` and when the page is hidden.
      - It calls `loadHeaderDefault()` when the page is shown or its window gets `focus`, unless a write is waiting.
      - It returns the remover.
  - `App.tsx`: `Promise.all([bootstrapDocuments(), bootStyle(), loadHeaderDefault()])`, and `useEffect(() => installHeaderMemory(), [])`.
  - `TemplateGrid.tsx`: `const remembered = useHeaderDefault(s => s.fields);` is added to the records' `useMemo` dependencies (`[day, remembered]`).

- [ ] **Step 1: Write the failing tests.** `L = (...labels) => labels.map((label, i) => ({ id: 'i' + i, label, value: '' }))`, and `NOW = new Date(2026, 10, 7)`.

```ts
// src/features/doc/headerFields.test.ts
test('adding: at the end and empty; a Date comes marked and as today; at 12 nothing', () => {
  expect(listAdd(L('Name'), { label: ' Teacher ' })).toEqual([...L('Name'), { id: expect.not.stringMatching(/^i0$/), label: 'Teacher', value: '' }]);
  expect(listAdd(L('Name'), { label: 'Date', today: true }, NOW)!.at(-1)).toMatchObject({ label: 'Date', value: '7 November 2026', today: true });
  expect(listAdd(L(...'abcdefghijkl'), { label: 'x' })).toBeNull();
});
test('renaming: one line, at most 30, empty is Field; the date mark stays; the same name changes nothing', () => {
  const d = [{ id: 'd', label: 'Date', value: 'x', today: true as const }];
  expect(listRename(d, 'd', ' Due\ndate ')).toEqual([{ id: 'd', label: 'Due date', value: 'x', today: true }]);
  expect(listRename(L('A'), 'i0', '')![0].label).toBe('Field'); expect(listRename(L('A'), 'i0', ' A ')).toBeNull(); expect(listRename(L('A'), 'zz', 'B')).toBeNull();
});
test('removing: never the only field; says which went and where it was', () => {
  expect(listRemove(L('A', 'B'), 'i1')).toEqual({ list: L('A'), field: L('A', 'B')[1], index: 1 }); expect(listRemove(L('A'), 'i0')).toBeNull();
});
test('moving: to any row; off the ends or in place changes nothing', () => {
  expect(listMove(L('A', 'B', 'C'), 'i0', 2)!.map(f => f.label)).toEqual(['B', 'C', 'A']);
  expect([listMove(L('A', 'B'), 'i0', 0), listMove(L('A', 'B'), 'i0', 2), listMove(L('A', 'B'), 'i0', -1)]).toEqual([null, null, null]);
});
```
  - `model.test.ts`: `each field change keeps the header’s text derived, and a block that isn’t a header is left alone`. On a header with `fieldsOf({ name: 'A', class: 'B', date: 'C' })`, after each of add, rename, move and remove, `h.text === headerText(h.fields!)`. The final text is the expected literal, such as `Name: A\nDue:\nSection: B` after add `Due`, rename class → `Section`, move it last, and remove date. On a text block, each returns null or false and its text is unchanged.
  - `actions.test.ts` (`useHeaderDefault.setState({ fields: null })` in `beforeEach`):
    - `adding, renaming, removing and moving a field are one undo step each, and Redo is exact`.
      - Open a header `h` (`fieldsOf({ name: '', class: '', date: 'd' })`) and a Main text.
      - Take `JSON.parse(snapshot())` after each of these: `addField('h', { label: 'Registration no.' })`, then `setField` with `'1'` then `'12'` (one step), `renameField('h', 'class', 'Section')`, `moveField('h', id, 0)`, `moveField('h', id, 1)`, `removeField('h', 'class')`.
      - The text is then `Name:\nRegistration no.: 12\nDate: d`.
      - Each `undo()` gives back the previous snapshot, and `canUndo` ends false. Each `redo()` gives the next one again.
    - `Remove says Removed “Section”. with Undo, which puts the field back where it was`: uses `lastToast()` and `lastToastAction()`.
    - `a field change that changes nothing records nothing`: renaming to the same label, moving a field to its own row, removing the only field, adding at 12, and an unknown field id each leave `canUndo` false and `toasts()` unchanged.
    - `addField gives the new field’s id, and null at 12`.
    - `Add → Header starts from the remembered default, its date-marked fields as today`: after `useHeaderDefault.setState({ fields: [{ label: 'Name', value: 'Asha' }, { label: 'Section', value: 'B' }, { label: 'Due', value: '1 May 2026', today: true }] })`, `addBlock('header', 0)` writes `Name: Asha\nSection: B\nDue: ${today()}`.
  - `headerDefault.test.ts`. It mocks `@/store/documents` with `putDoc`, `getPref` and `setPref` as `vi.fn`, uses fake timers for `setTimeout` only, and calls `installHeaderMemory()`'s remover in `afterEach`.
    - `before anything is remembered, a new header is Name, Class and today’s Date`.
    - `a change to the open document’s header is remembered at once and written once a second`.
      - `open(…)` a header, then `setField` twice and `renameField(…, 'class', 'Section')`.
      - The store holds the labels `[Name, Section, Date]` at once, and `setPref` hasn't been called.
      - At 999 ms there is still no call. At 1000 ms there is exactly one call: `('header-default', { fields: [{ label: 'Name', value: 'As' }, { label: 'Section', value: '' }, { label: 'Date', value: 'x', today: true }] })`.
    - `opening, closing or reading a document again is not a change`: opening a document whose header has `Teacher`, then closing it, leaves the store `null`, and after 2 s `setPref` hasn't been called.
    - `undoing a header change is a change too`: rename and then `undo()` leaves the remembered labels back at `Class`.
    - `leaving the page writes a waiting change at once`: after `pagehide`, `setPref` is called before 1 s has passed.
    - `a stored default is read back cleaned, and anything unreadable is the built-in one`. `getPref` resolves to:
      - `{ fields: [{ label: ' Section\n', value: 'B', today: 'no' }] }`, which gives `[{ label: 'Section', value: 'B' }]`;
      - `{ fields: [] }`, `'junk'` or `null`, which give `null`;
      - a rejection, which also gives `null`.
    - `shown again or focused, it takes in what another tab remembered, unless a change of its own is waiting`.
    - `the example document keeps its own fields`: with a default set, `sampleDoc(S).boxes[0].text === SAMPLE_HEAD`.
  - `templates.test.tsx`: `the Assignment header starts from the remembered default, and a template’s fields have the same ids each time`. Its text is `Name: Asha\nSection: B\nDue: 7 November 2026` at `NOW`, and two `templateRecord` calls give equal header `fields`.
  - `TemplateGrid.test.tsx`: `a newly remembered header draws the Assignment card again, and only it`. After the six pictures, `act(() => useHeaderDefault.setState({ fields: […] }))` calls `thumbFor` once more, for `tpl:assignment`, with that header's text.
- [ ] **Step 2: Run** `npx vitest run src/features/doc src/features/home/templates.test.tsx src/features/home/TemplateGrid.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run the same tests** with `--reporter=default`. Expected: PASS with clean output. `src/app/App.test.tsx` still passes.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(write): add, rename, remove and move a header's fields, one undo step each; new headers start from the last header changed on this device`

---

### Task 3: The field editor

A presentational component with no store: it gets the list and a `FieldOps` object. Task 4 binds it.

**Files:**
- Modify:
  - `src/features/write/HeaderFields.tsx`: add `FieldEditor` and its `FieldOps`. The existing `HeaderFields` export stays as Task 1 left it;
  - `src/features/write/dnd.ts`, `dnd.test.ts`;
  - `src/features/write/OutlineList.tsx`: its local `ghost()` moves to `dnd.ts` as `dragGhost`, and the two calls change. Nothing else.
- Create: `src/features/write/HeaderFields.test.tsx`.

**Interfaces:**
- Consumes: Task 1's `HeaderField`, `HEADER_LIMITS` and `headerLabel` (the test harness); `OptionsButton` (`BlockMenu.tsx`); `startDrag`, `pageDropIndex`, `dropClass` and `gripClass` (`dnd.ts`); `DropdownMenu*`, `Button` and `Input` (`src/components/ui`).
- Produces:
  - `HeaderFields.tsx`:

```ts
/** What the editor asks for; the header (or Import's copy of one) does it. */
export interface FieldOps {
  setValue(id: string, value: string): void;
  /** Add at the end; the new field's id, or null when nothing was added. */
  add(field: { label: string; today?: true }): string | null;
  rename(id: string, label: string): void;
  remove(id: string): void;
  move(id: string, to: number): void;
}
export function FieldEditor(props: { fields: HeaderField[]; ops: FieldOps; compact?: boolean }): JSX.Element;
```
  - `FieldEditor`'s structure:
    - The root is `relative group/fields`. Each row is keyed by `id` and carries `data-drop-field={index}` and `dropClass`. A row holds:
      - the grip: `role="img"`, `aria-label="Move “<label>”"`, `gripClass`, `data-vaul-no-drag`, `GripVertical`;
      - the label: `<button aria-label="Rename “<label>”" data-field-label={id}>` showing the label, or, while renaming, `<Input aria-label="Field name" data-field-name={id} maxLength={30}>`;
      - the value: `<Input aria-label="<label>" data-field-value={id} maxLength={80} autoComplete="off">`, which calls `ops.setValue` on change;
      - the ⋯: `OptionsButton` with `label="More for “<label>”"` and `data-field-menu={id}`, opening `Rename`, `Move up` (disabled on the first row), `Move down` (disabled on the last) and `Remove`. When it is the only field, Remove is `disabled` with `title="A header needs at least one field."` and `data-[disabled]:pointer-events-auto`.
    - Then **Add field** (`Plus` and `Add field`), a `DropdownMenuTrigger`.
      - Its menu lists the Interface copy's common fields that no row has (label trimmed, ignoring case), in order, then a separator, then `Custom field…`. The separator is left out when no common field is left.
      - `Date` asks for `{ label: 'Date', today: true }`, and `Custom field…` for `{ label: 'Field' }`.
      - At 12 fields the trigger is `disabled` with `title="A header holds up to 12 fields."` and `disabled:pointer-events-auto`.
  - **Rename.**
    - Clicking the label, or the menu's Rename, opens the input with its text selected.
    - Enter calls `ops.rename(id, draft)`. Esc calls nothing and stops the key's propagation. Both close the input and focus the label button.
    - Leaving the input calls `ops.rename` once.
    - If the input unmounts while still open, the draft goes to `ops.rename` once, as `Inspector`'s `NameField` does on unmount. A done-flag makes sure Enter, Esc, blur and unmount never send twice.
  - **Focus** (Accessibility table).
    - Each menu item's `onSelect` records where the focus goes next (`{ id, part: 'value' | 'name' | 'label' | 'menu' }`) and then calls the op.
    - The menu's `onCloseAutoFocus` prevents Radix's own focus whenever something was recorded.
    - A `useLayoutEffect` focuses the recorded element. It is found inside the editor's own root by its `data-field-*` attribute, so a second editor of the same header elsewhere is never the one focused.
  - **Drag.** The grip's `onPointerDown` calls `startDrag(e, { kind: 'grip', targets: 'field', ghost: () => dragGhost(label), onDrop })`. `onDrop` calls `ops.move(id, pageDropIndex(i, t.page, t.after))` when that differs from `i`. A drag never moves the focus.
  - **Sizes.**
    - Normal: the rows are `gap-x-3 gap-y-2`, the label is `text-[13px] font-medium text-muted`, the grip is `size-11 wide:size-[26px]` and the ⋯ is `size-11 wide:size-7`.
    - `compact` (the typed page): the rows take the inherited font size and line height, one ruled line each. The value input keeps Task 1's compact classes. The grip and ⋯ are icons at `size-[1em]` with a 44 px hit area below `wide:` (`relative before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 wide:before:hidden`).
    - In `compact`, the grip and ⋯ are `opacity-0` until their row is hovered or has the focus, and always shown under `[@media(hover:none)]`.
    - In `compact`, **Add field** is a small pill like the name tag, at `absolute top-full left-0 z-10`. It is `invisible` except for `group-hover/fields:visible group-focus-within/fields:visible data-[state=open]:visible in-[.selected]:visible` (Ruling 9).
  - `dnd.ts`:
    - `DragOptions.targets?: 'page' | 'field'` (default `'page'`): drop targets are `[data-drop-page]` or `[data-drop-field]`, whose number is `DropTarget.page`. `DropTarget.page`'s comment becomes "the page, or the header field row, under the pointer".
    - `targetAt(x, y, targets: 'page' | 'field' = 'page')`.
    - `export function dragGhost(text: string, color?: string): HTMLElement` is OutlineList's `ghost`, moved.

- [ ] **Step 1: Write the failing tests** (`HeaderFields.test.tsx`).
  - The harness holds the list in `useState`. Its `ops` change the list as a header would: `rename` through `headerLabel`; `add` gives ids `n1`, `n2`…; `move` splices. Every call is recorded in `calls`.
  - `F = (...labels) => labels.map((label, i) => ({ id: 'i' + i, label, value: '' }))`.

```ts
test('Tab goes name, value, ⋯ along each row, then Add field; each has a focus ring', async () => {
  render(<Harness start={F('Name', 'Class')} />);
  const order = ['Rename “Name”', 'Name', 'More for “Name”', 'Rename “Class”', 'Class', 'More for “Class”', 'Add field'];
  for (const name of order) { await userEvent.tab(); expect(document.activeElement).toHaveAccessibleName(name); }
  expect(screen.getByRole('button', { name: 'Rename “Name”' })).toHaveClass('focus-visible:ring-2');
  expect(screen.getByRole('img', { name: 'Move “Name”' })).toBeInTheDocument();
});
test('Remove: the focus goes to the next row’s value, or the previous one’s when it was the last', async () => {
  render(<Harness start={F('Name', 'Class', 'Date')} />);
  await userEvent.click(screen.getByRole('button', { name: 'More for “Class”' })); await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  expect(screen.getByRole('textbox', { name: 'Date' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'More for “Date”' })); await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
});
```
  - The rest, each with its assertions:
    - `rename: clicking the name opens it in place, selected; Enter keeps it and gives the focus back to the name`.
      - Clicking `Rename “Class”` focuses `Field name`, with value `Class` and selection 0–5.
      - Typing `Section{Enter}` gives `calls` `['rename', 'i1', 'Section']`, and `Rename “Section”` has the focus.
    - `Esc puts the old name back, and the key goes no further`: a `document` keydown listener in the bubble phase sees no Escape, there is no rename call, and `Rename “Class”` has the focus.
    - `an empty name becomes Field; leaving the name keeps what was typed`.
    - `the row menu: Rename, Move up, Move down, Remove; the first row can’t go up and the last can’t go down`: the menu item names, and `aria-disabled` on those two.
    - `Move up and Move down keep the focus on the moved row’s ⋯`: on Class, Move up gives the order `Class, Name, Date`, and `More for “Class”` has the focus. Then Move down the same way.
    - `the last field can’t be removed, and says why`: Remove is disabled with `title` `A header needs at least one field.`
    - `Add field offers the common fields the header doesn’t have, then Custom field…`. With `F('Name', ' class ', 'Date')` the items are `['Section', 'Subject', 'Roll no.', 'Registration no.', 'Teacher', 'School', 'Custom field…']`, with one separator before the last.
    - `Adding a common field focuses its value; Date comes marked as today`: `Registration no.` gives `['add', { label: 'Registration no.' }]`, and textbox `Registration no.` has the focus. With no Date, `Date` gives `{ label: 'Date', today: true }`.
    - `Custom field… adds Field with its name open and selected`: `Field name` has the focus, value `Field`, selection 0–5. Typing `Teacher’s name{Enter}` renames `n1`.
    - `at 12 fields Add field is off and says why`: disabled, with `title` `A header holds up to 12 fields.`
    - `dragging a row’s grip onto another row moves it there`.
      - Rows' rects are stubbed, with `elementFromPoint` as in `dnd.test.ts`.
      - Dragging Name's grip below Date's middle gives `['move', 'i0', 2]`.
      - A drop back on Name's own row calls nothing.
      - The focus is where it was.
    - `a name being typed is kept when the editor goes, and nothing happens when its field went first`.
      - Rename Class, type `Sec`, and unmount: `calls` ends with `['rename', 'i1', 'Sec']`, once.
      - With a list from which `i1` is removed while it is open, no error is thrown and the list is unchanged.
    - `on phones the ⋯ and the grip are 44 px`.
      - Normal: `More for “Name”` has `size-11` and `wide:size-7`, and the grip has `size-11` and `wide:size-[26px]`.
      - `compact`: both have `before:size-11` and `wide:before:hidden`.
      - The grip has `touch-none` and `data-vaul-no-drag`.
    - `compact: Add field sits just under the fields, shown while they have the focus or the pointer, or the header is selected`: it has `absolute`, `top-full`, `invisible`, `group-focus-within/fields:visible`, `group-hover/fields:visible`, `data-[state=open]:visible` and `in-[.selected]:visible`.
  - `dnd.test.ts`: `a field row drag finds the row under the pointer, never the page around it`. A `[data-drop-field="1"]` sits inside a `[data-drop-page="0"]`. `targetAt(x, y, 'field')` gives `{ page: 1, after }`, and a `targets: 'field'` drag marks the row's `data-drop`, not the page's. `targetAt(x, y)` still gives the page.
- [ ] **Step 2: Run** `npx vitest run src/features/write/HeaderFields.test.tsx src/features/write/dnd.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/features/write --reporter=default`. Expected: PASS with clean output (Outline's drags unchanged).
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(write): the header field editor: rows with an inline rename, a ⋯ menu and a grip, and Add field, with the focus where each change leaves it`

---

### Task 4: The editor everywhere: typed page, Outline, Import

**Files:**
- Modify:
  - `src/features/write/HeaderFields.tsx` (`HeaderFields` only);
  - `src/features/import/ImportOptions.tsx`, `src/features/import/ImportDialog.tsx` (`DialogContent`'s new `onEscapeKeyDown` only);
  - tests: `src/features/write/menus.test.tsx`, `OutlineView.test.tsx`, `PagesView.test.tsx`, `src/features/import/ImportOptions.test.tsx`, `ImportDialog.test.tsx`.

**Interfaces:**
- Consumes: Task 2's `addField`, `renameField`, `removeField`, `moveField` and `setField` (actions.ts), `listSetValue`/`listAdd`/`listRename`/`listRemove`/`listMove` (headerFields.ts), and `defaultHeaderFields` and `useHeaderDefault` (headerDefault.ts). Task 3's `FieldEditor` and `FieldOps`.
- Produces:
  - `HeaderFields({ boxId, compact })` reads the header's `fields` with `useEditor` and renders `FieldEditor`, with `ops` from the five actions bound to `boxId` (`useMemo` on `boxId`). `TypedPage` (compact) and `Inspector` already render it and don't change.
  - `ImportOptions`: the Header group renders `FieldEditor` over `value.header`.
    - Its ops apply the `list*` functions to the latest value: a `live` ref is set on every render and updated by each op before `onChange`, so two ops in one tick don't overwrite each other.
    - `add` returns the new last field's id.
    - Ticking `Add a header block` brings back what was typed, else gives `defaultHeaderFields()`.
    - `At the top right of page 1.` stays under it.
  - `ImportDialog`'s `DialogContent` gets `onEscapeKeyDown={e => { if (e.target instanceof Element && e.target.closest('[data-field-name]')) e.preventDefault(); }}`. Radix listens for Esc in the capture phase, before the input can stop it.

- [ ] **Step 1: Write the failing tests.**
  - `menus.test.tsx`: `the header’s fields are edited in place, each change one undo step, and the header’s text follows`.
    - With `h()` (`fieldsOf({ name: '', class: '', date: '6 November 2026' })`), render `<HeaderFields boxId="h" />`.
    - Add `Registration no.`, type `12`, rename Class to `Section`, and Remove Section. `lastToast()` is `Removed “Section”.`, and the text is `Name:\nDate: 6 November 2026\nRegistration no.: 12`.
    - `act(() => undo())` four times gives back `Name:\nClass:\nDate: 6 November 2026`, and the rows follow.
  - `OutlineView.test.tsx`: `Outline’s header editor adds a field, and the header’s item shows its value`. In `insp()`, Add field → `Teacher`, type `Ms Rao`, and the Header item's snippet is `Riya · 6 November 2026 · Ms Rao`.
  - `PagesView.test.tsx`:
    - `a field added on the typed page is a line on the handwritten page`: in `typed(0)`, Add field → `Section`. The header's text ends `\nSection:`, and `layoutFor(get().S, get().doc)` gives the header's first part 4 rows.
    - `the typed header’s Add field shows while the header is selected or has the focus`: the button is inside `.typed-part[data-part="h:0"]` with `in-[.selected]:visible` and `group-focus-within/fields:visible`. After `select('h')` that part has the class `selected`.
    - The existing `a header on two pages shows its fields once…` still passes.
  - `ImportOptions.test.tsx`:
    - `Add a header block starts from the remembered default, today’s date on its date fields`: with `useHeaderDefault.setState({ fields: [{ label: 'Name', value: 'Asha' }, { label: 'Section', value: '' }, { label: 'Due', value: 'x', today: true }] })`, ticking gives `[['Name', 'Asha'], ['Section', ''], ['Due', '7 November 2026']]`.
    - `the header uses the field editor: what is added, renamed, moved and removed is what will be written, and the open document is left alone`. On an open document with a header: rename Class to Section, add Teacher, move it up, remove Date. `value.header` follows, and `get().doc`'s header and `canUndo` are unchanged.
    - The existing `…what was typed comes back` passes, with list expectations.
  - `ImportDialog.test.tsx`:
    - `Esc in a field’s name puts the old name back and leaves the dialog open`: on `Rename “Class”`, type `Sec{Escape}`. The dialog `Import a document` is still open, and `Rename “Class”` has the focus.
    - `a header edited in Import is written out as edited, as one undo step`: on an open document with a header, Replace, rename Class to Section, add Teacher `Ms Rao`, then Write it out. The header's labels are `[Name, Section, Date, Teacher]`. One `undo()` gives back the old header.
- [ ] **Step 2: Run** `npx vitest run src/features/write src/features/import`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run the same tests** with `--reporter=default`. Expected: PASS with clean output.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(write): the field editor on the typed page, in Outline and in Import's header options`

---

### Task 5: Smoke, README and user guide

**Files:**
- Modify: `scripts/smoke.mjs` (two new steps), `README.md` (one highlight), `docs/USER_GUIDE.md`, and `docs/DEVELOPMENT.md` (one line in Project structure).

- [ ] **Step 1: Add two smoke steps.** As now, any console error fails a step. `Undo`/`Redo` mean the top bar's, `getByTitle(/^Undo \(/)` and `getByTitle(/^Redo \(/)`. `frame(p, id)` is the header's `[data-stage]:not([hidden]) .block-frame[data-id="<id>:0"]`. `line` is the frame's height before, divided by 3.
  1. **`Header fields: add Registration no., type it and rename Class to Section; both lines are on the handwritten page, Undo and Redo take them away and back, and the next Assignment starts from them`**. It goes after `Import: files Nib can’t read say why`.
     - Home → `Assignment` → Saved. In Pages, note `frame(page, hid)`'s height.
     - Click the typed page's textbox `Name`. `Add field` is visible. Choose `Registration no.`, and the focused element is textbox `Registration no.`. Type `12345`.
     - Click `Rename “Class”`. `Field name` has the focus; press Control+A, type `Section` and press Enter.
     - After Saved, the newest record's header text is `Name:\nSection:\nDate: ${todayText()}\nRegistration no.: 12345`.
     - The frame is one `line` taller (±2 px), and its ink canvas `.ink-layer canvas[data-id="<hid>:0"]` has ink in its bottom quarter.
     - Undo three times: the stored text is `Name:\nClass:\nDate: ${todayText()}` and the frame is back to its first height. Redo three times: the four-line text again.
     - Wait 1.5 s. `idb('prefs', 'header-default')` has the labels `Name, Section, Date, Registration no.`, with `12345`.
     - Home → `Assignment`: the newest record's header text is the four-line text.
  2. **`Phone: header fields at 390 px: 44 px targets in Outline’s sheet, Add field on the typed page, and nothing wider than the screen`**. It goes after `Phone: every stage at 390 px…`, in its own context `{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' }`, with the tips init script.
     - Open The Water Cycle. On Write's typed page, tap textbox `Name`. `Add field` is visible and inside 0–390.
     - Outline → the dialog `Outline` → tap the `Header` item, and note `frame(p, 'b2')`'s height. `More for “Name”` and `Move “Name”` are each at least 44 × 44 px.
     - Add field → `Registration no.`, type `12345`. `More for “Class”` → `Rename`, fill `Section`, Enter. `More for “Registration no.”` → `Move up`, and the focused element is `More for “Registration no.”`.
     - The stored text is `Name: Aarav Mehta\nSection: 8-B\nRegistration no.: 12345\nDate: 29 October 2026`. The header frame above the sheet is one line taller.
     - Undo four times gives back `SAMPLE_HEAD`'s text. `scrollWidth <= 390` throughout.
- [ ] **Step 2: Update the docs.**
  - `README.md`, in Highlights → **Blocks you can place anywhere.**, add after its first sentence: `A Header's fields are yours to add, rename and reorder, and new headers start from the last one you changed.`
  - `docs/USER_GUIDE.md`:
    - Home's Assignment bullet: `with a Header block (your usual fields, with today's date filled in)`.
    - Import's Header bullet: `**Add a header block**, starting from your usual fields, at the top right of page 1. Its fields are edited as in Write.`
    - Write's opening paragraph: the Header kind becomes `**Header** (fields such as Name, Class and Date, which you add, rename and order yourself; date fields start as today)`.
    - A new `### Header block fields` after `### Changing the structure`. It covers:
      - where the editor is: the typed page, Outline's block editor and the phone sheet, and Import;
      - `+ Add field` and its menu, `Custom field…` and the 12-field limit;
      - renaming (click the name or **Rename**; Enter keeps, Esc puts it back, an empty name becomes `Field`);
      - **Remove** and its Undo, and that the last field stays;
      - reordering by the grip or **Move up**/**Move down**, which works from the keyboard;
      - one undo step per change;
      - the remembered default: which new headers use it, date fields as today, and that The Water Cycle keeps its own;
      - 44 px targets on phones.
    - Under `### Working in more than one tab`, one sentence: an older Nib still open in another tab can't change a document this version saved, and asks you to reload.
  - `docs/DEVELOPMENT.md`, in the `src/features/` bullet: `` `doc/headerFields.ts` (a header's fields as a list: adding, renaming, removing and moving them) and `doc/headerDefault.ts` (the default header, kept in `prefs` as `header-default`) ``.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build && npm run smoke`. Expected: all pass, and the last line is `smoke ok`.
- [ ] **Step 4: Exit checks** (report each output):
  - `git diff e8e0610 --stat -- src/engine` lists only `doc.js`, `doc.d.ts`, `doc.test.ts` and `types.ts`. `git diff e8e0610 -- src/engine/__snapshots__ src/engine/core.js src/engine/config.js` gives no output.
  - `git diff e8e0610 -- package.json package-lock.json src/store/db.ts src/shell/shortcuts.ts` gives no output.
  - `grep -n "DOC_SCHEMA = 4" src/store/documents.ts` finds it.
  - `grep -rn "showField\|showHeaderField\|Add Subject\|Roll no. from" src` gives no output.
  - `grep -n "useWide" src/features/write/HeaderFields.tsx` gives no output.
- [ ] **Step 5: Commit** `test: smoke edits header fields at 1280 and 390 px and checks the handwritten page, undo and the remembered default; README, user guide and developer notes for custom header fields`

The controller then merges `nib/custom-headers` into `main` and pushes. This task does not merge, push or deploy.
