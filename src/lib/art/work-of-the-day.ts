import { curatedArtworks } from './catalog';
import { dayNumber, expressionOfDay, venueDate } from './day';
import { getInterpretation, type Expression } from './types';

/**
 * The day's work: deterministic per UTC date and stable for the visit, drawn from the works
 * the home can open on: those whose complete 1280 px Ink film is held locally from frame 0
 * and whose opening clip is published (scripts/build-plate-clips.mjs --opening). The pool
 * widens by itself as those derivatives are cut for more works; it is never hand-listed.
 */
function heroWorks(requireOpening: boolean): number[] {
  return curatedArtworks
    .filter((work) => {
      const ink = getInterpretation(work, 'ink');
      const plays = ink?.films.some(
        (film) => film.id === 'normal' && film.delivery === 'local-preview',
      );
      return !!plays && (!requireOpening || !!ink?.openingFilm);
    })
    .map((work) => work.id)
    .sort((a, b) => a - b);
}
const withOpening = heroWorks(true);
export const DAY_WORK_POOL: readonly number[] = withOpening.length ? withOpening : heroWorks(false);

/**
 * The venue's today. `COSMIC_VENUE_DATE` (an ISO date, read on the server) pins it, so the
 * browser suite and previews meet one day's work and one day's expression whatever the
 * calendar says; unset, as in production, it is the clock's. A value that is not a date is
 * refused rather than quietly ignored.
 */
export function venueNow(pinned = process.env.COSMIC_VENUE_DATE): Date {
  return venueDate(pinned);
}

export function workOfTheDay(now = venueNow(), pool: readonly number[] = DAY_WORK_POOL): number {
  if (pool.length === 0) throw new Error('No work can open the home: the curated archive is empty');
  const day = dayNumber(now);
  return pool[((day % pool.length) + pool.length) % pool.length];
}

/** The day's expression, on the day's work's pool (src/lib/art/day.ts states the turn). */
export function expressionOfTheDay(
  now = venueNow(),
  pool: readonly number[] = DAY_WORK_POOL,
): Expression {
  return expressionOfDay(dayNumber(now), pool.length);
}
