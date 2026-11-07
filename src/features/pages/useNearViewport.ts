// Whether an element is near what can be seen, so pages far from view (or in a hidden stage) draw nothing.
import { useEffect, useState, type RefObject } from 'react';
import { useStageActive } from '@/features/doc/StageHost';

/**
 * The nearest ancestor that scrolls (overflow auto or scroll): the pages column on wide screens, the
 * whole stage on phones. With `scrolling`, only one whose content is taller than it is right now.
 */
export function scrollerOf(el: Element, scrolling = false): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && (!scrolling || p.scrollHeight > p.clientHeight)) return p;
  }
  return null;
}

/**
 * True while `ref` is within `margin` of its scroller's visible area, measured by an IntersectionObserver
 * on that scroller. Always true where there is no IntersectionObserver, and false while the stage is hidden.
 */
export function useNearViewport(ref: RefObject<Element | null>, margin = '150%'): boolean {
  const active = useStageActive();
  const [near, setNear] = useState(() => typeof IntersectionObserver !== 'function');
  const [root, setRoot] = useState<HTMLElement | null | undefined>(undefined);

  // What scrolls changes at the wide breakpoint (the pages column, or the whole stage).
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const find = () => setRoot(scrollerOf(el));
    find();
    window.addEventListener('resize', find);
    return () => window.removeEventListener('resize', find);
  }, [ref, active]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active || root === undefined || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      if (e) setNear(e.isIntersecting);
    }, { root, rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, active, root, margin]);

  return active && near;
}
