import { withCollectionPreviews } from './collection-previews';
import { withPlateClips } from './plate-clips';
import { withStillLadder } from './still-ladder';
import type { ArtInterpretation, Artwork } from './types';

/**
 * Every hash-verified local derivative the venue authors offline, attached in one pass: the
 * catalogue excerpt, the settling and opening clips, and the still ladder. Each binds to an
 * interpretation only when the token, seed and published hashes agree with its registry, so
 * a stale snapshot can never paint the wrong file. Nothing here replaces a complete film.
 */
export function withLocalDerivatives(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return withStillLadder(work, withPlateClips(work, withCollectionPreviews(work, media)));
}
