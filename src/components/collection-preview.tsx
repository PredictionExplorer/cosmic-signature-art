'use client';

import Image from 'next/image';
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import type { ArtFilm, ArtInterpretation } from '@/lib/art/types';
import { getPlateGround } from '@/lib/art/plate-records';
import type { PreviewFailure } from './collection-motion';

/** The last frame rests this long before the excerpt fades back to its still (--t-hold). */
const HOLD_MS = 1200;
/** The fade from the held frame to the still (--t-reel). */
const REEL_MS = 700;

type CollectionPreviewProps = {
  media?: ArtInterpretation;
  alt: string;
  active: boolean;
  eager?: boolean;
  /** The work's identity, so its measured ground can letterbox the card. */
  artworkId?: number;
  onFailure: (reason: PreviewFailure) => void;
  /** The excerpt has finished and faded to the still; the lease may move on. */
  onEnded?: () => void;
};

/** Only explicitly verified, compact excerpts belong in a browsing grid. */
export function getCollectionPreviewFilm(media?: ArtInterpretation): ArtFilm | undefined {
  return media?.id === 'ink' ? media.previewFilm : undefined;
}

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

/** The excerpt's true place in its source film, e.g. "00:06–00:14". */
export function excerptRange(film?: ArtFilm): string | undefined {
  if (!film || film.startSeconds === undefined || film.durationSeconds === undefined) return;
  return `${clock(film.startSeconds)}–${clock(film.startSeconds + film.durationSeconds)}`;
}

/** A canonical still is always present; only the grid's selected Ink film has a video source. */
export function CollectionPreview(props: CollectionPreviewProps) {
  const identity = `${props.media?.id}:${props.media?.still}:${props.media?.thumbnail}:${getCollectionPreviewFilm(props.media)?.src}`;
  return <PreviewSession key={identity} {...props} />;
}

function PreviewSession({
  media,
  alt,
  active,
  eager,
  artworkId,
  onFailure,
  onEnded,
}: CollectionPreviewProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [filmFailed, setFilmFailed] = useState(false);
  const imageSource = thumbnailFailed ? media?.still : (media?.thumbnail ?? media?.still);
  const film = getCollectionPreviewFilm(media);
  const ground =
    artworkId !== undefined && media
      ? getPlateGround(artworkId, media.id, media.stillSha256)
      : undefined;
  const style = ground ? ({ '--plate-ground': ground.tone } as CSSProperties) : undefined;

  return (
    <div
      className="art-media"
      data-material={media?.id ?? 'ink'}
      data-collection-preview
      data-edge={ground?.edge ? 'true' : undefined}
      style={style}
    >
      {imageSource && !imageFailed ? (
        <Image
          className="art-still is-settled"
          src={imageSource}
          alt={alt}
          width={
            (imageSource === media?.thumbnail ? media?.thumbnailWidth : undefined) ??
            media?.width ??
            3456
          }
          height={
            (imageSource === media?.thumbnail ? media?.thumbnailHeight : undefined) ??
            media?.height ??
            2234
          }
          unoptimized
          loading={eager ? 'eager' : undefined}
          onError={() => {
            if (imageSource !== media?.still && media?.still) setThumbnailFailed(true);
            else setImageFailed(true);
          }}
        />
      ) : (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span />
        </div>
      )}
      {active && film && !filmFailed ? (
        <PreviewFilm
          film={film}
          onEnded={onEnded}
          onFailure={(reason) => {
            if (reason === 'media') setFilmFailed(true);
            onFailure(reason);
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewFilm({
  film,
  onFailure,
  onEnded,
}: {
  film: ArtFilm;
  onFailure: (reason: PreviewFailure) => void;
  onEnded?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <PreviewVideo
      film={film}
      onEnded={onEnded}
      onFailure={(reason) => {
        setFailed(true);
        onFailure(reason);
      }}
    />
  );
}

function PreviewVideo({
  film,
  onFailure,
  onEnded,
}: {
  film: ArtFilm;
  onFailure: (reason: PreviewFailure) => void;
  onEnded?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const reportFailure = useEffectEvent(onFailure);
  const reportEnded = useEffectEvent(() => onEnded?.());

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let canceled = false;
    let failed = false;
    // `ended` has fired: the rest is owed even if the lease is lost during the hold or fade.
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const fail = (reason: PreviewFailure) => {
      if (canceled || failed) return;
      failed = true;
      reportFailure(reason);
    };
    const play = () => {
      void player.play().catch((error: unknown) => {
        const denied =
          error !== null &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'NotAllowedError';
        fail(denied ? 'autoplay' : 'media');
      });
    };
    const mediaError = () => fail('media');
    const loaded = () => {
      // The compact source already contains an excerpt of the original film.
      // Preserve all of that excerpt, at its original playback speed.
      player.currentTime = 0;
      play();
    };
    const reveal = () => {
      if (canceled || failed || player.seeking) return;
      if (typeof player.requestVideoFrameCallback === 'function') {
        if (frame !== undefined) player.cancelVideoFrameCallback(frame);
        frame = player.requestVideoFrameCallback(() => {
          frame = undefined;
          if (!canceled && !failed) setHasFrame(true);
        });
      } else setHasFrame(true);
    };
    const ended = () => {
      // Hold the excerpt's last frame, fade back to the still, then release the lease.
      // Nothing rewinds on its own; an excerpt ends mid-fluid and says so.
      finished = true;
      timer = setTimeout(() => {
        setHasFrame(false);
        timer = setTimeout(() => {
          if (canceled) return;
          finished = false;
          reportEnded();
        }, REEL_MS);
      }, HOLD_MS);
    };
    player.addEventListener('loadedmetadata', loaded);
    player.addEventListener('playing', reveal);
    player.addEventListener('seeked', reveal);
    player.addEventListener('error', mediaError);
    player.addEventListener('ended', ended);
    player.src = film.src;
    player.load();
    return () => {
      canceled = true;
      clearTimeout(timer);
      if (frame !== undefined) player.cancelVideoFrameCallback(frame);
      player.removeEventListener('loadedmetadata', loaded);
      player.removeEventListener('playing', reveal);
      player.removeEventListener('seeked', reveal);
      player.removeEventListener('error', mediaError);
      player.removeEventListener('ended', ended);
      player.pause();
      // A paused, hidden <video> can keep fetching. Detach the source and reset the
      // media resource when its single playback lease moves to another artwork.
      player.removeAttribute('src');
      player.load();
      // A lease lost during the hold or the fade still rests: the excerpt played to its end.
      if (finished) reportEnded();
    };
  }, [film.src]);

  return (
    <video
      ref={video}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      className={hasFrame ? 'has-frame' : ''}
    />
  );
}
