'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowUpRight, Maximize2, RotateCcw, Pause, Play } from 'lucide-react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
import { useMediaPolicy } from './media-policy';
import { ArtworkTransition } from './artwork-transition';
import { ArtworkStage, useArtworkExpression } from './artwork-stage';
import { ArtworkRoom } from './artwork-room';
import styles from './artwork-viewer.module.css';

type ArtworkViewerProps = {
  artwork: Artwork;
  t: Messages;
  initialStill?: boolean;
  initialExpression?: string;
  presentation?: 'gallery' | 'auction';
};
export function ArtworkViewer(props: ArtworkViewerProps) {
  return (
    <ArtworkViewerSession
      key={`${props.artwork.id}:${props.initialStill ?? false}:${props.initialExpression ?? ''}`}
      {...props}
    />
  );
}

function ArtworkViewerSession({
  artwork,
  t,
  initialStill = false,
  initialExpression,
  presentation = 'gallery',
}: ArtworkViewerProps) {
  const [still, setStill] = useState(initialStill);
  const [compare, setCompare] = useState(false);
  const [room, setRoom] = useState<'still' | 'film' | null>(null);
  const [restart, setRestart] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);
  const [explicitPreview, setExplicitPreview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [failed, setFailed] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const { paused, toggle } = useMotion();
  const policy = useMediaPolicy();
  const { expression, pendingExpression, failedExpression, selectExpression, cancelPending } =
    useArtworkExpression({
      media: artwork.media,
      initialExpression,
      onCommit: () => {
        setTime({ current: 0, duration: 0 });
        setPlaying(false);
        setFailed(false);
        setCompare(false);
        setRestart(0);
        setPlayRequest(0);
      },
    });
  const media = getInterpretation(artwork, expression);
  const light = getInterpretation(artwork, 'light');
  const ambient = media
    ? {
        ...media,
        films:
          !room && (!policy.constrained || explicitPreview) && media.previewFilm
            ? [media.previewFilm]
            : [],
      }
    : undefined;
  const label = (id: string) =>
    id === 'ink'
      ? t.ink
      : id === 'light'
        ? t.light
        : (artwork.media.find((item) => item.id === id)?.label ?? id);
  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  function openRoom(film: boolean, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    cancelPending();
    setRestart(0);
    setPlayRequest(0);
    setRoom(film ? 'film' : 'still');
    setPlaying(false);
  }
  function closeRoom() {
    cancelPending();
    setRoom(null);
  }
  return (
    <>
      <section
        className={`viewing-room ${styles.room} ${presentation === 'auction' ? styles.auction : ''}`}
        aria-label={t.ways}
        data-expression={expression}
      >
        <header className={styles.topbar}>
          <p className="eyebrow">
            {t.viewingRoom} / № {String(artwork.id).padStart(3, '0')}
          </p>
          <div className={`interpretation-list ${styles.expressions}`} aria-label={t.ways}>
            {[...artwork.media]
              .sort((a, b) => Number(b.id === 'ink') - Number(a.id === 'ink'))
              .map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    selectExpression(item.id);
                    setCompare(false);
                  }}
                  aria-pressed={expression === item.id}
                  aria-busy={pendingExpression === item.id}
                >
                  <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>{' '}
                  {label(item.id)}
                </button>
              ))}
          </div>
          <button
            className={styles.enlarge}
            onClick={(event) => openRoom(false, event.currentTarget)}
            aria-label={t.enlarge}
          >
            <Maximize2 size={17} />
            <span>{t.enlarge}</span>
          </button>
        </header>
        <div className={`viewer-media ${styles.media}`}>
          <div
            className={`viewer-plate ${styles.plate} ${compare ? `paired ${styles.paired}` : ''}`}
          >
            <ArtworkTransition
              artworkId={artwork.id}
              interpretationId={expression}
              role="detail"
              disabled={compare || !!room}
            >
              <ArtworkStage
                artworkId={artwork.id}
                expression={expression}
                scope="page"
                disabled={compare || !!room}
              >
                <ArtworkMedia
                  key={`${artwork.id}-${expression}`}
                  media={ambient}
                  alt={`${t.signature} ${artwork.id} · ${label(expression)}`}
                  priority
                  still={still || !!room}
                  repeat
                  startAt={time.current}
                  restart={restart}
                  playRequest={playRequest}
                  onPlaybackChange={setPlaying}
                  onProgress={(current, duration) => setTime({ current, duration })}
                  onFailure={() => setFailed(true)}
                />
              </ArtworkStage>
            </ArtworkTransition>
            {compare && light?.still ? (
              <Image
                src={light.still}
                alt={`${t.signature} ${artwork.id} · ${t.light}`}
                width={light.width ?? 3456}
                height={light.height ?? 2234}
                unoptimized
              />
            ) : null}
          </div>
        </div>
        <div className={styles.lower}>
          <div className={`work-transport ${styles.transport}`}>
            {media?.previewFilm ? (
              <>
                <button
                  onClick={() => {
                    if (playing && !paused && !still) toggle();
                    else {
                      setFailed(false);
                      setStill(false);
                      setExplicitPreview(true);
                      setPlayRequest((value) => value + 1);
                      if (paused) toggle();
                    }
                  }}
                >
                  {paused || still || !playing ? <Play size={12} /> : <Pause size={12} />}{' '}
                  {paused || still || !playing ? t.play : t.pause}
                </button>
                <button
                  onClick={() => {
                    setFailed(false);
                    setStill(false);
                    setExplicitPreview(true);
                    setRestart((value) => value + 1);
                    setTime((value) => ({ ...value, current: 0 }));
                    if (paused) toggle();
                  }}
                >
                  <RotateCcw size={12} /> {t.restart}
                </button>
                <button onClick={() => setStill((value) => !value)} aria-pressed={still}>
                  {t.still}
                </button>
                <div className="progress-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${time.duration ? (time.current / time.duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className={styles.clock}>
                  {clock(time.current)} / {clock(time.duration)}
                </span>
                <span className={styles.previewLabel}>{t.mediaPreview}</span>
              </>
            ) : (
              <span className={styles.previewLabel}>{t.still}</span>
            )}
          </div>
          <aside className={`work-rail ${styles.rail}`}>
            <p className={styles.ending}>{t.oneMotion}</p>
            <div className={styles.actions}>
              {expression !== 'light' && light ? (
                <button
                  className="text-link"
                  onClick={() => {
                    cancelPending();
                    setCompare((value) => !value);
                  }}
                  aria-pressed={compare}
                >
                  {compare ? t.closeCompare : t.compare}
                  <ArrowUpRight size={14} />
                </button>
              ) : null}
              {media?.films.length ? (
                <button
                  className="text-link"
                  onClick={(event) => openRoom(true, event.currentTarget)}
                >
                  {t.completeFilm}
                  <Play size={13} />
                </button>
              ) : null}
            </div>
          </aside>
          {pendingExpression ? (
            <p className={styles.status} role="status">
              {t.preparingExpression}
            </p>
          ) : failedExpression ? (
            <p className={styles.status} role="status">
              {t.expressionFailed}
            </p>
          ) : failed ? (
            <p className={styles.status} role="status">
              {t.mediaUnavailable}
            </p>
          ) : null}
        </div>
      </section>
      {room ? (
        <ArtworkRoom
          artwork={artwork}
          t={t}
          expression={expression}
          pendingExpression={pendingExpression ?? undefined}
          expressionFailed={!!failedExpression}
          onExpressionChange={selectExpression}
          initialFilm={room === 'film'}
          onClose={closeRoom}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </>
  );
}
