import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArtworkDetails } from '@/lib/art/server';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtworkDetails } from '@/lib/art/details-validation';
import { en } from '@/lib/i18n/en';
import { ArtworkComposition, ArtworkCompositionView } from './artwork-composition';

vi.mock('@/lib/art/server', () => ({ getArtworkDetails: vi.fn() }));

const work = getCuratedArtwork(31)!;
const details: ArtworkDetails = {
  tokenId: 31,
  seed: work.seed!,
  sourceUrl: 'https://a1.cosmicsignature.com/metadata/31',
};
beforeEach(() => vi.mocked(getArtworkDetails).mockReset());

describe('published composition', () => {
  it('keeps meaningful zero values and preserves authored traits as escaped text', () => {
    const { container } = render(
      <ArtworkCompositionView
        details={{
          ...details,
          structure: '<script>Orbit</script>',
          chaos: 0,
          syzygies: 0,
          braidCrossings: 0,
          simulationSteps: 1000000,
          integrator: 'yoshida4',
        }}
        locale="en"
        t={en}
      />,
    );
    expect(screen.getByText('<script>Orbit</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(within(screen.getByText(en.chaos).parentElement!).getByText('0 / 100')).toBeVisible();
    expect(within(screen.getByText(en.syzygies).parentElement!).getByText('0')).toBeVisible();
    expect(
      within(screen.getByText(en.braidCrossings).parentElement!).getByText('0'),
    ).toBeInTheDocument();
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
    expect(screen.getByText('yoshida4')).toBeInTheDocument();
    expect(screen.queryByText(en.palette)).not.toBeInTheDocument();
  });

  it('loads published characteristics using this token and its actual seed', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({
      status: 'available',
      details: { ...details, palette: 'Rose Mono' },
    });
    render(await ArtworkComposition({ work, locale: 'en', t: en }));
    expect(getArtworkDetails).toHaveBeenCalledWith(31, work.seed);
    expect(screen.getByText('Rose Mono')).toBeVisible();
    expect(screen.queryByText(en.simulation)).not.toBeInTheDocument();
  });

  it('does not invent a trait section for an older metadata record without rendering traits', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'pending', details });
    expect(await ArtworkComposition({ work, locale: 'en', t: en })).toBeNull();
  });

  it('distinguishes unavailable metadata from pending characteristics', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    render(await ArtworkComposition({ work, locale: 'en', t: en }));
    expect(screen.getByText(en.detailsUnavailable)).toBeVisible();
    expect(screen.queryByRole('heading', { name: en.composition })).not.toBeInTheDocument();
  });
});
