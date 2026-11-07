import { FONTS } from '@/engine/config.js';
import { engineFor } from '@/engine/core.js';
import type { FontCfg } from '@/engine/types';
import { getDb } from '@/store/db';
import { getPref, setPref } from '@/store/documents';

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

/** The first four bytes of a TrueType, OpenType or WOFF file (0x00010000, `true`, `OTTO`, `wOFF`). */
const SIGNATURES = [0x00010000, 0x74727565, 0x4f54544f, 0x774f4646];
const fontSignature = (buf: ArrayBuffer): boolean => buf.byteLength >= 12 && SIGNATURES.includes(new DataView(buf).getUint32(0));

/**
 * Make an uploaded font available as a hand. The engine reads its outlines through `engineFor`,
 * the way it reads a built-in hand's; a new file it can't read is not added. A `stored` one was read
 * when it was added, so start-up doesn't wait to read every file again: its outlines are read the first
 * time it is drawn (its file is here, so `fontReady` is true), and only a file that isn't a font file at
 * all is skipped. The FontFace is only for the interface and the canvas fallback.
 */
export function registerFont(rec: FontRecord, stored = false): FontCfg | null {
  const have = FONTS.find(f => f.id === rec.id);
  if (have) return have;
  const cfg: FontCfg = {
    id: rec.id, name: rec.name, family: 'Nib Upload ' + rec.id, weight: 400, scale: 1, group: 'mine', local: true,
    buf: rec.buf, forms: rec.forms > 1 ? rec.forms : undefined,
  };
  if (stored ? !fontSignature(rec.buf) : !engineFor(cfg)) return null;
  FONTS.push(cfg);
  if (typeof FontFace === 'function' && typeof document !== 'undefined' && document.fonts) {
    try {
      const face = new FontFace(cfg.family, rec.buf.slice(0));
      void face.load().then(() => { document.fonts.add(face); }, () => {});
    } catch { /* the interface just uses its own font */ }
  }
  return cfg;
}

/**
 * Whether the engine can read a hand's outlines. A built-in hand's always can be. An uploaded one's are
 * read the first time this asks (or it is drawn), and the engine keeps what it read, so a stored file
 * that is signed as a font but isn't one is found out once, and then said in its note.
 */
export function handReadable(cfg: FontCfg): boolean {
  return !cfg.local || engineFor(cfg) !== null;
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
  if (have) {
    const forms = have.forms ?? 1;
    if (await getPref(FONT_KEY_PREFIX + id).catch(() => undefined)) return { ok: true, id, name: have.name, forms, kept: true, existed: true };
    // A hand on this page only: the device couldn't keep it the first time. Try again, and say how that went, as for a new one.
    const kept = await keep({ id, name: have.name, buf, forms, addedAt: Date.now() });
    return { ok: true, id, name: have.name, forms, kept, existed: false };
  }
  const probe: FontCfg = { id, name: fileName(file), family: 'Nib Upload ' + id, weight: 400, scale: 1, group: 'mine', local: true, buf };
  const eng = engineFor(probe) as { letterAlts: number } | null;
  if (!eng) return { ok: false, reason: 'unreadable' };
  const per = Math.round(eng.letterAlts / 26);
  const rec: FontRecord = { id, name: probe.name, buf, forms: per > 0 ? per + 1 : 1, addedAt: Date.now() };
  if (!registerFont(rec)) return { ok: false, reason: 'unreadable' };
  return { ok: true, id, name: rec.name, forms: rec.forms, kept: await keep(rec), existed: false };
}

/** Keep a font on the device; false when storage refuses it. */
async function keep(rec: FontRecord): Promise<boolean> {
  try { await setPref(FONT_KEY_PREFIX + rec.id, rec); return true; } catch { return false; }
}

const RANGE = () => IDBKeyRange.bound(FONT_KEY_PREFIX, FONT_KEY_PREFIX + '￿');

function wellFormed(v: unknown): v is FontRecord {
  const r = v as Partial<FontRecord> | null;
  return !!r && typeof r === 'object' && typeof r.id === 'string' && /^up-[0-9a-z]+-[0-9a-z]+$/.test(r.id)
    && typeof r.name === 'string' && Object.prototype.toString.call(r.buf) === '[object ArrayBuffer]' && (r.buf as ArrayBuffer).byteLength > 0
    && typeof r.forms === 'number' && typeof r.addedAt === 'number';
}

/**
 * Register every stored font this page doesn't have yet, and say how many. Run before any document is
 * read (another tab may have added a font since this page started), so no document loses its hand.
 * Only the new ones' files are read, so it is cheap to run again. Never rejects.
 */
export async function loadUploadedFonts(): Promise<number> {
  try {
    const db = await getDb();
    const keys = (await db.getAllKeys('prefs', RANGE())).map(String);
    const missing = keys.filter(k => !unusable.has(k) && !FONTS.some(f => FONT_KEY_PREFIX + f.id === k));
    if (!missing.length) return 0;
    const tx = db.transaction('prefs');
    const found = await Promise.all(missing.map(async key => ({ key, rec: (await tx.store.get(key)) as unknown })));
    let n = 0;
    for (const { key, rec } of found.sort((a, b) => order(a.rec) - order(b.rec))) {
      let ok = false;
      try { ok = wellFormed(rec) && !!registerFont(rec, true); } catch { /* skip this one */ }
      if (ok) n++; else unusable.add(key);
    }
    return n;
  } catch { return 0; }
}
/** Stored records that aren't a font Nib can use: they are not read again. */
const unusable = new Set<string>();
const order = (rec: unknown): number => (wellFormed(rec) ? rec.addedAt : 0);

export async function storedFontIds(): Promise<string[]> {
  try { return (await (await getDb()).getAllKeys('prefs', RANGE())).map(k => String(k).slice(FONT_KEY_PREFIX.length)); } catch { return []; }
}
