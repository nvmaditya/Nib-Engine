/// <reference types="node" />
// The hands' real font files, for tests that need the engine's own outlines and advances.
// (Tests run in Node, so the files are read from disk; the app's tsconfig has no Node types of its own.)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { words } from './docs';

// (Not `new URL(…, import.meta.url)`: Vite turns that into an asset URL.)
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/fonts');
const path = (id: string): string => join(FONT_DIR, `${id}.woff`);
const bytes = (id: string): ArrayBuffer => {
  const b = readFileSync(path(id));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** `fetch('…fonts/<id>.woff')` answers with that hand's real file from `public/fonts`. Callers `vi.unstubAllGlobals()` in `afterAll`. */
export function realFonts(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const m = /fonts\/([\w-]+)\.woff$/.exec(String(url)), id = m ? m[1] : '';
    if (!id || !existsSync(path(id))) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, arrayBuffer: async () => bytes(id) };
  }));
}

/** A hand's real file from `public/fonts`, as a `File` named `name` (as if the user had picked it). */
export const fontFile = (id: string, name: string): File => new File([bytes(id)], name);

/** `n` lines of 60 words each. */
export const paragraphs = (n: number): string => Array.from({ length: n }, () => words(60)).join('\n');
