import type { Locale } from '@/lib/i18n/routing';

/**
 * What the venue never says of an orbit in its own voice: each language's own words for
 * eternal, for ever and always (docs/after-the-frame.md §5 and §8.2). Of the 36 works whose
 * published trait is "eternal dance", 29 lose a body after the record stops looking.
 *
 * The words that only span the recorded steps (ずっと, 始终, 내내, suốt, упродовж усіх) are not
 * here: the count beside them bounds them.
 */
export const NEVER_OF_AN_ORBIT: Record<Locale, RegExp> = {
  // Whole words: "for every" is not "for ever".
  en: /eternal|\bfor ever\b|\bforever\b|\balways\b/i,
  uk: /вічн|назавжди|завжди/i,
  ja: /永遠|永久|いつまでも|いつも/,
  ko: /영원|언제나|항상/,
  zh: /永远|永恒|总是/,
  'zh-TW': /永遠|永恆|總是/,
  'zh-HK': /永遠|永恆|總是/,
  vi: /vĩnh|mãi mãi|luôn luôn/i,
};
