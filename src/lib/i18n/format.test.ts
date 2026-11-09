import { describe, expect, it } from 'vitest';
import { fill, fillParts } from './format';

describe('fill', () => {
  it('replaces named placeholders and leaves unknown ones visible', () => {
    expect(fill('{count} works', { count: 24 })).toBe('24 works');
    expect(fill('Cycle {first} to Cycle {last}', { first: 0, last: 2 })).toBe('Cycle 0 to Cycle 2');
    expect(fill('{work} is next door.', {})).toBe('{work} is next door.');
  });
});

describe('fillParts', () => {
  it('puts any value in its place, between the template’s own words, in order', () => {
    const gap = { exponent: -7 };
    expect(fillParts('Apart by {gap} · step {step}', { gap, step: 12 })).toEqual([
      'Apart by ',
      gap,
      ' · step ',
      '12',
    ]);
    expect(fillParts('{a}{b}', { a: 'x', b: 'y' })).toEqual(['x', 'y']);
    // Unknown names stay visible, within the words around them.
    expect(fillParts('{known} and {unknown}', { known: 'one' })).toEqual(['one', ' and {unknown}']);
    expect(fillParts('', {})).toEqual([]);
  });
});
