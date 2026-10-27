import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { artworkImageSource, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

const current = '[data-artwork-stage="page"]:visible [data-layer-state="current"]';

test('the plate, the room and the keys preserve identity; Escape returns focus', async ({
  page,
  isMobile,
}) => {
  await page.goto('/art/31');
  await pauseAmbientMotion(page);
  await expect(page).toHaveTitle(/№ 031/);
  const plate = page.locator(current);
  await artworkImageSource(plate.locator('img.art-still'), 31, 'ink', true);
  // The strip: the folio, the label from the published traits, and the words.
  await expect(plate.locator('.hanging-numeral')).toHaveText('031');
  // The work is never cropped: the media box fits the plate by height on a desk, and on a phone
  // the plate itself is 100 vw by the work's own proportion, the first pixel under the masthead.
  const plateBox = (await plate.locator('.plate').boundingBox())!;
  const mediaBox = (await plate.locator('.art-media').boundingBox())!;
  expect(mediaBox.height).toBeLessThanOrEqual(plateBox.height + 1);
  expect(mediaBox.width).toBeLessThanOrEqual(plateBox.width + 1);
  expect(Math.abs(mediaBox.width / mediaBox.height - 3456 / 2234)).toBeLessThan(0.02);
  if (isMobile) {
    const viewport = page.viewportSize()!;
    expect(Math.abs(plateBox.width - viewport.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(plateBox.height - (viewport.width * 2234) / 3456)).toBeLessThanOrEqual(2);
  }
  // The label line yields to the words on a phone; the numeral and the words remain.
  if (!isMobile)
    await expect(plate.getByText('Orbit Ribbons · Harmonic Weave · Ink')).toBeVisible();
  const study = plate.getByRole('button', { name: 'Study', exact: true });
  await study.focus();
  await study.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`№ 031 · ${catalogs.en.viewingRoom}`);
  await artworkImageSource(dialog.locator('img'), 31, 'ink', true);
  await expect(dialog.locator('video')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(study).toBeFocused();
  // F opens the film in the room; Z the still.
  await page.keyboard.press('f');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview.mp4|\/videos\/web\/ember.mp4)$/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await plate.getByRole('button', { name: /^Light$/ }).click();
  await expect(page.locator(current).locator('.art-media')).toHaveAttribute(
    'data-material',
    'light',
  );
  await artworkImageSource(page.locator(current).locator('img.art-still'), 31, 'light', true);
  await noHorizontalOverflow(page);
});

test('Film from a still starts the intended film with one explicit word', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const plate = page.locator(current);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'still');
  await plate.getByRole('button', { name: 'Film', exact: true }).click();
  await expect(plate.locator('video')).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => plate.locator('video').evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(false);
  await expect(plate.getByRole('button', { name: 'Still', exact: true })).toBeVisible();
  // The one time line runs at the viewport's bottom edge while the film plays.
  await expect(page.locator('.time-line')).toBeVisible();
  await plate.getByRole('button', { name: 'Still', exact: true }).click();
  await expect(plate.getByRole('button', { name: 'Film', exact: true })).toBeVisible();
});

test('the neighbours carry the visitor on by number and by wavelength', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const next = page.locator('[data-neighbour="next"]');
  await expect(next).toHaveAttribute('href', '/art/32');
  await expect(page.locator('[data-neighbour="previous"]')).toHaveAttribute('href', '/art/30');
  const star = page.locator('[data-neighbour="spectral"]');
  await expect(star).toHaveText(/Next by wavelength · № \d{3} · \d+ nm (?:redder|bluer)/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/art\/32$/);
  await expect(page).toHaveTitle(/№ 032/);
});

test('language switching preserves the current artwork route', async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    'On phones the languages live in the Index sheet, built in the collection workstream.',
  );
  await page.goto('/art/31?view=still');
  await page.locator('.language-menu button').click();
  await page.locator('.language-menu a[hreflang="ja"]').click();
  await expect(page).toHaveURL(/\/ja\/art\/31\?view=still$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveTitle(/№ 031/);
  await expect(page.locator(current).locator('img.art-still')).toHaveAttribute(
    'alt',
    `№ 031 · ${catalogs.ja.ink}`,
  );
});

test('a work without a local film wakes into its settling clip, keeps the film’s own clock, and fades into its still', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced-motion'),
    'No ambient film under reduced motion; the settling plate is proved in the unit suite.',
  );
  await page.goto('/art/40');
  const toggle = page.locator('button.motion-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', /true|false/);
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  const plate = page.locator(current);
  const film = plate.locator('video');
  // The plate's film is the settling clip: the film's final eight seconds, which end on the still.
  await expect(film).toHaveAttribute('src', /\/art\/clips\/40-ink-settling-[a-f0-9]{16}\.mp4$/, {
    timeout: 15_000,
  });
  await expect
    .poll(
      () =>
        film.evaluate((element) => {
          const video = element as HTMLVideoElement;
          return !video.paused && video.currentTime > 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'film');
  // The clock is the film's own: the clip runs from 00:22 to 00:30.
  await expect(plate.locator('.strip')).toContainText(/00:2[2-9] \/ 00:30/);
  await expect(plate.locator('[data-film-state]')).toHaveAttribute('data-film-state', 'still', {
    timeout: 15_000,
  });
  // The last frame is the still: held, then faded into the still beneath, so nothing jumps.
  await expect(film).toHaveClass(/has-ended/);
  await expect(film).not.toHaveClass(/has-frame/, { timeout: 5000 });
  // Film is the complete film, which opens in the room.
  const word = plate.getByRole('button', { name: 'Film', exact: true });
  await expect(word).toHaveAttribute('title', catalogs.en.filmInRoom);
  await word.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute('src', /\/videos\/web\/ember\.mp4$/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
