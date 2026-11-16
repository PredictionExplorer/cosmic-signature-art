import type { Page, TestInfo } from './fixtures';

/**
 * The longest side of one picture, in image pixels. WebKit on Linux and Windows draws through
 * Cairo, which holds no image over 32,767 px on a side, and Playwright refuses there with
 * "Cannot take screenshot larger than 32767 pixels on any dimension" (on macOS it does not, so
 * only CI meets it). A little under, so a rounding never crosses it.
 */
export const LONGEST_SIDE = 32_000;

/**
 * A page of `height` CSS pixels as strips from top to bottom, each no taller than one picture
 * may be on a device that draws `density` image pixels to the CSS pixel: one strip where the
 * page fits, else as few as will do, of equal height.
 */
export function strips(height: number, density = 1): { y: number; height: number }[] {
  const tallest = Math.floor(LONGEST_SIDE / density);
  const count = Math.max(1, Math.ceil(height / tallest));
  const each = Math.ceil(height / count);
  return Array.from({ length: count }, (_strip, index) => ({
    y: index * each,
    height: Math.min(each, height - index * each),
  }));
}

/**
 * A page's whole length, kept with the test's results as evidence of what was shown. Where the
 * page is longer than one picture may be (the Process essay on a phone is about 33,000 px), it
 * is pictured in strips, top to bottom, named `name (1 of 2)` and so on: nothing of the page
 * is left out, and the page is not shortened for the camera.
 */
export async function wholePagePictures(
  page: Page,
  testInfo: TestInfo,
  name: string,
  { style }: { style?: string } = {},
) {
  const { width, height, density } = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
    density: window.devicePixelRatio,
  }));
  const parts = strips(height, density);
  for (const [index, part] of parts.entries()) {
    const whole = parts.length === 1;
    const path = testInfo.outputPath(whole ? `${name}.png` : `${name}-${index + 1}.png`);
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
      style,
      // With fullPage, a clip is in the page's own coordinates.
      ...(whole ? {} : { clip: { x: 0, y: part.y, width, height: part.height } }),
    });
    await testInfo.attach(whole ? name : `${name} (${index + 1} of ${parts.length})`, {
      path,
      contentType: 'image/png',
    });
  }
  return parts.length;
}
