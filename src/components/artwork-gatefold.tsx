'use client';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getPlateGround } from '@/lib/art/plate-records';
import { workFolio } from '@/lib/art/number';
import { getInterpretation, type ArtInterpretation, type Artwork } from '@/lib/art/types';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import styles from './artwork-gatefold.module.css';

/*
  The gatefold (vision §6, Beat 3): the Ink plate on paper beside the Light plate on black at
  equal scale, a spread wider than the viewport that snaps plate to plate; on a wide screen
  both fit; on a phone it is a vertical diptych. The second view is the seam: the two plates
  stacked, the night clipped at a line the hand or the keyboard moves, the way the Turn does.
  Stills only, from the ladder's rungs; nothing here plays.
*/
const STILL_WIDTH = 3456;
const STILL_HEIGHT = 2234;

/** The rungs and the published still as one srcset, so each panel fetches what its width needs. */
export function sourceSet(media: ArtInterpretation): string | undefined {
  const rungs = (media.rungs ?? []).map((rung) => `${rung.src} ${rung.width}w`);
  if (!media.still) return rungs.length ? rungs.join(', ') : undefined;
  return [...rungs, `${media.still} ${media.width ?? STILL_WIDTH}w`].join(', ');
}

function Still({
  media,
  alt,
  sizes,
  className,
}: {
  media: ArtInterpretation;
  alt: string;
  sizes: string;
  className: string;
}) {
  return (
    <img
      className={className}
      src={media.still}
      srcSet={sourceSet(media)}
      sizes={sizes}
      alt={alt}
      width={media.width ?? STILL_WIDTH}
      height={media.height ?? STILL_HEIGHT}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

export function ArtworkGatefold({
  artwork,
  t,
  locale,
}: {
  artwork: Artwork;
  /** The committed expression; the spread shows both regardless. */
  expression: string;
  t: Messages;
  locale: Locale;
}) {
  const ink = getInterpretation(artwork, 'ink');
  const light = getInterpretation(artwork, 'light');
  const [view, setView] = useState<'spread' | 'seam'>('spread');
  const [seam, setSeam] = useState(50);
  const seamFrame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const headingId = useId();
  if (!ink?.still || !light?.still) return null;
  const folio = workFolio(artwork.id);
  const inkTone = getPlateGround(artwork.id, 'ink', ink.stillSha256)?.tone ?? '#f1ebdf';
  const lightTone = getPlateGround(artwork.id, 'light', light.stillSha256)?.tone ?? '#000000';
  const caption = fill(t.gatefoldCaption, { n: folio });
  const sizes = '(max-width: 767px) 100vw, (min-width: 1700px) 50vw, 92vw';
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const inkAlt = `№ ${folio} · ${t.ink}`;
  const lightAlt = `№ ${folio} · ${t.light}`;

  const seamFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = seamFrame.current?.getBoundingClientRect();
    if (!bounds || !bounds.width) return;
    const value = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSeam(Math.min(100, Math.max(0, Math.round(value * 10) / 10)));
  };

  return (
    <section className={styles.gatefold} aria-labelledby={headingId} data-gatefold data-view={view}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.caption}>
          {caption}
        </h2>
        <div className={styles.views} role="group" aria-label={t.gatefold}>
          <button type="button" aria-pressed={view === 'spread'} onClick={() => setView('spread')}>
            {t.gatefoldSpread}
          </button>
          <button type="button" aria-pressed={view === 'seam'} onClick={() => setView('seam')}>
            {t.gatefoldSeam}
          </button>
        </div>
      </div>
      {view === 'spread' ? (
        // A scroll region the keyboard can reach: focus it and the arrows turn the spread.
        <div
          className={styles.spread}
          data-gatefold-spread
          role="group"
          aria-label={t.gatefoldSpread}
          tabIndex={0}
        >
          <figure
            className={styles.panel}
            data-material="ink"
            style={{ '--gatefold-ground': inkTone } as CSSProperties}
          >
            <Still media={ink} alt={inkAlt} sizes={sizes} className={styles.still} />
          </figure>
          <div className={styles.gutter} aria-hidden="true" />
          <figure
            className={styles.panel}
            data-material="light"
            style={{ '--gatefold-ground': lightTone } as CSSProperties}
          >
            <Still media={light} alt={lightAlt} sizes={sizes} className={styles.still} />
          </figure>
        </div>
      ) : (
        <div
          ref={seamFrame}
          className={styles.seamFrame}
          data-gatefold-seam
          style={{ '--gatefold-seam': `${seam}%`, '--gatefold-ground': inkTone } as CSSProperties}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (event.target instanceof HTMLInputElement) return;
            dragging.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seamFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) seamFromPointer(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          <Still
            media={ink}
            alt={inkAlt}
            sizes="92vw"
            className={`${styles.still} ${styles.layer}`}
          />
          <div
            className={styles.night}
            data-material="light"
            style={{ '--gatefold-ground': lightTone } as CSSProperties}
          >
            <Still
              media={light}
              alt={lightAlt}
              sizes="92vw"
              className={`${styles.still} ${styles.layer}`}
            />
          </div>
          <div className={styles.seamLine} aria-hidden="true" />
          <input
            className={styles.seamInput}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(seam)}
            aria-label={t.gatefoldSeamLabel}
            aria-valuetext={`${percent.format(seam)} %`}
            onChange={(event) => setSeam(Number(event.target.value))}
          />
        </div>
      )}
    </section>
  );
}
