'use client';
import { useEffect, useRef } from 'react';

/**
 * A row that scrolls sideways when its words do not fit says so: this marks each edge beyond
 * which some of the row lies, `data-more-start` and `data-more-end`, for a stylesheet to fade.
 * It measures on scroll, on any resize of the row or a word in it (a font arriving), and when
 * its words change (a navigation swaps a link), once a frame at most, and writes attributes
 * rather than state, so a scroll never renders. A row that fits, or a browser without
 * ResizeObserver, carries neither mark.
 */
export function useScrollEdges<Row extends HTMLElement>() {
  const row = useRef<Row>(null);
  useEffect(() => {
    const node = row.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const beyond = node.scrollWidth - node.clientWidth;
      // A pixel of rounding is not a word out of sight.
      node.toggleAttribute('data-more-start', beyond > 1 && node.scrollLeft > 1);
      node.toggleAttribute('data-more-end', beyond > 1 && node.scrollLeft < beyond - 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    const watch = () => {
      for (const word of node.children) observer.observe(word);
    };
    observer.observe(node);
    watch();
    // New words are watched as they arrive; observing one already watched changes nothing.
    const words = new MutationObserver(() => {
      watch();
      schedule();
    });
    words.observe(node, { childList: true, subtree: true, characterData: true });
    node.addEventListener('scroll', schedule, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      words.disconnect();
      node.removeEventListener('scroll', schedule);
      node.removeAttribute('data-more-start');
      node.removeAttribute('data-more-end');
    };
  }, []);
  return row;
}
