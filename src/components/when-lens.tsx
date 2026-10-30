'use client';

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { rungFor, type ArtInterpretation } from '@/lib/art/types';
import { hexLuminance, paintWhen } from '@/lib/crossing/when';
import styles from './artwork-room.module.css';

/** An image this page may read: the venue's own rungs and maps are served from its origin. */
function decoded(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
  });
  image.src = src;
  return loaded.then((ready) =>
    typeof ready.decode === 'function' ? ready.decode().then(() => ready) : ready,
  );
}

/**
 * The When lens in the room: the still, each mark coloured by when its film reached it, on a
 * dark ground. Painted once per still on a 2D canvas from the work's own rung and arrival map,
 * both hash-verified local files; a browser that cannot paint it reports the failure and the
 * room returns to the still. The caller labels it analysis, never the work.
 */
export function WhenLens({
  media,
  paper,
  label,
  onFailure,
}: {
  media: ArtInterpretation;
  /** The sheet's measured tone, so Ink's marks are read as darkness on their own paper. */
  paper: string;
  label: string;
  onFailure: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const fail = useEffectEvent(onFailure);

  useEffect(() => {
    const node = canvas.current;
    const arrival = media.arrival;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rung = rungFor(media.rungs, Math.min(1920, (node?.clientWidth || 1280) * ratio));
    if (!node || !arrival || !rung) {
      fail();
      return;
    }
    let cancelled = false;
    void Promise.all([decoded(rung.src), decoded(arrival.src)])
      .then(([still, map]) => {
        if (cancelled) return;
        const context = node.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('no 2D canvas');
        const { naturalWidth: width, naturalHeight: height } = still;
        node.width = width;
        node.height = height;
        context.drawImage(still, 0, 0);
        const stillPixels = context.getImageData(0, 0, width, height).data;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(map, 0, 0, width, height);
        const mapPixels = context.getImageData(0, 0, width, height).data;
        const lens = context.createImageData(width, height);
        paintWhen(
          stillPixels,
          mapPixels,
          lens.data,
          media.id === 'light' ? 'light' : 'ink',
          hexLuminance(paper),
        );
        context.putImageData(lens, 0, 0);
        setPainted(true);
      })
      .catch(() => {
        if (!cancelled) fail();
      });
    return () => {
      cancelled = true;
    };
  }, [media, paper]);

  const ratio = (media.width ?? ART_WIDTH) / (media.height ?? ART_HEIGHT);
  return (
    <div className={styles.lens} style={{ '--ratio': ratio } as CSSProperties}>
      <canvas
        ref={canvas}
        className={styles.lensCanvas}
        role="img"
        aria-label={label}
        data-room-media
        data-when={painted ? 'painted' : 'painting'}
      />
    </div>
  );
}
