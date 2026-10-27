'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { ArtworkMedia } from '@/components/artwork-media';
import { useMediaPolicy } from '@/components/media-policy';
import { useMotion } from '@/components/motion-provider';
import { useSit } from '@/components/sit';
import { getPlateGround } from '@/lib/art/plate-records';
import { workNumber } from '@/lib/art/number';
import type { ArtInterpretation } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import styles from './process.module.css';
import { clock, expressionWord } from '@/lib/i18n/format';

/** After a film resolves into its still, nothing moves for --t-rest; then "Again". */
const REST_MS = 8000;

/**
 * A chapter's plate: the work full-bleed in its own measured tone, the film from frame 0
 * after the still has been held, the Resolution (freeze, rest, Again), Sit, and an explicit
 * Play where the connection or the visitor's preference keeps ambient films still.
 */
export function ChapterPlate({
  media,
  artworkId,
  t,
  eager = false,
}: {
  media?: ArtInterpretation;
  artworkId: number;
  t: Messages;
  eager?: boolean;
}) {
  const { paused, toggle } = useMotion();
  const policy = useMediaPolicy();
  const [explicit, setExplicit] = useState(false);
  const [playRequest, setPlayRequest] = useState(0);
  const [restart, setRestart] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [settled, setSettled] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rested, setRested] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const { sit, sitDown, stand, wake, wakeByPress, swallowWakingClick } = useSit();
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      setRested(true);
      stand();
    }, REST_MS);
    return () => clearTimeout(timer);
  }, [ended, stand]);
  const film = media?.films[0];
  const ambient = !policy.constrained || explicit;
  const ground = media ? getPlateGround(artworkId, media.id, media.stillSha256) : undefined;
  const expression = expressionWord(media, t);
  const state = !settled ? t.arriving : playing ? t.film : t.still;
  // Films answer to an explicit word whenever something keeps them still: the connection,
  // Pause or a reduced-motion preference. The word resumes ambient motion, as the viewer's does.
  const offerPlay = !!film && !playing && !ended && (paused || (policy.constrained && !explicit));
  function play() {
    setExplicit(true);
    setEnded(false);
    setRested(false);
    setPlayRequest((value) => value + 1);
    if (paused) toggle();
  }
  function again() {
    setExplicit(true);
    setEnded(false);
    setRested(false);
    setTime({ current: 0, duration: 0 });
    setRestart((value) => value + 1);
    if (paused) toggle();
  }
  const style = ground ? ({ '--plate-ground': ground.tone } as CSSProperties) : undefined;
  return (
    <div
      className={styles.stage}
      style={style}
      data-sit={sit ? '' : undefined}
      data-film-state={!settled ? 'arriving' : playing ? 'film' : 'still'}
      onPointerMove={wake}
      onKeyDown={wake}
      onFocus={wake}
      onPointerDown={wakeByPress}
      onTouchStart={wakeByPress}
      onClickCapture={swallowWakingClick}
    >
      <div className="plate">
        <ArtworkMedia
          media={media}
          alt={`${workNumber(artworkId)} · ${expression ?? ''}`}
          artworkId={artworkId}
          hold
          eager={eager}
          ambient={ambient}
          restart={restart}
          playRequest={playRequest}
          onSettled={() => setSettled(true)}
          onPlaybackChange={setPlaying}
          onProgress={(current, duration) => setTime({ current, duration })}
          onEnded={() => {
            setEnded(true);
            setPlaying(false);
          }}
        />
      </div>
      <div className={`strip ${styles.plateStrip}`}>
        <span className="numeral folio">
          {workNumber(artworkId)} · {expression}
        </span>
        <span className={styles.readout}>
          <span className={playing ? 'live-dot is-live' : 'live-dot'} />
          <span className="numeral folio">
            {state}
            {film && time.duration ? ` ${clock(time.current)}` : ''}
          </span>
          {film ? (
            <span className="progress-track" aria-hidden="true">
              <i
                style={{
                  width: `${time.duration ? (time.current / time.duration) * 100 : 0}%`,
                }}
              />
            </span>
          ) : null}
        </span>
        <span className="strip-words">
          {offerPlay ? (
            <button type="button" onClick={play}>
              {t.play}
            </button>
          ) : null}
          {film && ended && rested ? (
            <button type="button" onClick={again}>
              {t.again}
            </button>
          ) : null}
          {film && playing ? (
            <button type="button" onClick={sitDown} aria-pressed={sit}>
              {t.sit}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
