import { expect, test, type Page } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { readFileSync } from 'node:fs';
import { noHorizontalOverflow } from './helpers';

/** The record tests read the still; ambient motion is paused before the page loads. */
async function pauseMotion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
}

const t = catalogs.en;
const archive = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
) as { records: { id: number; transactionHash: string; seed: string }[] };
const identity = archive.records.find((entry) => entry.id === 31)!;

test('an artwork is typed as a catalogue entry from the publisher’s record, with its proofs and files', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/art/31?view=still#record');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const entry = main.locator('#record');
  // The one h1 is the entry's first line; the numeral grammar is "Signature 031".
  await expect(entry.getByRole('heading', { level: 1 })).toHaveText(/^Signature 031/);
  await expect(entry.getByText(/candidate orbits\. Number [\d,]+ was chosen\./)).toBeVisible();
  await expect(entry.getByText(/^Cycle 1 · /)).toBeVisible();
  await expect(entry).toContainText(t.spectralClass);
  await expect(entry).toContainText(t.syzygies);
  await expect(entry).toContainText(/\d+ nm/);
  // The glossary stands in the margin, Signature and expression defined first.
  const glossary = entry.getByRole('complementary', { name: t.glossary });
  await expect(glossary.getByRole('listitem').first()).toHaveText(new RegExp(t.glossarySignature));
  await expect(glossary.getByRole('listitem').nth(1)).toHaveText(new RegExp(t.glossaryExpression));
  await entry.getByRole('link', { name: 'Note 1', exact: true }).click();
  await expect(page).toHaveURL(/#note-1$/);
  // Verify on chain holds the full seed, the mint transaction and the two honesty notes.
  const verify = entry.locator('details', { hasText: t.verifyOnChain });
  await verify.locator('summary').click();
  await expect(verify.getByRole('link', { name: /Transaction/ })).toHaveAttribute(
    'href',
    `https://arbiscan.io/tx/${identity.transactionHash}`,
  );
  await expect(verify).toContainText(identity.seed);
  await expect(verify).toContainText(t.honestyRecord);
  // The custody timeline keeps its two honest streams.
  const custody = main.getByRole('region', { name: t.ownershipHistory });
  await expect(custody.getByRole('heading', { name: t.eventMint, exact: true })).toBeVisible();
  await expect(custody.getByRole('link', { name: /Transaction/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\/arbiscan\.io\/tx\/0x[\da-f]{64}$/i,
  );
  await expect(main.getByText(t.historyNote)).toBeVisible();
  await expect(custody.getByText(/^(Sold|Sale price|ETH)$/i)).toHaveCount(0);
  // Files by medium link the published originals, the spectral sweep among them.
  const sources = main.getByRole('region', { name: t.sources });
  const inkFiles = sources.locator('article', {
    has: page.getByRole('heading', { name: t.ink, exact: true }),
  });
  await expect(inkFiles.getByRole('link', { name: /^Film · 30 s/ })).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/ember\\.mp4$`),
  );
  await expect(sources.getByRole('link', { name: /^Spectral sweep · 10 s/ })).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/spectral_sweep\\.mp4$`),
  );
  await expect(
    sources.getByRole('link', { name: /^Still · WebP · 3,456 × 2,234 px/ }).first(),
  ).toBeVisible();
  await expect(sources.getByRole('link', { name: /Token metadata/ })).toHaveAttribute(
    'href',
    'https://a1.cosmicsignature.com/metadata/31',
  );
  for (const link of await sources.getByRole('link').all()) await expect(link).toContainText('↗');
  // Verify a download: the published hashes in full, and a chosen file hashed in the browser.
  const download = sources.locator('details', { hasText: t.verifyDownload });
  await download.locator('summary').click();
  await expect(download.getByText(`${t.ink} · ${t.film} · videos/web/ember.mp4`)).toBeVisible();
  await expect(download.locator('code').first()).toHaveText(/^[0-9a-f]{64}$/);
  await download
    .getByLabel(t.verifyChoose)
    .setInputFiles({ name: 'not-the-film.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') });
  await expect(download.getByRole('status')).toContainText(t.verifyNoMatch);
  await expect(download.getByRole('status')).toContainText(/sha256 [0-9a-f]{64}/);
  await noHorizontalOverflow(page);
});

test('the entry is set in every locale without running past its measure', async ({ page }) => {
  await pauseMotion(page);
  for (const locale of ['uk', 'vi'] as const) {
    await page.goto(`/${locale}/art/31?view=still#record`);
    const entry = page.getByRole('main').locator('#record');
    await expect(entry.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(`^${catalogs[locale].signature} 031`),
    );
    await expect(entry.getByText(catalogs[locale].glossarySignature)).toBeVisible();
    await noHorizontalOverflow(page);
  }
});

test('invalid history cursors show an honest recovery path without losing the still view', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/art/31?view=still&transfers=bad%2Fcursor#history');
  const history = page.locator('#history:visible').first();
  await expect(history.getByText(t.historyUnavailable)).toBeVisible();
  const reset = history.getByRole('link', { name: /Latest events/ });
  await expect(reset).toHaveAttribute('href', '/art/31?view=still#history');
  await reset.click();
  await expect(page).toHaveURL(/\/art\/31\?view=still#history$/);
  await expect(page.getByRole('region', { name: t.ownershipHistory })).toBeVisible();
  await expect(page).toHaveURL(/view=still/);
});
