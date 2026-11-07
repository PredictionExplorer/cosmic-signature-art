import { NBSP } from '@/lib/typography';

/**
 * One numbering grammar: the work's name is "№ 031"; the bare folio is "031". The sign is
 * bound to its folio by a no-break space, so a line never ends on "№" without its number.
 */
export function workFolio(id: number): string {
  return String(id).padStart(3, '0');
}
export function workNumber(id: number): string {
  return `№${NBSP}${workFolio(id)}`;
}
