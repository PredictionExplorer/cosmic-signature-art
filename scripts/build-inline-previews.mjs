import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { log } from 'node:console';

/**
 * Inline previews: the curated 640 px thumbnails as data URIs, so a route's hero paints
 * from the HTML itself. Each file is hashed and refused unless it matches the
 * thumbnailSha256 recorded in curated-media.json; nothing here alters an image.
 * Run `node scripts/build-inline-previews.mjs` after a curated thumbnail changes.
 */
const mediaPath = fileURLToPath(new URL('../src/lib/art/curated-media.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../src/lib/art/inline-previews.json', import.meta.url));
const artDirectory = resolve(fileURLToPath(new URL('../public', import.meta.url)), 'art');
const limit = 64 * 1024;
const shaPattern = /^[a-f0-9]{64}$/;

/** The on-disk thumbnail for a curated `/art/...` path, refused unless it stays inside public/art. */
export function resolveThumbnail(thumbnail, directory = artDirectory) {
  if (!thumbnail.startsWith('/art/')) throw new Error(`${thumbnail} is outside public/art`);
  const path = resolve(directory, `.${thumbnail.slice('/art'.length)}`);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`${thumbnail} is outside public/art`);
  return path;
}

export function registryEntry(bytes, expectedSha256) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256)
    throw new Error(
      `hashes to ${sha256.slice(0, 12)}…, not the curated ${expectedSha256.slice(0, 12)}…`,
    );
  if (bytes.length > limit)
    throw new Error(`${bytes.length} bytes exceeds the ${limit} byte inline limit`);
  return {
    sha256,
    bytes: bytes.length,
    dataUri: `data:image/webp;base64,${bytes.toString('base64')}`,
  };
}

async function main() {
  const curated = JSON.parse(await readFile(mediaPath, 'utf8'));
  const previews = {};
  for (const work of curated) {
    for (const media of work.media) {
      if (!media.thumbnail) continue;
      if (!shaPattern.test(media.thumbnailSha256 ?? ''))
        throw new Error(`Signature ${work.id}: ${media.id} thumbnail has no curated hash`);
      const bytes = await readFile(resolveThumbnail(media.thumbnail));
      try {
        previews[media.thumbnail] = registryEntry(bytes, media.thumbnailSha256);
      } catch (error) {
        throw new Error(
          `Signature ${work.id}: ${media.thumbnail} ${error.message}; refusing to inline`,
          { cause: error },
        );
      }
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(previews)
      .sort()
      .map((key) => [key, previews[key]]),
  );
  const text = `${JSON.stringify({ schemaVersion: 1, previews: sorted }, null, 2)}\n`;
  const temporary = `${registryPath}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, registryPath);
  log(`Inlined ${Object.keys(sorted).length} curated previews into ${registryPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
