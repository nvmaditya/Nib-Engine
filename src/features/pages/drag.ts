/** While a block is dragged nothing is redrawn and leftover transforms are kept. */
export const drag = { active: false };

/** The page scale (CSS pixels per page unit), shared by the sheets and the block frames. */
export interface PageScale { s: number }
