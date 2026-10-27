import type { Metadata } from 'next';
import { locales, localizedPath, type Locale } from './i18n/routing';
/** The canonical origin: cosmic.art, or NEXT_PUBLIC_SITE_URL while that domain is pending. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cosmic.art';
/**
 * The origin social crawlers can actually fetch preview images from, so a share card keeps
 * its image while cosmic.art's DNS is pending. NEXT_PUBLIC_DEPLOYMENT_URL wins when set (use
 * it to point cards at cosmic.art once that domain resolves). On Vercel, a *.vercel.app host
 * always resolves, so a custom production domain is never assumed to: the branch or
 * deployment host stands in for it.
 */
export function deploymentUrl(env: Record<string, string | undefined>): string {
  const origin = (host: string) => `https://${host.replace(/^https?:\/\//, '')}`;
  if (env.NEXT_PUBLIC_DEPLOYMENT_URL) return origin(env.NEXT_PUBLIC_DEPLOYMENT_URL);
  const production = env.VERCEL_PROJECT_PRODUCTION_URL;
  const resolvable = (host?: string) =>
    host && /\.vercel\.app$/i.test(host.replace(/^https?:\/\//, ''));
  if (env.VERCEL_ENV === 'production') {
    const host = resolvable(production) ? production : env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    if (host) return origin(host);
  } else if (env.VERCEL_URL || production) {
    return origin((env.VERCEL_URL || production) as string);
  }
  return env.NEXT_PUBLIC_SITE_URL || 'https://cosmic.art';
}
export const DEPLOYMENT_URL = deploymentUrl(process.env);
export const NFT_ADDRESS = '0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25' as const;
export const GAME_ADDRESS = '0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2' as const;
/**
 * A page's metadata. `image` undefined is the venue's still of 023; an object is that page's
 * own; null names no image here at all, so the sharing card drawn beside the route (an
 * opengraph-image.tsx) stands: Next adds a file-based card only where the page set none.
 */
export function metadata(
  locale: Locale,
  path: string,
  title: string,
  description: string,
  image?: { url: string; width?: number; height?: number; alt: string } | null,
): Metadata {
  const url = new URL(localizedPath(locale, path), SITE_URL).href;
  const chosen =
    image === undefined
      ? { url: '/art/23-ink.webp', width: 3456, height: 2234, alt: 'Cosmic Signature 23' }
      : image;
  // A relative image resolves against the serving deployment, never a domain that may not resolve.
  const preview = chosen ? { ...chosen, url: new URL(chosen.url, DEPLOYMENT_URL).href } : null;
  const images = preview ? { images: [preview] } : {};
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        locales.map((lang) => [lang, new URL(localizedPath(lang, path), SITE_URL).href]),
      ),
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Cosmic Signature',
      ...images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...images,
    },
  };
}
export function jsonLd(value: object) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
