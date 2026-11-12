import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FADE_MS, REST_MS } from './orbit-beyond';

/*
  The clocks the stylesheet and the TypeScript share. A fade is run by the stylesheet (--t-sit,
  --t-rest in globals.css) and waited out, or matched frame by frame, by the code: After the
  frame brings its bodies for as long as the still takes to go, and rests for as long as the
  token says. Nothing ties a constant to a custom property but this: retune one, and the test
  names the other.
*/
const css = readFileSync('src/app/globals.css', 'utf8');
const token = (name: string) => Number(new RegExp(`--${name}:\\s*(\\d+)ms;`).exec(css)![1]);
const declared = (file: string, name: string) =>
  Number(
    new RegExp(`const ${name} = ([\\d_]+);`)
      .exec(readFileSync(file, 'utf8'))![1]
      .replaceAll('_', ''),
  );

describe('the clocks the stylesheet shares', () => {
  it('fades for as long as --t-sit, and rests for as long as --t-rest', () => {
    expect(FADE_MS).toBe(token('t-sit'));
    expect(REST_MS).toBe(token('t-rest'));
  });

  it('rests as long wherever a rest is timed', () => {
    for (const file of [
      'src/components/artwork-viewer.tsx',
      'src/app/[locale]/process/chapter-plate.tsx',
    ])
      expect(declared(file, 'REST_MS'), file).toBe(token('t-rest'));
  });
});
