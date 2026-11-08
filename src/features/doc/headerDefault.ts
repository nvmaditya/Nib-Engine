// The fields every new header starts with: Add → Header, the Assignment template and Import's header block.
import type { HeaderField } from '@/engine/types';
import { fieldsFrom } from './headerFields';

/** A new header's fields: Name, Class and Date, with today's date. */
export function defaultHeaderFields(now: Date = new Date()): HeaderField[] {
  return fieldsFrom(null, now);
}
