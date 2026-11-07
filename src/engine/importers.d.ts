import type { ReadResult } from './types';

export type ImportCode = 'scan' | 'password' | 'locked' | 'doc' | 'rtf' | 'odt' | 'image' | 'type' | 'empty' | 'big' | 'lib' | 'read';

/** Rejects with an `Error` whose `code` is an `ImportCode`. */
export function readDocument(file: File): Promise<ReadResult>;
export function importError(code: string): string;
