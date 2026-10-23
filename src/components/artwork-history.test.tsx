import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArtworkHistory } from '@/lib/art/server';
import type {
  ArtworkHistory,
  ArtworkNameEvent,
  ArtworkTransferEvent,
} from '@/lib/art/history-types';
import { en } from '@/lib/i18n/en';
import {
  ArtworkHistorySection,
  ArtworkHistoryView,
  historyHref,
  historyOptions,
} from './artwork-history';

vi.mock('@/lib/art/server', () => ({ getArtworkHistory: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const holder = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const zero = '0x0000000000000000000000000000000000000000';
const hash = `0x${'ab'.repeat(32)}` as const;
const mint: ArtworkTransferEvent = {
  nftTokenId: 31,
  eventLogId: 2,
  blockNumber: 12345,
  transactionHash: hash,
  occurredAt: '2026-08-11T23:38:26Z',
  kind: 'mint',
  fromAddress: zero,
  toAddress: holder,
};
const transfer: ArtworkTransferEvent = {
  ...mint,
  eventLogId: 3,
  kind: 'transfer',
  fromAddress: holder,
  toAddress: recipient,
};
const named: ArtworkNameEvent = {
  nftTokenId: 31,
  eventLogId: 4,
  blockNumber: 12346,
  transactionHash: hash,
  occurredAt: '2026-08-12T01:00:00Z',
  kind: 'name',
  changedByAddress: holder,
  newName: '<img src=x onerror=alert(1)>',
};
function history(): ArtworkHistory {
  return {
    tokenId: 31,
    transfers: {
      items: [transfer, mint],
      status: 'available',
      sourceUrl: 'https://a1.cosmicsignature.com/transfers',
      cursor: null,
      nextCursor: null,
      limit: 12,
    },
    names: {
      items: [named],
      status: 'available',
      sourceUrl: 'https://a1.cosmicsignature.com/name-history',
      cursor: null,
      nextCursor: null,
      limit: 12,
    },
  };
}

beforeEach(() => vi.mocked(getArtworkHistory).mockReset());

describe('artwork history navigation', () => {
  it('accepts opaque cursors while rejecting arrays, empty and malformed values', () => {
    expect(historyOptions({ transfers: 'transfer_A-1', names: 'name_B-2' })).toEqual({
      transferCursor: 'transfer_A-1',
      nameCursor: 'name_B-2',
    });
    for (const transfers of ['', 'a/b', 'a?b', 'a b', 'a'.repeat(1025), ['a', 'b']]) {
      expect(historyOptions({ transfers })).toBeNull();
    }
    expect(historyOptions({ names: ['name'] })).toBeNull();
  });

  it('preserves the independent stream and still preference in localized continuation links', () => {
    expect(
      historyHref(
        'ja',
        31,
        { transfers: 'old', names: 'names_A', view: 'still' },
        'transfers',
        'transfers_B',
      ),
    ).toBe('/ja/art/31?view=still&names=names_A&transfers=transfers_B#custody-history');
    expect(
      historyHref(
        'en',
        31,
        { transfers: 'transfers_A', names: 'old', view: 'still' },
        'names',
        null,
      ),
    ).toBe('/art/31?view=still&transfers=transfers_A#naming-history');
    expect(historyHref('en', 31, { names: 'a/b', view: ['still'] }, 'transfers', null)).toBe(
      '/art/31#custody-history',
    );
  });

  it('rejects malformed query data before fetching and offers a localized recovery without losing still mode', async () => {
    render(
      await ArtworkHistorySection({
        tokenId: 31,
        locale: 'ja',
        t: en,
        query: { transfers: 'bad/value', view: 'still' },
      }),
    );
    expect(getArtworkHistory).not.toHaveBeenCalled();
    expect(screen.getByText(en.historyUnavailable)).toBeVisible();
    expect(screen.getByRole('link', { name: /Latest events/ })).toHaveAttribute(
      'href',
      '/ja/art/31?view=still#history',
    );
  });

  it('loads both validated streams through the server repository', async () => {
    vi.mocked(getArtworkHistory).mockResolvedValue(history());
    render(
      await ArtworkHistorySection({
        tokenId: 31,
        locale: 'en',
        t: en,
        query: { transfers: 'transfer_A', names: 'name_B' },
      }),
    );
    expect(getArtworkHistory).toHaveBeenCalledWith(31, {
      transferCursor: 'transfer_A',
      nameCursor: 'name_B',
    });
    expect(screen.getByRole('heading', { name: en.ownershipHistory })).toBeVisible();
  });
});

describe('honest indexed history presentation', () => {
  it('distinguishes an unavailable stream from an available empty stream', () => {
    const data = history();
    data.transfers = { ...data.transfers, status: 'unavailable', items: [] };
    data.names.items = [];
    render(<ArtworkHistoryView history={data} locale="en" t={en} query={{}} />);
    const custody = screen.getByRole('region', { name: en.ownershipHistory });
    const names = screen.getByRole('region', { name: en.namingHistory });
    expect(within(custody).getByRole('status')).toHaveTextContent(en.historyUnavailable);
    expect(within(custody).queryByText(en.noTransfers)).not.toBeInTheDocument();
    expect(within(names).getByText(en.noNames)).toBeVisible();
    expect(within(names).queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not mistake an empty continuation page for a token with no history', () => {
    const data = history();
    data.transfers = { ...data.transfers, items: [], cursor: 'older_page' };
    render(
      <ArtworkHistoryView history={data} locale="en" t={en} query={{ transfers: 'older_page' }} />,
    );
    const custody = screen.getByRole('region', { name: en.ownershipHistory });
    expect(within(custody).getByText(en.noHistoryOnPage)).toBeVisible();
    expect(within(custody).queryByText(en.noTransfers)).not.toBeInTheDocument();
    expect(within(custody).getByRole('link', { name: /Latest events/ })).toHaveAttribute(
      'href',
      '/art/31#custody-history',
    );
  });

  it('escapes owner-authored names and links each event to its actual transaction and block', () => {
    const { container } = render(
      <ArtworkHistoryView history={history()} locale="en" t={en} query={{}} />,
    );
    const names = screen.getByRole('region', { name: en.namingHistory });
    expect(within(names).getByText(named.newName)).toBeVisible();
    expect(container.querySelector('img, script')).toBeNull();
    for (const link of screen.getAllByRole('link', { name: /Transaction/ })) {
      expect(link).toHaveAttribute('href', `https://arbiscan.io/tx/${hash}`);
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
    expect(within(names).getByRole('link', { name: /Block 12,346/ })).toHaveAttribute(
      'href',
      'https://arbiscan.io/block/12346',
    );
    expect(screen.getByText(en.historyNote)).toBeVisible();
    expect(screen.queryByText(/^(Sold|Sale price|ETH)$/i)).not.toBeInTheDocument();
  });

  it('distinguishes creation, ordinary transfer, burn, and clearing a name', () => {
    const data = history();
    data.transfers.items.unshift({
      ...mint,
      eventLogId: 5,
      kind: 'burn',
      fromAddress: holder,
      toAddress: zero,
    });
    data.names.items = [{ ...named, newName: '' }];
    render(<ArtworkHistoryView history={data} locale="en" t={en} query={{}} />);
    for (const title of [en.eventMint, en.eventTransfer, en.eventBurn, en.nameCleared]) {
      expect(screen.getByRole('heading', { name: title })).toBeVisible();
    }
    expect(screen.queryByRole('link', { name: zero })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: en.eventName })).not.toBeInTheDocument();
  });

  it('keeps separately paginated histories independent when moving to earlier events or returning to latest', () => {
    const data = history();
    data.transfers.cursor = 'transfers_current';
    data.transfers.nextCursor = 'transfers_next';
    data.names.cursor = 'names_current';
    data.names.nextCursor = 'names_next';
    render(
      <ArtworkHistoryView
        history={data}
        locale="uk"
        t={en}
        query={{ transfers: 'transfers_current', names: 'names_current', view: 'still' }}
      />,
    );
    const custody = screen.getByRole('navigation', { name: en.ownershipHistory });
    const names = screen.getByRole('navigation', { name: en.namingHistory });
    expect(within(custody).getByRole('link', { name: /Earlier events/ })).toHaveAttribute(
      'href',
      '/uk/art/31?view=still&names=names_current&transfers=transfers_next#custody-history',
    );
    expect(within(names).getByRole('link', { name: /Latest events/ })).toHaveAttribute(
      'href',
      '/uk/art/31?view=still&transfers=transfers_current#naming-history',
    );
  });
});
