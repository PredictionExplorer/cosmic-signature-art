import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * Next's image optimizer is an endpoint, /_next/image, that fetches a picture and re-encodes it
 * at the width asked for. The venue does not use it: every still it shows is a file it cut and
 * named by its hash (scripts/build-still-ladder.mjs), served as it is. An endpoint nothing uses
 * that fetches and transcodes for anyone is cost and surface for no benefit, so it is closed
 * (next.config.ts), and these two keep it closed and unneeded together. The browser suite asks
 * the endpoint itself (tests/e2e/not-found.spec.ts).
 */

// Vitest runs from the repository root; the jsdom environment gives import.meta.url an http scheme.
const root = process.cwd();

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.(?:tsx?|mjs)$/.test(entry)) found.push(path);
  }
  return found;
}

describe('the image optimizer', () => {
  it('is closed, with no host or path left open to it', () => {
    expect(nextConfig.images).toEqual({ unoptimized: true });
  });

  it('is asked for nothing: no module imports next/image', () => {
    // A type-only import bundles nothing; a component that used the optimizer would import it.
    const users = ['src', 'tests']
      .flatMap((folder) => sources(join(root, folder)))
      .filter((path) =>
        /from\s+['"]next\/(?:legacy\/)?image['"]/.test(
          readFileSync(path, 'utf8').replace(/import\s+type\s[^;]+;/g, ''),
        ),
      )
      .map((path) => relative(root, path));
    expect(users).toEqual([]);
  });
});
