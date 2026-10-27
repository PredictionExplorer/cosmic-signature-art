import { describe, expect, it } from 'vitest';
import { parseEther } from 'viem';
import { en } from '../i18n/en';
import { MINIMUM_BID, type AuctionRecord } from './rules';
import {
  chainDate,
  chainStateLine,
  compactAddress,
  entryLine,
  formatChainDate,
  formatEth,
  isLeading,
  lotExpression,
} from './catalogue';

const bidder = '0x6308000000000000000000000000000000001F7C';
const base: AuctionRecord = {
  roundNum: 2n,
  eligibleAt: 1_762_783_200n, // 2025-11-10T14:00:00Z
  endAt: 0n,
  highestBidder: '0x0000000000000000000000000000000000000000',
  highestBid: 0n,
  registered: true,
  settled: false,
  delivered: false,
  proceedsForwarded: false,
};

describe('the catalogue', () => {
  it('alternates Ink on paper and Light on black down the order of sale', () => {
    expect([0, 1, 2, 3].map(lotExpression)).toEqual(['ink', 'light', 'ink', 'light']);
  });

  it("formats a chain date in UTC and in the visitor's zone, never typed into copy", () => {
    expect(formatChainDate(base.eligibleAt, 'en', en, 'UTC')).toBe('Nov 10, 14:00 UTC');
    expect(formatChainDate(base.eligibleAt, 'en', en, 'Europe/Kyiv')).toBe(
      'Nov 10, 14:00 UTC (16:00 in your zone)',
    );
    // A different calendar day in the visitor's zone carries its day.
    expect(formatChainDate(base.eligibleAt, 'en', en, 'Pacific/Auckland')).toBe(
      'Nov 10, 14:00 UTC (Nov 11, 03:00 in your zone)',
    );
    expect(formatChainDate(0n, 'en', en, 'UTC')).toBeNull();
    expect(chainDate(8_640_000_000_001n)).toBeNull();
    expect(compactAddress(bidder)).toBe('0x6308…1F7C');
    expect(formatEth(MINIMUM_BID)).toBe('0.00001 ETH');
  });

  it('states every phase from the record alone', () => {
    const t = en;
    expect(chainStateLine(base, base.eligibleAt + 1n, t, 'en', 'UTC')).toEqual({
      phase: 'waiting',
      line: 'Available to start · opening minimum 0.00001 ETH',
    });
    expect(chainStateLine(base, base.eligibleAt - 1n, t, 'en', 'UTC')).toEqual({
      phase: 'preview',
      line: 'Preview period · bidding eligible from Nov 10, 14:00 UTC',
    });
    const active = {
      ...base,
      endAt: base.eligibleAt + 48n * 3600n,
      highestBid: parseEther('0.42'),
      highestBidder: bidder,
    } as AuctionRecord;
    expect(chainStateLine(active, base.eligibleAt + 10n, t, 'en', 'UTC')).toEqual({
      phase: 'active',
      line: 'Bidding open · 0.42 ETH · closes Nov 12, 14:00 UTC · late bids leave 10 minutes',
    });
    expect(chainStateLine(active, active.endAt + 1n, t, 'en', 'UTC')).toEqual({
      phase: 'ended',
      line: 'Ready to settle · 0.42 ETH',
    });
    expect(chainStateLine({ ...active, settled: true }, active.endAt + 1n, t, 'en', 'UTC')).toEqual(
      {
        phase: 'settled',
        line: 'Settled · 0.42 ETH · won by 0x6308…1F7C · awaiting delivery',
      },
    );
    expect(
      chainStateLine(
        { ...active, settled: true, delivered: true },
        active.endAt + 1n,
        t,
        'en',
        'UTC',
      ).line,
    ).toBe('Settled · 0.42 ETH · won by 0x6308…1F7C · delivered');
    // An undated preview or close still names its phase.
    expect(
      chainStateLine({ ...base, eligibleAt: 9_000_000_000_000n }, 1n, t, 'en', 'UTC').line,
    ).toBe(t.preview);
    expect(
      chainStateLine(
        { ...active, endAt: 9_000_000_000_000n },
        active.eligibleAt + 1n,
        t,
        'en',
        'UTC',
      ).line,
    ).toBe('Bidding open · 0.42 ETH · late bids leave 10 minutes');
  });

  it('knows who leads and what the index lends an entry line', () => {
    const led = { ...base, highestBidder: bidder } as AuctionRecord;
    expect(isLeading(led, bidder)).toBe(true);
    expect(isLeading(led, bidder.toLowerCase() as `0x${string}`)).toBe(true);
    expect(isLeading(base, bidder)).toBe(false);
    expect(isLeading(led, null)).toBe(false);
    expect(entryLine({ structure: 'Orbit Ribbons', underlay: 'Harmonic Weave' })).toBe(
      'Orbit Ribbons · Harmonic Weave',
    );
    expect(entryLine({ structure: 'Orbit Ribbons' })).toBe('Orbit Ribbons');
    expect(entryLine(undefined)).toBeUndefined();
  });
});
