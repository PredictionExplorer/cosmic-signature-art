'use client';
import type { Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';

/**
 * The gatefold (vision §6, Beat 3): a horizontally scroll-snapped spread wider than the
 * viewport, the Ink plate on paper beside the Light plate on black at equal scale, with a
 * draggable seam as its second view; a vertical diptych on a phone. This seam in the viewer
 * is where it hangs; the spread itself is Phase 2 work in progress and renders nothing yet.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the seam's props are the spread's contract
export function ArtworkGatefold(_props: {
  artwork: Artwork;
  /** The committed expression; the spread shows both regardless. */
  expression: string;
  t: Messages;
  locale: Locale;
}) {
  return null;
}
