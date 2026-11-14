import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The 14 px root the stylesheets are written against (globals.css :root). */
const ROOT_PX = 14;
/** The 12 px floor: no caption, label or readout is smaller in any locale. */
const FLOOR_PX = 12;
// Vitest runs from the repository root; the jsdom environment gives import.meta.url an http scheme.
const src = join(process.cwd(), 'src');

function stylesheets(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...stylesheets(path));
    else if (entry === 'globals.css' || entry.endsWith('.module.css')) found.push(path);
  }
  return found.sort();
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function toPx(value: string, unit: string): number {
  return unit === 'rem' ? Number(value) * ROOT_PX : Number(value);
}

/** Every literal font size a declaration can resolve to, including clamp() bounds. */
function fontSizes(css: string): { declaration: string; px: number }[] {
  const sizes: { declaration: string; px: number }[] = [];
  const declarations = css.matchAll(/font(?:-size)?\s*:\s*([^;{}]+);/g);
  for (const [declaration, value] of declarations) {
    for (const [, number, unit] of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(px|rem)(?![\w-])/g)) {
      // Line-height fractions in a `font:` shorthand carry no unit, so only sized values count.
      sizes.push({ declaration: declaration.trim(), px: toPx(number, unit) });
    }
  }
  return sizes;
}

/** Literal durations in motion declarations; tokens are var(--t-*), zero is a disabled motion. */
function literalDurations(css: string): string[] {
  const offenders: string[] = [];
  const declarations = css.matchAll(
    /(?:transition|animation)(?:-duration|-delay)?\s*:\s*([^;{}]+);/g,
  );
  for (const [declaration, value] of declarations) {
    const withoutTokens = value.replace(/var\([^)]*\)/g, '');
    for (const [literal, number] of withoutTokens.matchAll(/(?<![\w.-])(\d*\.?\d+)m?s(?![\w-])/g)) {
      if (Number(number) !== 0) offenders.push(`${declaration.trim()} (${literal})`);
    }
  }
  return offenders;
}

/** A colour written as #rrggbb, as its three channels. */
function channels(hex: string): [number, number, number] {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) throw new Error(`Not a six-digit colour: ${hex}`);
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}
/** One colour laid over another at a share of itself, as color-mix with transparent paints it. */
function over(top: string, ground: string, share: number): [number, number, number] {
  const [above, below] = [channels(top), channels(ground)];
  return above.map((value, at) => value * share + below[at] * (1 - share)) as [
    number,
    number,
    number,
  ];
}
/** WCAG 2.2's contrast ratio of two colours (relative luminance, sRGB). */
function contrast(one: readonly number[], other: readonly number[]): number {
  const luminance = (colour: readonly number[]) => {
    const [r, g, b] = colour.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The rules of a stylesheet, each as its selector and its declarations (the innermost blocks). */
function rules(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    body,
  }));
}

describe('stylesheet floor', () => {
  const files = stylesheets(src);
  it('finds the stylesheets', () => {
    expect(files.some((file) => file.endsWith('globals.css'))).toBe(true);
    expect(files.filter((file) => file.endsWith('.module.css')).length).toBeGreaterThan(5);
  });
  it.each(files)('%s declares no font size below 12 px', (file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    const small = fontSizes(css).filter(({ px }) => px < FLOOR_PX);
    expect(small).toEqual([]);
  });
  it.each(files)('%s uses the motion tokens for every duration', (file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    expect(literalDurations(css)).toEqual([]);
  });

  // WCAG 2.2, 1.4.3 and 1.4.11: small type needs 4.5:1 on its ground, and the line that shows
  // where a field is needs 3:1. The venue's two grounds, its two muted tones and its two rules
  // are read from globals.css and held to that here.
  describe('the tones on their grounds', () => {
    const globals = stripComments(readFileSync(join(src, 'app/globals.css'), 'utf8'));
    const token = (name: string) => {
      const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(globals)?.[1];
      if (!value) throw new Error(`globals.css names no colour for --${name}`);
      return value;
    };
    const paper = { ground: token('paper'), type: token('paper-type') };
    const night = { ground: token('night'), type: token('night-type') };
    /** The muted tone each ground is given: the first is the root's (paper), the next night's. */
    const [mutedOnPaper, mutedOnNight] = [
      ...globals.matchAll(/--muted:\s*(#[0-9a-f]{6})\s*;/gi),
    ].map(([, value]) => value);
    /** The share of the type's colour each rule is mixed at. */
    const share = (name: string) => {
      const percent = new RegExp(
        `--${name}:\\s*color-mix\\(in srgb, var\\(--type\\) (\\d+)%, transparent\\)`,
      ).exec(globals)?.[1];
      if (!percent) throw new Error(`globals.css mixes no --${name} from the type`);
      return Number(percent) / 100;
    };

    it('keeps muted words at 4.5:1 or more', () => {
      expect(contrast(channels(mutedOnPaper), channels(paper.ground))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(channels(mutedOnNight), channels(night.ground))).toBeGreaterThanOrEqual(4.5);
    });

    it('draws the strong rule at 3:1 or more, which the hairline is not', () => {
      for (const { ground, type } of [paper, night]) {
        const strong = contrast(over(type, ground, share('rule-strong')), channels(ground));
        const hairline = contrast(over(type, ground, share('rule')), channels(ground));
        expect(strong).toBeGreaterThanOrEqual(3);
        // The hairline divides; it is not enough to show where a field is.
        expect(hairline).toBeLessThan(3);
      }
    });

    it('draws no field’s own rule with the hairline', () => {
      const field = /(^|[\s,>+~(])(input|textarea|select)(?![\w-])|\.input(?![\w-])/;
      const hairline = /border[\w-]*\s*:[^;]*var\(--rule\)/;
      const offenders = files.flatMap((file) =>
        rules(stripComments(readFileSync(file, 'utf8')))
          .filter(({ selector, body }) => field.test(selector) && hairline.test(body))
          .map(({ selector }) => `${file.slice(src.length + 1)}: ${selector}`),
      );
      expect(offenders).toEqual([]);
    });
  });
});
