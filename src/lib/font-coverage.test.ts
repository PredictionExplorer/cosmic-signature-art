import { describe, expect, it } from 'vitest';
// @ts-expect-error the check is plain JavaScript; its exports are read here as written.
import * as check from '../../scripts/check-font-coverage.mjs';

const {
  catalogText,
  covered,
  declaredFaces,
  missingFeatures,
  parseRanges,
  requestedFeatures,
  uncoveredCharacters,
} = check as {
  catalogText: (source: string) => string;
  covered: (codePoint: number, ranges: [number, number][]) => boolean;
  declaredFaces: (css: string, family: string) => { file: string; ranges: [number, number][] }[];
  missingFeatures: (
    requested: Set<string>,
    carried: Set<string>,
    pending?: Map<string, string>,
  ) => string[];
  parseRanges: (css: string) => [number, number][];
  requestedFeatures: (css: string) => Set<string>;
  uncoveredCharacters: (text: string, ranges: [number, number][], drawn?: Set<number>) => string[];
};

/** The Latin slice of a shipped face, as its stylesheet declares it. */
const latin = parseRanges(
  '@font-face { unicode-range: U+0000-00FF,U+0131,U+2000-206F,U+2191,U+2193,U+2212; }',
);

describe('the glyph check', () => {
  it('reads every literal form of a component once, JSX text included', () => {
    const component = [
      "const a = 'single ∴';",
      'const b = "double ‡";',
      'const c = `template ※ ${a}`;',
      '<span>text ∞</span>',
    ].join('\n');
    const text = catalogText(component);
    for (const glyph of ['∴', '‡', '※', '∞']) expect(text).toContain(glyph);
    // The daggers sit inside U+2000–206F; the two mathematical signs do not, and they are
    // reported from this one pass, with no second extraction needed to see them.
    expect(uncoveredCharacters(text, latin)).toEqual(['∴', '∞']);
  });

  it('flags only characters outside the declared ranges, never arrows or spaces', () => {
    expect(covered(0x41, latin)).toBe(true);
    expect(covered(0x2234, latin)).toBe(false);
    expect(uncoveredCharacters('Signature → 031 · ← ↗', latin)).toEqual([]);
    expect(uncoveredCharacters('№', latin)).toEqual(['№']);
  });

  it('counts a character as covered only where a cut really draws it', () => {
    // U+202F lies inside the Latin range, but a cut that does not draw it leaves it to the system.
    const drawn = new Set([...'Signature 031'].map((character) => character.codePointAt(0)!));
    expect(uncoveredCharacters('Signature\u202f031', [], drawn)).toEqual(['\u202f']);
    expect(uncoveredCharacters('Signature 031', [], drawn)).toEqual([]);
  });
});

describe('the feature check', () => {
  it('reads the OpenType features a stylesheet asks of the face', () => {
    const css = [
      '.eyebrow { font-variant-caps: all-small-caps; }',
      '.reading { font-variant-numeric: oldstyle-nums proportional-nums; }',
      '/* font-variant-position: super; is only a comment */',
      '.mark { font-feature-settings: "sups" 1, \'ordn\'; }',
      '.figures { font-variant-numeric: lining-nums tabular-nums; }',
    ].join('\n');
    expect([...requestedFeatures(css)].sort()).toEqual([
      'c2sc',
      'onum',
      'ordn',
      'smcp',
      'sups',
      'tnum',
    ]);
  });

  it('fails on a feature the face lacks unless a reason excuses it', () => {
    const requested = new Set(['smcp', 'onum', 'tnum']);
    const carried = new Set(['kern', 'tnum']);
    expect(missingFeatures(requested, carried, new Map())).toEqual(['onum', 'smcp']);
    expect(missingFeatures(requested, carried, new Map([['smcp', 'scaled capitals']]))).toEqual([
      'onum',
    ]);
  });

  it('reads each declared cut of a family with the range it claims', () => {
    const css = [
      "@font-face { font-family: 'Literata'; src: url('/fonts/literata/literata-latin-roman.woff2') format('woff2-variations'); unicode-range: U+0000-00FF; }",
      "@font-face { font-family: 'Literata Han'; src: url('/fonts/literata/literata-latin-roman.woff2'); unicode-range: U+0000-007F; }",
    ].join('\n');
    expect(declaredFaces(css, 'Literata')).toEqual([
      { file: 'literata-latin-roman.woff2', ranges: [[0, 0xff]] },
    ]);
  });
});
