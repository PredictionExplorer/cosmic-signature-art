import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import { fateLine } from './fate-line';
import { workEnergy } from './orbit-energy';
import { workOrbit } from './orbit-records';

/*
  What a stranger reads of one work before they have seen it: the sentence in a search result,
  under a shared link, and in the page's structured data. It is the line the venue sets under
  that work's still (fate-line.ts), in the page's own language, and nothing else: the reader of
  a search result is told what the visitor in front of the picture is told.

  The publisher's token text is not used here. It is one English sentence for every language,
  it calls a cycle a round, it prints "1 syzygies", and of half the works it says "fate: eternal
  dance", which the venue has measured and does not say (docs/after-the-frame.md §1.3 and §5).
  It stays in the token's own metadata, where it is the publisher's to word.
*/

/**
 * The line under one work's still, as its sentences, from the venue's own records of that work:
 * its orbit and the energy its computation kept. Null for a work with no orbit record, and for
 * one whose record would make the line's first sentence untrue.
 */
export function workLine(id: number, t: Messages, locale: Locale): readonly string[] | null {
  const orbit = workOrbit(id);
  return orbit ? fateLine(orbit, workEnergy(id), t, locale) : null;
}

/**
 * The description of one work, in one language: its line, the sentences run together as that
 * language runs them (t.sentences). A work with no line is described as every work is: one
 * recorded three-body orbit, rendered twice (t.statementLine).
 */
export function workDescription(id: number, t: Messages, locale: Locale): string {
  const line = workLine(id, t, locale);
  if (!line) return t.statementLine;
  return line.reduce((said, sentence) => fill(t.sentences, { first: said, second: sentence }));
}
