# Nib user guide

This guide covers everything Nib does, stage by stage. For an overview, see the [README](../README.md).

## Contents

- [Home](#home)
- [Import](#import)
- [Write](#write)
- [Style](#style)
- [Export](#export)
- [Keyboard](#keyboard)
- [Install and offline](#install-and-offline)

## Home

Home is where you start. The big **Import a PDF, Word or text file** button comes first, and you can also drop a file anywhere on the page. Under it, **Start something new** has six templates. Each one is an ordinary document with its own look, so you can change everything later:

- **Blank page**: Exam answer on ruled paper, nothing on it yet.
- **Assignment**: Exam answer, with a Header block (your usual fields, with today's date filled in), a title and a heading.
- **Class notes**: Neat notes on grid paper, with a heading and a list.
- **Letter**: the Letter look on plain paper, with `Dear …,` and `With love,`.
- **Journal page**: Journal on a yellow pad, starting with today's date.
- **Card**: the Letter look at a large size, with one message in the middle of the page.

**Recent** lists your documents. Each row shows page 1 as the engine draws it, the title, and a line such as `2 pages · Neat notes · Edited today` (the page count appears once page 1 has been laid out, and the look only when one matches). The ⋯ menu has Rename, Duplicate and Delete. Everything is saved on the device and nothing is uploaded.

### Working in more than one tab

Tabs follow each other: a document you rename, duplicate or delete in one tab changes in the Home of another, and an open document picks up edits made in another tab. If both tabs changed the same document, Nib keeps the newer version and offers **Copy your text**, so what you wrote in the other one is not lost. An older Nib still open in another tab can't change a document this version has saved, and asks you to reload.

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
- **Header**: **Add a header block**, starting from your usual fields, at the top right of page 1. Its fields are edited as in Write.

**Write it out** makes one main block that flows page by page. In an open document it is one undo step. From Home it makes a new document. If it has to wait (for the hand of the look you chose, say), the preview and the choices are locked until it is done, so what is written is what you saw when you pressed it. On phones the dialog is full screen. The file is read on the device: nothing is uploaded.

## Write

Write has two views, switched at the top: **Pages** and **Outline**. Blocks are the units you work with. There are three kinds: **Text**, **Header** (fields such as Name, Class and Date, which you add, rename and order yourself; date fields start as today) and **Margin note** (small and tilted). Each block has a name (`Main text`, `Text block`, `Header`, `Margin note`) and a colour. The colour shows on its outline and name tag and in the Outline.

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

### Header block fields

Each field of a Header block is one line of it, such as `Name: Aarav Mehta`, and the lines are written in the order the fields are listed. You edit them in the same way wherever they show: on the typed page (in Pages, where the grip and ⋯ of a row show when you point at it or are in it), in Outline's block editor and its sheet on phones, and in Import's header options.

- **Add field** sits under the fields. Its menu lists the common fields the header doesn't have yet: Name, Class, Section, Subject, Roll no., Registration no., Date, Teacher and School. **Custom field…** adds a field called `Field`, with its name selected, ready for you to type your own. On the typed page Add field shows while you are in the header or point at it, or while the header is selected. A header holds up to 12 fields: at 12, Add field is greyed out and says so.
- **Rename** a field by clicking its name, or with **Rename** in the row's ⋯ menu. Enter (or clicking away) keeps the new name and Esc puts the old one back. A name left empty becomes `Field`.
- **Remove**, in the ⋯ menu, takes the field out. In a document its message has **Undo**. The last field can't be removed.
- **Reorder** by dragging a row's grip, or with **Move up** and **Move down** in the ⋯ menu, which work from the keyboard too.
- In a document each add, rename, remove and move is one undo step, and typing in one field is one step until you do something else. In Import nothing changes the document until **Write it out**.
- **Your usual fields.** When you change a header's fields or what they say, Nib remembers that header on the device, for every tab. New headers start from it: **Add** → Header, the Assignment template, and Import's **Add a header block** for a new document or one with no header yet. Date fields start as today's date. Until you have changed a header, new ones have Name, Class and Date. The Water Cycle example keeps its own fields.
- **On phones** a row's ⋯ and grip are 44 px touch targets, on the typed page too.

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
- **Two tabs on two versions.** After Reload in one tab, another can go on running the old version beside it until you reload it too. Both read the same documents, under the usual rules for two tabs (see Working in more than one tab). An import started in the old tab may say `The document reader couldn’t be loaded. Check your connection and try again.`, because the old version's files are gone: press Reload there. When a later version has saved a document in a form an older one can't change (this version does), the older tab says `This document was saved by a newer version of Nib. Reload the page to keep editing.` with **Reload**, which applies the waiting version first, so the reload doesn't come back to the old one.

