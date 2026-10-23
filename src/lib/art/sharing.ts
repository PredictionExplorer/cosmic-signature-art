import type { Artwork } from './types';

/** A token-specific page must never borrow another token's social preview. */
export function artworkSharingImage(artwork: Artwork | null, alt: string) {
  const preview =
    artwork &&
    (artwork.media.find((item) => item.id === 'ink' && item.still) ??
      artwork.media.find((item) => item.id === 'light' && item.still) ??
      artwork.media.find((item) => item.still));
  return preview?.still
    ? { url: preview.still, width: preview.width, height: preview.height, alt }
    : null;
}
