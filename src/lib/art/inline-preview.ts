import registry from './inline-previews.json';
import { getCuratedArtwork } from './catalog';

/**
 * The route's one hero paints its 640 px preview from the HTML itself, before any image
 * request. Import this only from server components: the registry is ~130 KB of base64. inline-previews.json is generated from the hash-verified files in public/art
 * (see scripts/README note in the Phase 0 report); regenerate it whenever a curated
 * thumbnail changes. Each entry's sha256 must equal curated-media.json's thumbnailSha256.
 */
interface InlinePreviewRegistry {
  schemaVersion: number;
  previews: Record<string, { sha256: string; bytes: number; dataUri: string }>;
}
const file = registry as InlinePreviewRegistry;
const limit = 64 * 1024;

export function inlinePreview(path?: string): string | undefined {
  if (!path || file.schemaVersion !== 1) return undefined;
  const entry = file.previews[path];
  if (!entry || entry.bytes > limit || !entry.dataUri.startsWith('data:image/webp;base64,'))
    return undefined;
  return entry.dataUri;
}

/** Only a thumbnail the curated registry vouches for may be inlined. */
export function inlineCuratedPreview(id: number, expression: string): string | undefined {
  const media = getCuratedArtwork(id)?.media.find((item) => item.id === expression);
  return inlinePreview(media?.thumbnail);
}
