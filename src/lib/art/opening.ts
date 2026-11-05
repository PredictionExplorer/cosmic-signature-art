import type { IndexedWork } from './collection-index';
import { twinOf, type Artwork, type Expression } from './types';
import { expressionOfTheDay } from './work-of-the-day';

/**
 * The expression a single plate opens on (third-physics-phase-d.md §2): the visitor's request
 * when the work publishes it, else the day's expression, else its twin. Light and Ink are
 * equal, so nothing here prefers either; the day takes turns between them. Undefined means
 * the work publishes neither, and the caller opens on what it has.
 */
export function openingExpression(
  published: (expression: string) => boolean,
  requested?: string,
  day: Expression = expressionOfTheDay(),
): string | undefined {
  if (requested !== undefined && published(requested)) return requested;
  return [day, twinOf(day)].find(published);
}

/** The opening on a work's own media, once they are in hand: the policy's, else its first medium. */
export function openingOn(work: Artwork, requested?: string, day?: Expression): string | undefined {
  return (
    openingExpression((id) => work.media.some((item) => item.id === id), requested, day) ??
    work.media[0]?.id
  );
}

/**
 * What a work is known to publish before its live record arrives: the registry's media and
 * the index's. A work that neither knows publishes nothing yet.
 */
export function knownExpressions(
  registry: Artwork | undefined,
  indexed: IndexedWork | undefined,
): (expression: string) => boolean {
  return (expression) =>
    !!registry?.media.some((item) => item.id === expression) ||
    (expression === 'ink' && !!indexed?.media.ink) ||
    (expression === 'light' && !!indexed?.media.light);
}
