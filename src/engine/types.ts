// Types for the engine boundary. The engine itself is plain JavaScript; these describe what crosses into it.

export type Look = 'none' | 'scan' | 'gray' | 'bw';

export interface Settings {
  font: string; ink: string; customInk: string; tip: string;
  weight: number; size: number; gap: number; mess: number; wobble: number; variety: number;
  flow: number; track: number; words: number; mistakes: number;
  paper: string; holes: boolean; lighting: boolean; ghost: boolean; crease: boolean;
  look: Look; tilt: boolean; seed: number;
}

export interface FrameRect { x?: number; y?: number; w?: number }

export type BlockKind = 'text' | 'header' | 'note';
export type HeaderKey = 'name' | 'class' | 'subject' | 'roll' | 'date';
export type HeaderFields = Partial<Record<HeaderKey, string>>;

export interface Box {
  id: string; page: number; x: number; y: number; w: number; text: string;
  style: Partial<Settings>; shuffle: number; frames: Record<number, FrameRect>;
  kind: BlockKind; name: string; color: number; fields?: HeaderFields; from?: string;
}

export interface EngineDoc { pageCount: number; boxes: Box[]; fileName: string }

export interface Seg {
  box: Box; page: number; idx: number; x: number; w: number; top: number; bottom: number;
  rows: unknown[];
}

export interface Layout { segs: Seg[]; pages: number }

export interface FontCfg {
  id: string; name: string; family: string; weight: number; scale: number;
  group?: string; conn?: boolean; forms?: number;
  /** An uploaded font: its file, and whether it is installed under its own family name. */
  buf?: ArrayBuffer; local?: boolean;
}

export interface PenCfg {
  id: string; name: string; note: string; w: number; a: number; grain: number; halo: number; dn: number; flow: number;
}

export interface InkCfg { id: string; name: string; c: string }

export interface PaperCfg {
  name: string; bg: [number, number, number];
  rule?: string; margin?: string; holes?: boolean; spiral?: boolean; double?: boolean; grid?: string; photo?: boolean;
}

export interface PresetCfg { id: string; name: string; v: Partial<Settings> }

/** The ink as the chosen pen lays it down (internal to the engine). */
export interface InkLayer { c: string; a: number; grain: number; halo: number; pen: PenCfg }

export interface Geom {
  P: PaperCfg; gap: number; top: number; marginX: number; left: number; right: number; maxBase: number;
}

export interface Bounds { ox: number; oy: number; w: number; h: number }

export interface ReadResult { parts: string[]; pages: number; words: number; name: string }
