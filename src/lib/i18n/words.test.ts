import { describe, expect, it } from 'vitest';
import { catalogs } from './messages';
import { locales } from './routing';
import { words } from './words';

describe('the words a component is handed', () => {
  it('are the strings its list names, in the catalog asked, and no others', () => {
    for (const locale of locales) {
      const t = catalogs[locale];
      expect(words(t, ['errorTitle', 'retry']), locale).toEqual({
        errorTitle: t.errorTitle,
        retry: t.retry,
      });
    }
  });

  it('name a string once, however many lists that make up one name it', () => {
    const handed = words(catalogs.ja, ['ink', 'light', 'ink']);
    expect(Object.keys(handed)).toEqual(['ink', 'light']);
    expect(handed.ink).toBe(catalogs.ja.ink);
  });

  it('are plain data, as a prop that crosses to the browser must be', () => {
    const handed = words(catalogs.uk, ['close']);
    expect(Object.getPrototypeOf(handed)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(handed))).toEqual(handed);
  });
});
