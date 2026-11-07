import type { Settings, EngineDoc, Box, Seg, Layout, FontCfg, PenCfg, InkLayer, Geom, Bounds, PaperCfg } from './types';

export function use(settings: Settings, document: EngineDoc): void;
export function onAssetReady(fn: () => void): void;
export function loadFont(id: string): Promise<boolean>;
export const fontReady: (id: string) => boolean;
export function engineFor(cfg: FontCfg): unknown;
export const PHOTO_URL: string;
export function photoLoaded(): Promise<boolean>;

export const settingsKey: () => string;
export const segId: (sg: Seg) => string;
export const segSig: (sg: Seg) => string;
export const inkKey: (sg: Seg, px: number) => string;
export const framesOf: (box: Box) => Seg[];
export function setFrame(sg: Seg, patch: { x?: number; y?: number; w?: number }): void;
export function frameRange(box: Box, idx: number): [number, number];
export function textWithoutFrame(box: Box, idx: number): string;
export function splitAtFrame(box: Box, sg: Seg, newId: string): Box;
export function autoName(): string;
export const cleanName: (n: unknown) => string;
export const fileBase: () => string;
export const exportPage: (i: number) => HTMLCanvasElement;
export function fontsInUse(): string[];
export const clearMeasureCache: () => void;

export { S as settings };
declare const S: Settings;
export function fontCfg(): FontCfg;
export function penCfg(): PenCfg;
export function inkColor(): string;
export function inkName(): string;
export function familyCss(cfg: FontCfg): string;
export function fontStr(cfg: FontCfg, size: number): string;
export function boxSettings(box: Box | null | undefined): Settings;
export function hasOwnStyle(box: Box | null | undefined): boolean;
export function withBox<T>(box: Box, fn: () => T): T;
export function computeLayout(): Layout;
/** A margin note's letter size, against the document's. */
export const NOTE_SCALE: number;
/** A part's tilt in radians: 0, or between −3° and −1° for a margin note. */
export function segTilt(sg: Seg): number;
/** The word under a point (page units) on a part, or null when the part has no rows. */
export function hitWord(sg: Seg, x: number, y: number): RowSrc | null;
export function renderSegment(canvas: HTMLCanvasElement, sg: Seg, scale: number): void;
export function segBounds(sg: Seg): Bounds;
/**
 * Draw the first line of `markup` onto `canvas`, `heightPx` tall, as the engine writes it with `settings`
 * (hand, pen, ink, realism, mistakes and seed). Returns the canvas width, or null for blank markup or a
 * first line that isn't words. The engine's settings, document and layout are restored, even if drawing throws.
 */
export function drawSample(canvas: HTMLCanvasElement, settings: Settings, markup: string, heightPx: number): number | null;
export function paintPaper(canvas: HTMLCanvasElement, i: number, pxW: number): void;
export function paperKey(i: number, pxW: number): string;
export function composePage(i: number, pxW: number): HTMLCanvasElement;
export function frameShot(src: HTMLCanvasElement, i: number): HTMLCanvasElement;
/** The angle in radians `frameShot` turns page `i` by (±0.3–0.9°), or 0 without camera tilt. */
export function pageTilt(i: number): number;
export function applyLook(src: HTMLCanvasElement, i: number): HTMLCanvasElement;
export function geom(): Geom;
export function snapX(x: number, g: Geom, w: number): number;
export function snapY(y: number, g: Geom): number;
export function rng(...parts: unknown[]): () => number;
export type { InkLayer, PaperCfg };

export interface InlinePiece { text: string; style: { bold?: true; ul?: true; strike?: true; hl?: true } }
export function parseInline(t: string): InlinePiece[];
export type LineKind = 'newpage' | 'blank' | 'hr' | 'heading' | 'bullet' | 'number' | 'quote' | 'text';
export interface LineInfo { kind: LineKind; level: 0 | 1 | 2 | 3; depth: number; marker: string; content: string; prefix: number }
export function parseLine(raw: string): LineInfo;
export interface RowSrc { li: number; tok: number }
export function srcOffset(text: string, src: RowSrc): number;
