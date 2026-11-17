import { createRequire } from 'node:module';
import type { NextConfig } from 'next';

/**
 * The headers are written in src/lib/security-headers.ts, which the proxy and the tests read
 * too. They are required from this file's own address, not imported. Next 16.4 runs this file
 * compiled and gives it no filename (next/dist/build/next-config-ts/require-hook.js), so Node
 * looks for a plain `import` of a neighbour from the working directory: `next start` pointed at
 * a build in another directory could not find the file, or found another checkout's copy. A
 * require made from this file's address finds the one beside it, wherever `next` was started.
 * Outside Next (the unit tests) the same line has Node read TypeScript itself, which it does
 * from 22.18.
 */
const { securityHeaders } = createRequire(import.meta.url)(
  './src/lib/security-headers.ts',
) as typeof import('./src/lib/security-headers.ts');

const nextConfig: NextConfig = {
  // A second server in the same checkout (the configured-sale e2e) builds into its own directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  // An address no route answers gets the venue's own 404 (src/app/global-not-found.tsx): the
  // proxy sends unknown works, exhibitions and orbit numbers there, so they are true 404s.
  experimental: { globalNotFound: true },
  // The optimizer is closed. The venue serves its own hash-named rungs and previews and asks Next
  // to resize nothing (no module imports next/image); left at its default, /_next/image fetched
  // and transcoded any file in public/, and with the media host allowed, any file on that host,
  // for anyone who asked. Two servers answer that address, so two settings close it:
  // - `unoptimized` closes Next's own: under `next start` the address is a 404. (It is also what
  //   the host's older builder reads, were a deployment ever built without the adapter.)
  // - On the host the address is the platform's, and /_vercel/image beside it, set up from this
  //   configuration by an adapter that reads the patterns and never `unoptimized`. With no local
  //   pattern named, Next names every path itself. The empty list names none, and no remote
  //   pattern is named. (To any list Next adds the build's own media folders, where the build
  //   keeps the venue's three icon files, the pages' mono face and the workers' sources: no
  //   picture of the art is there.)
  // To open it again, name what it may serve and no more: remotePatterns with the publisher's
  // pathname, localPatterns with /art/**.
  images: { unoptimized: true, localPatterns: [] },
  // The sharing cards read a CJK locale's sliced face by name at render time
  // (src/components/sharing-card.tsx), which no bundler can trace; the slices and their
  // range tables travel with the card routes.
  outputFileTracingIncludes: Object.fromEntries(
    ['/**/opengraph-image', '/**/twitter-image'].map((route) => [
      route,
      [
        'noto-serif-sc',
        'noto-serif-tc',
        'noto-serif-hk',
        'shippori-mincho-b1',
        'gowun-batang',
      ].flatMap((face) => [
        `./node_modules/@fontsource/${face}/400.css`,
        `./node_modules/@fontsource/${face}/files/*-400-normal.woff`,
      ]),
    ]),
  ),
  async headers() {
    return [
      {
        // Hash-named and identity-named artwork derivatives never change in place.
        // The artwork pages (/art/31) are routes, not files, and stay out of this rule.
        source: '/art/:file((?:previews/|clips/|stills/|arrival/|light/)?[^/]+\\.(?:webp|mp4))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Generated per build from the vendor's files; their names are not content-hashed.
        source: '/fonts/:face(cjk|literata)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' },
        ],
      },
      {
        // Every response: the Content-Security-Policy and its fellows (src/lib/security-headers.ts).
        source: '/:path*',
        headers: securityHeaders({
          rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
          development: process.env.NODE_ENV === 'development',
        }),
      },
    ];
  },
};
export default nextConfig;
