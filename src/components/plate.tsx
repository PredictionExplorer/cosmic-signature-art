'use client';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { getPlateGround } from '@/lib/art/plate-records';
import { workFolio } from '@/lib/art/number';
import type { ArtInterpretation } from '@/lib/art/types';
import { setPlateTone } from './room-ground';
import styles from './plate.module.css';

/**
 * The plate and its label strip: one art screen. The plate is fitted by height to the room
 * (100svh − head − strip) and letterboxed in the work's own measured tone, so the sheet has
 * no edge; while it dominates the viewport the running head takes the same tone. The strip
 * carries the hanging numeral, one label and the words. Everything that moves inside the
 * plate is the work's own film, handled by ArtworkMedia, which the caller renders as children.
 */
export function Plate({
  id,
  media,
  current,
  centre,
  words,
  settled = true,
  strip = true,
  children,
  className = '',
}: {
  id: number;
  media?: ArtInterpretation;
  /** This layer is the committed expression: it lends the head its tone and its strip is live. */
  current: boolean;
  /** The strip's centre: the label line, or the home's one line. */
  centre?: ReactNode;
  /** The strip's right-hand words and readouts. */
  words?: ReactNode;
  /** The still has settled; the strip's centre may rise. */
  settled?: boolean;
  strip?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const ground = media ? getPlateGround(id, media.id, media.stillSha256) : undefined;
  const tone = ground?.tone ?? (media?.id === 'light' ? '#000000' : undefined);
  const night = media?.id === 'light';

  useEffect(() => {
    const node = screen.current;
    if (!node || !current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setPlateTone(
          entry.isIntersecting && entry.intersectionRatio >= 0.5 ? (tone ?? null) : null,
        ),
      { threshold: [0, 0.5] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setPlateTone(null);
    };
  }, [current, tone]);

  const style = ground
    ? ({ '--plate-ground': ground.tone } as CSSProperties)
    : night
      ? ({ '--plate-ground': '#000000' } as CSSProperties)
      : undefined;

  return (
    <div
      ref={screen}
      className={`${styles.screen} ${night ? styles.nightScreen : ''} ${className}`}
      data-plate-ground={night ? 'night' : 'paper'}
      data-settled={settled ? '' : undefined}
      style={style}
    >
      <div className={`plate ${styles.plate}`} data-edge={ground?.edge ? 'true' : undefined}>
        {children}
      </div>
      {strip ? (
        <div className={`strip ${styles.strip}`}>
          <span className={`hanging-numeral ${styles.numeral}`} aria-hidden="true">
            {workFolio(id)}
          </span>
          <div className={styles.centre}>{centre}</div>
          <div className={`strip-words ${styles.words}`}>{words}</div>
        </div>
      ) : null}
    </div>
  );
}
