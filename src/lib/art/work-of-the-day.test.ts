import { describe, expect, it } from 'vitest';
import { DAY_WORK_POOL, workOfTheDay } from './work-of-the-day';

describe('work of the day', () => {
  it('is deterministic per UTC date and cycles through the pool', () => {
    const day = (iso: string) => workOfTheDay(new Date(iso));
    expect(day('2026-10-26T00:00:01Z')).toBe(day('2026-10-26T23:59:59Z'));
    expect(day('2026-10-26T12:00:00Z')).not.toBe(day('2026-10-27T12:00:00Z'));
    const three = [day('2026-10-26Z'), day('2026-10-27Z'), day('2026-10-28Z')].sort(
      (a, b) => a - b,
    );
    expect(three).toEqual([...DAY_WORK_POOL].sort((a, b) => a - b));
    expect(workOfTheDay(new Date('1969-12-30T00:00:00Z'), [1, 2, 3])).toBe(2);
  });
});
