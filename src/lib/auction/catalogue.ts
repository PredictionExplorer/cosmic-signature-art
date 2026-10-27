import { formatEther, isAddressEqual, zeroAddress, type Address } from 'viem';
import type { Messages } from '../i18n/en';
import type { Locale } from '../i18n/routing';
import { fill } from '../i18n/format';
import { auctionPhase, MINIMUM_BID, type AuctionRecord } from './rules';

/**
 * The sale as a bound catalogue: pure helpers for what each lot says about itself. Every
 * figure and date comes from the chain record; the copy only names the phase. Nothing here
 * ticks: a date is a calendar date and time, in UTC and in the visitor's own zone.
 */
export type Phase = ReturnType<typeof auctionPhase>;
export type Expression = 'ink' | 'light';
/** The words the collection index lends a lot's entry line. */
export interface LotTraits {
  structure?: string;
  underlay?: string;
  fate?: string;
  cycle?: number;
}
export type LotTraitsById = Record<number, LotTraits>;

/** Lots alternate Ink on paper and Light on black, so neither expression leads every time. */
export function lotExpression(index: number): Expression {
  return index % 2 === 0 ? 'ink' : 'light';
}

export function compactAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** EVM timestamps can exceed JavaScript's Date range; such a value is not a date. */
export function chainDate(timestamp: bigint): Date | null {
  if (timestamp <= 0n || timestamp > 8_640_000_000_000n) return null;
  return new Date(Number(timestamp) * 1000);
}

/**
 * A chain date as "10 Nov, 14:00 UTC (16:00 in your zone)". The local reading is omitted when
 * the visitor's zone is UTC, and carries the day when it falls on a different calendar day.
 */
export function formatChainDate(
  timestamp: bigint,
  locale: Locale,
  t: Messages,
  timeZone?: string,
): string | null {
  const date = chainDate(timestamp);
  if (!date) return null;
  const utc = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date);
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === 'UTC' || zone === 'Etc/UTC') return `${utc} UTC`;
  const day = (tz: string) =>
    new Intl.DateTimeFormat('en', { day: 'numeric', month: 'numeric', timeZone: tz }).format(date);
  const sameDay = day(zone) === day('UTC');
  const local = new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zone,
  }).format(date);
  return `${utc} UTC (${fill(t.inYourZone, { time: local })})`;
}

export function formatEth(value: bigint): string {
  return `${formatEther(value)} ETH`;
}

/**
 * The one quiet line a lot states about its chain phase, straight from `auctionPhase()`:
 * what it is, what it costs, and when, with nothing typed into copy.
 */
export function chainStateLine(
  lot: AuctionRecord,
  blockTime: bigint,
  t: Messages,
  locale: Locale,
  timeZone?: string,
): { phase: Phase; line: string } {
  const phase = auctionPhase(lot, blockTime);
  const price = formatEth(lot.highestBid || MINIMUM_BID);
  switch (phase) {
    case 'waiting':
      return { phase, line: `${t.lotAvailable} · ${t.openingMinimum} ${formatEth(MINIMUM_BID)}` };
    case 'preview': {
      const date = formatChainDate(lot.eligibleAt, locale, t, timeZone);
      return { phase, line: date ? `${t.preview} · ${t.lotEligibleFrom} ${date}` : t.preview };
    }
    case 'active': {
      const date = formatChainDate(lot.endAt, locale, t, timeZone);
      return {
        phase,
        line: [t.active, price, date ? `${t.lotCloses} ${date}` : null, t.lotLateBids]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'ended':
      return { phase, line: `${t.ended} · ${price}` };
    case 'settled': {
      const winner =
        lot.highestBidder !== zeroAddress
          ? `${t.lotWonBy} ${compactAddress(lot.highestBidder)}`
          : null;
      return {
        phase,
        line: [t.settled, price, winner, lot.delivered ? t.lotDeliveredWord : t.lotAwaitingDelivery]
          .filter(Boolean)
          .join(' · '),
      };
    }
  }
}

/** True when this account holds the lot's highest bid. */
export function isLeading(lot: AuctionRecord, account: Address | null | undefined): boolean {
  return (
    !!account && lot.highestBidder !== zeroAddress && isAddressEqual(lot.highestBidder, account)
  );
}

/** The entry line beneath a lot: the published structure and underlay, when the index knows them. */
export function entryLine(traits: LotTraits | undefined): string | undefined {
  const words = [traits?.structure, traits?.underlay].filter(Boolean);
  return words.length ? words.join(' · ') : undefined;
}
