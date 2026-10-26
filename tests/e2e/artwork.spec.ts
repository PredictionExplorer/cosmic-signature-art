import { expect, test } from '@playwright/test';
import { catalogs } from '../../src/lib/i18n/messages';
import { artworkImageSource, noHorizontalOverflow, pauseAmbientMotion } from './helpers';

test('artwork comparison and enlarged viewer preserve identity and Escape returns focus', async ({
  page,
}) => {
  await page.goto('/art/31');
  await pauseAmbientMotion(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signature 31');
  const room = page.getByRole('region', { name: 'Ways of seeing', exact: true });
  await artworkImageSource(room.locator('.art-media img.art-still'), 31, 'ink', true);
  await room.getByRole('button', { name: 'See both expressions', exact: true }).click();
  await expect(room.locator('.viewer-plate')).toHaveClass(/paired/);
  await expect(room.locator('.viewer-plate > img')).toHaveAttribute('alt', 'Signature 31 · Light');
  await room.getByRole('button', { name: 'Single expression', exact: true }).click();
  await expect(room.locator('.viewer-plate')).not.toHaveClass(/paired/);
  const enlarge = page.getByRole('button', { name: 'Open full artwork viewer', exact: true });
  await enlarge.focus();
  await enlarge.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`Signature 31 · ${catalogs.en.viewingRoom}`);
  await artworkImageSource(dialog.locator('img'), 31, 'ink', true);
  await expect(dialog.locator('video')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(enlarge).toBeFocused();
  const completeFilm = room.getByRole('button', { name: 'The complete film', exact: true });
  await completeFilm.focus();
  await completeFilm.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute(
    'src',
    /(?:\/art\/31-ink-preview.mp4|\/videos\/web\/ember.mp4)$/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(completeFilm).toBeFocused();
  await room.getByRole('button', { name: /^Light$/ }).click();
  await expect(room.locator('.art-media')).toHaveAttribute('data-material', 'light');
  await artworkImageSource(room.locator('.art-media img.art-still'), 31, 'light', true);
  await noHorizontalOverflow(page);
});

test('Play from a still starts the intended film with one explicit action', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await pauseAmbientMotion(page);
  const room = page.getByRole('region', { name: 'Ways of seeing', exact: true });
  await expect(room.getByRole('button', { name: 'Still', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await room.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(room.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(room.locator('video')).toHaveAttribute('src', /\/art\/31-ink-preview\.mp4$/);
  await expect
    .poll(() => room.locator('video').evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(false);
});

test('language switching preserves the current artwork route', async ({ page }) => {
  await page.goto('/art/31?view=still');
  await page.locator('.language-menu button').click();
  await page.locator('.language-menu a[hreflang="ja"]').click();
  await expect(page).toHaveURL(/\/ja\/art\/31\?view=still$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${catalogs.ja.signature} 31`);
});
