import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ImageConfigComplete } from 'next/dist/shared/lib/image-config';
import { hasLocalMatch } from 'next/dist/shared/lib/match-local-pattern';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * Next's image optimizer is an endpoint, /_next/image, that fetches a picture and re-encodes it
 * at the width asked for. The venue does not use it: every still it shows is a file it cut and
 * named by its hash (scripts/build-still-ladder.mjs), served as it is. An endpoint nothing uses
 * that fetches and transcodes for anyone is cost and surface for no benefit, so it is closed
 * (next.config.ts), and these keep it closed and unneeded together.
 *
 * Two servers answer the address. Next's own is asked by the browser suite, under `next start`
 * (tests/e2e/not-found.spec.ts). The host's is the platform's, and no test run here can ask it:
 * what it is handed is held below, and the address itself is asked of the live site once a
 * deployment stands (docs/codebase-review.md records each asking).
 */

// Vitest runs from the repository root; the jsdom environment gives import.meta.url an http scheme.
const root = process.cwd();

/** Every file under a directory whose name matches `wanted`. */
function files(directory: string, wanted: RegExp = /./): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...files(path, wanted));
    else if (wanted.test(entry)) found.push(path);
  }
  return found;
}

describe('the image optimizer', () => {
  it('is set closed for both servers, with no host and no file of the venue’s named', () => {
    // `unoptimized` closes Next's own server. The host's endpoint is set up by an adapter that
    // copies the patterns and never reads `unoptimized` (getImagesConfig in nextjs/adapter-vercel,
    // reported there as issue 133): with no local pattern named, Next hands it one that matches
    // every path, and an empty list names none. With no remote pattern or domain named, no other
    // host is fetched from.
    expect(nextConfig.images).toEqual({ unoptimized: true, localPatterns: [] });
  });

  it('hands the host no file in public/: Next’s reading, put to Next’s own matcher', () => {
    // What the host's adapter is given is the configuration as Next resolves it, and Next adds
    // to any list of local patterns. So Next's own loader resolves it here, as it does for the
    // headers (src/lib/security-headers.test.ts), and every file in public/ is put to the
    // matcher Next's optimizer uses. The platform's own matcher is not public: the live site is
    // asked for what this cannot show (docs/codebase-review.md).
    const load = `
      const config = require(process.argv[1] + '/node_modules/next/dist/server/config').default;
      config('phase-production-build', process.argv[1], { silent: true })
        .then((loaded) => process.stdout.write(JSON.stringify(loaded.images)));
    `;
    const images = JSON.parse(
      execFileSync(process.execPath, ['-e', load, root], { encoding: 'utf8' }),
    ) as Pick<ImageConfigComplete, 'localPatterns' | 'remotePatterns' | 'domains'>;
    expect(images.remotePatterns).toEqual([]);
    expect(images.domains).toEqual([]);
    // What Next adds: the build's own media, where the venue's icon files, the pages' mono face
    // and the workers' sources are kept and no picture of the art. A release that added more
    // would fail here and be looked at.
    expect(images.localPatterns).toEqual([
      { pathname: '/_next/static/media/**', search: '' },
      { pathname: '/_next/static/immutable/media/**', search: '' },
    ]);
    const published = files(join(root, 'public')).map(
      (path) => `/${relative(join(root, 'public'), path)}`,
    );
    expect(published.filter((file) => file.startsWith('/art/')).length).toBeGreaterThan(500);
    expect(published.filter((file) => hasLocalMatch(images.localPatterns, file))).toEqual([]);
    // The matcher can tell. With no list named, as the configuration once was, Next names every
    // path itself, and that one pattern lets each of these files through.
    const unnamed = [{ pathname: '**', search: '' }];
    expect(published.filter((file) => !hasLocalMatch(unnamed, file))).toEqual([]);
  }, 60_000);

  it('is asked for nothing: no module imports next/image', () => {
    // A type-only import bundles nothing; a component that used the optimizer would import it.
    const users = ['src', 'tests']
      .flatMap((folder) => files(join(root, folder), /\.(?:tsx?|mjs)$/))
      .filter((path) =>
        /from\s+['"]next\/(?:legacy\/)?image['"]/.test(
          readFileSync(path, 'utf8').replace(/import\s+type\s[^;]+;/g, ''),
        ),
      )
      .map((path) => relative(root, path));
    expect(users).toEqual([]);
  });
});
