import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import registry from './inline-previews.json';
import curated from './curated-media.json';
import { createInlinePreviewLookup, inlineCuratedPreview, inlinePreview } from './inline-preview';

const prefix = 'data:image/webp;base64,';
const publicDirectory = resolve(process.cwd(), 'public');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const thumbnails = curated.flatMap((work) =>
  work.media.flatMap((media) =>
    'thumbnail' in media && media.thumbnail
      ? [
          {
            id: work.id,
            expression: media.id,
            path: media.thumbnail,
            sha256: media.thumbnailSha256,
          },
        ]
      : [],
  ),
);

describe('the inline preview registry', () => {
  it('holds exactly the curated thumbnails, byte for byte, under their verified hashes', () => {
    expect(registry.schemaVersion).toBe(1);
    const entries = Object.entries(registry.previews);
    expect(entries.map(([path]) => path).sort()).toEqual(
      thumbnails.map((item) => item.path).sort(),
    );
    for (const [path, entry] of entries) {
      expect(entry.dataUri.startsWith(prefix)).toBe(true);
      const decoded = Buffer.from(entry.dataUri.slice(prefix.length), 'base64');
      expect(decoded.length).toBe(entry.bytes);
      expect(entry.bytes).toBeLessThanOrEqual(64 * 1024);
      expect(digest(decoded)).toBe(entry.sha256);
      const published = readFileSync(resolve(publicDirectory, path.slice(1)));
      expect(published.length).toBe(entry.bytes);
      expect(digest(published)).toBe(entry.sha256);
      expect(thumbnails.find((item) => item.path === path)?.sha256).toBe(entry.sha256);
    }
  });

  it('inlines the home hero and every curated thumbnail only under its curated hash', () => {
    expect(inlineCuratedPreview(23, 'ink')?.startsWith(prefix)).toBe(true);
    for (const item of thumbnails) {
      expect(inlineCuratedPreview(item.id, item.expression)).toBe(
        registry.previews[item.path as keyof typeof registry.previews].dataUri,
      );
    }
    expect(inlineCuratedPreview(2, 'ink')).toBeUndefined();
    expect(inlineCuratedPreview(999, 'ink')).toBeUndefined();
    expect(inlinePreview('/art/23-ink-640.webp')).toBeUndefined();
    expect(inlinePreview('/art/23-ink-640.webp', 'f'.repeat(64))).toBeUndefined();
  });

  it('refuses a registry whose bytes disagree with the curated record, and malformed entries', () => {
    const stale = createInlinePreviewLookup({
      schemaVersion: 1,
      previews: {
        '/art/23-ink-640.webp': { sha256: 'a'.repeat(64), bytes: 10, dataUri: `${prefix}AAAA` },
        '/art/31-ink-640.webp': { sha256: 'not a hash', bytes: 10, dataUri: `${prefix}AAAA` },
        '/art/35-ink-640.webp': { sha256: 'b'.repeat(64), bytes: 10, dataUri: 'data:text/plain,x' },
      },
    });
    expect(stale.inlineCuratedPreview(23, 'ink')).toBeUndefined();
    expect(stale.inlineCuratedPreview(31, 'ink')).toBeUndefined();
    expect(stale.inlineCuratedPreview(35, 'ink')).toBeUndefined();
    expect(
      createInlinePreviewLookup({ schemaVersion: 2, previews: {} }).inlinePreview('/x', 'a'),
    ).toBeUndefined();
    expect(createInlinePreviewLookup(null).inlineCuratedPreview(23, 'ink')).toBeUndefined();
  });
});
