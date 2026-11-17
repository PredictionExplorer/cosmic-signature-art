import { describe, expect, it } from 'vitest';
import { catalogs } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { SOURCE_ORDER, sourceNumber } from './numerals';
import { SOURCES, SOURCE_MARK, isSource, sourceOrder, type SourceKey } from './sources';
import { CASES, ESSAY, FRAME, TERMS, chapterKeys, type EssayKey } from './structure';

const en = catalogs.en;
const essayKeys = (Object.keys(en) as (keyof typeof en)[]).filter((key): key is EssayKey =>
  key.startsWith('essay'),
);
const count = (text: string, mark: RegExp) => [...text.matchAll(mark)].length;

describe('the essay’s structure', () => {
  it('gives every essay key in the catalog one place, and reads no key the catalog lacks', () => {
    const placed = [...chapterKeys(), ...FRAME];
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual([...essayKeys].sort());
  });

  it('numbers eight chapters, night before paper, each at an address of its own', () => {
    expect(ESSAY.map(({ numeral }) => numeral)).toEqual([
      ...['01', '02', '03', '04', '05', '06', '07', '08'],
      '·',
    ]);
    expect(new Set(ESSAY.map(({ id }) => id)).size).toBe(ESSAY.length);
    for (const { id } of ESSAY) expect(id).toMatch(/^[a-z][a-z-]*$/);
    const grounds = ESSAY.map(({ ground }) => ground);
    expect(grounds).toEqual([...grounds].sort());
    // “(chapter 06)” in the words is the choice.
    expect(en.essayThree5).toContain('chapter 06');
    expect(ESSAY.find(({ id }) => id === 'choice')?.numeral).toBe('06');
    expect(ESSAY.filter(({ blocks }) => blocks.some(({ kind }) => kind === 'choice'))).toHaveLength(
      1,
    );
  });

  it('labels as analysis each figure derived from a work, and no other', () => {
    const figures = ESSAY.flatMap(({ blocks }) =>
      blocks.flatMap((block) => (block.kind === 'figure' ? [block] : [])),
    );
    expect(figures.filter(({ derived }) => derived).map(({ figure }) => figure)).toEqual([
      'pair',
      'energy',
      'twin',
      'sheet',
    ]);
    expect(figures.filter(({ derived }) => !derived).map(({ figure }) => figure)).toEqual([
      'arrangements',
      'ledger',
      'pushes',
      'plaits',
    ]);
    expect(TERMS.at(-1)).toEqual(['analysisNotWork', 'essayTermAnalysisIs']);
  });

  it('keeps the sentences a work decides free of sources, so the numerals never move', () => {
    for (const key of Object.values(CASES).flat()) expect(en[key]).not.toMatch(SOURCE_MARK);
  });
});

describe('the essay’s sources', () => {
  it('are each cited, and numbered as a reader of the English meets them', () => {
    expect([...SOURCE_ORDER].sort()).toEqual(Object.keys(SOURCES).sort());
    expect(sourceNumber('newton')).toBe(1);
    expect(sourceNumber(SOURCE_ORDER.at(-1)!)).toBe(SOURCE_ORDER.length);
    expect(sourceOrder(['a[^kepler] b[^newton]', 'c[^kepler]'])).toEqual(['kepler', 'newton']);
    expect(() => sourceOrder(['a[^nobody]'])).toThrow(/does not list: nobody/);
    expect(() => sourceNumber('nobody' as SourceKey)).toThrow(/never cite/);
    expect(isSource('toString')).toBe(false);
  });

  it('give each reference as text, and an address only where a reader can open one', () => {
    for (const [key, references] of Object.entries(SOURCES)) {
      expect(references.length, key).toBeGreaterThan(0);
      for (const reference of references) {
        expect(reference.text.trim(), key).toBe(reference.text);
        expect(reference.text.length, key).toBeGreaterThan(20);
        // Scholarpedia is served over http alone; every other address is https.
        if ('href' in reference) expect(reference.href, key).toMatch(/^https?:\/\/[^\s]+$/);
      }
    }
  });

  it('are marked in every language on the sentences the English marks', () => {
    for (const locale of locales)
      for (const key of essayKeys) {
        const marks = (text: string) =>
          [...text.matchAll(SOURCE_MARK)].map(([, source]) => source).sort();
        expect(marks(catalogs[locale][key]), `${key} in ${locale}`).toEqual(marks(en[key]));
        // A term defined, an emphasis and a raised figure are marked wherever the English marks one.
        for (const mark of [/\*\*[^*]+\*\*/g, /\^\{/g])
          expect(count(catalogs[locale][key], mark), `${key} in ${locale}`).toBe(
            count(en[key], mark),
          );
        // No stray mark is left for a reader to see.
        const bare = catalogs[locale][key]
          .replace(SOURCE_MARK, '')
          .replace(/\*\*[^*]+\*\*/g, '')
          .replace(/\*[^*]+\*/g, '')
          .replace(/\^\{[^{}]*\{\w+\}\}/g, '');
        expect(bare, `${key} in ${locale}`).not.toMatch(/[*^[\]]/);
      }
  });
});
