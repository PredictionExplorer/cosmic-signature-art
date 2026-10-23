import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseNameHistoryPage, parseTransferHistoryPage } from './history-validation';

const zero = `0x${'0'.repeat(40)}`;
const first = `0x${'1'.repeat(40)}`;
const second = `0x${'2'.repeat(40)}`;
const transactionHash = `0x${'3'.repeat(64)}`;
const base = {
  nftTokenId: 23,
  eventLogId: 23560,
  blockNumber: 477268350,
  occurredAt: '2026-06-25T17:40:26Z',
  transactionHash,
};
const transfer = { ...base, fromAddress: first, toAddress: second, transferType: 'transfer' };
const name = { ...base, tokenName: 'An orbit', changedByAddress: first };
const scope = { tokenId: 23, limit: 12 };
const envelope = (data: unknown[], nextCursor?: string | null) => ({
  data,
  meta: { limit: scope.limit, nextCursor },
});

describe('artwork history validation', () => {
  it('preserves transaction and indexer identities without inventing a chain log index or sale', () => {
    const page = parseTransferHistoryPage(envelope([transfer]), scope);
    expect(page).toEqual({
      items: [{ ...base, fromAddress: first, toAddress: second, kind: 'transfer' }],
      nextCursor: null,
    });
    expect(page?.items[0]).not.toHaveProperty('logIndex');
    expect(page?.items[0]).not.toHaveProperty('price');
  });

  it('identifies mint and burn only when their zero-address endpoints agree', () => {
    expect(
      parseTransferHistoryPage(
        envelope([{ ...transfer, fromAddress: zero, transferType: 'mint' }]),
        scope,
      )?.items[0].kind,
    ).toBe('mint');
    expect(
      parseTransferHistoryPage(
        envelope([{ ...transfer, toAddress: zero, transferType: 'burn' }]),
        scope,
      )?.items[0].kind,
    ).toBe('burn');
    for (const row of [
      { ...transfer, transferType: 'mint' },
      { ...transfer, transferType: 'burn' },
      { ...transfer, fromAddress: zero },
      { ...transfer, toAddress: zero },
      { ...transfer, transferType: 'sale' },
      { ...transfer, fromAddress: zero, toAddress: zero, transferType: 'mint' },
    ])
      expect(parseTransferHistoryPage(envelope([row]), scope)).toBeNull();
  });

  it('allows an actual self-transfer without inferring a change of beneficial ownership', () => {
    const page = parseTransferHistoryPage(envelope([{ ...transfer, toAddress: first }]), scope);
    expect(page?.items[0]).toMatchObject({
      kind: 'transfer',
      fromAddress: first,
      toAddress: first,
    });
  });

  it('preserves exact names and clearing events without guessing the prior name', () => {
    for (const tokenName of ['', '  A space  ', '軌道 · Орбіта']) {
      const page = parseNameHistoryPage(envelope([{ ...name, tokenName }]), scope);
      expect(page?.items[0]).toMatchObject({
        kind: 'name',
        newName: tokenName,
        changedByAddress: first,
      });
      expect(page?.items[0]).not.toHaveProperty('oldName');
    }
  });

  it('rejects a mixed-token page instead of hiding bad rows and claiming a complete page', () => {
    expect(
      parseTransferHistoryPage(
        envelope([transfer, { ...transfer, nftTokenId: 24, eventLogId: 23559 }]),
        scope,
      ),
    ).toBeNull();
    expect(parseNameHistoryPage(envelope([{ ...name, nftTokenId: 24 }]), scope)).toBeNull();
  });

  it('requires descending, duplicate-free event order and non-increasing blocks', () => {
    for (const row of [
      { ...transfer },
      { ...transfer, eventLogId: 23561 },
      { ...transfer, eventLogId: 23559, blockNumber: 477268351 },
    ])
      expect(parseTransferHistoryPage(envelope([transfer, row]), scope)).toBeNull();
    expect(
      parseTransferHistoryPage(envelope([transfer, { ...transfer, eventLogId: 23559 }]), scope)
        ?.items,
    ).toHaveLength(2);
  });

  it.each([
    { eventLogId: 0 },
    { eventLogId: Number.MAX_SAFE_INTEGER + 1 },
    { nftTokenId: '23' },
    { blockNumber: -1 },
    { transactionHash: 'https://evil.example/tx' },
    { occurredAt: '2026-02-30T10:00:00Z' },
    { occurredAt: 'not-a-date' },
    { fromAddress: '0x123' },
  ])('rejects malformed event identity %o', (replacement) => {
    expect(parseTransferHistoryPage(envelope([{ ...transfer, ...replacement }]), scope)).toBeNull();
  });

  it('validates name author and bounds name payloads', () => {
    expect(parseNameHistoryPage(envelope([{ ...name, changedByAddress: zero }]), scope)).toBeNull();
    expect(
      parseNameHistoryPage(envelope([{ ...name, tokenName: 'x'.repeat(513) }]), scope),
    ).toBeNull();
    expect(parseNameHistoryPage(envelope([transfer]), scope)).toBeNull();
  });

  it('validates page scope, cardinality and a non-looping opaque continuation', () => {
    expect(parseTransferHistoryPage({ data: [transfer], meta: { limit: 11 } }, scope)).toBeNull();
    expect(parseTransferHistoryPage(envelope([], 'continuation'), scope)).toBeNull();
    expect(
      parseTransferHistoryPage(envelope([transfer], 'same'), { ...scope, cursor: 'same' }),
    ).toBeNull();
    expect(
      parseTransferHistoryPage(envelope([transfer], 'https://evil.example'), scope),
    ).toBeNull();
    expect(parseTransferHistoryPage(envelope([transfer], 'x'.repeat(1025)), scope)).toBeNull();
    expect(
      parseTransferHistoryPage(
        { data: [transfer, { ...transfer, eventLogId: 23559 }], meta: { limit: 1 } },
        { ...scope, limit: 1 },
      ),
    ).toBeNull();
    expect(parseTransferHistoryPage(envelope([transfer], 'opaque_cursor'), scope)?.nextCursor).toBe(
      'opaque_cursor',
    );
    expect(parseTransferHistoryPage(envelope([], null), scope)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('never accepts an event belonging to any other safe token identifier', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }).filter((id) => id !== 23),
        (nftTokenId) => {
          expect(
            parseTransferHistoryPage(envelope([{ ...transfer, nftTokenId }]), scope),
          ).toBeNull();
          expect(parseNameHistoryPage(envelope([{ ...name, nftTokenId }]), scope)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
