import { expect, test } from './fixtures';

/*
  First Light's proof (docs/first-light.md §8, F0) on № 031: the still is the first thing on the
  stage, the light performs over it where motion is welcome, any input gives the still back, and a
  visitor who prefers stillness is invited rather than shown.
*/

test.describe('First Light', () => {
  test('opens on the still, performs, and gives the still back at a key', async ({
    page,
  }, testInfo) => {
    await page.goto('/first-light/31');
    const stage = page.locator('main section[data-state]');
    const still = stage.getByRole('img', { name: '№ 031 · Light' });
    await expect(still).toBeVisible();
    await expect
      .poll(() => still.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBeGreaterThan(0);
    // The numero sign keeps its number with a no-break space, which a RegExp compares raw.
    await expect(page).toHaveTitle(/First Light · №\u00a0031/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    if (testInfo.project.name.includes('reduced-motion')) {
      await expect(stage).toHaveAttribute('data-state', 'invited');
      await expect(page.getByRole('button', { name: 'Watch it form' })).toBeVisible();
      return;
    }

    // A browser that cannot draw the light keeps the still, and that is a pass too.
    await expect(stage).toHaveAttribute('data-state', /^(playing|unavailable)$/, {
      timeout: 20_000,
    });
    test.skip(
      (await stage.getAttribute('data-state')) === 'unavailable',
      'This browser cannot draw the light here; the still stays on view.',
    );
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-state', 'ended');
    await expect(stage.locator('canvas')).toHaveCSS('opacity', '0');
    await expect(
      page.getByText('Computed from its seed, in this browser, just now.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Again' })).toBeVisible();
  });

  test('performs to the end on its own and lands on the still', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('reduced-motion'), 'Nothing plays unasked here.');
    await page.goto('/first-light/31');
    const stage = page.locator('main section[data-state]');
    await expect(stage).toHaveAttribute('data-state', /^(playing|unavailable)$/, {
      timeout: 20_000,
    });
    test.skip(
      (await stage.getAttribute('data-state')) === 'unavailable',
      'This browser cannot draw the light here; the still stays on view.',
    );
    const duration = Number(await stage.getAttribute('data-duration'));
    await expect(stage).toHaveAttribute('data-state', 'ended', { timeout: duration + 15_000 });
    await expect(stage.locator('canvas')).toHaveCSS('opacity', '0');
  });

  test('has nothing to perform for a work it does not hold', async ({ page }) => {
    await page.goto('/first-light/9999');
    await expect(page.locator('main section[data-state]')).toHaveCount(0);
  });
});
