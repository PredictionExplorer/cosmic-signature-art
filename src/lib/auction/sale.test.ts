import { describe, expect, it } from 'vitest';
import { parseCollectionIndex } from '@/lib/art/collection-index';
import { comingCycle } from './sale';

describe('coming cycle', () => {
  it('is one past the last indexed cycle, and the first cycle for an empty index', () => {
    expect(comingCycle()).toBeGreaterThanOrEqual(3);
    expect(comingCycle(parseCollectionIndex(null))).toBe(0);
    const index = parseCollectionIndex({
      schemaVersion: 1,
      origin: 'https://a1.cosmicsignature.com',
      checkedOn: '2026-10-26',
      total: 1,
      works: [{ id: 5, seed: `0x${'5'.repeat(64)}`, cycle: 4, traits: {}, media: {} }],
    });
    expect(comingCycle(index)).toBe(5);
  });
});
