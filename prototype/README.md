# Nib redesign prototype (throwaway)

A single-file, clickable prototype used to settle the Nib redesign (layout of Write, Style, Export and Home, block restructuring rules, logo and visual direction). It is a primary source for the decisions in `docs/superpowers/specs/2026-11-06-nib-redesign-design.md` on the milestone branches. It is not product code: the handwriting is imitated with CSS, and none of it should be copied into `src/`.

Open `nib-prototype.html` in a browser (it expects the Artifact page skeleton, but renders as a plain page too).

Verdicts it produced:
- Write has two views: Pages (typed and handwritten pages side by side) and Outline (page list, page, block editor), with drag to reorder pages and move blocks.
- A block's continuation follows its start onto the next page; pages are added when needed. Split blocks can be joined back; pages can be merged.
- Studio look, Figtree, the ink-page logo, ink-blue accent.
- Style: scope switch, Looks first, handwriting picker, How natural with Fine-tune. Export: live preview beside one panel.
