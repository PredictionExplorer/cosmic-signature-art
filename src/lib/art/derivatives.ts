import { withArrivalMaps } from './arrival-maps';
import { withCollectionPreviews } from './collection-previews';
import { withPlateClips } from './plate-clips';
import { withStillLadder } from './still-ladder';
import { withPlateDetail } from './plate-details';
import { withSweepSpans } from './sweep-spans';
import type { ArtInterpretation, Artwork } from './types';

/**
 * Every hash-verified local derivative the venue authors offline, attached in one pass: the
 * catalogue excerpt, the settling and opening clips, the still ladder, the detail windows, the
 * arrival maps and the spectral sweep's span.
 * Each binds to an interpretation only when the token, seed and published hashes agree with
 * its registry, so a stale snapshot can never paint the wrong file. Nothing here replaces a
 * complete film. Server side only: the registries weigh more than a page should carry, so a
 * client component never imports this module or anything that does (catalog.ts included).
 */
export function withLocalDerivatives(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return withSweepSpans(
    work,
    withArrivalMaps(
      work,
      withPlateDetail(
        work,
        withStillLadder(work, withPlateClips(work, withCollectionPreviews(work, media))),
      ),
    ),
  );
}
