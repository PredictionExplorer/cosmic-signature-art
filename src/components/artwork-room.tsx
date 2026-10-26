'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import {
  getInterpretation,
  type ArtFilm,
  type ArtInterpretation,
  type Artwork,
} from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import { workNumber } from '@/lib/art/number';
import { ArtworkStage } from './artwork-stage';
import styles from './artwork-room.module.css';

type ArtworkRoomProps = {
  artwork: Artwork;
  t: Messages;
  expression: string;
  onExpressionChange: (expression: string) => void;
  /** Only an explicit request for a complete film may opt into its transfer. */
  initialFilm?: boolean;
  pendingExpression?: string | null;
  expressionFailed?: boolean;
  /** Safari pointer clicks need not focus the launcher; capture the explicit opener. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type FilmMemory = Map<string, number>;

function expressionLabel(media: ArtInterpretation, t: Messages) {
  return media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label;
}

function filmLabel(film: ArtFilm, t: Messages) {
  return film.id === 'normal'
    ? t.film
    : film.id === 'medium'
      ? t.longStudy
      : film.id === 'slow'
        ? t.extendedStudy
        : film.label;
}

function RoomStill({ media, label, t }: { media: ArtInterpretation; label: string; t: Messages }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <div className={styles.still}>
      {media.still && !failed ? (
        <Image
          key={attempt}
          className={styles.image}
          src={media.still}
          alt={label}
          width={media.width ?? 3456}
          height={media.height ?? 2234}
          unoptimized
          loading="eager"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={styles.filmNotice} role="status">
          <span>{t.mediaUnavailable}</span>
          {media.still ? (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              {t.retry}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A complete film exists in the DOM only after a visitor chooses it. */
function RoomFilm({
  media,
  film,
  label,
  t,
  memory,
}: {
  media: ArtInterpretation;
  film: ArtFilm;
  label: string;
  t: Messages;
  memory: FilmMemory;
}) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const identity = `${film.variantKey}:${film.src}`;

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let resume = true;
    let disposed = false;
    const play = () => {
      // A user agent may refuse playback; native controls remain available.
      void player.play().catch(() => {});
    };
    const restorePosition = () => {
      const position = memory.get(identity);
      if (position && Number.isFinite(player.duration)) {
        player.currentTime = Math.min(position, Math.max(0, player.duration - 0.1));
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        resume = !player.paused && !player.ended;
        player.pause();
      } else if (resume && !disposed) {
        play();
      }
    };
    player.addEventListener('loadedmetadata', restorePosition);
    // Strict Mode and Activity may replay effects on the same DOM node. Cleanup
    // releases the decoder, so reattach this chosen film before restarting it.
    if (!player.getAttribute('src')) {
      player.setAttribute('src', film.src);
      player.load();
    }
    // Cached media can already have metadata before this effect subscribes.
    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) restorePosition();
    document.addEventListener('visibilitychange', visibility);
    if (document.visibilityState !== 'hidden') play();
    return () => {
      disposed = true;
      if (Number.isFinite(player.currentTime)) {
        memory.set(identity, player.ended ? 0 : player.currentTime);
      }
      player.removeEventListener('loadedmetadata', restorePosition);
      document.removeEventListener('visibilitychange', visibility);
      player.pause();
      // Removing the source cancels downloads and releases the decoder even on route changes.
      player.removeAttribute('src');
      player.load();
    };
  }, [identity, film.src, memory, retry, failed]);

  return (
    <div className={styles.film}>
      {failed ? (
        <RoomStill media={media} label={label} t={t} />
      ) : (
        <video
          key={retry}
          ref={video}
          src={film.src}
          poster={film.poster ?? media.still}
          className={styles.video}
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={`${label} · ${filmLabel(film, t)}`}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      )}
      {failed || loading ? (
        <div className={styles.filmNotice} role="status">
          <span>{failed ? t.mediaUnavailable : t.loadingFilm}</span>
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setFailed(false);
                setRetry((value) => value + 1);
              }}
            >
              {t.retry}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Mount only while open. The dialog works independently of optional native fullscreen. */
export function ArtworkRoom({
  artwork,
  t,
  expression,
  onExpressionChange,
  initialFilm = false,
  pendingExpression,
  expressionFailed = false,
  returnFocusRef,
  onClose,
}: ArtworkRoomProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(false);
  const fullscreenRequest = useRef(false);
  const backdropStart = useRef(false);
  const [positions] = useState<FilmMemory>(() => new Map());
  const [showFilm, setShowFilm] = useState(initialFilm);
  const [selectedFilms, setSelectedFilms] = useState<Record<string, string>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  // iPhone Safari never grants element fullscreen; a control that always fails is not offered.
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  useEffect(() => {
    setFullscreenAvailable(
      document.fullscreenEnabled === true && typeof frame.current?.requestFullscreen === 'function',
    );
  }, []);
  const media = getInterpretation(artwork, expression) ?? artwork.media[0];
  const film = media?.films.find((item) => item.id === selectedFilms[media.id]) ?? media?.films[0];
  const label = `${t.signature} ${artwork.id} · ${media ? expressionLabel(media, t) : ''}`;

  useEffect(() => {
    const modal = dialog.current;
    const room = frame.current;
    if (!modal || !room) return;
    alive.current = true;
    const explicitOpener = returnFocusRef?.current;
    const opener = explicitOpener?.isConnected
      ? explicitOpener
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflowProperties = ['overflow', 'overflow-x', 'overflow-y'];
    const locked = [document.documentElement, document.body].map((element) => ({
      element,
      // Preserve explicit longhands too: writing a shorthand can replace them.
      declarations: Array.from(element.style)
        .filter((property) => overflowProperties.includes(property))
        .map((property) => ({
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        })),
    }));
    for (const { element } of locked) element.style.setProperty('overflow', 'hidden');
    modal.showModal();
    closeButton.current?.focus({ preventScroll: true });
    const changed = () => setFullscreen(document.fullscreenElement === room);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      alive.current = false;
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === room && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
      modal.close();
      for (const { element, declarations } of locked) {
        for (const property of overflowProperties) element.style.removeProperty(property);
        for (const { property, value, priority } of declarations) {
          element.style.setProperty(property, value, priority);
        }
      }
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  const toggleFullscreen = async () => {
    const room = frame.current;
    if (!room || fullscreenRequest.current) return;
    fullscreenRequest.current = true;
    setFullscreenPending(true);
    setFullscreenFailed(false);
    try {
      if (document.fullscreenElement === room) {
        await document.exitFullscreen();
      } else if (room.requestFullscreen) {
        // A dialog itself cannot request fullscreen; its content frame can.
        await room.requestFullscreen();
        // A request may resolve after navigation or closing the room.
        if (!alive.current && document.fullscreenElement === room) {
          await document.exitFullscreen();
        }
      } else {
        setFullscreenFailed(true);
      }
    } catch {
      if (alive.current) setFullscreenFailed(true);
    } finally {
      fullscreenRequest.current = false;
      if (alive.current) setFullscreenPending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={`${t.signature} ${artwork.id} · ${t.viewingRoom}`}
      data-testid="artwork-room"
      data-material={media?.id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropStart.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropStart.current) onClose();
        backdropStart.current = false;
      }}
    >
      <div ref={frame} className={styles.room} data-material={media?.id}>
        <header className={styles.header}>
          <div className={styles.title}>
            <span>{t.viewingRoom}</span>
            <p>{workNumber(artwork.id)}</p>
          </div>
          <button ref={closeButton} className={styles.close} type="button" onClick={onClose}>
            <span>{t.close}</span>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.canvas}>
          <ArtworkStage artworkId={artwork.id} expression={expression} scope="room">
            {media ? (
              showFilm && film ? (
                <RoomFilm
                  key={`${film.variantKey}:${film.src}`}
                  media={media}
                  film={film}
                  label={label}
                  t={t}
                  memory={positions}
                />
              ) : (
                <RoomStill key={media.still ?? media.id} media={media} label={label} t={t} />
              )
            ) : (
              <p role="status">{t.mediaUnavailable}</p>
            )}
          </ArtworkStage>
        </div>

        <footer className={styles.controls}>
          <div className={styles.expressions} role="group" aria-label={t.ways}>
            {[...artwork.media]
              .sort((a, b) => Number(b.id === 'ink') - Number(a.id === 'ink'))
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onExpressionChange(item.id)}
                  aria-pressed={expression === item.id}
                  aria-busy={pendingExpression === item.id}
                >
                  {expressionLabel(item, t)}
                </button>
              ))}
          </div>
          <div className={styles.transport}>
            <div className={styles.switch} role="group" aria-label={t.sources}>
              <button
                type="button"
                onClick={() => setShowFilm(false)}
                aria-pressed={!showFilm || !film}
              >
                {t.still}
              </button>
              {film ? (
                <button type="button" onClick={() => setShowFilm(true)} aria-pressed={showFilm}>
                  {t.film}
                </button>
              ) : null}
            </div>
            {showFilm && media && media.films.length > 1 && film ? (
              <label className={styles.variant}>
                <span className="sr-only">{t.completeFilm}</span>
                <select
                  value={film.id}
                  onChange={(event) =>
                    setSelectedFilms((current) => ({ ...current, [media.id]: event.target.value }))
                  }
                >
                  {media.films.map((item) => (
                    <option key={item.id} value={item.id}>
                      {filmLabel(item, t)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {fullscreenAvailable ? (
            <button
              className={styles.fullscreen}
              type="button"
              onClick={() => void toggleFullscreen()}
              disabled={fullscreenPending}
              aria-busy={fullscreenPending}
            >
              {fullscreen ? (
                <Minimize2 size={15} aria-hidden="true" />
              ) : (
                <Maximize2 size={15} aria-hidden="true" />
              )}
              <span>{fullscreen ? t.exitFullScreen : t.fullScreen}</span>
            </button>
          ) : (
            <span className={styles.fullscreen} aria-hidden="true" />
          )}
        </footer>
        <div
          className={styles.notice}
          role={pendingExpression || expressionFailed || fullscreenFailed ? 'status' : undefined}
          aria-live="polite"
        >
          {pendingExpression
            ? t.preparingExpression
            : expressionFailed
              ? t.expressionFailed
              : fullscreenFailed
                ? t.fullScreenUnavailable
                : ''}
        </div>
      </div>
    </dialog>
  );
}
