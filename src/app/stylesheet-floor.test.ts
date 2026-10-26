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
});
