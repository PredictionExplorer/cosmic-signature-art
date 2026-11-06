'use client';
import { useEffect, type RefObject } from 'react';

/**
 * While a wall hung across the seam passes beneath the running head, the head stands on both
 * grounds: <html data-split> clips its night copy to the right half (globals.css), so the head
 * splits at the seam like the wall below it. Each wall holds the split for itself, and the
 * last one to leave the head's line lets it go.
 */
const holders = new Set<object>();

function apply() {
  const root = document.documentElement;
  if (holders.size) root.setAttribute('data-split', '');
  else root.removeAttribute('data-split');
}

export function useSplitHead(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    const holder = {};
    let frame = 0;
    const sample = () => {
      frame = 0;
      const head =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head')) || 48;
      const rect = node.getBoundingClientRect();
      if (rect.top < head && rect.bottom > head) holders.add(holder);
      else holders.delete(holder);
      apply();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sample);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      holders.delete(holder);
      apply();
    };
  }, [ref, enabled]);
}
