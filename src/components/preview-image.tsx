'use client';
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

/** Attempts a preview is given before its frame is left empty: the first load and two retries. */
export const PREVIEW_ATTEMPTS = 3;
/** The pause before a retry grows with each attempt (--t-hold, then twice that). */
const RETRY_MS = 1200;

/**
 * A publisher's preview that asks again when a load fails. Dozens of previews hang at once on
 * the Spectrum wall, in the Index and in a cycle's row, and one origin answering a burst can
 * drop a few; a quiet retry restores the plate instead of leaving a broken image on the wall.
 * The source is never changed, only requested again, so the bytes stay the publisher's own.
 */
export function PreviewImage({
  src,
  alt = '',
  onFailure,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string;
  alt?: string;
  /** Every attempt failed; the frame is kept but marked. */
  onFailure?: () => void;
}) {
  // Attempts belong to one source; a new source starts over (derived state, reset in render).
  const [state, setState] = useState({ src, attempt: 1, failed: false });
  if (state.src !== src) setState({ src, attempt: 1, failed: false });
  const { attempt, failed } = state.src === src ? state : { attempt: 1, failed: false };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <img
      key={`${src}#${attempt}`}
      src={src}
      alt={alt}
      data-attempt={attempt}
      data-failed={failed ? '' : undefined}
      {...rest}
      onError={(event) => {
        rest.onError?.(event);
        if (attempt >= PREVIEW_ATTEMPTS) {
          setState((current) => ({ ...current, failed: true }));
          onFailure?.();
          return;
        }
        timer.current = setTimeout(
          () => setState((current) => ({ ...current, attempt: current.attempt + 1 })),
          RETRY_MS * attempt,
        );
      }}
    />
  );
}
