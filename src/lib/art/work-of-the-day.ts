import { curatedArtworks } from './catalog';
import { getInterpretation } from './types';

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

export function workOfTheDay(now = new Date(), pool: readonly number[] = DAY_WORK_POOL): number {
  if (pool.length === 0) throw new Error('No work can open the home: the curated archive is empty');
  const day = Math.floor(now.getTime() / 86_400_000);
  return pool[((day % pool.length) + pool.length) % pool.length];
}
