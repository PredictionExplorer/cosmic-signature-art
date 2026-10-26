/**
 * The day's work: deterministic per UTC date and stable for the visit, drawn from the works
 * whose complete 1280 px Ink film is held locally and plays from frame 0. The pool widens
 * automatically when scripts/build-settling-clips.mjs publishes clips for the rest.
 */
export const DAY_WORK_POOL: readonly number[] = [23, 31, 35];

export function workOfTheDay(now = new Date(), pool: readonly number[] = DAY_WORK_POOL): number {
  const day = Math.floor(now.getTime() / 86_400_000);
  return pool[((day % pool.length) + pool.length) % pool.length];
}
