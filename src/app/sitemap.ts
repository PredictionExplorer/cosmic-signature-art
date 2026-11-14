import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { locales, localizedPath } from '@/lib/i18n/routing';
import { collectionIndex } from '@/lib/art/collection-index';
import { orbitIds } from '@/lib/art/orbit-records';
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
      // Every work in the collection index, not only the few the venue holds its own copies of:
      // the works are what the venue most wants found.
      ...collectionIndex.works.map((work) => `/art/${work.id}`),
      // Verify an orbit is a tool, not a derived image: its door and every work's page are public.
      '/verify/orbit',
      ...orbitIds().map((id) => `/verify/orbit/${id}`),
    ].map((path) => ({
      url: `${SITE_URL}${localizedPath(locale, path)}`,
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.7,
    })),
  );
}
