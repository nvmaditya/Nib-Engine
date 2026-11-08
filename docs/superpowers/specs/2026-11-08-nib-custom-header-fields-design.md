# Custom header fields — design

Date: 2026-11-08. Status: approved in conversation (approach A, full control, remembered default).

## Why

A Header block today has five fixed fields: Name, Class and Date by default, and Subject and Roll no., which are added or removed from the block's ⋯ menu. Their keys, labels and order are hard-coded in `src/engine/doc.js` (`HEADER_FIELDS`). Schools differ: some write Section instead of Class, some need a Registration no., a Teacher or a School line. People need to add any number of fields, rename them, remove them and put them in their own order, without retyping that layout in every document.

## What the person can do

- **Add** a field with **+ Add field** under a header's fields. It opens a menu of common fields the header does not already have: Name, Class, Section, Subject, Roll no., Registration no., Date, Teacher, School. Below them is **Custom field…**, which adds a row whose label is ready to type. A header holds at most 12 fields. At 12, + Add field is disabled with the tooltip `A header holds up to 12 fields.`
- **Rename** a field: click its label, or choose **Rename** in the row's menu. The label becomes an input in place. Enter or leaving it keeps the change, and Esc puts the old label back. A label that ends up empty becomes `Field`.
- **Remove** a field from the row's menu (**Remove**). The message says `Removed “<label>”.`, with **Undo**. The last field can't be removed: its Remove is disabled, with the tooltip `A header needs at least one field.`
- **Reorder** by dragging a row's grip, or with **Move up** / **Move down** in the row's menu, which also works from the keyboard. Move up is disabled on the first row and Move down on the last.
- **Undo.** Add, rename, remove and each move are one undo step each. Typing a value works as today: consecutive typing in one field is one step.
- **Remembered default.** Whenever a header's fields or values change in an open document, that header becomes the device's default. New headers start from it: Add → Header, the Assignment template, and Import's **Add a header block** for a new document. Fields marked as a date start as today's date. Before anything is remembered, the default is Name, Class and Date (empty, empty, today). The Water Cycle example document keeps its own fields.

The same editor appears everywhere header fields are edited today: in the Header block on the typed page (Pages view, Side by side and Typed, compact, at the page's text size), in Outline's block editor (wide, and the phone sheet), and in Import's header options. The header's ⋯ menu loses its `Add Subject` / `Remove Subject` / `Add Roll no.` / `Remove Roll no.` items.

## Data model

- A header field is `{ id: string; label: string; value: string; today?: true }`. A header block's `fields` becomes an ordered `HeaderField[]` (1–12 entries) instead of the fixed-key object.
  - `label`: one line, trimmed, at most 30 characters; empty → `Field`.
  - `value`: one line, at most 80 characters (as today).
  - `today`: set on the default Date field and on the converted `date` field. It only decides the starting value of a new header; the value is ordinary text afterwards. Renaming a date field keeps the mark.
  - `id`: unique within the header; new fields get `uid()`.
- The header's text stays derived: one line per field, in list order, `Label: value`, or `Label:` when the value is empty. Values are escaped with the existing `escapeValue`, and labels are escaped the same way, so markup characters in either show as typed.
- **Conversion.** `cleanDoc` (engine `doc.js`) accepts both shapes. An object-shaped `fields` (schema ≤ 3, and the result of `migrateDoc` for schema 1) becomes a list in the old order — Name, Class, Subject, Roll no., Date — keeping only the keys present, with their values, ids `name`/`class`/`subject`/`roll`/`date`, and `today: true` on `date`. The derived text is byte-identical to before, so converted documents draw exactly the same pages.
- **Format version.** `DOC_SCHEMA` goes from 3 to 4. A tab still running the previous version refuses to write a schema-4 record (`NewerDocumentError`) and shows `This document was saved by a newer version of Nib. Reload the page to keep editing.` with **Reload**, which applies the waiting version. IndexedDB's version does not change.
- **Remembered default** is one prefs entry, `header-default`: `{ fields: { label, value, today? }[] }`, written (coalesced, about once a second) after a header change in an open document, read when a new header is made. Date-marked values are not used from it; they start as today.

## Engine boundary

Only `src/engine/doc.js` / `doc.d.ts` / `types.ts` change: `HEADER_FIELDS` keeps the old keys and labels for the conversion; `headerText` takes the list; `cleanFields` validates and converts; the sample document's header becomes a list. No drawing, layout or realism code changes.

## Code that changes

- `src/features/doc/model.ts`: `setHeaderField(box, fieldId, value)`; new `addHeaderField`, `renameHeaderField`, `removeHeaderField`, `moveHeaderField` (each keeps the text derived and enforces the limits); `showHeaderField` goes; a new header uses the remembered default.
- `src/features/doc/actions.ts`: actions for the above through `update(fn, { history })`; the Remove message with Undo.
- `src/features/doc/build.ts`: `headerBlock`/`newDocument`/`importInto` take a `HeaderField[]`.
- A small module for the remembered default (read, write coalesced, `defaultHeaderFields(now)`).
- `src/features/write/HeaderFields.tsx`: the editor (rows, inline rename, row menu, grip drag, + Add field menu).
- `src/features/write/BlockMenu.tsx`: drop the Subject / Roll no. items.
- `src/features/write/OutlineList.tsx`: the snippet joins the list's values.
- `src/features/import/options.ts`, `ImportOptions.tsx`: the header option uses the same editor and the default.
- `src/features/home/templates.ts`: the Assignment header from the default.
- `src/store/documents.ts`: `DOC_SCHEMA = 4`.

## Interface copy

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

Copy is plain sentence case with curly quotes, like the rest of Nib.

## Accessibility

Every control is reachable by keyboard with a visible focus ring. Reordering works without a pointer (Move up / Move down). After Remove, the focus goes to the next row's value (or the previous one if it was last); after Add, to the new value (or the new label for Custom field…); after a move, it stays on the moved row's menu trigger. The phone layout keeps 44 px touch targets for the menu and grip.

## Testing

- Engine: conversion of every old shape (each optional key present or not, empty values, markup characters) gives byte-identical header text and identical pages (`computeLayout` and a rendered page hash); labels and values are validated and clamped.
- Model and actions: add / rename / remove / move, the 1 and 12 limits, one undo step each, Redo exact, text always derived.
- Format: a schema-4 record is refused by the schema-3 check; two-tab rules unchanged.
- Remembered default: written after edits, used by Add → Header, the Assignment template and Import's new-document header; dates start as today.
- Editor component: keyboard rename (Enter, Esc, empty → Field), menu actions and their focus, the add menu hiding fields already present, the limit, drag reorder.
- Smoke (Chromium, 1280 and 390 px): add a Registration no. field, type a value, rename Class to Section, and see both lines on the handwritten page; Undo restores.
