import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';

const t = catalogs.en;

/**
 * Every engine re-derives the orbit from the seed with + − × ÷ and √ only, so each project
 * here (Chromium, Firefox, WebKit; desktop, phone, reduced motion) must reach the published
 * record bit for bit. A calm eternal dance, and an ejection whose profile rolled a Duet.
 */
for (const id of [31, 71]) {
  test(`№ ${String(id).padStart(3, '0')}'s orbit is re-derived here and is its published record`, async ({
    page,
  }) => {
    await page.goto(`/art/${id}`);
    const orbit = page.getByRole('region', { name: t.orbitTitle });
    await orbit.scrollIntoViewIfNeeded();
    await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
    await expect(orbit).toHaveAttribute('data-exact', 'true');
    await expect(orbit.getByRole('cell', { name: t.orbitExact, exact: true })).toHaveCount(10);
    await expect(orbit.getByRole('status')).toContainText(t.orbitAllExact);
    // While the section stands beneath the running head, the head is night, type and all.
    await orbit.evaluate((section) =>
      window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + 40),
    );
    await expect(page.locator('html')).toHaveAttribute('data-plate-material', 'night');
    // The entry returns the head to paper.
    await page
      .locator('#record')
      .evaluate((entry) => window.scrollTo(0, entry.getBoundingClientRect().top + window.scrollY));
    await expect(page.locator('html')).not.toHaveAttribute('data-plate-material', 'night');
  });
}

test('the orbit holds still for reduced motion and plays once otherwise', async ({
  page,
}, info) => {
  await page.goto('/art/31');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-phase', 'derived', { timeout: 30_000 });
  const again = orbit.getByRole('button', { name: t.again });
  if (info.project.name.includes('reduced-motion')) {
    // The whole orbit is drawn at once; there is nothing to replay.
    await expect(again).toHaveCount(0);
  } else {
    await expect(orbit.getByText(/into the Light film$/)).toBeVisible();
  }
});
