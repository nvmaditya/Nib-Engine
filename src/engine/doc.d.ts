import type { Settings, EngineDoc, Box, BlockKind, HeaderKey, HeaderField } from './types';

export const uid: () => string;
export const BOX_KEYS: string[];
export function cleanStyle(st: unknown): Partial<Settings>;
/** The fixed fields' keys and labels before schema 4, in their order (converting only). */
export const HEADER_FIELDS: [HeaderKey, string][];
/** At most 12 fields in a header, labels of at most 30 characters and values of at most 80. */
export const HEADER_LIMITS: { readonly fields: 12; readonly label: 30; readonly value: 80 };
export const DEFAULT_NAMES: Record<BlockKind, string>;
/** A field's label as a header keeps it: one line, trimmed, at most 30 characters; `Field` when that leaves nothing. */
export function headerLabel(raw: unknown): string;
/** The header's text: one `Label: value` line per field (`Label:` when empty), markup in either written as typed. */
export function headerText(fields: HeaderField[]): string;
/**
 * A header's fields made safe: a list (schema 4) is checked and clamped, the fixed-key object of schema 3 and
 * earlier becomes a list in its old order, and anything else (or nothing left) is the three blanks Name, Class, Date.
 */
export function cleanFields(f: unknown): HeaderField[];
export function migrateDoc(doc: EngineDoc, fromSchema: number): EngineDoc;
export function cleanDoc(d: unknown): EngineDoc | null;
export function cleanSettings(raw: unknown, legacy?: boolean): Settings;
export function sampleDoc(S: Settings): EngineDoc;
export function loadSaved(): { S: Settings; doc: EngineDoc };
export function saveSoon(S: Settings, doc: EngineDoc): void;
export type { Box };
