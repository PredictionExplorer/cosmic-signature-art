import { Fragment, type ReactNode } from 'react';
import { bindNumbers } from '@/lib/typography';
import { isSource, type SourceKey } from './sources';

/*
  The essay's marks, as the catalogs write them (src/lib/i18n/en.ts):

    [^name]   a source: the page sets a raised numeral that leads to it
    **term**  a term of the venue's, where it is defined
    *words*   an emphasis or a title
    ^{…}      a raised figure, such as a power of ten

  A sentence comes here with its blanks already filled (fill, src/lib/i18n/format.ts), so a
  mark is only ever one the catalog wrote: the values are figures and names, and
  src/lib/essay/facts.test.ts holds them clear of every mark's characters.
*/
const MARK = /\[\^([\w-]+)\]|\*\*([^*]+)\*\*|\*([^*]+)\*|\^\{([^{}]*)\}/g;

/**
 * A sentence of the essay as React renders it. Its plain words keep their numbers whole at a
 * line's end (bindNumbers); `cite` draws a source's mark. A mark naming no listed source stays
 * visible as written, never dropped: the catalogs' test finds it first.
 */
export function rich(text: string, cite: (key: SourceKey) => ReactNode): ReactNode[] {
  const nodes: ReactNode[] = [];
  let at = 0;
  const words = (to: number) => {
    if (to > at) nodes.push(bindNumbers(text.slice(at, to)));
  };
  for (const match of text.matchAll(MARK)) {
    const [whole, source, term, emphasis, raised] = match;
    words(match.index);
    at = match.index + whole.length;
    const key = `${match.index}`;
    if (source !== undefined)
      nodes.push(isSource(source) ? <Fragment key={key}>{cite(source)}</Fragment> : whole);
    else if (term !== undefined) nodes.push(<dfn key={key}>{term}</dfn>);
    else if (emphasis !== undefined) nodes.push(<em key={key}>{emphasis}</em>);
    else nodes.push(<sup key={key}>{raised}</sup>);
  }
  words(text.length);
  return nodes;
}

/** A sentence without its marks: for a name read aloud, where a numeral or a slant says nothing. */
export function plain(text: string): string {
  // Each group is there only when its own mark matched.
  return text.replace(
    MARK,
    (whole: string, source?: string, term?: string, emphasis?: string, raised?: string) =>
      source !== undefined ? '' : (term ?? emphasis ?? raised ?? whole),
  );
}
