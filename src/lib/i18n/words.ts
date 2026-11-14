import type { Messages } from './en';

/** The catalog's keys one component reads, listed beside it (key-sheet.words.ts). */
export type WordList = readonly (keyof Messages)[];

/** The catalog's strings under a list's keys, and no others: what that component is handed. */
export type Words<List extends WordList> = Pick<Messages, List[number]>;

/**
 * Only the strings a list names. A Server Component holds a whole catalog, and React writes
 * every prop it hands a Client Component into the document, so it hands over the words that
 * component reads and the rest of the catalog stays on the server
 * (src/lib/i18n/client-boundary.test.ts).
 */
export function words<const List extends WordList>(t: Messages, list: List): Words<List> {
  return Object.fromEntries(list.map((key) => [key, t[key]])) as Words<List>;
}
