import type { Metadata } from 'next';
import { locales, localizedPath, type Locale } from './i18n/routing';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cosmicsignature.art';
export const NFT_ADDRESS = '0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25' as const;
export const GAME_ADDRESS = '0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2' as const;
export function metadata(
  locale: Locale,
  path: string,
  title: string,
  description: string,
  image?: { url: string; width?: number; height?: number; alt: string } | null,
): Metadata {
  const url = new URL(localizedPath(locale, path), SITE_URL).href;
  const preview =
    image === undefined
      ? { url: '/art/23-ink.webp', width: 3456, height: 2234, alt: 'Cosmic Signature 23' }
      : image;
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
      images: preview ? [preview] : [],
    },
    twitter: {
      card: preview ? 'summary_large_image' : 'summary',
      title,
      description,
      images: preview ? [preview] : [],
    },
  };
}
export function jsonLd(value: object) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
