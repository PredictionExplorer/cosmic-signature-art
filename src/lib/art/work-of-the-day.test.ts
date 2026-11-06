import { describe, expect, it } from 'vitest';
import { DAY_WORK_POOL, expressionOfTheDay, venueNow, workOfTheDay } from './work-of-the-day';
import { getCuratedArtwork } from './catalog';
import { getInterpretation } from './types';

const DAY_MS = 86_400_000;
const dayAt = (index: number) => new Date(index * DAY_MS + DAY_MS / 2);

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

describe('expression of the day', () => {
  it('holds for a whole UTC day and turns at midnight', () => {
    expect(expressionOfTheDay(new Date('2026-11-05T00:00:01Z'))).toBe('light');
    expect(expressionOfTheDay(new Date('2026-11-05T23:59:59Z'))).toBe('light');
    expect(expressionOfTheDay(new Date('2026-11-06T00:00:01Z'))).toBe('ink');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 72])(
    'gives each expression half the days and every work of a pool of %i both, within two passes',
    (size) => {
      const pool = Array.from({ length: size }, (_, index) => index + 100);
      const start = 20_000 - (20_000 % size);
      const seen = new Map(pool.map((id) => [id, new Set<string>()]));
      const count = { light: 0, ink: 0 };
      for (let index = start; index < start + 2 * size; index += 1) {
        const expression = expressionOfTheDay(dayAt(index), pool);
        count[expression] += 1;
        seen.get(workOfTheDay(dayAt(index), pool))!.add(expression);
      }
      expect(count.light).toBe(count.ink);
      for (const expressions of seen.values()) expect(expressions.size).toBe(2);
    },
  );

  it('alternates day to day through an odd pool, the passes included', () => {
    const turns = Array.from({ length: 12 }, (_, index) =>
      expressionOfTheDay(dayAt(20_760 + index), [23, 31, 35]),
    );
    for (let index = 1; index < turns.length; index += 1)
      expect(turns[index]).not.toBe(turns[index - 1]);
  });

  it('counts days before 1970 the same way and survives an empty pool', () => {
    expect(['light', 'ink']).toContain(expressionOfTheDay(new Date('1969-07-20T20:17:00Z')));
    expect(expressionOfTheDay(dayAt(-1), [1, 2])).not.toBe(expressionOfTheDay(dayAt(-2), [1, 2]));
    expect(['light', 'ink']).toContain(expressionOfTheDay(new Date(), []));
  });
});

describe("the venue's today", () => {
  it('is the clock unless a date pins it, and refuses a pin that is not a date', () => {
    const before = Date.now();
    const now = venueNow(undefined).getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(venueNow('').getTime()).toBeGreaterThanOrEqual(before);
    expect(venueNow('2026-11-06').toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(expressionOfTheDay(venueNow('2026-11-06'))).toBe('ink');
    expect(() => venueNow('tomorrow')).toThrow(/COSMIC_VENUE_DATE/);
  });
});
