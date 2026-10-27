import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function imageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const img = element as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

export const archivedMedia = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-media.json', import.meta.url), 'utf8'),
) as { id: number; media: { id: string; sourceUrl: string }[] }[];

export async function artworkImageSource(
  image: Locator,
  tokenId: number,
  expression: 'ink' | 'light',
  allowPublished = false,
) {
  const allowed = [new URL(`/art/${tokenId}-${expression}.webp`, image.page().url()).href];
  if (allowPublished) {
    const source = archivedMedia
      .find((work) => work.id === tokenId)
      ?.media.find((media) => media.id === expression)?.sourceUrl;
    if (!source) throw new Error(`Missing authentic source for ${tokenId} / ${expression}`);
    allowed.push(source);
  }
  await expect
    .poll(
      async () => {
        const source = await image.getAttribute('src');
        if (!source) return false;
        const url = new URL(source, image.page().url());
        // Vercel's deployment-routing query changes delivery, not artwork identity.
        // Preserve the exact expected origin/path and reject every other query or fragment.
        url.searchParams.delete('dpl');
        return allowed.includes(url.href);
      },
      {
        message: `Expected authentic ${expression} image for token ${tokenId}: ${allowed.join(' or ')}`,
      },
    )
    .toBe(true);
}

export async function collectionLoaded(page: Page, loadAllImages = false) {
  const section = page.getByRole('main').locator('#works');
  await expect(section.locator('.collection-skeleton:visible')).toHaveCount(0, { timeout: 30_000 });
  const cards = section.locator('.work-grid:not(.collection-skeleton) .work-card');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await cards.first().scrollIntoViewIfNeeded();
  await imageLoaded(cards.first().locator('img'));
  if (loadAllImages) {
    const count = await cards.count();
    for (let index = 0; index < count; index += 3) {
      await cards.nth(index).scrollIntoViewIfNeeded();
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.locator('img')).toHaveCount(count);
    await expect
      .poll(async () =>
        cards
          .locator('img')
          .evaluateAll((elements) =>
            elements.every(
              (element) =>
                (element as HTMLImageElement).complete &&
                (element as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

export async function pauseAmbientMotion(page: Page) {
  const control = page.locator('button.motion-toggle');
  // Server HTML begins paused. Wait for the actual browser preference before clicking.
  const initiallyPaused = await page.evaluate(() => {
    const saved = sessionStorage.getItem('cosmic-art-motion-v1');
    return saved ? saved === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  await expect(control).toHaveAttribute('aria-pressed', String(initiallyPaused));
  if (!initiallyPaused) await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
}
