'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { frameForNm, frameTime, timeFrame } from '@/lib/art/spectral-sweep';
import {
  stillSourceSet,
  type ArtFilm,
  type ArtInterpretation,
  type SweepSpan,
} from '@/lib/art/types';
import styles from './wavelength-lens.module.css';

/**
 * The Wavelength lens in the room: the work's own published spectral sweep, never played, held
 * on the frame whose wavelength the visitor chose, with the visible spectrum beneath it as the
 * lens's control. The film is fetched only once the lens is on and released when it leaves.
 *
 * A seek decodes from the film's last keyframe, so a drag could ask for frames faster than a
 * browser can paint them: one seek is in flight at a time, the latest wish waits for it, and
 * the last decoded frame stays on screen until the next arrives. Until the first frame is
 * decoded the still stands where the frame will be. The caller labels it analysis, never the work.
 */
export function WavelengthLens({
  media,
  film,
  span,
  nm,
  label,
  rule,
  onState,
  onFailure,
}: {
  media: ArtInterpretation;
  film: ArtFilm;
  span: SweepSpan;
  /** The wavelength held, in nanometres. */
  nm: number;
  label: string;
  /** The control beneath the frame. */
  rule: ReactNode;
  /** Loading from the moment the film is attached; held once a frame is on screen. */
  onState: (state: 'loading' | 'held') => void;
  onFailure: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const wanted = useRef(frameForNm(nm, span));
  const seeking = useRef(false);
  const onScreen = useRef<number | null>(null);
  const [frame, setFrame] = useState<number | null>(null);
  const attached = useEffectEvent(() => onState('loading'));

  /** Ask for the wanted frame unless one is already on its way or on screen. */
  const seek = useCallback(() => {
    const player = video.current;
    if (!player || seeking.current || player.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (wanted.current === onScreen.current) return;
    seeking.current = true;
    player.currentTime = frameTime(wanted.current);
  }, []);

  // On intent only: the source is attached when the lens opens and released when it closes.
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (!player.getAttribute('src')) {
      player.setAttribute('src', film.src);
      player.load();
    }
    attached();
    // Cached media can already have metadata before this effect subscribes.
    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
    return () => {
      seeking.current = false;
      onScreen.current = null;
      // A lens shown again (Activity, Strict Mode) waits for its own first frame.
      setFrame(null);
      player.pause();
      // Removing the source cancels the download and releases the decoder.
      player.removeAttribute('src');
      player.load();
    };
  }, [film.src, seek]);

  useEffect(() => {
    wanted.current = frameForNm(nm, { start: span.start, end: span.end });
    seek();
  }, [nm, span.start, span.end, seek]);

  const ratio = (media.width ?? ART_WIDTH) / (media.height ?? ART_HEIGHT);
  return (
    <div className={styles.lens}>
      <div className={styles.frame}>
        <div
          className={styles.plate}
          style={{ '--ratio': ratio } as CSSProperties}
          data-room-media
          data-wavelength={frame === null ? 'loading' : 'held'}
        >
          {media.still ? (
            <img
              className={styles.still}
              src={media.still}
              srcSet={stillSourceSet(media)}
              sizes="100vw"
              alt=""
              width={media.width ?? ART_WIDTH}
              height={media.height ?? ART_HEIGHT}
              decoding="async"
            />
          ) : null}
          <video
            ref={video}
            className={styles.video}
            muted
            playsInline
            preload="auto"
            aria-label={label}
            data-frame={frame ?? undefined}
            onLoadedMetadata={seek}
            onSeeked={(event) => {
              seeking.current = false;
              const shown = timeFrame(event.currentTarget.currentTime);
              onScreen.current = shown;
              setFrame(shown);
              onState('held');
              seek();
            }}
            onError={() => {
              seeking.current = false;
              onFailure();
            }}
          />
        </div>
      </div>
      <div className={styles.rule}>{rule}</div>
    </div>
  );
}
