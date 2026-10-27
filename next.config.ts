import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'a1.cosmicsignature.com' }] },
  async headers() {
    return [
      {
        // Hash-named and identity-named artwork derivatives never change in place.
        // The artwork pages (/art/31) are routes, not files, and stay out of this rule.
        source: '/art/:file((?:previews/)?[^/]+\\.(?:webp|mp4))',
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
