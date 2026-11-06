// A header block's fields (Name, Class, Subject, Roll no., Date), each written as one line of the header.
import { Fragment, useId } from 'react';
import { HEADER_FIELDS } from '@/engine/doc.js';
import { Input } from '@/components/ui/input';
import { setField } from '@/features/doc/actions';
import { cn } from '@/lib/utils';
import { useEditor } from '@/store/editor';

/**
 * Labelled inputs for the fields the header has, in the order it writes them. `compact` is for the typed
 * page: no boxes, and the text size and line height of the page around it.
 */
export function HeaderFields({ boxId, compact = false }: { boxId: string; compact?: boolean }) {
  // Changing a field replaces the fields object, so this re-renders on every change (and on undo).
  const fields = useEditor(s => s.doc.boxes.find(b => b.id === boxId && b.kind === 'header')?.fields);
  const id = useId();
  if (!fields) return null;
  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center', compact ? 'gap-x-[0.5em]' : 'gap-x-3 gap-y-2')}>
      {HEADER_FIELDS.filter(([k]) => typeof fields[k] === 'string').map(([k, label]) => (
        <Fragment key={k}>
          <label htmlFor={id + k} className={cn('whitespace-nowrap text-muted', compact ? '' : 'text-[13px] font-medium')}>{label}</label>
          <Input id={id + k} value={fields[k]} maxLength={80} autoComplete="off" onChange={e => setField(boxId, k, e.target.value)}
            className={compact ? 'h-auto rounded-sm border-0 border-b border-line bg-transparent px-[0.25em] py-0 text-[length:inherit] leading-[inherit] focus-visible:ring-2 focus-visible:ring-ring/50' : undefined} />
        </Fragment>
      ))}
    </div>
  );
}
