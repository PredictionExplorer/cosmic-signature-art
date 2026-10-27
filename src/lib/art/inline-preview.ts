import registry from './inline-previews.json' with { type: 'json' };
import mediaRecords from './curated-media.json' with { type: 'json' };

/**
 * The route's one hero paints its 640 px preview from the HTML itself, before any image
 * request. Import this only from server components: the registry is ~130 KB of base64.
 * `node scripts/build-inline-previews.mjs` regenerates inline-previews.json from the
 * hash-verified files in public/art whenever a curated thumbnail changes, and
 * inline-preview.test.ts proves every entry's bytes hash to curated-media.json's
 * thumbnailSha256. The lookup below refuses an entry whose hash disagrees anyway, so a
 * stale registry can never paint pixels the curated record no longer vouches for.
 */
export interface InlinePreviewEntry {
  sha256: string;
  bytes: number;
  dataUri: string;
}
export interface InlinePreviewRegistry {
  schemaVersion: number;
  previews: Record<string, InlinePreviewEntry>;
}
interface CuratedThumbnail {
  id: number;
  media: { id: string; thumbnail?: string; thumbnailSha256?: string }[];
}

const limit = 64 * 1024;
const sha = /^[a-f0-9]{64}$/;
const prefix = 'data:image/webp;base64,';
const curatedMedia = mediaRecords as CuratedThumbnail[];

function validEntry(entry: unknown): entry is InlinePreviewEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const { sha256, bytes, dataUri } = entry as Partial<InlinePreviewEntry>;
  return (
    typeof sha256 === 'string' &&
    sha.test(sha256) &&
    Number.isSafeInteger(bytes) &&
    (bytes as number) > 0 &&
    (bytes as number) <= limit &&
    typeof dataUri === 'string' &&
    dataUri.startsWith(prefix)
  );
}

/** A lookup over one registry; the test injects a disagreeing one to prove the refusal. */
export function createInlinePreviewLookup(
  raw: unknown,
  curated: CuratedThumbnail[] = curatedMedia,
) {
  const file = raw as Partial<InlinePreviewRegistry> | null;
  const previews = new Map<string, InlinePreviewEntry>();
  if (file?.schemaVersion === 1 && file.previews && typeof file.previews === 'object') {
    for (const [path, entry] of Object.entries(file.previews)) {
      if (validEntry(entry)) previews.set(path, entry);
    }
  }
  /** The inline bytes for a published path, only when their hash is the expected one. */
  function inlinePreview(path?: string, sha256?: string): string | undefined {
    const entry = path ? previews.get(path) : undefined;
    if (!entry || !sha256 || entry.sha256 !== sha256) return undefined;
    return entry.dataUri;
  }
  /** Only a thumbnail the curated registry vouches for, byte for byte, may be inlined. */
  function inlineCuratedPreview(id: number, expression: string): string | undefined {
    const entry = curated
      .find((work) => work.id === id)
      ?.media.find((item) => item.id === expression);
    if (!entry?.thumbnail || !entry.thumbnailSha256) return undefined;
    return inlinePreview(entry.thumbnail, entry.thumbnailSha256);
  }
  return { inlinePreview, inlineCuratedPreview };
}

const lookup = createInlinePreviewLookup(registry);
export const inlinePreview = lookup.inlinePreview;
export const inlineCuratedPreview = lookup.inlineCuratedPreview;
