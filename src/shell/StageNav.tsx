import { navigate, type Stage } from '@/app/route';
import { cn } from '@/lib/utils';

const ITEMS: { stage: Stage; label: string }[] = [
  { stage: 'write', label: '1 Write' },
  { stage: 'style', label: '2 Style' },
  { stage: 'export', label: '3 Export' },
];

export function StageNav({ id, stage }: { id: string; stage: Stage }) {
  const active: Stage = stage === 'outline' ? 'write' : stage;
  return (
    <nav aria-label="Stages" className="flex items-center gap-1">
      {ITEMS.map(it => (
        <button
          key={it.stage}
          type="button"
          aria-current={active === it.stage ? 'step' : undefined}
          onClick={() => navigate({ name: 'doc', id, stage: it.stage })}
          className={cn(
            'h-8 rounded-md px-3 text-sm font-medium transition-colors',
            active === it.stage ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >{it.label}</button>
      ))}
    </nav>
  );
}
