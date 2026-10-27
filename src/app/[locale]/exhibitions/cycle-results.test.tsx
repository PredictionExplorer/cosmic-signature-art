import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseEther, zeroAddress } from 'viem';
import { en } from '@/lib/i18n/en';

const readBatch = vi.fn();
vi.mock('@/lib/auction/client', () => ({ readBatch: (page: number) => readBatch(page) }));
const { CycleResults } = await import('./cycle-results');

function lot(settled: boolean, highestBid: bigint) {
  return {
    roundNum: 1n,
    eligibleAt: 0n,
    endAt: 0n,
    highestBid,
    highestBidder: zeroAddress,
    registered: true,
    settled,
    delivered: false,
    proceedsForwarded: false,
  };
}
const batch = (ids: number[], lots: Record<number, ReturnType<typeof lot>>, count = 1n) => ({
  count,
  ids,
  lots: ids.map((tokenId) => ({ tokenId, lot: lots[tokenId] ?? lot(false, 0n) })),
});

beforeAll(() => {
  // jsdom has no observer; the section reads at once, as the component does without one.
  vi.stubGlobal('IntersectionObserver', undefined);
});

describe('a cycle’s results', () => {
  it('prints one line per settled lot with the exact chain amount, and nothing for the rest', async () => {
    readBatch.mockReset();
    readBatch.mockImplementation(async (page: number) =>
      page === 0
        ? batch([24, 25, 26, 27, 28, 29, 30, 31], {
            31: lot(true, parseEther('0.42')),
            30: lot(false, parseEther('0.1')),
            29: lot(true, 0n),
          })
        : batch([], {}),
    );
    render(<CycleResults ids={[24, 29, 30, 31]} t={en} />);
    const region = await screen.findByRole('region', { name: en.results });
    expect(region).toHaveTextContent('№ 031 · Settled · 0.42 ETH');
    expect(region.querySelectorAll('p')).toHaveLength(1);
    expect(region).toHaveAttribute('data-results', 'read');
    // One batch read serves every lot of the cycle; no lot was read on its own.
    expect(readBatch).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while no lot has settled and every batch was read', async () => {
    readBatch.mockReset();
    readBatch.mockResolvedValue(batch([31], { 31: lot(false, 0n) }));
    const { container } = render(<CycleResults ids={[31]} t={en} />);
    await waitFor(() => expect(readBatch).toHaveBeenCalledWith(0));
    await waitFor(() =>
      expect(container.querySelector('section')).toHaveAttribute('data-results', 'read'),
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('hidden');
  });

  it('says when some results could not be read instead of passing a short list as whole', async () => {
    readBatch.mockReset();
    readBatch.mockImplementation(async (page: number) => {
      if (page === 0) throw new Error('unreachable');
      if (page === 1)
        return batch([24, 25, 26, 27, 28, 29, 30, 31], { 31: lot(true, 10n ** 18n) }, 2n);
      return batch([], {}, 2n);
    });
    render(<CycleResults ids={[31, 40]} t={en} />);
    const region = await screen.findByRole('region', { name: en.results });
    expect(region).toHaveTextContent('№ 031 · Settled · 1 ETH');
    expect(region).toHaveTextContent(en.resultsPartial);
    expect(region).toHaveAttribute('data-results', 'partial');
  });
});
