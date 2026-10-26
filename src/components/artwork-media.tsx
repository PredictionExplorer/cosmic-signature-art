'use client';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { preload } from 'react-dom';
import { useMotion } from './motion-provider';
import { getPlateGround } from '@/lib/art/plate-records';
import type { ArtInterpretation } from '@/lib/art/types';

/** The settled still is held as an object before any film may begin (--t-hold). */
export const HOLD_MS = 1200;

type ArtworkMediaProps = {
  media?: ArtInterpretation;
  alt: string;
  /** The route's one hero: eager, high fetch priority, its preview preloaded. */
  priority?: boolean;
  eager?: boolean;
  /** A browsing card: the publisher's preview is the only image. */
  thumbnail?: boolean;
  still?: boolean;
  /** Hold the settled still for --t-hold before the first automatic playback. */
  hold?: boolean;
  /**
   * The ambient film may load and play. False unmounts the <video> but keeps the session
   * (settled, played, ended, held), so a room opening or a connection policy changing
   * never makes the plate arrive again.
   */
  ambient?: boolean;
  startAt?: number;
  restart?: number;
  playRequest?: number;
  /** Inline bytes for the preview layer, read on the server for the route's hero. */
  previewSrc?: string;
  /** The work's identity, so its measured ground can letterbox the plate. */
  artworkId?: number;
  onProgress?: (time: number, duration: number) => void;
  onPlaybackChange?: (playing: boolean) => void;
  /** The full still has decoded over the preview (or is the only layer). */
  onSettled?: () => void;
  /** The film reached its final frame, which is the still. Nothing rewinds. */
  onEnded?: () => void;
  onFailure?: () => void;
};

/** A different source starts a new media session, including failure and playback state. */
export function ArtworkMedia(props: ArtworkMediaProps) {
  const identity = `${props.media?.id}:${props.media?.still}:${props.thumbnail ? props.media?.thumbnail : ''}:${props.media?.films[0]?.src}`;
  return <ArtworkMediaSession key={identity} {...props} />;
}

function settleImage(image: HTMLImageElement, settle: () => void) {
  if (typeof image.decode === 'function') void image.decode().then(settle, settle);
  else settle();
}

/**
 * The arrival ladder: the publisher's own 640 px preview paints the whole plate on the
 * work's ground at first paint; the full still fades over it only once it has decoded.
 * Original proportions and colors are preserved. Only visible films acquire a src, and a
 * finished film holds its last frame, which is the still, until a visitor asks again.
 */
function ArtworkMediaSession({
  media,
  alt,
  priority = false,
  eager = false,
  thumbnail = false,
  still = false,
  hold = false,
  ambient = true,
  startAt = 0,
  restart = 0,
  playRequest = 0,
  previewSrc,
  artworkId,
  onProgress,
  onPlaybackChange,
  onSettled,
  onEnded,
  onFailure,
}: ArtworkMediaProps) {
  const { paused, theatre } = useMotion();
  const hushed = theatre === 'hushed';
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Declared before the player ref: its cleanup clears a stale frame when a player leaves.
  const [hasFrame, setHasFrame] = useState(false);
  const attachVideo = useCallback((player: HTMLVideoElement | null) => {
    video.current = player;
    if (!player) return;
    return () => {
      player.pause();
      if (video.current === player) video.current = null;
      // React also detaches refs during Strict Mode replay and Activity hiding. Wait
      // until the commit finishes so only genuinely removed players release bytes
      // and their decoder; a reused or merely hidden node keeps its playback position.
      queueMicrotask(() => {
        if (player.isConnected || video.current === player) return;
        player.removeAttribute('src');
        player.load();
        // A player that returns later must not show a stale frame over the still.
        setHasFrame(false);
      });
    };
  }, []);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [failure, setFailure] = useState<{ restart: number; playRequest: number } | null>(null);
  const failed = failure?.restart === restart && failure?.playRequest === playRequest;
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [settled, setSettled] = useState(false);
  const ended = useRef(false);
  const held = useRef(false);
  const previousRequest = useRef({ restart, playRequest });
  const film = media?.films[0];
  const cardSource =
    thumbnail && !thumbnailFailed ? (media?.thumbnail ?? media?.still) : media?.still;
  const preview =
    thumbnail || previewFailed
      ? undefined
      : (previewSrc ??
        (media?.thumbnail && media.thumbnail !== media.still ? media.thumbnail : undefined));
  // A plate with a preview layer arrives in two steps; anything else is a single image.
  // A still that failed leaves the preview as the one image, so the plate still settles.
  const layered = !thumbnail && !!preview && !!media?.still && !imageFailed;
  const arrival = layered ? (settled ? 'settled' : 'arriving') : 'single';
  const ground =
    artworkId !== undefined && media
      ? getPlateGround(artworkId, media.id, media.stillSha256)
      : undefined;
  if (priority && preview && !preview.startsWith('data:')) {
    preload(preview, { as: 'image', fetchPriority: 'high' });
  }
  const shouldPlay = visible && pageVisible && !paused && !hushed && !still && !failed && ambient;
  const reportPlayback = useEffectEvent((playing: boolean) => onPlaybackChange?.(playing));
  const reportProgress = useEffectEvent((time: number, duration: number) =>
    onProgress?.(time, duration),
  );
  const reportSettled = useEffectEvent(() => onSettled?.());
  const settle = useCallback(() => setSettled(true), []);
  const attachStill = useCallback(
    (image: HTMLImageElement | null) => {
      // A cached or server-painted still can complete before React attaches its handlers.
      if (image && image.complete && image.naturalWidth > 0) settleImage(image, settle);
    },
    [settle],
  );
  useEffect(() => {
    if (settled || !layered) reportSettled();
  }, [settled, layered]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.08,
      rootMargin: '100px',
    });
    if (container.current) observer.observe(container.current);
    const visibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    const player = video.current;
    const restartRequested = restart !== previousRequest.current.restart;
    const playRequested = playRequest !== previousRequest.current.playRequest;
    previousRequest.current = { restart, playRequest };
    if (!player) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let canceled = false;
    const play = () => {
      void player.play().catch(() => {
        // Autoplay refusal preserves the original still and exposes a Play control.
        if (!canceled) reportPlayback(false);
      });
    };
    if (restartRequested || (playRequested && ended.current)) {
      player.currentTime = 0;
      ended.current = false;
      reportProgress(0, Number.isFinite(player.duration) ? player.duration : 0);
    }
    // An explicit request is intent; it never waits out the hold.
    if (restartRequested || playRequested) held.current = true;
    if (shouldPlay) {
      if (ended.current) {
        // The final frame is the still. It rests until someone asks again.
      } else if (hold && !held.current) {
        if (layered && !settled) return;
        timer = setTimeout(() => {
          held.current = true;
          play();
        }, HOLD_MS);
      } else play();
    } else player.pause();
    return () => {
      canceled = true;
      player.pause();
      if (timer) clearTimeout(timer);
    };
  }, [shouldPlay, hold, layered, settled, restart, playRequest]);
  const loading = eager || priority ? 'eager' : 'lazy';
  const style = ground ? ({ '--plate-ground': ground.tone } as CSSProperties) : undefined;
  let image: React.ReactNode;
  if (thumbnail) {
    image =
      cardSource && !imageFailed ? (
        <img
          className="art-still is-settled"
          src={cardSource}
          alt={alt}
          width={media?.thumbnailWidth ?? media?.width ?? 3456}
          height={media?.thumbnailHeight ?? media?.height ?? 2234}
          decoding="async"
          loading={loading}
          onError={() => {
            if (cardSource !== media?.still && media?.still) setThumbnailFailed(true);
            else {
              setImageFailed(true);
              onFailure?.();
            }
          }}
        />
      ) : null;
  } else if (layered) {
    image = (
      <>
        <img
          className="art-preview"
          src={preview}
          alt=""
          aria-hidden="true"
          width={media?.thumbnailWidth ?? 640}
          height={media?.thumbnailHeight ?? 414}
          decoding="async"
          loading="eager"
          fetchPriority={priority ? 'high' : undefined}
          onError={() => setPreviewFailed(true)}
        />
        <img
          ref={attachStill}
          className={settled ? 'art-still is-settled' : 'art-still'}
          src={media?.still}
          alt={alt}
          width={media?.width ?? 3456}
          height={media?.height ?? 2234}
          decoding="async"
          loading={loading}
          onLoad={(event) => settleImage(event.currentTarget, settle)}
          onError={() => setImageFailed(true)}
        />
      </>
    );
  } else if (preview && imageFailed) {
    // The full still could not be fetched; the publisher's preview remains the work.
    image = (
      <img
        className="art-still is-settled"
        src={preview}
        alt={alt}
        width={media?.thumbnailWidth ?? 640}
        height={media?.thumbnailHeight ?? 414}
        decoding="async"
        loading="eager"
        onError={() => {
          setPreviewFailed(true);
          onFailure?.();
        }}
      />
    );
  } else {
    image =
      media?.still && !imageFailed ? (
        <img
          className="art-still is-settled"
          src={media.still}
          alt={alt}
          width={media.width ?? 3456}
          height={media.height ?? 2234}
          decoding="async"
          loading={loading}
          fetchPriority={priority ? 'high' : undefined}
          onError={() => {
            setImageFailed(true);
            onFailure?.();
          }}
        />
      ) : null;
  }
  return (
    <div
      ref={container}
      className="art-media"
      data-material={media?.id ?? 'ink'}
      data-arrival={arrival}
      data-edge={ground?.edge ? 'true' : undefined}
      style={style}
    >
      {image ?? (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span />
        </div>
      )}
      {ambient && film && !failed && (shouldPlay || hasPlayed) ? (
        <video
          ref={attachVideo}
          src={film.src}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className={hasFrame && !still ? 'has-frame' : ''}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = Math.min(
              restart > 0 ? 0 : Math.max(0, startAt),
              Math.max(0, event.currentTarget.duration - 1),
            );
          }}
          onPlaying={() => {
            setHasFrame(true);
            setHasPlayed(true);
            held.current = true;
            onPlaybackChange?.(true);
          }}
          onPause={() => onPlaybackChange?.(false)}
          onTimeUpdate={(event) => {
            const player = event.currentTarget;
            onProgress?.(player.currentTime, player.duration);
            // A frame that advanced is playback, whether or not an engine announced it.
            if (!player.paused && !player.ended) {
              setHasFrame(true);
              held.current = true;
              onPlaybackChange?.(true);
            }
          }}
          onError={() => {
            setFailure({ restart, playRequest });
            setHasFrame(false);
            setHasPlayed(false);
            ended.current = false;
            onPlaybackChange?.(false);
            onFailure?.();
          }}
          onEnded={(event) => {
            ended.current = true;
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration)) onProgress?.(duration, duration);
            onPlaybackChange?.(false);
            onEnded?.();
          }}
        />
      ) : null}
    </div>
  );
}
