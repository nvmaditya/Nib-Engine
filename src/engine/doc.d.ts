import type { Settings, EngineDoc, Box } from './types';

export const uid: () => string;
export const BOX_KEYS: string[];
export function cleanStyle(st: unknown): Partial<Settings>;
export function cleanDoc(d: unknown): EngineDoc | null;
export function cleanSettings(raw: unknown, legacy?: boolean): Settings;
export function sampleDoc(S: Settings): EngineDoc;
export function loadSaved(): { S: Settings; doc: EngineDoc };
export function saveSoon(S: Settings, doc: EngineDoc): void;
export type { Box };
