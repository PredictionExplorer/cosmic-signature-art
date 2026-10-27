import { describe, expect, it } from 'vitest';
import { catalogs, messages } from './messages';
import { locales } from './routing';

describe('production translations', () => {
  for (const locale of locales) {
    it(`${locale} has every English key and no unexpected key`, () => {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
        expect(value, `${locale}.${key} must be NFC`).toBe(value.normalize('NFC'));
      }
    });
    if (locale !== 'en') {
      it(`${locale} resolves its own translated catalog without an English fallback`, () => {
        expect(messages(locale)).toBe(catalogs[locale]);
        expect(messages(locale)).not.toBe(catalogs.en);
        const translations = Object.entries(catalogs[locale]).filter(
          ([key, value]) => value !== catalogs.en[key as keyof typeof catalogs.en],
        );
        expect(translations.length).toBeGreaterThan(Object.keys(catalogs.en).length * 0.9);
      });
    }
  }

  it('preserves critical auction quantities in every language', () => {
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.ruleFirstCopy).toContain('0.00001');
      expect(catalog.ruleFirstCopy).toContain('48');
      expect(catalog.ruleRaise).toContain('10%');
      expect(catalog.ruleFunds).toContain('100%');
      expect(catalog.invalidAmount).toContain('18');
    }
  });

  it('keeps the Chinese regional catalogs distinct', () => {
    expect(catalogs['zh-TW'].privacyCopy).toContain('網路');
    expect(catalogs['zh-HK'].privacyCopy).toContain('網絡');
    expect(catalogs['zh-TW'].privacy).not.toBe(catalogs['zh-HK'].privacy);
  });

  it('keeps locale-specific reader conventions', () => {
    expect(Object.values(catalogs.ko).join(' ')).not.toContain('당신');
    expect(Object.values(catalogs.ja).join(' ')).not.toContain('あなた');
    expect(Object.values(catalogs.vi).join(' ')).not.toMatch(/quý khách|quý vị|\.\.\./u);
    // The Chinese catalogs address the reader as 你 throughout; 您 would change register mid-page.
    for (const locale of ['zh', 'zh-TW', 'zh-HK'] as const)
      expect(Object.values(catalogs[locale]).join(' ')).not.toContain('您');
  });
});
