import { expect, test } from '@playwright/test';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { collectionLoaded, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

import AxeBuilder from '@axe-core/playwright';

for (const locale of locales) {
  for (const route of [
    '/',
    '/collection',
    '/collection/all-the-light',
    '/collection/orrery',
    '/art/31',
    '/process',
    '/auctions',
    '/statement',
    '/exhibitions',
    '/exhibitions/a-hang',
    '/exhibitions/the-long-curve',
  ]) {
    const title =
      locale === 'en'
        ? `accessibility and visual evidence: ${route}`
        : `accessibility: ${locale} ${route}`;
    test(title, async ({ page }, testInfo) => {
      await page.goto(localizedPath(locale, route), { waitUntil: 'domcontentloaded' });
      await pauseAmbientMotion(page);
      await expect(page.getByRole('main')).toBeVisible();
      if (route === '/collection') await collectionLoaded(page, locale === 'en');
      await noHorizontalOverflow(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      if (locale === 'en') {
        const name = route === '/' ? 'home' : route.replaceAll('/', '-').slice(1);
        const screenshot = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
      }
    });
  }
}
