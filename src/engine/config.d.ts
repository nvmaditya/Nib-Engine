import type { FontCfg, PenCfg, InkCfg, PaperCfg, PresetCfg, Settings } from './types';

export const PAGE_W: number;
export const PAGE_H: number;
export const PAD: { l: number; r: number; t: number; b: number };
export const FONTS: FontCfg[];
export const FONT_GROUPS: [string, string][];
export const PENS: PenCfg[];
export const INKS: InkCfg[];
export const PRESETS: PresetCfg[];
export const PAPERS: Record<string, PaperCfg>;
export const DEFAULTS: Settings;
export const LIMITS: Record<'size' | 'gap' | 'mess' | 'wobble' | 'variety' | 'flow' | 'weight' | 'track' | 'words' | 'mistakes', [number, number]>;
export const TOGGLES: ('lighting' | 'ghost' | 'crease' | 'holes' | 'tilt')[];
export const KEY: string;
export const OLD_KEY: string;
export const SAMPLE_HEAD: string;
export const SAMPLE_BODY: string;
