'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Maximize2, X, RotateCcw, Pause, Play } from 'lucide-react';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import { ArtworkMedia } from './artwork-media';
import { useMotion } from './motion-provider';
type ArtworkViewerProps = {
  artwork: Artwork;
  t: Messages;
  initialStill?: boolean;
};

/** Explicit full-film playback is independent of ambient motion, but never runs in a hidden tab. */
function DialogFilm({
  media,
  label,
  unavailable,
}: {
  media: NonNullable<ReturnType<typeof getInterpretation>>;
  label: string;
  unavailable: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let resume = true;
    const visibility = () => {
      if (document.visibilityState === 'visible') {
        if (resume)
          void player.play().catch(() => {
            /* Native controls allow retry. */
          });
      } else {
        resume = !player.paused && !player.ended;
        player.pause();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      player.pause();
    };
  }, []);
  return (
    <>
      <video
        ref={video}
        src={media.films[0].src}
        poster={media.still}
        controls
        muted
        playsInline
        aria-label={label}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <p className="notice" role="status">
          {unavailable}
        </p>
      ) : null}
    </>
  );
}

export function ArtworkViewer(props: ArtworkViewerProps) {
  return (
    <ArtworkViewerSession key={`${props.artwork.id}:${props.initialStill ?? false}`} {...props} />
  );
}

function ArtworkViewerSession({ artwork, t, initialStill = false }: ArtworkViewerProps) {
  const [mode, setMode] = useState(
    artwork.media.some((m) => m.id === 'ink') ? 'ink' : (artwork.media[0]?.id ?? 'light'),
  );
  const [still, setStill] = useState(initialStill);
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState(false);
  const [dialogFilm, setDialogFilm] = useState(false);
  const [restart, setRestart] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const { paused, toggle } = useMotion();
  const media = getInterpretation(artwork, mode);
  const light = getInterpretation(artwork, 'light');
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) element.showModal();
    else element.close();
    return () => element.close();
  }, [open]);
  const label = (id: string) =>
    id === 'ink'
      ? t.ink
      : id === 'light'
        ? t.light
        : (artwork.media.find((m) => m.id === id)?.label ?? id);
  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  return (
    <>
      <section className="viewing-room" aria-label={t.ways}>
        <div className="viewer-media">
          <div className={`viewer-plate ${compare ? 'paired' : ''}`}>
            <ArtworkMedia
              key={`${artwork.id}-${mode}`}
              media={media}
              alt={`${t.signature} ${artwork.id} · ${label(mode)}`}
              priority
              still={still || open}
              restart={restart}
              playRequest={playRequest}
              onPlaybackChange={setPlaying}
              onProgress={(current, duration) => setTime({ current, duration })}
              onFailure={() => setFailed(true)}
            />
            {compare && light?.still ? (
              <Image
                src={light.still}
                alt={`${t.signature} ${artwork.id} · ${t.light}`}
                width={light.width ?? 3456}
                height={light.height ?? 2234}
                unoptimized
              />
            ) : null}
            <button
              className="enlarge-button"
              onClick={() => {
                setDialogFilm(!still && !paused && playing);
                setOpen(true);
              }}
              aria-label={t.enlarge}
            >
              <Maximize2 size={17} />
            </button>
          </div>
          {media?.films.length ? (
            <div className="work-transport">
              <button
                onClick={() => {
                  if (playing && !paused && !still) toggle();
                  else {
                    setFailed(false);
                    setStill(false);
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
                  setRestart((value) => value + 1);
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
                  style={{ width: `${time.duration ? (time.current / time.duration) * 100 : 0}%` }}
                />
              </div>
              <span>
                {clock(time.current)} / {clock(time.duration)}
              </span>
            </div>
          ) : null}
          {failed ? (
            <p className="notice" role="status">
              {t.mediaUnavailable}
            </p>
          ) : null}
        </div>
        <aside className="work-rail">
          <p className="eyebrow">{t.ways}</p>
          <div className="interpretation-list">
            {[...artwork.media]
              .sort((a, b) => Number(b.id === 'ink') - Number(a.id === 'ink'))
              .map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (mode !== item.id) {
                      setMode(item.id);
                      setTime({ current: 0, duration: 0 });
                      setPlaying(false);
                      setFailed(false);
                    }
                    setCompare(false);
                  }}
                  aria-pressed={mode === item.id}
                >
                  <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
                  <span>{label(item.id)}</span>
                  <i aria-hidden="true">{mode === item.id ? '●' : ''}</i>
                </button>
              ))}
          </div>
          <p className="rail-copy">{t.workCopy}</p>
          {mode !== 'light' && light ? (
            <button
              className="text-link"
              onClick={() => setCompare((value) => !value)}
              aria-pressed={compare}
            >
              {compare ? t.closeCompare : t.compare}
              <ArrowUpRight size={14} />
            </button>
          ) : null}
          {media?.films.length ? (
            <button
              className="text-link"
              onClick={() => {
                setStill(false);
                setDialogFilm(true);
                setOpen(true);
              }}
            >
              {t.completeFilm}
              <Play size={13} />
            </button>
          ) : null}
          <p className="rail-ending">{t.oneMotion}</p>
        </aside>
      </section>
      <dialog
        ref={dialog}
        className="art-dialog"
        aria-label={`${t.signature} ${artwork.id}`}
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <button className="dialog-close" onClick={() => setOpen(false)}>
          <span>{t.close}</span>
          <X size={20} />
        </button>
        {open ? (
          media?.films[0] && dialogFilm ? (
            <DialogFilm
              media={media}
              label={`${t.signature} ${artwork.id} · ${t.film}`}
              unavailable={t.mediaUnavailable}
            />
          ) : media?.still ? (
            <Image
              src={media.still}
              alt={`${t.signature} ${artwork.id} · ${label(mode)}`}
              width={media.width ?? 3456}
              height={media.height ?? 2234}
              unoptimized
            />
          ) : null
        ) : null}
      </dialog>
    </>
  );
}
