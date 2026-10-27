import { describe, expect, it } from 'vitest';
import { DAY_WORK_POOL, workOfTheDay } from './work-of-the-day';
import { getCuratedArtwork } from './catalog';
import { getInterpretation } from './types';

describe('work of the day', () => {
  it('draws from the works whose complete film and opening clip are held locally', () => {
    expect([...DAY_WORK_POOL]).toEqual([23, 31, 35]);
    for (const id of DAY_WORK_POOL) {
      const ink = getInterpretation(getCuratedArtwork(id)!, 'ink')!;
      expect(ink.openingFilm?.id).toBe('opening');
      expect(
        ink.films.some((film) => film.id === 'normal' && film.delivery === 'local-preview'),
      ).toBe(true);
    }
  });

  it('is deterministic per UTC date and cycles through the pool', () => {
    const day = (iso: string) => workOfTheDay(new Date(iso));
    expect(day('2026-10-26T00:00:01Z')).toBe(day('2026-10-26T23:59:59Z'));
    expect(day('2026-10-26T12:00:00Z')).not.toBe(day('2026-10-27T12:00:00Z'));
    const three = [day('2026-10-26Z'), day('2026-10-27Z'), day('2026-10-28Z')].sort(
      (a, b) => a - b,
    );
    expect(three).toEqual([...DAY_WORK_POOL].sort((a, b) => a - b));
    expect(workOfTheDay(new Date('1969-12-30T00:00:00Z'), [1, 2, 3])).toBe(2);
    expect(() => workOfTheDay(new Date(), [])).toThrow();
  });
});
