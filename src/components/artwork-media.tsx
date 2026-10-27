'use client';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { preload } from 'react-dom';
import { useMotion } from './motion-provider';
import { useMediaPolicy } from './media-policy';
import { getPlateGround } from '@/lib/art/plate-records';
import type { ArtFilm, ArtInterpretation } from '@/lib/art/types';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { stillSourceSet } from '@/lib/art/types';

/** The settled still is held as an object before any film may begin (--t-hold). */
export const HOLD_MS = 1200;
/** The home's handover: the complete film is fetched this far into the opening clip. */
export const RELAY_PREFETCH_S = 2;
/** The relay is cued two frames ahead of the clip so its first presented frame is in step. */
export const RELAY_LEAD_S = 2 / 60;
/** The relay must hold this much film beyond the cue before it may take over. */
export const RELAY_BUFFER_S = 2;
/**
 * The plate's layout width for the still ladder: 100 vw on a phone, and on a desk the plate
 * fitted by height to the room (100svh − head − strip) in the work's own proportion.
 */
export const PLATE_SIZES = '(max-width: 767px) 100vw, min(100vw, calc((100svh - 104px) * 1.547))';
/** On a constrained connection the resting still is this rung, never the 3,456 px file. */
const CONSTRAINED_RUNG_PX = 1280;
/**
 * The ladder cut to what a constrained connection may fetch: the rungs no wider than the cap,
 * as a srcset. The `src` stays the published still, so the markup the server sends is the
 * markup the client hydrates; only the candidates narrow, once the client knows its connection.
 */
export function cappedSourceSet(media?: ArtInterpretation, cap = CONSTRAINED_RUNG_PX) {
  const rungs = (media?.rungs ?? []).filter((rung) => rung.width <= cap);
  return rungs.length ? rungs.map((rung) => `${rung.src} ${rung.width}w`).join(', ') : undefined;
}
const noSubscription = () => () => {};
/** False while the server's markup is being hydrated, true from the first client render after. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

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
  /** Film time to resume at: where the frame sits in the complete film, not in a clip. */
  startAt?: number;
  restart?: number;
  playRequest?: number;
  /** Inline bytes for the preview layer, read on the server for the route's hero. */
  previewSrc?: string;
  /** The work's identity, so its measured ground can letterbox the plate. */
  artworkId?: number;
  /** The still's layout width for the ladder's srcset; the plate's by default. */
  sizes?: string;
  /** Film time and the complete film's length. */
  onProgress?: (time: number, duration: number) => void;
  onPlaybackChange?: (playing: boolean) => void;
  /** The full still has decoded over the preview (or is the only layer). */
  onSettled?: () => void;
  /** The film reached its final frame, which is the still. Nothing rewinds. */
  onEnded?: () => void;
  /** The opening clip has ended before the complete film could take over; the plate holds. */
  onHandover?: (waiting: boolean) => void;
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

export { stillSourceSet };

/** Where a player's frame sits in the complete film: a clip carries its own start. */
export function filmTime(film: ArtFilm | undefined, playerTime: number): number {
  return (film?.startSeconds ?? 0) + playerTime;
}
/** The complete film's length as the plate's clock states it; an opening clip reports the film it opens. */
export function filmLength(
  film: ArtFilm | undefined,
  playerDuration: number,
  relay?: ArtFilm,
): number {
  if (relay) return relay.durationSeconds ?? playerDuration;
  return filmTime(film, Number.isFinite(playerDuration) ? playerDuration : 0);
}

function buffered(player: HTMLVideoElement, from: number, to: number): boolean {
  const ranges = player.buffered;
  for (let index = 0; index < ranges.length; index += 1)
    if (ranges.start(index) <= from + 0.01 && ranges.end(index) >= to) return true;
  return false;
}

/**
 * The arrival ladder: the publisher's own 640 px preview paints the whole plate on the
 * work's ground at first paint; the full still fades over it only once it has decoded.
 * Original proportions and colors are preserved. Only visible films acquire a src, and a
 * finished film holds its last frame, which is the still, then fades into it.
 *
 * The home's opening clip hands over to the complete film: the film is fetched from
 * RELAY_PREFETCH_S into the clip, cued two frames ahead at the clip's own time, and shown
 * on its first presented frame; a clip that ends first holds its last frame as `arriving`.
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
  sizes,
  onProgress,
  onPlaybackChange,
  onSettled,
  onEnded,
  onHandover,
  onFailure,
}: ArtworkMediaProps) {
  const { paused, theatre } = useMotion();
  const { constrained } = useMediaPolicy();
  const hushed = theatre === 'hushed';
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const relayVideo = useRef<HTMLVideoElement>(null);
  // Declared before the player refs: their cleanups clear a stale frame when a player leaves.
  const [hasFrame, setHasFrame] = useState(false);
  const [relayFrame, setRelayFrame] = useState(false);
  const releasePlayer = (
    ref: { current: HTMLVideoElement | null },
    player: HTMLVideoElement,
    clearFrame: () => void,
  ) => {
    ref.current = player;
    return () => {
      player.pause();
      if (ref.current === player) ref.current = null;
      // React also detaches refs during Strict Mode replay and Activity hiding. Wait
      // until the commit finishes so only genuinely removed players release bytes
      // and their decoder; a reused or merely hidden node keeps its playback position.
      queueMicrotask(() => {
        if (player.isConnected || ref.current === player) return;
        player.removeAttribute('src');
        player.load();
        // A player that returns later must not show a stale frame over the still.
        clearFrame();
      });
    };
  };
  const attachVideo = useCallback((player: HTMLVideoElement | null) => {
    if (!player) return;
    return releasePlayer(video, player, () => setHasFrame(false));
  }, []);
  const attachRelay = useCallback((player: HTMLVideoElement | null) => {
    if (!player) return;
    return releasePlayer(relayVideo, player, () => setRelayFrame(false));
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
  /** The film has ended: its last frame is held, then fades into the still beneath. */
  const [resting, setResting] = useState(false);
  const ended = useRef(false);
  const held = useRef(false);
  const restTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousRequest = useRef({ restart, playRequest });
  const film = media?.films[0];
  /** The complete film an opening clip hands over to. */
  const relayFilm = film?.id === 'opening' ? media?.films[1] : undefined;
  const [relay, setRelay] = useState<'idle' | 'loading' | 'live'>('idle');
  const [waiting, setWaiting] = useState(false);
  /** Set the moment the relay takes over, before React has re-rendered. */
  const live = useRef(false);
  const relayCued = useRef(false);
  const relayFailed = useRef(false);
  /** The opening clip has ended; it never replays on its own. */
  const clipDone = useRef(false);
  /** Film time a remounted plate resumes at, when the clip cannot show it and the relay must. */
  const resumeAt = useRef<number | undefined>(undefined);
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
  // The still ladder: any connection picks its rung from the plate's layout width, and the
  // 3,456 px file only when the screen asks; a constrained one is offered the 1280 rung alone.
  // The cap applies only once the client knows its connection, so the hero still is fetched
  // once: the server's markup and the hydrating client's are the same.
  const hydrated = useHydrated();
  const capped = hydrated && constrained;
  const stillSrc = media?.still;
  const stillSet = capped ? cappedSourceSet(media) : stillSourceSet(media);
  const stillSizes = stillSet ? (sizes ?? PLATE_SIZES) : undefined;
  if (priority && preview && !preview.startsWith('data:')) {
    preload(preview, { as: 'image', fetchPriority: 'high' });
  }
  const shouldPlay = visible && pageVisible && !paused && !hushed && !still && !failed && ambient;
  const reportPlayback = useEffectEvent((playing: boolean) => onPlaybackChange?.(playing));
  const reportSettled = useEffectEvent(() => onSettled?.());
  /** A replay begins at the film's first frame; the clock is told so before any frame shows. */
  const reportRestart = useEffectEvent((player: HTMLVideoElement) =>
    onProgress?.(
      filmTime(relay === 'live' ? relayFilm : film, 0),
      filmLength(film, Number.isFinite(player.duration) ? player.duration : 0, relayFilm),
    ),
  );
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
  useEffect(() => () => clearTimeout(restTimer.current), []);

  /** The relay takes over once it holds the film from the cue onward. */
  function tryRelay() {
    const opening = video.current;
    const second = relayVideo.current;
    if (!relayFilm || !opening || !second || relay !== 'loading' || relayCued.current) return;
    const at = clipDone.current
      ? (resumeAt.current ??
        (Number.isFinite(opening.duration) ? opening.duration : opening.currentTime))
      : opening.currentTime + RELAY_LEAD_S;
    const need = Math.min(
      at + RELAY_BUFFER_S,
      Number.isFinite(second.duration) ? second.duration : Infinity,
    );
    if (second.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || !buffered(second, at, need))
      return;
    relayCued.current = true;
    second.currentTime = at;
    void second.play().catch(() => {
      relayCued.current = false;
    });
  }
  const relayFromEffect = useEffectEvent(() => tryRelay());
  /** The relay's first presented frame: the clip pauses beneath it in the same instant. */
  function goLive() {
    if (!relayCued.current || live.current) return;
    live.current = true;
    resumeAt.current = undefined;
    setRelay('live');
    setRelayFrame(true);
    setHasPlayed(true);
    held.current = true;
    video.current?.pause();
    if (clipDone.current) {
      clipDone.current = false;
      setWaiting(false);
      onHandover?.(false);
    }
    onPlaybackChange?.(true);
  }
  function fail() {
    setFailure({ restart, playRequest });
    setHasFrame(false);
    setRelayFrame(false);
    setHasPlayed(false);
    ended.current = false;
    clipDone.current = false;
    live.current = false;
    relayCued.current = false;
    // A relay that failed once is tried afresh the next time the plate is asked to play.
    relayFailed.current = false;
    setRelay('idle');
    if (waiting) {
      setWaiting(false);
      onHandover?.(false);
    }
    onPlaybackChange?.(false);
    onFailure?.();
  }
  /** A film has reached its last frame, which is the still: hold it, then fade into the still. */
  function finish(player: HTMLVideoElement, current: ArtFilm | undefined) {
    ended.current = true;
    const duration = player.duration;
    if (Number.isFinite(duration))
      onProgress?.(filmTime(current, duration), filmLength(current, duration, relayFilm));
    onPlaybackChange?.(false);
    setResting(true);
    clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => {
      setHasFrame(false);
      setRelayFrame(false);
    }, HOLD_MS);
    onEnded?.();
  }

  useEffect(() => {
    // The player is chosen as the effect runs, from the ref that tracks the handover, so the
    // relay's own state changes (the prefetch cue at two seconds, the takeover) never pause
    // and replay the clip beneath them.
    const player = live.current ? relayVideo.current : video.current;
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
      clipDone.current = false;
      relayFailed.current = false;
      resumeAt.current = undefined;
      clearTimeout(restTimer.current);
      setResting(false);
      reportRestart(player);
    }
    // An explicit request is intent; it never waits out the hold.
    if (restartRequested || playRequested) held.current = true;
    if (shouldPlay) {
      if (ended.current) {
        // The final frame is the still. It rests until someone asks again.
      } else if (clipDone.current && !live.current) {
        // The opening clip has ended; its last frame holds until the complete film arrives.
        relayFromEffect();
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
  let image: ReactNode;
  if (thumbnail) {
    const ladder = !!sizes && cardSource === media?.thumbnail && !!stillSet;
    image =
      cardSource && !imageFailed ? (
        <img
          className="art-still is-settled"
          src={cardSource}
          srcSet={
            ladder ? `${cardSource} ${media?.thumbnailWidth ?? 640}w, ${stillSet}` : undefined
          }
          sizes={ladder ? sizes : undefined}
          alt={alt}
          width={media?.thumbnailWidth ?? media?.width ?? ART_WIDTH}
          height={media?.thumbnailHeight ?? media?.height ?? ART_HEIGHT}
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
          src={stillSrc}
          srcSet={stillSet}
          sizes={stillSizes}
          alt={alt}
          width={media?.width ?? ART_WIDTH}
          height={media?.height ?? ART_HEIGHT}
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
          src={stillSrc}
          srcSet={stillSet}
          sizes={stillSizes}
          alt={alt}
          width={media.width ?? ART_WIDTH}
          height={media.height ?? ART_HEIGHT}
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
  const mounted = ambient && film && !failed && (shouldPlay || hasPlayed);
  const videoClass = (frame: boolean) =>
    [frame && !still ? 'has-frame' : '', resting ? 'has-ended' : ''].filter(Boolean).join(' ');
  return (
    <div
      ref={container}
      className="art-media"
      data-material={media?.id ?? 'ink'}
      data-arrival={arrival}
      data-edge={ground?.edge ? 'true' : undefined}
      data-handover={
        relayFilm && mounted
          ? relay === 'live'
            ? 'film'
            : waiting
              ? 'waiting'
              : 'opening'
          : undefined
      }
      style={style}
    >
      {image ?? (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span />
        </div>
      )}
      {mounted && relay !== 'live' ? (
        <video
          ref={attachVideo}
          src={film.src}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className={videoClass(hasFrame)}
          onLoadedMetadata={(event) => {
            const player = event.currentTarget;
            const at = Math.max(0, startAt - (film.startSeconds ?? 0));
            if (relayFilm && restart === 0 && at >= player.duration - 1) {
              // The plate resumes past the clip: the complete film carries on from there.
              player.currentTime = Math.max(0, player.duration - 1);
              clipDone.current = true;
              resumeAt.current = startAt;
              setRelay('loading');
              return;
            }
            player.currentTime = Math.min(restart > 0 ? 0 : at, Math.max(0, player.duration - 1));
          }}
          onPlaying={() => {
            if (live.current) return;
            setHasFrame(true);
            setHasPlayed(true);
            held.current = true;
            onPlaybackChange?.(true);
          }}
          onPause={() => {
            if (!live.current) onPlaybackChange?.(false);
          }}
          onTimeUpdate={(event) => {
            if (live.current) return;
            const player = event.currentTarget;
            onProgress?.(
              filmTime(film, player.currentTime),
              filmLength(film, player.duration, relayFilm),
            );
            // A frame that advanced is playback, whether or not an engine announced it.
            if (!player.paused && !player.ended) {
              setHasFrame(true);
              held.current = true;
              onPlaybackChange?.(true);
            }
            if (relayFilm) {
              if (relay === 'idle' && player.currentTime >= RELAY_PREFETCH_S) setRelay('loading');
              else tryRelay();
            }
          }}
          onError={fail}
          onEnded={(event) => {
            if (live.current) return;
            if (relayFilm) {
              if (relayFailed.current) {
                fail();
                return;
              }
              // The clip has ended before the film arrived: hold its last frame, say arriving.
              clipDone.current = true;
              setWaiting(true);
              onHandover?.(true);
              onPlaybackChange?.(false);
              if (relay === 'idle') setRelay('loading');
              else tryRelay();
              return;
            }
            finish(event.currentTarget, film);
          }}
        />
      ) : null}
      {mounted && relayFilm && relay !== 'idle' ? (
        <video
          ref={attachRelay}
          src={relayFilm.src}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          data-relay=""
          className={videoClass(relayFrame)}
          onLoadedMetadata={(event) => {
            if (!live.current) {
              tryRelay();
              return;
            }
            // A live relay that returns (the room closed, the policy changed) resumes where the plate was.
            const player = event.currentTarget;
            player.currentTime = Math.min(
              restart > 0 ? 0 : Math.max(0, startAt),
              Math.max(0, player.duration - 1),
            );
          }}
          onProgress={tryRelay}
          onCanPlay={tryRelay}
          onCanPlayThrough={tryRelay}
          onPlaying={(event) => {
            if (live.current) {
              setRelayFrame(true);
              onPlaybackChange?.(true);
              return;
            }
            const player = event.currentTarget;
            if (typeof player.requestVideoFrameCallback === 'function')
              player.requestVideoFrameCallback(() => goLive());
            else goLive();
          }}
          onPause={() => {
            if (live.current) onPlaybackChange?.(false);
          }}
          onTimeUpdate={(event) => {
            if (!live.current) {
              goLive();
              return;
            }
            const player = event.currentTarget;
            onProgress?.(player.currentTime, filmLength(relayFilm, player.duration));
            if (!player.paused && !player.ended) {
              setRelayFrame(true);
              onPlaybackChange?.(true);
            }
          }}
          onError={() => {
            relayFailed.current = true;
            // A film that cannot arrive fails the plate only once the clip has nothing left to show.
            if (live.current || clipDone.current) fail();
          }}
          onEnded={(event) => {
            if (live.current) finish(event.currentTarget, relayFilm);
          }}
        />
      ) : null}
    </div>
  );
}
