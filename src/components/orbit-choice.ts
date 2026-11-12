import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { pressedBody, type Target } from './orbit-painter';
import type { StageHand } from './orbit-figure';
import type { TooSoon } from './orbit-word';

/*
  Whom to stay with, by the hand (docs/after-the-frame.md §8.4). While the question stands the
  visitor may point at a body before answering, and may press one in the picture itself.

  This hook owns what that takes: which bodies are ringed and why, what a press on the picture
  is taken to mean, and since when the picture has been one to press. The drawing owns the
  numbers and what a pointer may press (`picks`); it draws the ring it is given here.
*/

/** No body: the ring's rest. One array, so a state set to it again changes nothing. */
const NO_BODIES: readonly number[] = [];

/**
 * While the visitor chooses, the bodies ringed in the picture, each for its own reason: the
 * answer the focus is on (Enter stays with it), the answer a mouse is over, the body a mouse
 * is on in the picture (a click stays with it), and the bodies a finger's press could not
 * tell apart, so that the press is seen to have been taken in and the words can answer.
 */
type Pointed = {
  focus: number | null;
  hover: number | null;
  aim: number | null;
  unsure: readonly number[];
};
const NOT_POINTED: Pointed = { focus: null, hover: null, aim: null, unsure: NO_BODIES };

export function useChoice({
  stage,
  picks,
  asked,
  tooSoon,
  onStay,
}: {
  /** The picture: a pointer's place is found in it. */
  stage: RefObject<HTMLDivElement | null>;
  /** What a pointer may press, as the drawing last left it. */
  picks: RefObject<Target[]>;
  /** The question the visitor is now asked, by its count; null while none is. */
  asked: number | null;
  /** Whether a press comes too soon after what it lands on came to stand there (orbit-word.tsx). */
  tooSoon: TooSoon;
  /** The visitor's answer, pressed in the picture: the body to stay with. */
  onStay: (body: number) => void;
}) {
  const [pointed, setPointed] = useState(NOT_POINTED);
  const { focus, hover, aim, unsure } = pointed;
  // One list for the drawing, which draws the numbers again only when it changes.
  const ringed = useMemo(
    () => [
      ...new Set([focus, hover, aim, ...unsure].filter((body): body is number => body !== null)),
    ],
    [focus, hover, aim, unsure],
  );
  /** A body is pointed at, or no longer, for one of the three reasons a pointer or the focus has. */
  const point = (by: 'focus' | 'hover' | 'aim', body: number | null) =>
    setPointed((now) => (now[by] === body ? now : { ...now, [by]: body }));
  /** The bodies a finger's press could not tell apart; none once another press goes down. */
  const doubt = (bodies: readonly number[]) =>
    setPointed((now) => (now.unsure === bodies ? now : { ...now, unsure: bodies }));
  /**
   * The press that last went down on the picture while the visitor chose: whether it was a
   * finger's (a pen points as finely as a mouse), and the body it went down on, if any. And
   * since when the picture has been one to press, on the clock a press is timed by.
   */
  const pressed = useRef<{ finger: boolean; body: number | null } | null>(null);
  const pressableSince = useRef(0);
  const renew = () => {
    pressableSince.current = performance.now();
  };
  // The picture becomes one to press as each question is asked, and anew whenever the page
  // moves under the pointer while it stands: by the page's own glide to the picture, which
  // may outlast the moment a press must wait, or by the visitor's scroll. And no press that
  // went down before the question was asked is one on it.
  useEffect(() => {
    if (asked === null) return;
    pressed.current = null;
    const moved = () => {
      pressableSince.current = performance.now();
    };
    moved();
    window.addEventListener('scroll', moved, { passive: true });
    return () => window.removeEventListener('scroll', moved);
  }, [asked]);
  /** What a pointer finds in the picture (orbit-painter.ts, `pressedBody`). */
  const pressAt = (event: { clientX: number; clientY: number }, finger = false) => {
    const box = stage.current?.getBoundingClientRect();
    return box
      ? pressedBody(picks.current, event.clientX - box.left, event.clientY - box.top, finger)
      : null;
  };
  const hand: StageHand | null =
    asked === null
      ? null
      : {
          onPointerDown: (event) => {
            // A new press: what the last one could not tell apart is no longer shown.
            const finger = event.pointerType === 'touch';
            const at = pressAt(event, finger);
            pressed.current = { finger, body: at && 'body' in at ? at.body : null };
            doubt(NO_BODIES);
          },
          onClick: (event) => {
            const down = pressed.current;
            pressed.current = null;
            // A pointer's press is one that went down on the picture since it asked: not the
            // letting go of a hold begun on the orbit in the hand, which the question took
            // from under it.
            if (event.detail > 0 && !down) return;
            // Not a press made before the picture had stood long enough to be read (the page
            // may just have brought it under the finger that asked).
            if (tooSoon(event, pressableSince.current)) return;
            const at = pressAt(event, down?.finger);
            if (!at) return;
            // A finger that covers two bodies is shown both, and the words answer.
            if ('unsure' in at) doubt(at.unsure);
            // A press is on a body if it went down on it too: a drag across the picture that
            // happens to end on one is not an answer.
            else if (!down || down.body === at.body) onStay(at.body);
          },
          onPointerMove: (event) => {
            if (event.pointerType === 'touch') return;
            const at = pressAt(event);
            point('aim', at && 'body' in at ? at.body : null);
          },
          onPointerLeave: (event) => {
            if (event.pointerType !== 'touch') point('aim', null);
          },
        };
  return {
    /** The bodies ringed in the picture. */
    ringed,
    /** A mouse is on a body in the picture: it is shown that it can be pressed. */
    aiming: aim !== null,
    point,
    /** Nothing in the picture is pointed at: a new question, an answer, or the way out. */
    unpoint: () => setPointed(NOT_POINTED),
    /** The picture is new under the pointer: a press there is timed from now. */
    renew,
    /** The stage's pointer handlers while the visitor is asked; none otherwise. */
    hand,
  };
}
