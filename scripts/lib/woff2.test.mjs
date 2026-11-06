import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { inspectWoff2 } from './woff2.mjs';

const require = createRequire(import.meta.url);
const plexRoot = dirname(require.resolve('@fontsource/ibm-plex-mono/package.json'));
const literataCuts = new URL('../../fonts/literata/', import.meta.url);
const plex = (file) => readFileSync(resolve(plexRoot, 'files', file));
const literata = (file) => readFileSync(new URL(file, literataCuts));

test('reads the characters a cut draws from its cmap, not the range it claims', () => {
  const latin = inspectWoff2(plex('ibm-plex-mono-latin-400-normal.woff2'));
  // The count fontTools reports for the same file.
  assert.equal(latin.codePoints.size, 229);
  for (const character of 'Signature 031 · 0x7406…Bc6c') {
    assert.ok(latin.codePoints.has(character.codePointAt(0)), character);
  }
  // The Latin range claims U+2000–206F, yet the narrow no-break space is not drawn.
  assert.equal(latin.codePoints.has(0x202f), false);
  // The numero sign lives in the Cyrillic cut.
  assert.equal(latin.codePoints.has(0x2116), false);
  assert.ok(inspectWoff2(plex('ibm-plex-mono-cyrillic-400-normal.woff2')).codePoints.has(0x2116));
});

test('lists the OpenType features a cut carries in GSUB and GPOS', () => {
  // The venue's cuts of the complete Literata keep every feature Google's web cuts drop.
  for (const style of ['roman', 'italic']) {
    const cut = inspectWoff2(literata(`literata-latin-${style}.woff2`));
    for (const feature of ['kern', 'liga', 'pnum', 'tnum', 'smcp', 'c2sc', 'onum', 'lnum', 'sups'])
      assert.ok(cut.features.has(feature), `${style} ${feature}`);
    // The numero sign is in the Latin cut, so № 031 in Literata needs no Cyrillic.
    assert.ok(cut.codePoints.has(0x2116));
  }
  // Plex Mono's web cut carries no figure sets: it is monospaced, every figure already tabular.
  const mono = inspectWoff2(plex('ibm-plex-mono-latin-400-normal.woff2'));
  assert.equal(mono.features.has('tnum'), false);
});

test('refuses a file that is not WOFF2', () => {
  assert.throws(() => inspectWoff2(Buffer.from('wOFF and then nothing')), /Not a WOFF2 file/);
});
