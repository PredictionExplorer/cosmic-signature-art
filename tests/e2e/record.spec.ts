import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { readFileSync } from 'node:fs';
import { noHorizontalOverflow, pauseAmbientMotion } from './helpers';

test('an artwork exposes genuine custody history, composition, and original published files', async ({
  page,
}) => {
  await page.goto('/art/31?view=still#record');
  await pauseAmbientMotion(page);
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const record = main.locator('#record');
  await expect(record.getByRole('heading', { name: catalogs.en.provenanceTitle })).toBeVisible();
  const archive = JSON.parse(
    readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
  ) as { records: { id: number; transactionHash: string; seed: string }[] };
  const identity = archive.records.find((entry) => entry.id === 31)!;
  await expect(record.getByRole('link', { name: /Transaction/ })).toHaveAttribute(
    'href',
    `https://arbiscan.io/tx/${identity.transactionHash}`,
  );
  await expect(record).toContainText(identity.seed);
  const custody = main.getByRole('region', { name: catalogs.en.ownershipHistory });
  await expect(
    custody.getByRole('heading', { name: catalogs.en.eventMint, exact: true }),
  ).toBeVisible();
  await expect(custody.getByRole('link', { name: /Transaction/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\/arbiscan\.io\/tx\/0x[\da-f]{64}$/i,
  );
  await expect(main.getByText(catalogs.en.historyNote)).toBeVisible();
  await expect(custody.getByText(/^(Sold|Sale price|ETH)$/i)).toHaveCount(0);
  const composition = main.getByRole('region', { name: catalogs.en.composition });
  await expect(composition).toBeVisible();
  await expect(composition).toContainText(catalogs.en.structure);
  await expect(composition).toContainText(catalogs.en.syzygies);
  const sources = main.getByRole('region', { name: catalogs.en.sources });
  await expect(sources.getByRole('link', { name: /Published film/ }).first()).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/`),
  );
  await sources.locator('summary').click();
  await expect(sources.getByRole('link', { name: /Token metadata/ })).toHaveAttribute(
    'href',
    'https://a1.cosmicsignature.com/metadata/31',
  );
  await noHorizontalOverflow(page);
});

test('invalid history cursors show an honest recovery path without losing the still view', async ({
  page,
}) => {
  await page.goto('/art/31?view=still&transfers=bad%2Fcursor#history');
  await pauseAmbientMotion(page);
  const history = page.locator('#history');
  await expect(history.getByText(catalogs.en.historyUnavailable)).toBeVisible();
  const reset = history.getByRole('link', { name: /Latest events/ });
  await expect(reset).toHaveAttribute('href', '/art/31?view=still#history');
  await reset.click();
  await expect(page).toHaveURL(/\/art\/31\?view=still#history$/);
  await expect(page.getByRole('region', { name: catalogs.en.ownershipHistory })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: catalogs.en.ways })
      .getByRole('button', { name: catalogs.en.still, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
