import { MEDIA_REVALIDATE_SECONDS } from './constants';
import { parseArtworkDetails, type ArtworkDetailsResult } from './details-validation';
import { createArtRequest, type ArtFetchLike } from './request';
import { parseArtworkId } from './validation';
import type { Artwork } from './types';

export type { ArtworkDetails, ArtworkDetailsResult } from './details-validation';

/** Optional enrichment never prevents an artwork or its provenance from rendering. */
export function createArtworkDetailsRepository(
  config: { fetch?: ArtFetchLike; timeoutMs?: number } = {},
) {
  const request = createArtRequest(config);

  async function getArtworkDetails(
    input: string | number,
    expectedSeed: Artwork['seed'],
  ): Promise<ArtworkDetailsResult> {
    const id = parseArtworkId(input);
    if (id === null || !expectedSeed || !/^0x[a-f0-9]{1,64}$/i.test(expectedSeed))
      return { status: 'unavailable', details: null };
    try {
      const raw = await request(`/metadata/${id}`, MEDIA_REVALIDATE_SECONDS);
      return parseArtworkDetails(raw, id, expectedSeed);
    } catch {
      return { status: 'unavailable', details: null };
    }
  }

  return { getArtworkDetails };
}
