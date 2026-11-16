import { describe, expect, it } from 'vitest';
import { fill } from '@/lib/i18n/format';
import { messages } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/lib/i18n/routing';
import { collectionIndex, indexedWork } from './collection-index';
import { fateLine } from './fate-line';
import { workEnergy } from './orbit-energy';
import { orbitIds, workOrbit } from './orbit-records';
import { workDescription, workLine } from './work-description';
import { NEVER_OF_AN_ORBIT } from '../../../tests/word-rules';

const described = (id: number, locale: Locale = 'en') =>
  workDescription(id, messages(locale), locale);
const works = collectionIndex.works.map((work) => work.id);
/** Every work in every language: 72 × 8 descriptions. */
const everywhere = locales.flatMap((locale) =>
  works.map((id) => ({ locale, id, text: described(id, locale), label: `${locale} № ${id}` })),
);

/** A language written in another script than English: its descriptions hold no Latin letter. */
const OWN_SCRIPT: Partial<Record<Locale, RegExp>> = {
  uk: /\p{Script=Cyrillic}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /\p{Script=Hangul}/u,
  zh: /\p{Script=Han}/u,
  'zh-TW': /\p{Script=Han}/u,
  'zh-HK': /\p{Script=Han}/u,
};

/** The words of a sentence, four letters or longer, in lower case. */
const longWords = (text: string) => new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? []);

describe('what a search result and a shared link say of a work', () => {
  it('is the line under the work’s still, its sentences run together', () => {
    expect(described(31)).toBe(
      'Three bodies, together for all 1,000,000 steps this work records. They are still bound to one another at step 8,000,000, where the record stops looking.',
    );
    expect(described(25)).toBe(
      'Three bodies, together for all 1,000,000 steps this work records. 6.3 seconds after its film ends, one of them is no longer bound to the other two.',
    );
    // № 004's computation lost its energy before its dated ejection: the first sentence alone.
    expect(described(4)).toBe('Three bodies, together for all 1,000,000 steps this work records.');
    for (const locale of locales) {
      const t = messages(locale);
      for (const id of works) {
        const line = fateLine(workOrbit(id)!, workEnergy(id), t, locale)!;
        expect(workLine(id, t, locale), `${locale} № ${id}`).toEqual(line);
        expect(described(id, locale), `${locale} № ${id}`).toBe(
          line.length === 1 ? line[0] : fill(t.sentences, { first: line[0], second: line[1] }),
        );
      }
    }
  });

  it('runs two sentences together as each language does', () => {
    expect(described(31, 'ja')).toBe(
      '三つの天体は、この作品が記録する 1,000,000 ステップのあいだ、ずっと共にあります。記録が見届けた最後の第 8,000,000 ステップでも、三つはまだ互いに束縛されています。',
    );
    expect(described(25, 'uk')).toBe(
      'Три тіла, разом упродовж усіх 1 000 000 кроків, які записує цей твір. Через 6,3 секунди після кінця фільму одне з них уже не зв’язане з двома іншими.',
    );
  });

  it('describes all 72 works, each from its own record', () => {
    expect(works).toHaveLength(72);
    expect(works).toEqual(orbitIds());
    expect(everywhere).toHaveLength(72 * 8);
    for (const { locale, text, label } of everywhere) {
      expect(text, label).not.toBe(messages(locale).statementLine);
      expect(text, label).not.toMatch(/[{}]/);
      // A sentence or two: long enough to say something, short enough to be shown whole.
      expect([...text].length, label).toBeGreaterThanOrEqual(30);
      expect([...text].length, label).toBeLessThanOrEqual(160);
    }
  });

  it('never says eternal or for ever, in any of the eight languages', () => {
    for (const { locale, text, label } of everywhere) {
      expect(text, label).not.toMatch(NEVER_OF_AN_ORBIT[locale]);
      // Nor in English under another language's page, where the token's text once stood.
      expect(text, label).not.toMatch(NEVER_OF_AN_ORBIT.en);
    }
  });

  it('never says Round for a cycle, nor anything else of the token’s own text', () => {
    for (const { id, text, label } of everywhere) {
      expect(text, label).not.toMatch(/\bround\b/i);
      expect(text, label).not.toMatch(/syzyg|fate:|imprinted in|re-render|tones\b/i);
      expect(text, label).not.toBe(indexedWork(id)!.description);
    }
    // The token's text is what it is said to be: this is the sentence the venue no longer uses.
    expect(indexedWork(31)!.description).toMatch(/fate: eternal dance\. Imprinted in Round 1/);
    expect(indexedWork(2)!.description).toContain('1 syzygies');
  });

  it('is English only in English', () => {
    for (const { locale, id, text, label } of everywhere) {
      if (locale === 'en') continue;
      const english = described(id);
      expect(text, label).not.toBe(english);
      // No word of the English sentence stands in another language's.
      const shared = [...longWords(text)].filter((word) => longWords(english).has(word));
      expect(shared, label).toEqual([]);
      const script = OWN_SCRIPT[locale];
      if (!script) continue;
      expect(text, label).toMatch(script);
      expect(text, label).not.toMatch(/\p{Script=Latin}/u);
    }
    // Vietnamese is written in Latin letters, so it is held by its words alone.
    expect(Object.keys(OWN_SCRIPT).sort()).toEqual(
      locales.filter((locale) => locale !== 'en' && locale !== 'vi').sort(),
    );
  });

  it('describes a work it holds no record for as every work is, in the page’s language', () => {
    expect(workOrbit(9999)).toBeUndefined();
    expect(workLine(9999, messages('en'), 'en')).toBeNull();
    for (const locale of locales) {
      const t = messages(locale);
      expect(described(9999, locale)).toBe(t.statementLine);
      expect(t.statementLine, locale).not.toMatch(NEVER_OF_AN_ORBIT[locale]);
      if (locale !== 'en') expect(t.statementLine, locale).not.toBe(messages('en').statementLine);
    }
  });
});
