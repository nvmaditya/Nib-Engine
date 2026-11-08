// A header's fields as a list. Pure: each function takes a list and gives a new one, or null when nothing would
// change, so the document model and Import's options share them.
import { uid } from '@/engine/doc.js';
import type { HeaderField } from '@/engine/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A date the way a header writes it: 6 November 2026. */
export const today = (now: Date = new Date()): string => `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

/** A header field's value as the header keeps it: one line (typing keeps its spaces), at most 80 characters. */
export const fieldValue = (value: string): string => value.replace(/[\r\n]+/g, ' ').slice(0, 80);

/** A field as a header to start from keeps it: no id, since each new header gives its own. */
export interface RememberedField { label: string; value: string; today?: true }

const BUILT_IN: RememberedField[] = [{ label: 'Name', value: '' }, { label: 'Class', value: '' }, { label: 'Date', value: '', today: true }];

/** An id for a field added to `list`: one none of its fields has. */
export function newFieldId(list: HeaderField[]): string {
  let id = uid();
  while (list.some(f => f.id === id)) id = uid();
  return id;
}

/**
 * A new header's fields, from `src` or (null) the built-in Name, Class and Date. Their ids are f1…fN, so a header
 * made the same way twice is the same. A date-marked field starts as today's date; the other values are copied.
 */
export function fieldsFrom(src: RememberedField[] | null, now: Date = new Date()): HeaderField[] {
  return (src ?? BUILT_IN).map((f, i): HeaderField => (f.today
    ? { id: `f${i + 1}`, label: f.label, value: today(now), today: true }
    : { id: `f${i + 1}`, label: f.label, value: f.value }));
}

/** The list with field `id`'s value as typing writes it; null for a field the list doesn't have, or the value it already has. */
export function listSetValue(list: HeaderField[], id: string, value: string): HeaderField[] | null {
  const i = list.findIndex(f => f.id === id), v = fieldValue(value);
  if (i < 0 || list[i].value === v) return null;
  return list.map((f, j) => (j === i ? { ...f, value: v } : f));
}
