'use client';
import { useEffect, useRef } from 'react';
import { filmShare, type FilmScore } from '@/lib/physics/film-score';
import { drawScore } from './score-drawing';
import styles from './film-score-band.module.css';

/**
 * The Light film's score in place of its time line (third-physics.md §5.5): the window's three
 * separations and its events across the film's own clock, lit as far as the film has drawn.
 * The Light film is an exposure, so everything lit is in the frame on screen. It is for the
 * eye alone: the strip says the physics of the moment in words, and the closest approach is a
 * word in the plate's options.
 */
export function FilmScoreBand({
  score,
  hues,
  progress,
  className,
}: {
  score: FilmScore;
  /** The bodies' hues, in degrees of OKLCH hue. */
  hues: readonly number[];
  /** How much of the film has played, from 0 to 1. */
  progress: number;
  /** Where a surface sets the band otherwise: the room's transport. */
  className?: string;
}) {
  const band = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLCanvasElement>(null);
  const lit = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = band.current;
    const whole = dim.current;
    const drawn = lit.current;
    if (!node || !whole || !drawn) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const box = node.getBoundingClientRect();
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      whole.width = drawn.width = width;
      whole.height = drawn.height = height;
      const context = whole.getContext('2d');
      const copy = drawn.getContext('2d');
      if (!context || !copy) return;
      const ink = getComputedStyle(node).color;
      // The base is the time line the score replaces.
      context.fillStyle = ink;
      context.fillRect(0, height - ratio, width, ratio);
      drawScore(context, score, hues, {
        ratio,
        x: (step) => filmShare(score, step) * width,
        lane: { top: ratio, height: height - 2 * ratio },
        base: height,
        // The closest approach rises to the lane's top, clear of the numeral above the band.
        ticks: { crossing: 3, syzygy: 6, closest: height / ratio - 1 },
        lineAlpha: 0.85,
        ink,
      });
      copy.drawImage(whole, 0, 0);
    };
    // A window dragged to a display of another density keeps its size: the density is watched
    // on its own, re-armed at each new density.
    let density: MediaQueryList | null = null;
    const watchDensity = () => {
      density?.removeEventListener('change', onDensity);
      density =
        typeof matchMedia === 'function'
          ? matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
          : null;
      density?.addEventListener('change', onDensity);
    };
    const onDensity = () => {
      draw();
      watchDensity();
    };
    watchDensity();
    // The first observation draws it; a new width (a rotated phone, a resized window) redraws.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    if (resize) resize.observe(node);
    else draw();
    return () => {
      resize?.disconnect();
      density?.removeEventListener('change', onDensity);
    };
  }, [score, hues]);

  const unplayed = (1 - Math.min(1, Math.max(0, progress))) * 100;
  return (
    <div
      ref={band}
      className={className ? `${styles.band} ${className}` : styles.band}
      aria-hidden="true"
      data-film-score
    >
      <canvas ref={dim} className={styles.dim} />
      <canvas
        ref={lit}
        className={styles.lit}
        style={{ clipPath: `inset(0 ${unplayed}% 0 0)` }}
        data-film-score-progress={Math.round((100 - unplayed) * 10) / 10}
      />
    </div>
  );
}
