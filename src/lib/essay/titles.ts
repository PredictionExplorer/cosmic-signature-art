/*
  A chapter's statement is display type, and a phone's column is narrow: at 320 px it is 288 px
  wide, six and a half ems of the chapter size. A long word does not fit that («розташуваннях.»
  is nearly eight ems), and a word is never broken in a title. So the page reckons how wide a
  title's longest word is, and where the column is narrower than that the whole title is set
  as large as the word allows (essay.module.css).
*/

/**
 * How wide a character of the book face is, about, in ems: a Latin letter a little over half,
 * a Cyrillic one six tenths (measured: «розташуваннях.» is 7.7 ems, «перемішувати» 7.0), a
 * Hangul syllable a whole em. A little wide on purpose: a title set a size too small is whole.
 */
const LATIN = 0.55;
const CYRILLIC = 0.6;
const IS_CYRILLIC = /[\u0400-\u04ff]/u;
const WHOLE_EM = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/u;
const width = (char: string) =>
  WHOLE_EM.test(char) ? 1 : IS_CYRILLIC.test(char) ? CYRILLIC : LATIN;

/**
 * About how wide a title's longest unbreakable run is, in ems of the title's own size, and
 * never under one. Chinese and Japanese lines break between any two characters or phrases, so
 * there is no run to fit; elsewhere a line breaks at a space or after a hyphen, never at the
 * no-break space that binds a number to its unit.
 */
export function longestRun(title: string, locale: string): number {
  if (locale === 'ja' || locale.startsWith('zh')) return 1;
  const widths = title
    .split(/[ \t\n-]+/)
    .map((word) => [...word].reduce((sum, char) => sum + width(char), 0));
  return Math.round(Math.max(1, ...widths) * 100) / 100;
}
