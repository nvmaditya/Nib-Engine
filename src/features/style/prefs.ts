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

/**
 * A look keeps the handwriting keys (cleaned) and the paper, nothing else. Not the As drawn pen: it is
 * kept only for documents that already draw with it, and isn't offered, so a look doesn't hand it on.
 */
function cleanLookValues(v: unknown): Partial<Settings> {
  const src = isObj(v) ? v : {};
  const out: Partial<Settings> = cleanStyle(Object.fromEntries(BOX_KEYS.filter(k => k in src).map(k => [k, src[k]])));
  if (out.tip === 'font') delete out.tip;
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

const cleanFavourites = (v: unknown): string[] => (Array.isArray(v) ? v.filter((f): f is string => typeof f === 'string') : []);

export async function loadStylePrefs(): Promise<void> {
  let looks: unknown, favourites: unknown, previewText: unknown;
  try {
    [looks, favourites, previewText] = await Promise.all([getPref('looks'), getPref('favourites'), getPref('previewText')]);
  } catch { /* nothing readable: start empty */ }
  useStylePrefs.setState({
    looks: cleanLooks(looks),
    favourites: cleanFavourites(favourites),
    previewText: typeof previewText === 'string' ? previewText.slice(0, 80) : '',
  });
}

/** Uploaded hands first: `cleanStyle` keeps an uploaded hand only once it is registered. */
export async function bootStyle(): Promise<void> {
  await loadUploadedFonts();
  await loadStylePrefs();
}

/**
 * When this tab is shown again, take in what another tab saved meanwhile: its hands, looks,
 * favourites and preview text (once this tab's own changes are written). Returns the remover.
 */
export function refreshStylePrefsOnShow(): () => void {
  const onShow = () => { if (document.visibilityState === 'visible') void queued(bootStyle); };
  document.addEventListener('visibilitychange', onShow);
  return () => document.removeEventListener('visibilitychange', onShow);
}

// Every tab on the device shares the saved looks and favourites. A change is made to the list as it is
// stored now, not as this tab last read it, so what another tab changed meanwhile is kept, and this
// tab's list becomes what was written. This tab's changes run one after another, each on what the one
// before wrote. Stored entries are kept as they are: another tab's look may name a hand this page
// hasn't registered yet, and cleaning it here would write that loss.
let queue: Promise<unknown> = Promise.resolve();
function queued<T>(run: () => Promise<T>): Promise<T> {
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
const latest = { looks: 0, favourites: 0 };
async function changeStored(key: keyof typeof latest, change: (stored: unknown[]) => unknown[]): Promise<void> {
  const n = ++latest[key];
  const next = await queued(async () => {
    const stored = await getPref(key), v = change(Array.isArray(stored) ? stored : []);
    await setPref(key, v);
    return v;
  });
  if (latest[key] !== n) return; // a later change shows its own result, which has this one in it
  useStylePrefs.setState(key === 'looks' ? { looks: cleanLooks(next) } : { favourites: cleanFavourites(next) });
}
const hasId = (l: unknown, id: string): boolean => isObj(l) && l.id === id;

/** Save a look on this device. Shown at once; when it can't be written it goes again, and this rejects. */
export async function addSavedLook(name: string, v: Partial<Settings>): Promise<SavedLook> {
  const look: SavedLook = {
    id: 'look-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim().slice(0, 40).trim() || 'My look',
    v: cleanLookValues(v),
  };
  useStylePrefs.setState(s => ({ looks: [...s.looks, look] }));
  try { await changeStored('looks', ls => [...ls.filter(l => !hasId(l, look.id)), look]); } catch (e) {
    useStylePrefs.setState(s => ({ looks: s.looks.filter(l => l.id !== look.id) }));
    throw e;
  }
  return look;
}

/**
 * Take a saved look off, and say where it was. `kept` is false when the device couldn't store that: the
 * look is off this page's list all the same, but it is still stored, so it may come back.
 */
export async function removeSavedLook(id: string): Promise<{ look: SavedLook; index: number; kept: boolean } | null> {
  const before = useStylePrefs.getState().looks, index = before.findIndex(l => l.id === id);
  if (index < 0) return null;
  useStylePrefs.setState(s => ({ looks: s.looks.filter(l => l.id !== id) }));
  let kept = true;
  try { await changeStored('looks', ls => ls.filter(l => !hasId(l, id))); } catch { kept = false; }
  return { look: before[index], index, kept };
}

/** Put a removed look back where it was (in the list as it is now). */
export async function putBackSavedLook(look: SavedLook, index: number): Promise<void> {
  const put = <T,>(ls: T[]): T[] => {
    if (ls.some(l => hasId(l, look.id))) return ls;
    const next = [...ls];
    next.splice(Math.min(Math.max(index, 0), next.length), 0, look as T);
    return next;
  };
  if (useStylePrefs.getState().looks.some(l => l.id === look.id)) return;
  useStylePrefs.setState(s => ({ looks: put(s.looks) }));
  try { await changeStored('looks', put); } catch { /* back for now */ }
}

/** Star or unstar a hand, as this tab shows it. */
export async function toggleFavourite(fontId: string): Promise<void> {
  const on = !useStylePrefs.getState().favourites.includes(fontId);
  const flip = <T,>(fs: T[]): T[] => { const rest = fs.filter(f => f !== fontId); return on ? [...rest, fontId as T] : rest; };
  useStylePrefs.setState(s => ({ favourites: flip(s.favourites) }));
  try { await changeStored('favourites', flip); } catch { /* kept for this page */ }
}

export async function setPreviewText(text: string): Promise<void> {
  const t = text.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, 80);
  useStylePrefs.setState({ previewText: t });
  try { await setPref('previewText', t); } catch { /* kept for this page */ }
}
