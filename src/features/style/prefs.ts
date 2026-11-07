import { create } from 'zustand';
import { PAPERS } from '@/engine/config.js';
import { BOX_KEYS, cleanStyle } from '@/engine/doc.js';
import type { Settings } from '@/engine/types';
import { getPref, setPref } from '@/store/documents';
import { loadUploadedFonts } from './fonts';

export interface SavedLook { id: string; name: string; v: Partial<Settings> }
export interface StylePrefs { looks: SavedLook[]; favourites: string[]; previewText: string }

export const useStylePrefs = create<StylePrefs>(() => ({ looks: [], favourites: [], previewText: '' }));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A look keeps the handwriting keys (cleaned) and the paper, nothing else. */
function cleanLookValues(v: unknown): Partial<Settings> {
  const src = isObj(v) ? v : {};
  const out: Partial<Settings> = cleanStyle(Object.fromEntries(BOX_KEYS.filter(k => k in src).map(k => [k, src[k]])));
  if (typeof src.paper === 'string' && Object.prototype.hasOwnProperty.call(PAPERS, src.paper)) out.paper = src.paper;
  return out;
}

function cleanLooks(v: unknown): SavedLook[] {
  if (!Array.isArray(v)) return [];
  const out: SavedLook[] = [];
  for (const l of v) {
    if (!isObj(l) || typeof l.id !== 'string' || typeof l.name !== 'string') continue;
    out.push({ id: l.id, name: l.name.slice(0, 40), v: cleanLookValues(l.v) });
  }
  return out;
}

export async function loadStylePrefs(): Promise<void> {
  let looks: unknown, favourites: unknown, previewText: unknown;
  try {
    [looks, favourites, previewText] = await Promise.all([getPref('looks'), getPref('favourites'), getPref('previewText')]);
  } catch { /* nothing readable: start empty */ }
  useStylePrefs.setState({
    looks: cleanLooks(looks),
    favourites: Array.isArray(favourites) ? favourites.filter((f): f is string => typeof f === 'string') : [],
    previewText: typeof previewText === 'string' ? previewText.slice(0, 80) : '',
  });
}

/** Uploaded hands first: `cleanStyle` keeps an uploaded hand only once it is registered. */
export async function bootStyle(): Promise<void> {
  await loadUploadedFonts();
  await loadStylePrefs();
}

export async function addSavedLook(name: string, v: Partial<Settings>): Promise<SavedLook> {
  const look: SavedLook = {
    id: 'look-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim().slice(0, 40).trim() || 'My look',
    v: cleanLookValues(v),
  };
  const before = useStylePrefs.getState().looks;
  const next = [...before, look];
  useStylePrefs.setState({ looks: next });
  try { await setPref('looks', next); } catch (e) {
    if (useStylePrefs.getState().looks === next) useStylePrefs.setState({ looks: before });
    throw e;
  }
  return look;
}

export async function removeSavedLook(id: string): Promise<{ look: SavedLook; index: number } | null> {
  const before = useStylePrefs.getState().looks, index = before.findIndex(l => l.id === id);
  if (index < 0) return null;
  const next = before.filter(l => l.id !== id);
  useStylePrefs.setState({ looks: next });
  try { await setPref('looks', next); } catch { /* shown as removed for now */ }
  return { look: before[index], index };
}

export async function putBackSavedLook(look: SavedLook, index: number): Promise<void> {
  const cur = useStylePrefs.getState().looks;
  if (cur.some(l => l.id === look.id)) return;
  const next = [...cur];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, look);
  useStylePrefs.setState({ looks: next });
  try { await setPref('looks', next); } catch { /* back for now */ }
}

export async function toggleFavourite(fontId: string): Promise<void> {
  const cur = useStylePrefs.getState().favourites;
  const next = cur.includes(fontId) ? cur.filter(f => f !== fontId) : [...cur, fontId];
  useStylePrefs.setState({ favourites: next });
  try { await setPref('favourites', next); } catch { /* kept for this page */ }
}

export async function setPreviewText(text: string): Promise<void> {
  const t = text.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, 80);
  useStylePrefs.setState({ previewText: t });
  try { await setPref('previewText', t); } catch { /* kept for this page */ }
}
