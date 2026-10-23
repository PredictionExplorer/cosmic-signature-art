import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'a1.cosmicsignature.com' }] },
  async headers() {
    return [
      {
        source: '/art/previews/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
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
