'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useMotion } from './motion-provider';
import type { ArtInterpretation } from '@/lib/art/types';

/** Original proportions and colors are preserved. Only visible films acquire a src. */
export function ArtworkMedia({
  media,
  alt,
  priority = false,
  still = false,
  repeat = false,
  startAt = 0,
  restart = 0,
  onProgress,
  onFailure,
}: {
  media?: ArtInterpretation;
  alt: string;
  priority?: boolean;
  still?: boolean;
  repeat?: boolean;
  startAt?: number;
  restart?: number;
  onProgress?: (time: number, duration: number) => void;
  onFailure?: () => void;
}) {
  const { paused } = useMotion();
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const film = media?.films[0];
  const shouldPlay = visible && pageVisible && !paused && !still && !failed;
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
    if (!player) return;
    if (shouldPlay)
      void player.play().catch(() => {
        /* Autoplay refusal leaves the authentic still visible. */
      });
    else player.pause();
    return () => {
      player.pause();
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
  }, [shouldPlay, film?.src]);
  useEffect(() => {
    if (restart > 0 && video.current) video.current.currentTime = 0;
  }, [restart]);
  return (
    <div ref={container} className="art-media" data-material={media?.id ?? 'ink'}>
      {media?.still && !imageFailed ? (
        <Image
          src={media.still}
          alt={alt}
          width={media.width ?? 3456}
          height={media.height ?? 2234}
          unoptimized
          priority={priority}
          onError={() => {
            setImageFailed(true);
            onFailure?.();
          }}
        />
      ) : (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span>∴</span>
        </div>
      )}
      {film && visible && !failed && (!still || hasFrame) && (!paused || hasFrame) ? (
        <video
          ref={video}
          src={film.src}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className={hasFrame && !still ? 'has-frame' : ''}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = Math.min(
              startAt,
              Math.max(0, event.currentTarget.duration - 1),
            );
            if (shouldPlay) void event.currentTarget.play().catch(() => {});
          }}
          onPlaying={() => setHasFrame(true)}
          onTimeUpdate={(event) =>
            onProgress?.(event.currentTarget.currentTime, event.currentTarget.duration)
          }
          onError={() => {
            setFailed(true);
            onFailure?.();
          }}
          onEnded={() => {
            if (!repeat) return;
            replayTimer.current = setTimeout(() => {
              setHasFrame(false);
              replayTimer.current = setTimeout(() => {
                if (video.current) {
                  video.current.currentTime = 0;
                  if (shouldPlay) void video.current.play().catch(() => {});
                }
              }, 600);
            }, 1600);
          }}
        />
      ) : null}
    </div>
  );
}
