import { useCallback, useEffect, useState, type RefObject } from 'react';
import { lendPlateTone, returnPlateTone } from './room-ground';

/**
 * Where the orbit section stands to the visitor (orbit-score.tsx). It is near once it is a
 * screen away, so the derivation can begin before it is seen. It is in view while any of it
 * shows, so it is drawn only then. While it stands beneath the running head, it lends the head
 * the night: a band the height of the head at the top of the viewport, so a section taller than
 * the screen still takes the head.
 *
 * Nothing is near on the server. A browser without IntersectionObserver is near at once.
 */
export function useOrbitPresence(section: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setNear(true));
      return;
    }
    const holder = {};
    const approach = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '100% 0px',
    });
    const view = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    const head = new IntersectionObserver(
      ([entry]) =>
        entry.isIntersecting ? lendPlateTone(holder, '#000000', 'night') : returnPlateTone(holder),
      // Two pixels down, so a section that only touches the top edge has left the head.
      { rootMargin: '-2px 0px -92% 0px' },
    );
    approach.observe(node);
    view.observe(node);
    head.observe(node);
    return () => {
      approach.disconnect();
      view.disconnect();
      head.disconnect();
      returnPlateTone(holder);
    };
  }, [section]);
  /** Brought near on request: the plate's word asks for the orbit before the visitor reaches it. */
  const bringNear = useCallback(() => setNear(true), []);
  return { near, inView, bringNear };
}
