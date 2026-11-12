import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from 'react';

/*
  The picture's room, past the frame (docs/after-the-frame.md §8.3).

  Past the frame the whole picture is the subject: its four edges, the line beneath it and the
  words stand in one screen, so the caption and the score step aside (orbit-score.module.css)
  and, as a performance begins, the page brings the picture just under the running head, unless
  all of that is in view already. Leaving, the caption and the score return, and the words are
  kept in view. Either is the visitor's own act: the word they pressed.

  This hook owns the two things that takes: the height the picture is fitted to, and the page's
  scroll. Nothing here moves the page unasked.
*/

/** Past the frame the picture is brought this far beneath the running head, in pixels… */
const BENEATH_HEAD = 6;
/** …and this much of the screen is left to spare under what stands beneath it. */
const BENEATH_SPARE = 6;

export function usePictureRoom({
  section,
  stage,
  beneath,
  wordsRow,
  run,
  reducedMotion,
}: {
  section: RefObject<HTMLElement | null>;
  /** The picture. */
  stage: RefObject<HTMLDivElement | null>;
  /** The line beneath the picture and its words: what must stand in view with it. */
  beneath: RefObject<HTMLDivElement | null>;
  /** The words themselves: kept under the hand that pressed one, on the way back. */
  wordsRow: RefObject<HTMLDivElement | null>;
  /** Which performance past the frame stands, by its count; null at the frame. */
  run: number | null;
  reducedMotion: boolean;
}) {
  const composing = useRef(0);
  /** Where the words stood as the visitor left After the frame, so they stay under the hand. */
  const wordsWere = useRef<{ top: number; bottom: number } | null>(null);
  /**
   * Whether the performance now beginning may move the page to its picture: always when the
   * visitor has just asked, and only if they are still here when it had to wait for its path.
   * It is taken once (`compose`): a picture that comes back unasked moves nothing.
   */
  const arriving = useRef<'bring' | 'if-here' | null>(null);
  const performed = useRef(false);

  /**
   * Past the frame the plate is fitted to the height its screen leaves beside what stands
   * beneath it: the label, the line's room (that of the tallest thing that can come to stand
   * in it, in this language at this width) and the words. That room is found here, once it is
   * laid out, and given to the stylesheet (--beneath-measured: orbit-score.module.css). On a
   * phone it does not depend on the plate's own size, and is found in one pass. On a desk, and
   * between 700 and 860 px, what stands beneath is as wide as the plate: a room taller than
   * the desk's 172 px narrows both, a telling may then take a line more, and the section's
   * observer of the room finds that in a further pass. At the frame it is not given, and the
   * plate is the size it always was.
   */
  const fit = () => {
    const node = section.current;
    if (!node) return;
    const picture = stage.current?.getBoundingClientRect();
    const under = beneath.current?.getBoundingClientRect();
    if (run === null || !picture || !under) node.style.removeProperty('--beneath-measured');
    else
      node.style.setProperty(
        '--beneath-measured',
        `${Math.ceil(under.bottom - picture.bottom) + BENEATH_HEAD + BENEATH_SPARE}px`,
      );
  };
  /** The page as it should stand, past the frame (`past`) or back at it. */
  const compose = (past: boolean) => {
    cancelAnimationFrame(composing.current);
    // First of all, so that the page is brought to the picture as it will stand.
    fit();
    /** Where the picture and what stands beneath it are in the window now. */
    const stands = () => {
      const picture = stage.current?.getBoundingClientRect();
      const words = beneath.current?.getBoundingClientRect();
      if (!section.current || !picture || !words) return null;
      const head = parseFloat(getComputedStyle(section.current).scrollMarginTop) || 0;
      return { picture, words, head, room: window.innerHeight };
    };
    const now = stands();
    if (!now) return;
    if (!past) {
      // Back at the frame the caption and the score return above the words. They are put back
      // where they stood under the hand that pressed one: at once, before the next paint, and
      // once more two frames on, when the browser has answered the change in its own way.
      const were = wordsWere.current;
      wordsWere.current = null;
      if (!were || were.bottom <= now.head || were.top >= now.room) return;
      const back = () => {
        const top = wordsRow.current?.getBoundingClientRect().top;
        if (top === undefined || Math.abs(top - were.top) < 1) return;
        window.scrollTo({ top: window.scrollY + top - were.top, behavior: 'instant' });
      };
      back();
      composing.current = requestAnimationFrame(() => {
        composing.current = requestAnimationFrame(back);
      });
      return;
    }
    // The page moves to the picture only as the visitor's own act: their word for it, taken
    // once. A picture that stands past the frame again without one (a plate turned back to
    // the material its orbit is drawn on) is left where the page is.
    const asked = arriving.current;
    arriving.current = null;
    if (!asked) return;
    // A performance that waited for its path found the page already on its way here, by the
    // plate's word: if the visitor is still here it ends on the picture, wherever that scroll
    // has reached. One they asked for here moves nothing when all of it is in view.
    const waited = asked === 'if-here';
    const here = now.picture.bottom > now.head && now.picture.top < now.room;
    if (waited ? !here : now.picture.top >= now.head && now.words.bottom <= now.room) return;
    const bring = () => {
      const at = stands();
      if (!at) return;
      window.scrollTo({
        top: window.scrollY + at.picture.top - at.head - BENEATH_HEAD,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    };
    if (reducedMotion) {
      bring();
      return;
    }
    // Two frames on, and measured again there. The note above the picture grows a line as the
    // performance begins, the browser's scroll anchoring answers that in the next frame, and
    // WebKit cancels a smooth scroll begun in the frame of a change it has to answer.
    composing.current = requestAnimationFrame(() => {
      composing.current = requestAnimationFrame(bring);
    });
  };
  const composed = useEffectEvent(compose);
  useLayoutEffect(() => {
    // Nothing moves when the section first stands, only when the visitor goes past the frame or back.
    if (run === null && !performed.current) return;
    performed.current = run !== null;
    composed(run !== null);
    return () => cancelAnimationFrame(composing.current);
  }, [run]);

  return {
    /** Fits the picture again: what stands beneath it has taken another height. */
    fit,
    /**
     * The visitor has asked for a performance: as it begins, the page may move to its picture.
     * `if-here` where it had to wait for its path, and moves the page only if they stayed.
     */
    arrive: (how: 'bring' | 'if-here') => {
      arriving.current = how;
    },
    /** The picture, already standing past the frame, is asked for again: it comes into view now. */
    bring: () => {
      arriving.current = 'bring';
      compose(true);
    },
    /** Notes where the words stand, on the way out of After the frame. */
    keepWords: () => {
      const box = wordsRow.current?.getBoundingClientRect();
      wordsWere.current = box ? { top: box.top, bottom: box.bottom } : null;
    },
  };
}
