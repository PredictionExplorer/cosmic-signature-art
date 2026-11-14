import { expect, test } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { fill } from '../../src/lib/i18n/format';

const t = catalogs.en;

/*
  One part in a trillion (docs/first-light.md §15): a twin of № 060's orbit, one body moved by a
  trillionth at the window's first step, carried past the frame beside the work until it parts.
  Every engine follows it with the same arithmetic, so every project must find the same parting:
  performed, or drawn at once for reduced motion.
*/

test('a twin moved by a trillionth is carried past the frame until it parts', async ({
  page,
}, info) => {
  test.slow();
  await page.goto('/art/60');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  // The window stands whole: performed to its end, brought there, or drawn at once.
  await orbit.getByRole('slider', { name: t.orbitTimeLabel }).focus();
  await page.keyboard.press('End');
  const twin = orbit.getByRole('button', { name: t.oneInATrillion });
  await expect(twin).toHaveAttribute('aria-pressed', 'false');
  await twin.click();
  await expect(twin).toHaveAttribute('aria-pressed', 'true');
  await expect(orbit.getByText(fill(t.oneInATrillionNote, { body: 1 }))).toBeVisible();
  // The orbit in the hand and the slider stand aside while the twin runs.
  await expect(orbit.getByRole('slider')).toHaveCount(0);
  if (!info.project.name.includes('reduced-motion'))
    await expect(orbit.getByText(/^Apart by .* · step [\d,]+ · /)).toBeVisible({ timeout: 30_000 });
  await expect(orbit).toHaveAttribute('data-twin', 'rested', { timeout: 90_000 });
  await expect(
    orbit.getByText(/^Parted at step 1,904,600\. The gap doubled about every [\d,]+ steps\.$/),
  ).toBeVisible();
  // After the frame is a word away, and the twin gives way to it.
  await orbit.getByRole('button', { name: t.afterTheFrame }).click();
  await expect(orbit).not.toHaveAttribute('data-twin');
  await expect(orbit).toHaveAttribute('data-beyond');
});
