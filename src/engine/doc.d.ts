import type { Settings, EngineDoc, Box, BlockKind, HeaderKey, HeaderFields } from './types';

export const uid: () => string;
export const BOX_KEYS: string[];
export function cleanStyle(st: unknown): Partial<Settings>;
export const HEADER_FIELDS: [HeaderKey, string][];
export const DEFAULT_NAMES: Record<BlockKind, string>;
export function headerText(f: HeaderFields): string;
export function migrateDoc(doc: EngineDoc, fromSchema: number): EngineDoc;
export function cleanDoc(d: unknown): EngineDoc | null;
export function cleanSettings(raw: unknown, legacy?: boolean): Settings;
export function sampleDoc(S: Settings): EngineDoc;
export function loadSaved(): { S: Settings; doc: EngineDoc };
export function saveSoon(S: Settings, doc: EngineDoc): void;
export type { Box };
