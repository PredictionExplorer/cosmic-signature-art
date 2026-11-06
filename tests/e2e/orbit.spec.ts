import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { AFTER_THE_FRAME_EVENT } from '../../src/lib/venue-events';

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
    // The fate is checked last: the worker runs on past the window, to the horizon for a dance.
    await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
    await expect(orbit.getByRole('cell', { name: t.orbitExact, exact: true })).toHaveCount(11);
    await expect(orbit.getByRole('status')).toContainText(t.orbitAllExact);
    // While the section stands beneath the running head, the head is night, type and all; the
    // entry returns it to paper. Each poll scrolls again, so a late change of layout above the
    // target cannot leave the page short of it.
    const headAt = async (selector: string, offset: number) => {
      await page.evaluate(
        ([target, by]) => {
          const element = document.querySelector(target as string)!;
          const top = element.getBoundingClientRect().top + window.scrollY + (by as number);
          window.scrollTo({ top, behavior: 'instant' });
        },
        [selector, offset],
      );
      return page.locator('html').getAttribute('data-plate-material');
    };
    await expect.poll(() => headAt('[aria-labelledby="orbit-title"]', 40)).toBe('night');
    await expect.poll(() => headAt('#record', 0)).not.toBe('night');
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

/**
 * After the frame (third-physics.md §5.6): past the recorded window the same physics runs on,
 * labelled as physics, not the work. № 054 ejects soonest, 90,000 steps after its window, so
 * every project sees the escape at the published step: performed at the film's pace, or drawn
 * at once for reduced motion.
 */
test('After the frame performs № 054’s escape at its published step, then returns', async ({
  page,
}) => {
  await page.goto('/art/54');
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute('data-exact', 'true', { timeout: 60_000 });
  await expect(orbit).toHaveAttribute('data-fate', 'ejection');
  await expect(
    orbit.getByRole('row', { name: /^Fate body 2 escapes at step 1,090,000/ }),
  ).toBeVisible();
  // The plate's word asks by this event, wherever the visitor stands.
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), AFTER_THE_FRAME_EVENT);
  const word = orbit.getByRole('button', { name: t.afterTheFrame });
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(orbit.getByText(t.afterTheFrameNote)).toBeVisible();
  await expect(orbit).toHaveAttribute('data-beyond', 'rested', { timeout: 60_000 });
  await expect(orbit.getByText('Body 2 has escaped, at step 1,090,000')).toBeVisible();
  // The word again returns to the recorded window.
  await word.click();
  await expect(orbit).not.toHaveAttribute('data-beyond');
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await expect(orbit.getByText(t.orbitLine)).toBeVisible();
});

test('a resolved film offers After the frame, which goes down to the orbit and on past it', async ({
  page,
}, info) => {
  // A desk's plate resolves its film into the still; a phone's rests on an excerpt, which
  // offers the film instead, and reduced motion plays no film at all.
  test.skip(!info.project.name.endsWith('-desktop'), 'Only a desk’s film resolves on the plate.');
  test.slow();
  await page.goto('/art/54');
  const word = page.locator('[data-layer-state="current"]').getByRole('link', {
    name: t.afterTheFrame,
  });
  await expect(word).toBeVisible({ timeout: 90_000 });
  await expect(word).toHaveAttribute('href', '#orbit');
  await word.click();
  const orbit = page.getByRole('region', { name: t.orbitTitle });
  await expect(orbit).toHaveAttribute('data-beyond', /^(running|rested)$/, { timeout: 60_000 });
  await expect(orbit).toBeInViewport();
  // The word moves the visitor, not the address.
  expect(new URL(page.url()).hash).toBe('');
});
