'use client';

import Image from 'next/image';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ArtFilm, ArtInterpretation } from '@/lib/art/types';
import type { PreviewFailure } from './collection-motion';

type CollectionPreviewProps = {
  media?: ArtInterpretation;
  alt: string;
  active: boolean;
  eager?: boolean;
  onFailure: (reason: PreviewFailure) => void;
};

/** Only explicitly verified, compact excerpts belong in a browsing grid. */
export function getCollectionPreviewFilm(media?: ArtInterpretation): ArtFilm | undefined {
  return media?.id === 'ink' ? media.previewFilm : undefined;
}

/** A canonical still is always present; only the grid's selected Ink film has a video source. */
export function CollectionPreview(props: CollectionPreviewProps) {
  const identity = `${props.media?.id}:${props.media?.still}:${props.media?.thumbnail}:${getCollectionPreviewFilm(props.media)?.src}`;
  return <PreviewSession key={identity} {...props} />;
}

function PreviewSession({ media, alt, active, eager, onFailure }: CollectionPreviewProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [filmFailed, setFilmFailed] = useState(false);
  const imageSource = thumbnailFailed ? media?.still : (media?.thumbnail ?? media?.still);
  const film = getCollectionPreviewFilm(media);

  return (
    <div className="art-media" data-material={media?.id ?? 'ink'} data-collection-preview>
      {imageSource && !imageFailed ? (
        <Image
          src={imageSource}
          alt={alt}
          width={media?.width ?? 3456}
          height={media?.height ?? 2234}
          unoptimized
          loading={eager ? 'eager' : undefined}
          onError={() => {
            if (imageSource !== media?.still && media?.still) setThumbnailFailed(true);
            else setImageFailed(true);
          }}
        />
      ) : (
        <div className="art-placeholder" role="img" aria-label={alt}>
          <span>∴</span>
        </div>
      )}
      {active && film && !filmFailed ? (
        <PreviewFilm
          film={film}
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
}: {
  film: ArtFilm;
  onFailure: (reason: PreviewFailure) => void;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <PreviewVideo
      film={film}
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
}: {
  film: ArtFilm;
  onFailure: (reason: PreviewFailure) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const reportFailure = useEffectEvent(onFailure);

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let canceled = false;
    let failed = false;
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
    const seekToOpening = () => {
      // The compact source already contains an excerpt of the original film.
      // Preserve all of that excerpt, at its original playback speed.
      player.currentTime = 0;
    };
    const loaded = () => {
      seekToOpening();
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
      timer = setTimeout(() => {
        setHasFrame(false);
        timer = setTimeout(() => {
          seekToOpening();
          play();
        }, 700);
      }, 1_200);
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
