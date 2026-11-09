'use client';
import { useEffect, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { MARKS, placeAt, readPlace, scrollFor, type Place } from '@/lib/reading-place';
import { PLACE_KEY } from '@/lib/storage-keys';

/*
  The reader's place across a change of language (src/lib/reading-place.ts). A language link keeps
  where the reader stands for the page it goes to; the page, arriving, puts the same mark back at
  the reading line, again as its fonts, images and late-streamed parts settle, and lets go the
  moment the reader moves. Without storage the page simply opens at its top, as it always has.
*/

/** The reading line: just below the running head, where the eye picks the page up again. */
function readingLine() {
  const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head'));
  return (Number.isFinite(head) ? head : 48) + 16;
}

/** The page's marks that hold no other marks, shown, in reading order. */
function marks(): HTMLElement[] {
  const main = document.querySelector('main');
  if (!main) return [];
  return [...main.querySelectorAll<HTMLElement>(MARKS)].filter(
    (mark) => !mark.querySelector(MARKS) && mark.getClientRects().length > 0,
  );
}

/** On the way to another language: where the reader stands, kept for the page they go to. */
export function keepPlace(to: string) {
  try {
    // At the top of a page there is no place to keep: the other page opens at its top too.
    if (window.scrollY < 8) {
      sessionStorage.removeItem(PLACE_KEY);
      return;
    }
    const found = marks();
    const at = placeAt(
      found.map((mark) => mark.getBoundingClientRect()),
      readingLine(),
    );
    if (!at) return;
    // An id the page wrote itself names the same mark in every language; one React generated
    // (useId's "_R_…") may not, so the mark is found by its place instead.
    const id = found[at.index].id;
    const place: Place = {
      to: new URL(to, window.location.href).pathname,
      id: id && /^[a-z][\w-]*$/i.test(id) ? id : undefined,
      index: at.index,
      count: found.length,
      share: at.share,
    };
    sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    /* Storage is optional: the page opens at its top. */
  }
}

/** A language link's click: a plain click keeps the place, a click meant for another tab does not. */
export function keepPlaceOnClick(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  keepPlace(event.currentTarget.href);
}

/**
 * The place kept for this page, let go as it is read; a place kept for another page waits for
 * that page. Null where none was kept, or storage cannot be read.
 */
function takePlace(): Place | null {
  try {
    const place = readPlace(sessionStorage.getItem(PLACE_KEY));
    if (!place || place.to !== window.location.pathname) return null;
    sessionStorage.removeItem(PLACE_KEY);
    return place;
  } catch {
    return null;
  }
}

/** When the page puts the kept mark back: at once, then as the page settles. */
const SETTLING_MS = [150, 500, 1_200, 2_400] as const;

/** On arrival: the place kept for this page, put back at the reading line as the page settles. */
export function ReadingPlace() {
  const pathname = usePathname();
  useEffect(() => {
    const place = takePlace();
    if (!place) return;
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const finish = () => {
      done = true;
      timers.forEach(clearTimeout);
      inputs.forEach((name) => window.removeEventListener(name, finish));
    };
    // The reader takes over the moment they move.
    inputs.forEach((name) => window.addEventListener(name, finish, { passive: true }));
    const put = (last: boolean) => {
      if (done) return;
      const found = marks();
      const named = place.id ? document.getElementById(place.id) : null;
      // By its id, else by its place once the page holds as many marks as were kept (what streams
      // in last is not yet there before), else, the last time, the nearest it can be.
      const mark =
        named ??
        (found.length === place.count || last
          ? found[Math.min(place.index, found.length - 1)]
          : undefined);
      if (mark) {
        const top = scrollFor(
          mark.getBoundingClientRect(),
          place.share,
          readingLine(),
          window.scrollY,
        );
        window.scrollTo({ top, behavior: 'instant' });
      }
      if (last) finish();
    };
    const frame = requestAnimationFrame(() => put(false));
    SETTLING_MS.forEach((at, index) =>
      timers.push(setTimeout(() => put(index === SETTLING_MS.length - 1), at)),
    );
    void document.fonts?.ready.then(() => put(false));
    return () => {
      cancelAnimationFrame(frame);
      finish();
    };
  }, [pathname]);
  return null;
}
