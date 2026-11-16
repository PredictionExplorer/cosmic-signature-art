import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { generateMetadata } from './page';

describe('the home’s title', () => {
  it('is the tagline the page itself prints, in every language', async () => {
    for (const locale of locales) {
      const result = await generateMetadata({ params: Promise.resolve({ locale }) });
      expect(result.title, locale).toBe(messages(locale).shapeOfMotion);
      expect(result.openGraph?.title, locale).toBe(messages(locale).shapeOfMotion);
      expect(result.description, locale).toBe(messages(locale).statementLine);
    }
    const japanese = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    // One phrase, with no Latin space set inside it.
    expect(japanese.title).toBe('運動のかたち。');
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({});
  });
});
