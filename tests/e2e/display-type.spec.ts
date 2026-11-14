import { expect, test } from './fixtures';
import { locales, localizedPath } from '../../src/lib/i18n/routing';

/**
 * The cover headlines are the venue's largest type. Each line's ink, measured from the font the
 * page actually loaded, must clear the next line's: no descender may meet an ascender below it,
 * in any language, at any width the line breaks fall.
 */
const covers = ['/process', '/auctions'];

for (const locale of locales) {
  test(`${locale} cover headlines keep every line's ink clear of the next`, async ({ page }) => {
    for (const route of covers) {
      await page.goto(localizedPath(locale, route), { waitUntil: 'domcontentloaded' });
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const lines = await heading.evaluate((element) => {
        const style = getComputedStyle(element);
        // Group the heading's characters into its lines by where the browser set them.
        const rows = new Map<number, string>();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? '';
          for (let index = 0; index < text.length; index++) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            const box = range.getClientRects()[0];
            if (!box) continue;
            const top = Math.round(box.top);
            rows.set(top, (rows.get(top) ?? '') + text[index]);
          }
        }
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return {
          lineHeight: parseFloat(style.lineHeight),
          ink: [...rows.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, text]) => {
              const metrics = context.measureText(text.trim());
              return {
                text: text.trim(),
                ascent: metrics.actualBoundingBoxAscent,
                descent: metrics.actualBoundingBoxDescent,
              };
            }),
        };
      });
      // Baselines stand one line-height apart, so the ink between two lines is what is left of
      // it after the upper line's deepest descender and the lower line's tallest ascender.
      for (let index = 1; index < lines.ink.length; index++) {
        const upper = lines.ink[index - 1]!;
        const lower = lines.ink[index]!;
        expect(
          lines.lineHeight - upper.descent - lower.ascent,
          `${route}: “${upper.text}” over “${lower.text}”`,
        ).toBeGreaterThan(0);
      }
    }
  });
}
