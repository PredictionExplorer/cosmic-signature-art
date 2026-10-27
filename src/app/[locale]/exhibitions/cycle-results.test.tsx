import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { en } from '@/lib/i18n/en';

const readAuction = vi.fn();
vi.mock('@/lib/auction/client', () => ({ readAuction: (id: number) => readAuction(id) }));
const { CycleResults } = await import('./cycle-results');

function lot(settled: boolean, highestBid: bigint) {
  return { lot: { settled, highestBid } };
}

describe('a cycle’s results', () => {
  it('prints one line per settled lot and nothing for the rest', async () => {
    readAuction.mockImplementation(async (id: number) => {
      if (id === 31) return lot(true, parseEther('0.42'));
      if (id === 35) return lot(false, parseEther('0.1'));
      if (id === 23) throw new Error('unreachable');
      return lot(true, 0n);
    });
    render(<CycleResults ids={[35, 31, 23, 2]} locale="en" t={en} />);
    const region = await screen.findByRole('region', { name: en.results });
    expect(region).toHaveTextContent('№ 031 · Settled · 0.42 ETH');
    expect(region.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders nothing while no lot has settled', async () => {
    readAuction.mockResolvedValue(lot(false, 0n));
    const { container } = render(<CycleResults ids={[31]} locale="en" t={en} />);
    await waitFor(() => expect(readAuction).toHaveBeenCalledWith(31));
    expect(container).toBeEmptyDOMElement();
  });
});
