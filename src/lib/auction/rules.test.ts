import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatEther, zeroAddress } from 'viem';
import {
  auctionPhase,
  bidFunding,
  minimumNextBid,
  parseEthInput,
  MINIMUM_BID,
  type AuctionRecord,
} from './rules';

const UINT256_MAX = (1n << 256n) - 1n;
const record = (overrides: Partial<AuctionRecord> = {}): AuctionRecord => ({
  roundNum: 0n,
  eligibleAt: 1000n,
  endAt: 0n,
  highestBidder: zeroAddress,
  highestBid: 0n,
  registered: true,
  settled: false,
  delivered: false,
  proceedsForwarded: false,
  ...overrides,
});

describe('exact auction amounts', () => {
  it('uses the agreed opening minimum and rounds every nonzero percentage upward', () => {
    expect(minimumNextBid(0n)).toBe(10_000_000_000_000n);
    for (let remainder = 0n; remainder < 10n; remainder++) {
      const high = MINIMUM_BID + remainder;
      expect(minimumNextBid(high)).toBe((high * 11n + 9n) / 10n);
    }
    expect(() => minimumNextBid(-1n)).toThrow(RangeError);
  });

  it('satisfies the smallest-integer 110% inequality without floating point', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: UINT256_MAX / 2n }), (high) => {
        const next = minimumNextBid(high);
        expect(next * 10n).toBeGreaterThanOrEqual(high * 11n);
        expect((next - 1n) * 10n).toBeLessThan(high * 11n);
        expect(next).toBeGreaterThan(high);
      }),
      { numRuns: 1000, seed: 42161 },
    );
  });

  it('never converts a direct offer into a lower automatic bid or reuses a refund', () => {
    const high = 10n ** 18n;
    const total = 100n * 10n ** 18n;
    expect(bidFunding(total, high, false)).toBe(total);
    expect(bidFunding(total, high, true)).toBe(total - high);
    expect(() => bidFunding(minimumNextBid(high) - 1n, high, true)).toThrow(RangeError);
    expect(() => bidFunding(minimumNextBid(high) - 1n, high, false)).toThrow(RangeError);
  });

  it('conserves prior committed ETH when computing a valid self-raise', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: MINIMUM_BID, max: 10n ** 30n }),
        fc.bigInt({ min: 0n, max: 10n ** 30n }),
        (high, jump) => {
          const total = minimumNextBid(high) + jump;
          expect(bidFunding(total, high, true) + high).toBe(total);
          expect(bidFunding(total, high, false)).toBe(total);
        },
      ),
      { numRuns: 500, seed: 10010 },
    );
  });

  it('parses exact wei and the uint256 boundary', () => {
    expect(parseEthInput('0.000000000000000001')).toBe(1n);
    expect(parseEthInput('0.00001')).toBe(MINIMUM_BID);
    expect(parseEthInput('100')).toBe(100n * 10n ** 18n);
    expect(parseEthInput(' 1.100000000000000001 ')).toBe(1_100_000_000_000_000_001n);
    expect(parseEthInput(formatEther(UINT256_MAX))).toBe(UINT256_MAX);
    expect(parseEthInput(formatEther(UINT256_MAX + 1n))).toBeNull();
  });

  it.each([
    '',
    ' ',
    '-1',
    '+1',
    '1e-5',
    '1,000',
    '1.0000000000000000001',
    '.1',
    '1.',
    '01',
    'NaN',
    'Infinity',
    '1\n2',
    '1.2.3',
    '0x10',
  ])('rejects ambiguous or inexact input %j', (value) => {
    expect(parseEthInput(value)).toBeNull();
  });

  it('round-trips every sampled valid uint256 wei amount through its decimal ETH representation', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: UINT256_MAX }), (amount) => {
        expect(parseEthInput(formatEther(amount))).toBe(amount);
      }),
      { numRuns: 1000, seed: 60048 },
    );
  });
});

describe('chain-defined auction phases', () => {
  it('does not start an empty lot because its preview ended', () => {
    expect(auctionPhase(record(), 999n)).toBe('preview');
    expect(auctionPhase(record(), 1000n)).toBe('waiting');
    expect(auctionPhase(record(), 10n ** 15n)).toBe('waiting');
  });

  it('closes at the exact end and keeps settlement separate from delivery/funding', () => {
    const active = record({ endAt: 2000n, highestBid: MINIMUM_BID });
    expect(auctionPhase(active, 1999n)).toBe('active');
    expect(auctionPhase(active, 2000n)).toBe('ended');
    expect(auctionPhase({ ...active, settled: true }, 2000n)).toBe('settled');
    expect(
      auctionPhase({ ...active, settled: true, delivered: false, proceedsForwarded: false }, 9999n),
    ).toBe('settled');
  });
});
