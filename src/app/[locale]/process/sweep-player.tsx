'use client';
import { useEffect, useRef, useState } from 'react';
import { ArtworkMedia } from '@/components/artwork-media';
import { useMotion } from '@/components/motion-provider';
import { workNumber } from '@/lib/art/number';
import type { ArtFilm, ArtInterpretation } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import styles from './process.module.css';

const SPECTRUM = { from: 380, to: 700 };

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

/**
 * The published spectral sweep, on intent only: the Light still rests until the visitor asks,
 * then the ten-second film plays once over it and ends on its last frame. Beneath it the
 * visible spectrum is typeset as a rule with the work's own dominant wavelength ticked.
 */
export function SweepPlayer({
  still,
  film,
  artworkId,
  wavelengthNm,
  t,
}: {
  still?: ArtInterpretation;
  film?: ArtFilm;
  artworkId: number;
  wavelengthNm?: number;
  t: Messages;
}) {
  const { theatre } = useMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [requested, setRequested] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  useEffect(() => {
    const player = video.current;
    if (!player || !requested) return;
    let disposed = false;
    player.currentTime = 0;
    void player.play().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      player.pause();
    };
  }, [requested]);
  // A hushed theatre (a collector reviewing a bid) holds every film on its frame.
  useEffect(() => {
    if (theatre === 'hushed') video.current?.pause();
  }, [theatre]);
  const tick =
    wavelengthNm === undefined
      ? undefined
      : Math.min(1, Math.max(0, (wavelengthNm - SPECTRUM.from) / (SPECTRUM.to - SPECTRUM.from)));
  const alt = `${workNumber(artworkId)} · ${t.light} · ${t.spectralSweep}`;
  return (
    <div className={styles.stage} data-sweep-state={playing ? 'film' : ended ? 'still' : 'rest'}>
      <div className="plate">
        <div className={styles.sweepFrame}>
          <ArtworkMedia media={still} alt={alt} artworkId={artworkId} still />
          {film && requested && !failed ? (
            <video
              ref={video}
              className={`${styles.sweepVideo} ${playing || ended ? styles.sweepVisible : ''}`}
              src={film.src}
              poster={still?.still}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
              onPlaying={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) =>
                setTime({
                  current: event.currentTarget.currentTime,
                  duration: event.currentTarget.duration,
                })
              }
              onEnded={() => {
                setPlaying(false);
                setEnded(true);
              }}
              onError={() => {
                setFailed(true);
                setPlaying(false);
              }}
            />
          ) : null}
        </div>
      </div>
      <div className={`strip ${styles.plateStrip}`}>
        <span className="numeral folio">
          {workNumber(artworkId)} · {t.spectralSweep}
        </span>
        <span className={styles.readout}>
          <span className={styles.spectrumRule} aria-hidden="true">
            <span className={styles.spectrumEnd}>{SPECTRUM.from} nm</span>
            <i>
              {tick !== undefined ? (
                <b style={{ left: `${tick * 100}%` }}>
                  <span>{wavelengthNm} nm</span>
                </b>
              ) : null}
            </i>
            <span className={styles.spectrumEnd}>{SPECTRUM.to} nm</span>
          </span>
          {playing || ended ? <span className="numeral folio">{clock(time.current)}</span> : null}
        </span>
        <span className="strip-words">
          {film && !playing ? (
            <button
              type="button"
              onClick={() => {
                setEnded(false);
                setFailed(false);
                setTime({ current: 0, duration: 0 });
                setRequested((value) => value + 1);
              }}
            >
              {ended ? t.again : t.playSweep}
            </button>
          ) : null}
          {failed ? <span className="folio muted">{t.mediaUnavailable}</span> : null}
        </span>
      </div>
    </div>
  );
}
