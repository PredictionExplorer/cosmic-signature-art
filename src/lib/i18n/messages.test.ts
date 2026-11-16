import { describe, expect, it } from 'vitest';
import { catalogs, messages } from './messages';
import { locales, type Locale } from './routing';

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

  it('fills the same blanks in every language as in English', () => {
    // A translation that drops {steps} or {time} would print a sentence with its number gone.
    const blanks = (value: string) => [...value.matchAll(/\{[a-zA-Z]+\}/g)].map(([blank]) => blank);
    for (const locale of locales)
      for (const [key, value] of Object.entries(catalogs[locale]))
        expect(blanks(value).sort(), `${locale}.${key}`).toEqual(
          blanks(catalogs.en[key as keyof typeof catalogs.en]).sort(),
        );
  });

  it('names each answer to "whom to stay with" by a name that holds its visible label', () => {
    // WCAG 2.5.3: a visitor who speaks the word they see must be understood. The answers are
    // shown as "1", "2", "3" and the frame's own label, and named by what they do; a language
    // whose grammar would change the label inside the name words the name round it instead
    // (Ukrainian: «Кадр фільму: лишитися з ним»).
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.beyondStayFrame.toLowerCase(), locale).toContain(
        catalog.beyondFrame.toLowerCase(),
      );
      expect(catalog.beyondStayBody, locale).toContain('{body}');
      // Whom the running line says the picture is with comes before the line it wraps.
      expect(catalog.beyondKeptLine.indexOf('{body}'), locale).toBeLessThan(
        catalog.beyondKeptLine.indexOf('{line}'),
      );
    }
  });

  it('has one Vietnamese word for a body, «vật thể», wherever a body is named', () => {
    // «thiên thể» (a heavenly body) stood in six older strings, one of them a row of the
    // record's table beside «Khối lượng vật thể 1».
    for (const [key, value] of Object.entries(catalogs.vi))
      expect(String(value).toLowerCase(), key).not.toContain('thiên thể');
  });

  it('has one name for Ink in each language, wherever the expression or its material is named', () => {
    // Sumi is what the expression simulates, and each language has its word for it. The control
    // once said «Чорнило», インク and 잉크, the words for the ink of a pen, while the entry, the
    // Statement and the exhibitions said «Туш», 墨 and 먹 (the 14 November 2026 review, content-6).
    const name: Record<Locale, RegExp> = {
      en: /\bink\b/i,
      uk: /туш/i,
      ja: /墨/,
      ko: /먹/,
      zh: /墨/,
      'zh-TW': /墨/,
      'zh-HK': /墨/,
      vi: /mực/i,
    };
    const second: Partial<Record<Locale, RegExp>> = { uk: /чорнил/i, ja: /インク/, ko: /잉크/ };
    const named = Object.entries(catalogs.en).filter(([, value]) => name.en.test(value));
    expect(named.length).toBeGreaterThan(15);
    for (const locale of locales) {
      const catalog = catalogs[locale];
      // The word on the control is the name itself, and every sentence that names Ink in
      // English names it by that word.
      expect(catalog.ink, locale).toMatch(name[locale]);
      for (const [key] of named)
        expect(catalog[key as keyof typeof catalog], `${locale}.${key}`).toMatch(name[locale]);
      const other = second[locale];
      if (other)
        for (const [key, value] of Object.entries(catalog))
          expect(value, `${locale}.${key}`).not.toMatch(other);
    }
    expect([catalogs.uk.ink, catalogs.ja.ink, catalogs.ko.ink]).toEqual(['Туш', '墨', '먹']);
  });

  it('sets Light apart from what it says of Ink, on a work whose Ink is not indexed', () => {
    // The card shows the Light and says the Ink is not indexed yet. Japanese once joined the two
    // with a nakaguro (光・墨は…), which reads "Light and Ink are not yet indexed".
    for (const locale of locales) expect(catalogs[locale].lightOnly, locale).toContain(' · ');
    expect(catalogs.ja.lightOnly).not.toContain('・');
  });

  it('calls a plate «аркуш» in Ukrainian, wherever English says plate', () => {
    // The colophon, at the foot of every page, once began «Плати відтворено…»: payments, or
    // circuit boards.
    const said = (value: string) => /\bplates?\b/i.test(value.replace(/\{\w+\}/g, ''));
    const plates = Object.entries(catalogs.en).filter(([, value]) => said(value));
    expect(plates.map(([key]) => key)).toContain('colophonPlates');
    for (const [key] of plates)
      expect(catalogs.uk[key as keyof typeof catalogs.uk].toLowerCase(), key).toContain('аркуш');
    expect(catalogs.uk.colophonPlates).toMatch(/^Аркуші відтворено/);
  });

  it('names Sit in its key line by the word on the control', () => {
    // The control's hint and the key sheet read the one line (keySit); in seven languages it
    // once began with another word than the control beside it (Сісти beside Споглядати).
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.keySit.startsWith(catalog.sit), `${locale}: ${catalog.keySit}`).toBe(true);
    }
  });

  it('has one tagline, said one way', () => {
    // The home's title was once put together from two keys, which Japanese, Korean and
    // Vietnamese had translated apart from the line the page prints, and which set a Latin
    // space inside a Chinese or Japanese title.
    expect(catalogs.en).not.toHaveProperty('shape');
    expect(catalogs.en).not.toHaveProperty('ofMotion');
    expect(catalogs.en.shapeOfMotion).toBe('The shape of motion.');
    for (const locale of ['ja', 'zh', 'zh-TW', 'zh-HK'] as const)
      expect(catalogs[locale].shapeOfMotion, locale).not.toMatch(/\s/);
  });

  it('runs two sentences together as each language does: no space in Japanese or Chinese', () => {
    for (const locale of locales)
      expect(catalogs[locale].sentences, locale).toBe(
        ['ja', 'zh', 'zh-TW', 'zh-HK'].includes(locale) ? '{first}{second}' : '{first} {second}',
      );
  });

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
