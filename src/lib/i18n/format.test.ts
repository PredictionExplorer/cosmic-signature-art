import { describe, expect, it } from 'vitest';
import { fill } from './format';

describe('fill', () => {
  it('replaces named placeholders and leaves unknown ones visible', () => {
    expect(fill('{count} works', { count: 24 })).toBe('24 works');
    expect(fill('Cycle {first} to Cycle {last}', { first: 0, last: 2 })).toBe('Cycle 0 to Cycle 2');
    expect(fill('{work} is next door.', {})).toBe('{work} is next door.');
  });
});
