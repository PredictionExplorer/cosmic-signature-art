import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // A second server in the same checkout (the configured-sale e2e) builds into its own directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'a1.cosmicsignature.com' }] },
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
        source: '/art/:file((?:previews/|clips/|stills/)?[^/]+\\.(?:webp|mp4))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Generated per build from the vendor's slices; their names are not content-hashed.
        source: '/fonts/cjk/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
