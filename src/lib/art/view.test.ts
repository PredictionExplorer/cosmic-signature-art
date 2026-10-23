import { describe, expect, it } from 'vitest';
import { artworkViewParams } from './view';
describe('artwork view preferences', () => {
  it('preserves a still and exact expression without altering token identity', () => {
    expect(artworkViewParams({ view: 'still', expression: 'light' }).toString()).toBe(
      'view=still&expression=light',
    );
    expect(artworkViewParams({ expression: 'future-3d' }).get('expression')).toBe('future-3d');
  });
  it('drops malformed or repeated hints rather than coercing them', () => {
    for (const expression of ['', ['light'], 'Light', '../light', 'ink?view=still', 'x'.repeat(41)])
      expect(artworkViewParams({ view: ['still'], expression }).size).toBe(0);
  });
});
