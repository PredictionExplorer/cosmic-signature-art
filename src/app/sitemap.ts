import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { locales, localizedPath } from '@/lib/i18n/routing';
import { curatedArtworks } from '@/lib/art/catalog';
import { exhibitions } from '@/lib/exhibitions/exhibitions';
export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) =>
    [
      '/',
      '/collection',
      // The Orrery performs the physics; All the light is a derived image, and a derived image
      // is never offered for discovery as if it were a work (docs/third-physics.md §9).
      '/collection/orrery',
      '/exhibitions',
      '/process',
      '/statement',
      '/privacy',
      ...exhibitions().map((item) => `/exhibitions/${item.slug}`),
      ...curatedArtworks.map((work) => `/art/${work.id}`),
    ].map((path) => ({
      url: `${SITE_URL}${localizedPath(locale, path)}`,
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.7,
    })),
  );
}
