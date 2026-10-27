import { describe, expect, it } from 'vitest';
// @ts-expect-error the check is plain JavaScript; its exports are read here as written.
import * as check from '../../scripts/check-font-coverage.mjs';

const { catalogText, covered, parseRanges, uncoveredCharacters } = check as {
  catalogText: (source: string) => string;
  covered: (codePoint: number, ranges: [number, number][]) => boolean;
  parseRanges: (css: string) => [number, number][];
  uncoveredCharacters: (text: string, ranges: [number, number][]) => string[];
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
});
