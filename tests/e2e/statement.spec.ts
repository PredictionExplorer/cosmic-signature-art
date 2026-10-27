import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { locales, localizedPath } from '../../src/lib/i18n/routing';
import { noHorizontalOverflow } from './helpers';

for (const locale of locales) {
  test(`${locale} statement is six indexed paragraphs on paper, counted from the index`, async ({
    page,
  }) => {
    const t = catalogs[locale];
    await page.goto(localizedPath(locale, '/statement'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('data-room', 'paper');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cosmic Signature');
    await expect(page.getByText(t.oneMotion, { exact: true })).toBeVisible();
    await expect(page.getByText(t.shapeOfMotion, { exact: true })).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6] as const) {
      await expect(page.getByRole('region', { name: `§ ${n}` })).toHaveText(
        new RegExp(t[`statement${n}`].slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
    await expect(page.getByText(t.statementSigned, { exact: true })).toBeVisible();
    await expect(page.getByText(t.livingCollection, { exact: false })).toContainText(/\d/);
    await expect(
      page.getByRole('main').getByRole('link', { name: `${t.collection} →` }),
    ).toHaveAttribute('href', localizedPath(locale, '/collection'));
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
  });
}

test('the quiet pages belong to the venue: the 404 hangs the work next door on black', async ({
  page,
}) => {
  await page.goto('/art/not-a-work');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(catalogs.en.notFound);
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  const plate = page.getByRole('main').locator('.art-media');
  await expect(plate).toHaveAttribute('data-material', 'light');
  await expect(plate.locator('img.art-still')).toHaveAttribute('alt', '№ 031 · Light');
  await page.getByRole('main').getByRole('link', { name: '№ 031 is next door.' }).click();
  await expect(page).toHaveURL(/\/art\/31$/);
  await noHorizontalOverflow(page);
});
