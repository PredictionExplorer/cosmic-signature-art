'use client';
import type { Artwork } from '@/lib/art/types';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { PlateSequence } from './plate-sequence';

/**
 * A spread of works side by side, kept for the home while it is re-sequenced; the collection
 * itself hangs in the plate sequence's rhythm. Remove with the last caller.
 */
export function WorkGrid({
  works,
  locale,
  t,
  eagerFirstRow = false,
  animated = false,
}: {
  works: Artwork[];
  locale: Locale;
  t: Messages;
  eagerFirstRow?: boolean;
  animated?: boolean;
}) {
  return (
    <PlateSequence
      works={works}
      locale={locale}
      t={t}
      animated={animated}
      eagerFirstRow={eagerFirstRow}
      rhythm={[2]}
    />
  );
}
