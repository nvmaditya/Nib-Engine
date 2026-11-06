import type { ReadResult } from './types';

export function readDocument(file: File): Promise<ReadResult>;
export function importError(code: string): string;
