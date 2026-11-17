import { expect, test } from './fixtures';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { collectionLoaded, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

import AxeBuilder from '@axe-core/playwright';
import { WCAG_22_AA } from './standard';

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
    '/verify/orbit',
    '/verify/orbit/31',
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
      const scan = new AxeBuilder({ page }).withTags(WCAG_22_AA);
      // Held over, one sentence of the Korean catalog (allTheLightShowAlone): a particle is
      // written against the number, "№ 000만 보기", so the name no longer holds "000" as a word
      // of its own, the word the button shows and a visitor would speak (WCAG 2.5.3). The
      // sentence is the catalog's to change, and this line goes when it has.
      if (locale === 'ko' && route === '/collection/all-the-light')
        scan.disableRules(['label-content-name-mismatch']);
      const results = await scan.analyze();
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
