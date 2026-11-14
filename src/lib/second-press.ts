/*
  A press that comes too soon. A word that is pressed may go, and another may come to stand
  where it stood: the second press of a double click or a double tap, or the tap of someone who
  thought the first had done nothing, would then press a word they had not yet read
  (docs/after-the-frame.md §8.4: Again pressed twice answered the question that followed it).
  So may the picture, brought by the page under the finger that asked for it.

  So a pointer's press is not taken on something that came less than a moment ago to stand where
  the press before its coming landed: nobody presses, on purpose, what arrived under their
  finger four tenths of a second ago. It is timed from when the thing came, not from that press,
  so a slow device that takes a second to show the new word gives no window either. And it is
  measured against the last press made before the thing came, not the last press of all: the
  third press of three is refused as the second was.

  Anything pressed elsewhere is pressed as fast as the hand likes. So is anything whose coming
  no press in that place went before, however lately it came: a word stepped with again and
  again is the visitor's own to press from the moment it appears.

  A key's press is another matter. It goes to whatever the focus is on, which the visitor moved
  there, so it is always taken; what a held key must not do is press again and again, and that
  is stopped where it begins (the words ignore a key's repeats).
*/

/** A pointer's press: where it landed in the window, in CSS pixels, and when, on the page's clock. */
export interface Press {
  x: number;
  y: number;
  at: number;
}

/** What came after a press can be pressed by a pointer once it has stood this long, in milliseconds… */
export const SETTLE_MS = 400;
/** …or at once, by a press farther than this from where that press landed: inside one word. */
const SAME_PLACE = 30;
/**
 * Presses worth remembering: more than a hand can make in the moment a thing takes to settle,
 * so the press a thing came after is still among them when the last of a burst lands.
 */
export const PRESSES_KEPT = 8;

/**
 * Whether a pointer's press comes too soon. What is under it became what it is at `becameAt`
 * (on the presses' clock), less than a moment ago; and of the presses made `earlier`, oldest
 * first, the last one made no later than that landed where this one does.
 */
export function pressedTooSoon(press: Press, earlier: readonly Press[], becameAt: number): boolean {
  const before = earlier.findLast((one) => one.at <= becameAt);
  return (
    !!before &&
    press.at - becameAt < SETTLE_MS &&
    Math.hypot(press.x - before.x, press.y - before.y) < SAME_PLACE
  );
}
