'use client';
import { createContext, useContext, useEffect, useRef, type KeyboardEvent, type Ref } from 'react';
import { PRESSES_KEPT, pressedTooSoon, type Press } from '@/lib/second-press';
import styles from './orbit-score.module.css';

/**
 * Whether a click is a pointer's, made too soon after what it lands on became what it is
 * (`becameAt`), where the press before it landed (src/lib/second-press.ts). The section answers,
 * since it keeps the presses; a word outside one is always pressed.
 */
export type TooSoon = (
  event: { detail: number; clientX: number; clientY: number },
  becameAt: number,
) => boolean;
export const PressGuard = createContext<TooSoon>(() => false);

/**
 * A pointer's last few presses, oldest first, the one being made last: a press that comes
 * too soon is measured against those before it. They are noted wherever in the window they
 * land: the plate's own word stands outside this section, and brings its picture under the
 * pointer that pressed it. A key's click, and one a script makes, count no presses
 * (`detail` 0): the focus was moved there on purpose, and it is always taken.
 */
export function usePresses(): TooSoon {
  const presses = useRef<Press[]>([]);
  useEffect(() => {
    const note = (event: PointerEvent) => {
      presses.current = [
        ...presses.current.slice(1 - PRESSES_KEPT),
        { x: event.clientX, y: event.clientY, at: performance.now() },
      ];
    };
    window.addEventListener('pointerdown', note, true);
    return () => window.removeEventListener('pointerdown', note, true);
  }, []);
  return (event, becameAt) =>
    event.detail > 0 &&
    pressedTooSoon(
      { x: event.clientX, y: event.clientY, at: performance.now() },
      presses.current.slice(0, -1),
      becameAt,
    );
}

/** A held key presses a word once: its repeats are stopped where they begin. */
const oncePerPress = (event: KeyboardEvent) => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
};

/** One of the words beside the line: pressed or not where it is a mode, dimmed where it would do nothing. */
export function Word({
  ref,
  label,
  name,
  onClick,
  onPoint,
  pressed,
  disabled = false,
}: {
  /** The word itself, where the section must know whether the focus stands on it. */
  ref?: Ref<HTMLButtonElement>;
  label: string;
  /** What the word does, where its letters alone do not say: it contains them (WCAG 2.5.3). */
  name?: string;
  onClick: () => void;
  /**
   * The focus, or a mouse, has come to the word or left it. A finger does not hover: a touch
   * that changed the picture on its way to a press could lose the press (WebKit).
   */
  onPoint?: (by: 'focus' | 'mouse', on: boolean) => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  /** When the word became what it now says, on the clock a press is timed by. */
  const became = useRef(0);
  useEffect(() => {
    became.current = performance.now();
  }, [label, pressed]);
  const tooSoon = useContext(PressGuard);
  return (
    <button
      ref={ref}
      type="button"
      className={styles.again}
      aria-label={name}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        if (!tooSoon(event, became.current)) onClick();
      }}
      onKeyDown={oncePerPress}
      onPointerEnter={
        onPoint && ((event) => event.pointerType === 'mouse' && onPoint('mouse', true))
      }
      onPointerLeave={
        onPoint && ((event) => event.pointerType === 'mouse' && onPoint('mouse', false))
      }
      onFocus={onPoint && (() => onPoint('focus', true))}
      onBlur={onPoint && (() => onPoint('focus', false))}
    >
      {label}
    </button>
  );
}

/** A way on among the words: a link, which a press that comes too soon does not follow either. */
export function WordLink({ label, href }: { label: string; href: string }) {
  const became = useRef(0);
  useEffect(() => {
    became.current = performance.now();
  }, []);
  const tooSoon = useContext(PressGuard);
  return (
    <a
      className={styles.again}
      href={href}
      onClick={(event) => {
        if (tooSoon(event, became.current)) event.preventDefault();
      }}
      onKeyDown={oncePerPress}
    >
      {label}
    </a>
  );
}
