import { readFileSync } from 'node:fs';
import { expect, failedToLoad, test } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';
import { workNumber } from '../../src/lib/art/number';
import { noHorizontalOverflow } from './helpers';

const t = catalogs.en;
const { records } = JSON.parse(
  readFileSync(new URL('../../src/lib/art/orbit-records.json', import.meta.url), 'utf8'),
) as { records: { id: number }[] };

/**
 * Verify an orbit (third-physics.md §5.12): any work, chosen by its number, derived again from
 * its seed in this browser and printed against its published record, line by line. Every engine
 * uses + − × ÷ and √ alone, so every project must reach the record bit for bit. № 031's fate
 * runs on to the record's horizon, eight million steps: a desk takes seconds, CI's two cores
 * thirty to sixty, so the derivations here are given minutes.
 */
const DERIVED_MS = 150_000;

test('the door lists every number with a record, and its field goes on to the work', async ({
  page,
}) => {
  await page.goto('/verify/orbit');
  await expect(page.getByRole('heading', { level: 1, name: t.verifyOrbit })).toBeVisible();
  // A page of night, the orbit section's ground, from the first paint.
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  const works = page.getByRole('region', { name: t.verifyOrbitWorks });
  await expect(works.getByRole('link')).toHaveCount(records.length);
  await expect(works.getByRole('link', { name: '№ 031' })).toHaveAttribute(
    'href',
    '/verify/orbit/31',
  );
  await noHorizontalOverflow(page);

  // The field answers once the page is hydrated: a number without a record says so in place.
  await expect(page.locator('html')).toHaveAttribute('data-keys', 'ready');
  const field = page.getByLabel(t.verifyOrbitNumber);
  await field.fill('99');
  await field.press('Enter');
  await expect(page.getByText('№ 099 has no published record.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('№ 054');
  await expect(field).toHaveValue('054');
  await page.getByRole('button', { name: t.verifyOrbitGo }).click();
  await expect(page).toHaveURL(/\/verify\/orbit\/54$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('№ 054');
});

test('№ 031 is derived here, line by line, and is its published record', async ({ page }) => {
  test.setTimeout(DERIVED_MS + 30_000);
  await page.goto('/verify/orbit/31');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('№ 031');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'night');
  const derivation = page.getByRole('region', { name: t.verifyOrbitLineByLine });
  // Begun only once hydrated, the seed first.
  await expect(derivation).toHaveAttribute('data-phase', /^(deriving|derived)$/);
  await expect(derivation.getByRole('listitem').first()).toContainText('Seed 0x4a0d…f5b5');

  await expect(derivation).toHaveAttribute('data-exact', 'true', { timeout: DERIVED_MS });
  await expect(derivation).toHaveAttribute('aria-busy', 'false');
  // Each phase on its line, settled at its count, then the run on to the fate.
  await expect(derivation.getByRole('listitem')).toHaveText([
    /Seed 0x4a0d…f5b5$/,
    /Reading the seed · candidate 77,741 of 77,741$/,
    /Candidate 77,741 in motion · warm-up step 1,000,000 of 1,000,000$/,
    /The recorded window · step 1,000,000 of 1,000,000$/,
    /Following the crossings · step 1,000,000 of 1,000,000$/,
    /Past the window, for the fate · up to step 8,000,000$/,
  ]);
  // Eleven measurements, the fate included and last, every one exact.
  const rows = derivation.locator('[data-key]');
  await expect(rows).toHaveCount(11);
  await expect(derivation.locator('[data-key][data-exact="true"]')).toHaveCount(11);
  await expect(derivation.getByText(t.orbitExact, { exact: true })).toHaveCount(11);
  await expect(rows.last()).toHaveAttribute('data-key', 'fate');
  await expect(rows.last()).toContainText('bound through 8,000,000 steps');
  await expect(derivation.locator('[data-key="totalEnergy"]')).toContainText('−2142.8907060284882');
  const status = derivation.getByRole('status');
  await expect(status).toContainText(/Checked here in [\d.]+ s\./);
  await expect(status).toContainText(t.orbitAllExact);
  await expect(derivation.getByRole('link', { name: 'Go to № 031' })).toHaveAttribute(
    'href',
    '/art/31',
  );
  await expect(derivation.getByRole('link', { name: t.verifyOrbitAnother })).toHaveAttribute(
    'href',
    '/verify/orbit',
  );
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

test('a phone holds the whole transcript within its width, in a long language too', async ({
  page,
}, info) => {
  test.skip(!info.project.name.endsWith('-mobile'), 'A phone’s width.');
  test.setTimeout(DERIVED_MS + 30_000);
  const vi = catalogs.vi;
  // № 054 ejects soonest after its window, so its fate is reached soonest.
  await page.goto('/vi/verify/orbit/54');
  const derivation = page.getByRole('region', { name: vi.verifyOrbitLineByLine });
  await expect(derivation).toHaveAttribute('data-exact', 'true', { timeout: DERIVED_MS });
  await expect(derivation.locator('[data-key="fate"]')).toContainText(
    'vật thể 2 thoát ra ở bước 1.090.000',
  );
  await noHorizontalOverflow(page);
  const width = page.viewportSize()!.width;
  for (const box of await derivation
    .locator('[data-key], li')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right)))
    expect(box).toBeLessThanOrEqual(width);
});

test('a number without a record is not here', async ({ page, faults }) => {
  // Refused before the page renders (src/lib/addresses.ts): a true 404, with the venue's own
  // not-found in the visitor's language, marked noindex.
  const notHere = async (path: string, words: string, locale: 'en' | 'ja' = 'en') => {
    faults.allow(failedToLoad(path));
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1, name: words })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(
      page.getByRole('heading', { name: catalogs[locale].verifyOrbitLineByLine }),
    ).toHaveCount(0);
  };
  // A number the collection does not hold has not been imprinted; a work it holds, misspelt, or a
  // name that is no number, is not here.
  await notHere('/verify/orbit/999', fill(t.notImprinted, { work: workNumber(999) }));
  // Only the one spelling of a number that has a record, in any language.
  await notHere('/verify/orbit/031', t.notFound);
  await notHere('/verify/orbit/abc', t.notFound);
  await notHere(
    '/ja/verify/orbit/72',
    fill(catalogs.ja.notImprinted, { work: workNumber(72) }),
    'ja',
  );
  const known = await page.goto('/ja/verify/orbit/71');
  expect(known?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: catalogs.ja.verifyOrbitLineByLine }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
