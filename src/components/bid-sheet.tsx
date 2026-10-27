'use client';
import type { ReactNode, RefObject } from 'react';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import { AuctionSheet } from './auction-sheet';
import { AuctionSummary } from './auction-summary';

/**
 * The bid sheet: `Collect this work` opens it beside the plate with the live panel inside,
 * unchanged in substance, and the conditions at a glance beneath. While it is open the
 * theatre hushes. The panel mounts only while the sheet is open, so its polling begins when
 * a collector asks and ends when the sheet closes.
 */
export function BidSheet({
  open,
  onClose,
  returnFocusRef,
  tokenId,
  t,
  locale,
  panel,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  tokenId: number;
  t: Messages;
  locale: Locale;
  /** The live panel for this lot, provided by the page so the sheet never chooses a client. */
  panel: ReactNode;
}) {
  return (
    <AuctionSheet
      open={open}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      label={`${workNumber(tokenId)} · ${t.bidSheet}`}
      closeLabel={t.close}
      handleLabel={t.sheetHandle}
      hush
    >
      {panel}
      <AuctionSummary locale={locale} t={t} />
    </AuctionSheet>
  );
}
