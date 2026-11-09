'use client';
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { LIGHT_FILM } from '@/lib/physics/light-film';
import styles from './orbit-score.module.css';

/**
 * The score as a slider (docs/first-light.md §14): the Light film's frames, from the window's
 * first step to the still's.
 *
 * - **Keys:** the arrows move a frame; Shift with an arrow, or the Page keys, a second of film;
 *   Home and End go to either end.
 * - **A hand on the score** sets the moment where it points and carries it as it moves. Let go,
 *   the clock plays on if it was playing.
 *
 * It is a native range, so a screen reader can set it with its own gestures, and it reads the
 * moment aloud. The score beneath draws the playhead.
 */
export function OrbitSlider({
  slider,
  frames,
  label,
  valueText,
  disabled,
  onScrub,
}: {
  slider: RefObject<HTMLInputElement | null>;
  /** The Light film's frames. */
  frames: number;
  label: string;
  valueText: string;
  disabled: boolean;
  /** A frame was chosen; `settled` once the hand or the key has let it go. */
  onScrub: (frame: number, settled: boolean) => void;
}) {
  const pointer = useRef<number | null>(null);
  const last = frames - 1;
  const set = (input: HTMLInputElement, frame: number, settled: boolean) => {
    const clamped = Math.min(last, Math.max(0, Math.round(frame)));
    input.value = String(clamped);
    onScrub(clamped, settled);
  };
  const frameAt = (event: PointerEvent<HTMLInputElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - box.left) / Math.max(1, box.width)) * last;
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    const page = event.key === 'PageUp' || event.key === 'PageDown';
    if (!page && !(event.shiftKey && event.key.startsWith('Arrow'))) return;
    event.preventDefault();
    const forward = event.key === 'PageUp' || event.key === 'ArrowRight' || event.key === 'ArrowUp';
    const input = event.currentTarget;
    set(input, Number(input.value) + (forward ? 1 : -1) * LIGHT_FILM.fps, true);
  };
  const letGo = (event: PointerEvent<HTMLInputElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    onScrub(Number(event.currentTarget.value), true);
  };
  return (
    <input
      ref={slider}
      type="range"
      className={styles.slider}
      min={0}
      max={last}
      step={1}
      defaultValue={last}
      aria-label={label}
      aria-valuetext={valueText}
      disabled={disabled}
      onKeyDown={key}
      onChange={(event) => {
        // A hand's moves are followed below; this hears the keys and assistive technology.
        if (pointer.current === null) onScrub(Number(event.currentTarget.value), true);
      }}
      onPointerDown={(event) => {
        if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
        // The thumb is not where the hand is: the moment follows the hand, wherever it lands.
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        set(event.currentTarget, frameAt(event), false);
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) set(event.currentTarget, frameAt(event), false);
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
    />
  );
}
