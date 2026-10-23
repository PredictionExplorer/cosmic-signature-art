'use client';
import Image from 'next/image';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useMotion } from './motion-provider';
import type { ArtInterpretation } from '@/lib/art/types';

type ArtworkMediaProps = {
  media?: ArtInterpretation;
  alt: string;
  priority?: boolean;
  eager?: boolean;
  thumbnail?: boolean;
  still?: boolean;
  repeat?: boolean;
  startAt?: number;
  restart?: number;
  playRequest?: number;
  onProgress?: (time: number, duration: number) => void;
  onPlaybackChange?: (playing: boolean) => void;
  onFailure?: () => void;
};

/** A different source starts a new media session, including failure and playback state. */
export function ArtworkMedia(props: ArtworkMediaProps) {
  const identity = `${props.media?.id}:${props.media?.still}:${props.thumbnail ? props.media?.thumbnail : ''}:${props.media?.films[0]?.src}`;
  return <ArtworkMediaSession key={identity} {...props} />;
}

/** Original proportions and colors are preserved. Only visible films acquire a src. */
function ArtworkMediaSession({
  media,
  alt,
  priority = false,
  eager = false,
  thumbnail = false,
  still = false,
  repeat = false,
  startAt = 0,
  restart = 0,
  playRequest = 0,
  onProgress,
  onPlaybackChange,
  onFailure,
}: ArtworkMediaProps) {
  const { paused } = useMotion();
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
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
      });
    };
  }, []);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [hasFrame, setHasFrame] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [replayCycle, setReplayCycle] = useState(0);
  const [failure, setFailure] = useState<{ restart: number; playRequest: number } | null>(null);
  const failed = failure?.restart === restart && failure?.playRequest === playRequest;
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const ended = useRef(false);
  const replayPhase = useRef<'hold' | 'fade' | null>(null);
  const previousRequest = useRef({ restart, playRequest });
  const film = media?.films[0];
  const imageSource =
    thumbnail && !thumbnailFailed ? (media?.thumbnail ?? media?.still) : media?.still;
  const shouldPlay = visible && pageVisible && !paused && !still && !failed;
  const reportPlayback = useEffectEvent((playing: boolean) => onPlaybackChange?.(playing));
  const reportProgress = useEffectEvent((time: number, duration: number) =>
    onProgress?.(time, duration),
  );
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
      replayPhase.current = null;
      reportProgress(0, Number.isFinite(player.duration) ? player.duration : 0);
    }
    if (shouldPlay) {
      if (ended.current && repeat) {
        const rewind = () => {
          replayPhase.current = 'fade';
          setHasFrame(false);
          timer = setTimeout(() => {
            player.currentTime = 0;
            ended.current = false;
            replayPhase.current = null;
            play();
          }, 600);
        };
        // Pausing or leaving the viewport retains the replay phase; resuming cannot
        // strand a finished film or skip its deliberate transition through the still.
        if (replayPhase.current === 'fade') rewind();
        else timer = setTimeout(rewind, 1600);
      } else if (!ended.current) play();
    } else player.pause();
    return () => {
      canceled = true;
      player.pause();
      if (timer) clearTimeout(timer);
    };
  }, [shouldPlay, repeat, restart, playRequest, replayCycle]);
  return (
    <div ref={container} className="art-media" data-material={media?.id ?? 'ink'}>
      {imageSource && !imageFailed ? (
        <Image
          src={imageSource}
          alt={alt}
          width={media?.width ?? 3456}
          height={media?.height ?? 2234}
          unoptimized
          priority={priority}
          loading={eager && !priority ? 'eager' : undefined}
          onError={() => {
            if (imageSource !== media?.still && media?.still) setThumbnailFailed(true);
            else {
              setImageFailed(true);
              onFailure?.();
            }
          }}
        />
      ) : (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span>∴</span>
        </div>
      )}
      {film && !failed && (shouldPlay || hasPlayed) ? (
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
            onPlaybackChange?.(true);
          }}
          onPause={() => onPlaybackChange?.(false)}
          onTimeUpdate={(event) =>
            onProgress?.(event.currentTarget.currentTime, event.currentTarget.duration)
          }
          onError={() => {
            setFailure({ restart, playRequest });
            setHasFrame(false);
            setHasPlayed(false);
            ended.current = false;
            replayPhase.current = null;
            onPlaybackChange?.(false);
            onFailure?.();
          }}
          onEnded={() => {
            ended.current = true;
            replayPhase.current = 'hold';
            onPlaybackChange?.(false);
            if (repeat) setReplayCycle((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}
