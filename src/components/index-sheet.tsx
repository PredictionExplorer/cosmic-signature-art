'use client';
import type { CompactWork } from '@/lib/art/collection-index';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';

/**
 * The Index of numbers: a full-viewport sheet with every numeral by cycle and the work under
 * the pointer standing behind the type. Opened by the running head's Index word, by `/`, and
 * closed by Escape or outside tap. This is the Phase 1 mounting point; the sheet itself is
 * built in the collection workstream and reads `useOpenSheet() === 'index'`. The closed
 * dialog exists so the head's `aria-controls` always names a real element.
 */
export function IndexSheet({
  works,
  locale,
  t,
}: {
  works: CompactWork[];
  locale: Locale;
  t: Messages;
}) {
  void works;
  void locale;
  return <dialog id="index-sheet" className="sheet" aria-label={t.indexSheet} />;
}
