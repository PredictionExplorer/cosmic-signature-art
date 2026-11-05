import type { Expression } from './types';

/**
 * The venue's day, in arithmetic alone: no registry is read here, so the browser can compute
 * what the server computed (the Index sheet's wall, the first paint's ground).
 */
export const DAY_MS = 86_400_000;
const modulo = (value: number, by: number) => ((value % by) + by) % by;

/** The UTC day a moment falls on, counted from 1 January 1970. */
export function dayNumber(at: Date): number {
  return Math.floor(at.getTime() / DAY_MS);
}

/**
 * The day's expression for a day's-work pool of `size` works (third-physics-phase-d.md §2):
 * Light and Ink take turns opening the venue, one UTC day each. The turn counts the day's
 * work's place in the pool plus the pass through it, so every work of the pool opens the home
 * in both expressions within two passes, whether the pool is odd or even. Even turns are Light.
 */
export function expressionOfDay(day: number, size: number): Expression {
  const pool = Math.max(1, size);
  const turn = modulo(day, pool) + Math.floor(day / pool);
  return modulo(turn, 2) === 0 ? 'light' : 'ink';
}

/** The venue's date: an ISO date that pins it, or the clock. A pin that is not a date is refused. */
export function venueDate(pinned?: string): Date {
  if (!pinned) return new Date();
  const date = new Date(pinned);
  if (Number.isNaN(date.getTime())) throw new Error(`COSMIC_VENUE_DATE is not a date: ${pinned}`);
  return date;
}
