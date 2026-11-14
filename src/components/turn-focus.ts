'use client';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/*
  The focus across a Turn.

  The plate's two layers each carry the strip's words, and the layer that leaves goes inert
  (turn.tsx, TurnLayer). A word that held the focus there drops it to the page, and no blur
  says so: a keyboard is left on nothing in the middle of the strip, a second Enter turns
  nothing back, and a screen reader loses its place (WCAG 2.2, 2.4.3 Focus Order). So the
  focus is handed on at the source. A Turn asked for from the keyboard notes where the focus
  stands, while the word is still there to ask; once the plate has turned, the matching word
  of the layer now on view takes it, without a scroll.

  The note has to last: the still is readied before the Turn travels, and the commit can come
  seconds after the key. It is read again as the Turn lands, since the visitor may have moved
  on in the meantime: to another word of the same strip, which is handed on in its turn, or
  out of the strip, where the focus stays. It is dropped when the still cannot be had, and by
  whatever asks for a Turn without the keyboard: a pointer's Turn moves no focus.
*/

const LIVE = '[data-layer-state="current"]';
const LEFT = '[data-layer-state="twin"]';
/** What marks each of the strip's words: a word of one layer has its match in the other. */
const WORDS = ['[data-turn]', '[data-film-word]', '[data-after-the-frame]'];
const OPTIONS = '[data-viewing-options]';

/**
 * The word of `layer` that matches `from`, a control of the other layer's strip: the Turn's
 * word for the Turn's, the film's for the film's, the options for the options or anything
 * inside their panel. A word with no match there (After the frame, once the film is to play
 * again) gives way to the Turn's word, which every plate with two expressions has.
 */
export function matchingWord(from: Element, layer: Element): HTMLElement | null {
  const mark = from.closest(`${OPTIONS}, [data-viewing-options-panel]`)
    ? OPTIONS
    : WORDS.find((word) => from.matches(word));
  return (
    (mark ? layer.querySelector<HTMLElement>(mark) : null) ??
    layer.querySelector<HTMLElement>('[data-turn]')
  );
}

export function useTurnFocus({
  section,
  expression,
  failedExpression,
}: {
  /** The viewer's section: the two layers are looked for inside it. */
  section: RefObject<HTMLElement | null>;
  /** The committed expression. */
  expression: string;
  /** The expression whose still could not be had: its Turn never lands. */
  failedExpression: string | null;
}) {
  /** A Turn asked for by a key, and the control of the strip the focus stood on. */
  const noted = useRef<{ to: string; from: HTMLElement } | null>(null);

  /** The control of the layer on view that has the focus, if one has. */
  function standing(): HTMLElement | null {
    const active = document.activeElement;
    const live = section.current?.querySelector(LIVE);
    return active instanceof HTMLElement && live?.contains(active) ? active : null;
  }

  // The plate has turned, and its DOM says so; the browser has not yet painted, nor (where it
  // waits for the next frame to do it) taken the focus from the layer that left. The word
  // takes it here, so the focus goes from one word to the other and is never the page's.
  useLayoutEffect(() => {
    const note = noted.current;
    noted.current = null;
    const live = section.current?.querySelector(LIVE);
    if (!note || note.to !== expression || !live) return;
    const active = document.activeElement;
    // Still where it stood, or already dropped to the page by the layer going inert.
    const dropped = !active || active === document.body;
    const left = !!active?.closest(LEFT) && !!section.current?.contains(active);
    if (!dropped && !left) return;
    matchingWord(left && active ? active : note.from, live)?.focus({ preventScroll: true });
  }, [section, expression]);

  useEffect(() => {
    if (failedExpression) noted.current = null;
  }, [failedExpression]);

  return {
    standing,
    /** A key asks for a Turn to `to`: the focus is handed on if it stands in the strip. */
    note(to: string) {
      const from = standing();
      noted.current = from ? { to, from } : null;
    },
    /** A Turn asked for otherwise, or none at all: nothing is handed on. */
    drop() {
      noted.current = null;
    },
    /**
     * The Turn is about to land. The focus is read while the layer is still live: on another
     * word of the strip it is that word's to hand on, and anywhere else (the visitor moved
     * it, or pressed the bare page) it stays where it is.
     */
    landing() {
      const note = noted.current;
      if (!note) return;
      const from = standing();
      noted.current = from ? { to: note.to, from } : null;
    },
    /**
     * Where the focus goes back to when the room closes: `opener` itself, or, when the room
     * turned the plate and `opener` is in the layer that left (or went with it), its match.
     */
    afterRoom(opener: HTMLElement | null): HTMLElement | null {
      const live = section.current?.querySelector(LIVE);
      if (!opener || !live) return opener;
      return !opener.isConnected || opener.closest(LEFT) ? matchingWord(opener, live) : opener;
    },
  };
}
