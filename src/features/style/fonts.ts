import { FONTS } from '@/engine/config.js';
import { engineFor } from '@/engine/core.js';
import type { FontCfg } from '@/engine/types';
import { getDb } from '@/store/db';
import { setPref } from '@/store/documents';

/** A font file kept on the device, in `prefs` under `font:<id>`. */
export interface FontRecord { id: string; name: string; buf: ArrayBuffer; forms: number; addedAt: number }

export const FONT_KEY_PREFIX = 'font:';
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff'];

export type AddFontResult =
  | { ok: true; id: string; name: string; forms: number; kept: boolean; existed: boolean }
  | { ok: false; reason: 'type' | 'unreadable' };

function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  return h >>> 0;
}

/** The same file is always the same font: its hash and length. */
export function fontId(buf: ArrayBuffer): string {
  return 'up-' + fnv1a32(new Uint8Array(buf)).toString(36) + '-' + buf.byteLength.toString(36);
}

/**
 * Make an uploaded font available as a hand. The engine reads its outlines through `engineFor`,
 * the way it reads a built-in hand's; a file it can't read is not added. The FontFace is only for
 * the interface and the canvas fallback.
 */
export function registerFont(rec: FontRecord): FontCfg | null {
  const have = FONTS.find(f => f.id === rec.id);
  if (have) return have;
  const cfg: FontCfg = {
    id: rec.id, name: rec.name, family: 'Nib Upload ' + rec.id, weight: 400, scale: 1, group: 'mine', local: true,
    buf: rec.buf, forms: rec.forms > 1 ? rec.forms : undefined,
  };
  if (!engineFor(cfg)) return null;
  FONTS.push(cfg);
  if (typeof FontFace === 'function' && typeof document !== 'undefined' && document.fonts) {
    try {
      const face = new FontFace(cfg.family, rec.buf.slice(0));
      void face.load().then(() => { document.fonts.add(face); }, () => {});
    } catch { /* the interface just uses its own font */ }
  }
  return cfg;
}

function fileName(file: File): string {
  return file.name.replace(/\.[^.]*$/, '').trim().slice(0, 40).trim() || 'Your font';
}

export async function addFontFile(file: File): Promise<AddFontResult> {
  const lower = file.name.toLowerCase();
  if (!FONT_EXTENSIONS.some(x => lower.endsWith(x))) return { ok: false, reason: 'type' };
  let buf: ArrayBuffer;
  try { buf = await file.arrayBuffer(); } catch { return { ok: false, reason: 'unreadable' }; }
  const id = fontId(buf);
  const have = FONTS.find(f => f.id === id);
  if (have) return { ok: true, id, name: have.name, forms: have.forms ?? 1, kept: true, existed: true };
  const probe: FontCfg = { id, name: fileName(file), family: 'Nib Upload ' + id, weight: 400, scale: 1, group: 'mine', local: true, buf };
  const eng = engineFor(probe) as { letterAlts: number } | null;
  if (!eng) return { ok: false, reason: 'unreadable' };
  const per = Math.round(eng.letterAlts / 26);
  const rec: FontRecord = { id, name: probe.name, buf, forms: per > 0 ? per + 1 : 1, addedAt: Date.now() };
  if (!registerFont(rec)) return { ok: false, reason: 'unreadable' };
  let kept = true;
  try { await setPref(FONT_KEY_PREFIX + id, rec); } catch { kept = false; }
  return { ok: true, id, name: rec.name, forms: rec.forms, kept, existed: false };
}

const RANGE = () => IDBKeyRange.bound(FONT_KEY_PREFIX, FONT_KEY_PREFIX + '￿');

function wellFormed(v: unknown): v is FontRecord {
  const r = v as Partial<FontRecord> | null;
  return !!r && typeof r === 'object' && typeof r.id === 'string' && /^up-[0-9a-z]+-[0-9a-z]+$/.test(r.id)
    && typeof r.name === 'string' && Object.prototype.toString.call(r.buf) === '[object ArrayBuffer]' && (r.buf as ArrayBuffer).byteLength > 0
    && typeof r.forms === 'number' && typeof r.addedAt === 'number';
}

/** Register every stored font. Run before any document is read, so no document loses its hand. Never rejects. */
export async function loadUploadedFonts(): Promise<number> {
  try {
    const all = (await (await getDb()).getAll('prefs', RANGE())) as unknown[];
    const recs = all.filter(wellFormed).sort((a, b) => a.addedAt - b.addedAt);
    let n = 0;
    for (const rec of recs) { try { if (registerFont(rec)) n++; } catch { /* skip this one */ } }
    return n;
  } catch { return 0; }
}

export async function storedFontIds(): Promise<string[]> {
  try { return (await (await getDb()).getAllKeys('prefs', RANGE())).map(k => String(k).slice(FONT_KEY_PREFIX.length)); } catch { return []; }
}
