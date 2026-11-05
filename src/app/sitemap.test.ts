import { describe, expect, it } from 'vitest';
import { locales, localizedPath } from '@/lib/i18n/routing';
import { orbitIds } from '@/lib/art/orbit-records';
import sitemap from './sitemap';
import { metadata as auctionMetadata } from './[locale]/auctions/layout';
import { generateMetadata as termsMetadata } from './[locale]/terms/page';

describe('direct-link auction pages', () => {
  it('keeps the sale and its terms out of discovery in every locale', () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);
    for (const locale of locales) {
      expect(paths).not.toContain(localizedPath(locale, '/auctions'));
      expect(paths).not.toContain(localizedPath(locale, '/terms'));
      expect(paths).toContain(localizedPath(locale, '/collection'));
      expect(paths).toContain(localizedPath(locale, '/exhibitions'));
    }
    expect(paths.some((path) => path.includes('/auctions/'))).toBe(false);
  });

  it('lists the Orrery in every locale, and never the derived image of All the light', () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);
    for (const locale of locales) {
      expect(paths).toContain(localizedPath(locale, '/collection/orrery'));
      expect(paths).not.toContain(localizedPath(locale, '/collection/all-the-light'));
    }
  });

  it('lists Verify an orbit and the page of every work it can derive, in every locale', () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);
    for (const locale of locales) {
      expect(paths).toContain(localizedPath(locale, '/verify/orbit'));
      for (const id of orbitIds())
        expect(paths).toContain(localizedPath(locale, `/verify/orbit/${id}`));
    }
    expect(paths.filter((path) => path.endsWith('/verify/orbit/31'))).toHaveLength(locales.length);
  });

  it('asks crawlers not to index the auction route family or its terms', async () => {
    expect(auctionMetadata.robots).toEqual({ index: false, follow: false });
    for (const locale of locales) {
      const terms = await termsMetadata({ params: Promise.resolve({ locale }) });
      expect(terms).toHaveProperty('robots', { index: false, follow: false });
    }
  });
});
