'use client';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { LIGHT_FILM } from '@/lib/physics/light-film';
import styles from './orbit-score.module.css';

/**
 * The score as a slider (docs/first-light.md §14): the Light film's frames, from the window's
 * first step to the still's.
 *
 * - **Keys:** the arrows move a frame; Shift with an arrow, or the Page keys, a second of film;
 *   Home and End go to either end.
 * - **A hand on the score** sets the moment where it points and carries it as it moves. Let go,
 *   the clock plays on if it was playing. A finger or a pen takes the score only once it moves
 *   sideways, or lifts where it landed: one that came down to scroll the page sets nothing. The browser's
 *   own slider answers a finger too (Chromium sets it where the finger lands, at once, and
 *   follows a finger that moves along it; Firefox sets it once more where the finger lifts):
 *   whatever it sets while a finger is down, and as it lifts, is put back, so the score is set
 *   by what is read from the finger here and by nothing else.
 * - **The end of the track is the film's end.** Its last few pixels are its last notch, and a
 *   key that asks for the end where the slider already stands sets it there all the same: so
 *   the hand that puts it there is known to have (orbit-clock.ts).
 *
 * It is a native range, so a screen reader can set it with its own gestures, and it reads the
 * moment aloud. The score beneath draws the playhead.
 */
/**
 * A finger on the score takes it once it has moved this far sideways, in CSS pixels, and farther
 * sideways than along the page: a scroll that drifts is still a scroll.
 */
const TOUCH_TRAVEL = 6;
/** A finger, or a pen: what may be scrolling the page as it comes down. A mouse never is. */
const mayScroll = (event: { pointerType: string }) =>
  event.pointerType === 'touch' || event.pointerType === 'pen';
/** The track's last pixels are its last notch: no hand finds the quarter of a pixel it is. */
const END_REACH = 4;

export function OrbitSlider({
  slider,
  frames,
  startsAt,
  label,
  valueText,
  describedBy,
  atEnd,
  disabled,
  onScrub,
}: {
  slider: RefObject<HTMLInputElement | null>;
  /** The Light film's frames. */
  frames: number;
  /**
   * The frame the clock stands on as the slider is made: the film's first where it has yet to
   * begin, its last where the window stands whole. From then on the drawing keeps it.
   */
  startsAt: number;
  label: string;
  valueText: string;
  /** What stands because of where the slider is, said after its value: the question at its end. */
  describedBy?: string;
  /** Whether the clock stands at the film's end, asked at the moment of a key. */
  atEnd: () => boolean;
  disabled: boolean;
  /** A frame was chosen; `settled` once the hand or the key has let it go. */
  onScrub: (frame: number, settled: boolean) => void;
}) {
  const pointer = useRef<number | null>(null);
  /** A finger that has come down on the score and has not yet taken it: where it landed. */
  const finger = useRef<{ id: number; x: number; y: number } | null>(null);
  /**
   * The frame the slider stands on while a finger is down on it. Until the finger takes the
   * score that is where the venue has it: read as the finger lands, and again before each of
   * its moves and as it lifts, since a film plays on under a finger that scrolls the page.
   * Once taken, it is the last frame read from the finger. What the browser's own slider sets
   * meanwhile is put back to it (`onChange`).
   */
  const standing = useRef<number | null>(null);
  /** Touch events are being sent for the finger that is down: when it lifts is theirs to say. */
  const touching = useRef(false);
  /** A lift that waits for its task to end (`liftSoon`). */
  const lifting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = frames - 1;
  const set = (input: HTMLInputElement, frame: number, settled: boolean) => {
    const clamped = Math.min(last, Math.max(0, Math.round(frame)));
    input.value = String(clamped);
    if (standing.current !== null) standing.current = clamped;
    onScrub(clamped, settled);
  };
  const frameAt = (event: PointerEvent<HTMLInputElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX >= box.right - END_REACH) return last;
    return ((event.clientX - box.left) / Math.max(1, box.width)) * last;
  };
  /** The hand takes the score: the moment follows it from here until it lets go. */
  const take = (event: PointerEvent<HTMLInputElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    set(event.currentTarget, frameAt(event), false);
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const forward = event.key === 'PageUp' || event.key === 'ArrowRight' || event.key === 'ArrowUp';
    // Asked for the end where it already stands, the native slider says nothing has changed:
    // the hand has set it there all the same. Not by a key the browser keeps for itself
    // (Alt with an arrow is its way back and forward); and only where the clock does stand
    // there: until the window is first drawn the slider is on its last notch with the film
    // yet to begin.
    const theBrowsers = event.altKey || event.metaKey || event.ctrlKey;
    const asksForTheEnd = forward || event.key === 'End';
    if (!theBrowsers && asksForTheEnd && Number(input.value) === last && atEnd()) {
      event.preventDefault();
      set(input, last, true);
      return;
    }
    const page = event.key === 'PageUp' || event.key === 'PageDown';
    if (!page && !(event.shiftKey && event.key.startsWith('Arrow'))) return;
    event.preventDefault();
    set(input, Number(input.value) + (forward ? 1 : -1) * LIGHT_FILM.fps, true);
  };
  const letGo = (event: PointerEvent<HTMLInputElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    onScrub(standing.current ?? Number(event.currentTarget.value), true);
  };
  /** No finger is down any longer: what changes the slider now is a key, or a screen reader. */
  const lifted = () => {
    clearTimeout(lifting.current);
    lifting.current = undefined;
    standing.current = null;
    touching.current = false;
  };
  /**
   * The last finger's touch has ended. The browser's own slider may answer that too, after the
   * page has heard of it (Firefox sets it where the finger lifted): so the slider is given back
   * to the keys only when this task is over, and what the browser sets until then is put back
   * like the rest.
   */
  const liftSoon = () => {
    clearTimeout(lifting.current);
    lifting.current = setTimeout(lifted, 0);
  };
  useEffect(() => () => clearTimeout(lifting.current), []);
  /**
   * Before the browser's own slider answers a move or a lift of a finger that has not taken
   * the score: the film may have played on, or ended, under a finger that scrolls the page,
   * and what is put back is where the slider stands now. (The page hears each touch event
   * before the browser's slider acts on it.)
   */
  const found = (input: HTMLInputElement) => {
    if (standing.current !== null && pointer.current === null)
      standing.current = Number(input.value);
  };
  /**
   * The finger's pointer is over, lifted or taken by the browser for a scroll. Where touch
   * events are sent the finger may still be down, scrolling the page, with the browser's own
   * slider still following it: then its end is theirs to say (`onTouchEnd`).
   */
  const pointerOver = (event: PointerEvent<HTMLInputElement>) => {
    if (mayScroll(event) && !touching.current) lifted();
  };
  return (
    <input
      ref={slider}
      type="range"
      className={styles.slider}
      min={0}
      max={last}
      step={1}
      defaultValue={startsAt}
      aria-label={label}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      disabled={disabled}
      onKeyDown={key}
      onChange={(event) => {
        const input = event.currentTarget;
        // A finger is down: this is the browser's own slider answering it. It is put back, and
        // nobody is told.
        if (standing.current !== null) input.value = String(standing.current);
        // A hand's moves are followed below; this hears the keys and assistive technology.
        else if (pointer.current === null) onScrub(Number(input.value), true);
      }}
      onPointerDown={(event) => {
        if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
        // A lift still waiting for its task to end is over now: this is a new hand.
        if (lifting.current !== undefined) lifted();
        // The thumb is not where the hand is: the moment follows the hand, wherever it lands.
        event.preventDefault();
        // A finger may be beginning a scroll of the page, which the browser is yet to say: the
        // score waits for it to move sideways, or to lift where it landed.
        if (mayScroll(event)) {
          finger.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          standing.current = Number(event.currentTarget.value);
          // Its lift is heard here wherever it lifts: a finger is the score's by the browser's
          // own rule, a pen is not. (A scroll of the page is still the browser's to take.)
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } else take(event);
      }}
      onPointerMove={(event) => {
        const landed = finger.current;
        if (landed?.id === event.pointerId) {
          // A pen that hovers has lifted where the score did not hear it: it holds nothing.
          if (event.pointerType === 'pen' && event.buttons === 0) {
            finger.current = null;
            pointerOver(event);
            return;
          }
          const across = Math.abs(event.clientX - landed.x);
          if (across < TOUCH_TRAVEL || across <= Math.abs(event.clientY - landed.y)) return;
          finger.current = null;
          take(event);
        } else if (pointer.current === event.pointerId)
          set(event.currentTarget, frameAt(event), false);
      }}
      onPointerUp={(event) => {
        if (finger.current?.id === event.pointerId) {
          // A tap: the moment is set where the finger landed, and let go at once.
          finger.current = null;
          event.currentTarget.focus({ preventScroll: true });
          set(event.currentTarget, frameAt(event), true);
        } else letGo(event);
        pointerOver(event);
      }}
      onPointerCancel={(event) => {
        // The browser took the finger for a scroll before the score was taken: nothing was set.
        if (finger.current?.id === event.pointerId) finger.current = null;
        else letGo(event);
        pointerOver(event);
      }}
      onLostPointerCapture={(event) => {
        // The waiting finger or pen is gone with neither a lift nor a cancel said of it.
        if (finger.current?.id !== event.pointerId) return;
        finger.current = null;
        pointerOver(event);
      }}
      onTouchStart={() => {
        touching.current = true;
      }}
      onTouchMove={(event) => found(event.currentTarget)}
      onTouchEnd={(event) => {
        found(event.currentTarget);
        if (event.targetTouches.length === 0) liftSoon();
      }}
      onTouchCancel={(event) => {
        found(event.currentTarget);
        if (event.targetTouches.length === 0) liftSoon();
      }}
    />
  );
}
