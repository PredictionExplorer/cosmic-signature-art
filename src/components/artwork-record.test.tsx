import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { en } from '@/lib/i18n/en';
import type { Artwork } from '@/lib/art/types';
import { NFT_ADDRESS } from '@/lib/site';
import { ArtworkIdentity, ArtworkSources } from './artwork-record';

const holder = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';

function artwork(): Artwork {
  return structuredClone(getCuratedArtwork(31)!);
}

describe('artwork identity record', () => {
  it('preserves cycle zero and distinguishes original recipient from indexed current custody', () => {
    const work = {
      ...artwork(),
      cycle: 0,
      owner: holder,
      originalRecipient: recipient,
      title: '<b>A name</b>',
    };
    const { container } = render(<ArtworkIdentity work={work} locale="en" t={en} />);
    const cycle = screen.getByText(en.cycle).parentElement!;
    expect(within(cycle).getByText('0')).toBeVisible();
    expect(screen.getByRole('link', { name: holder })).toHaveAttribute(
      'href',
      `https://arbiscan.io/address/${holder}`,
    );
    expect(screen.getByRole('link', { name: recipient })).toHaveAttribute(
      'href',
      `https://arbiscan.io/address/${recipient}`,
    );
    expect(screen.getByText(en.indexedNote)).toBeVisible();
    expect(screen.getByText('<b>A name</b>')).toBeVisible();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('link', { name: /View on Arbiscan/ })).toHaveAttribute(
      'href',
      `https://arbiscan.io/token/${NFT_ADDRESS}?a=31`,
    );
    expect(screen.getByRole('link', { name: /Transaction/ })).toHaveAttribute(
      'href',
      `https://arbiscan.io/tx/${work.provenance.mintTransactionHash}`,
    );
    expect(container.querySelector('time')).toHaveAttribute('dateTime', work.mintedAt);
  });

  it('labels a preserved record and leaves unknown ownership or custom naming absent', () => {
    render(<ArtworkIdentity work={artwork()} locale="en" t={en} />);
    expect(screen.getByText(en.preservedRecord)).toBeVisible();
    expect(screen.queryByText(en.indexedOwner)).not.toBeInTheDocument();
    expect(screen.queryByText(en.originalRecipient)).not.toBeInTheDocument();
    expect(screen.queryByText(en.currentName)).not.toBeInTheDocument();
  });

  it('distinguishes the indexed custody contract from the participant while the token is anchored', () => {
    const work = {
      ...artwork(),
      owner: holder,
      anchoring: { active: true, participant: recipient },
    };
    render(<ArtworkIdentity work={work} locale="en" t={en} />);
    const custody = screen.getByText(en.indexedOwner).parentElement!;
    const anchoring = screen.getByText(en.anchoringActive).parentElement!;
    expect(within(custody).getByRole('link', { name: holder })).toBeVisible();
    expect(within(custody).queryByRole('link', { name: recipient })).not.toBeInTheDocument();
    expect(within(anchoring).getByText(en.anchoringParticipant)).toBeVisible();
    expect(within(anchoring).getByRole('link', { name: recipient })).toBeVisible();
  });
});

describe('published artwork files', () => {
  it('links source originals rather than local display previews and preserves document provenance', () => {
    const work = artwork();
    const media = work.media.find((entry) => entry.id === 'ink')!;
    media.master = 'https://a1.cosmicsignature.com/images/source-master.png';
    render(<ArtworkSources work={work} locale="en" t={en} />);
    const ink = screen.getByRole('heading', { name: en.ink, level: 3 }).closest('article')!;
    expect(within(ink).getByRole('link', { name: /Published still/ })).toHaveAttribute(
      'href',
      media.sourceUrl,
    );
    expect(within(ink).getByRole('link', { name: /Published film/ })).toHaveAttribute(
      'href',
      media.films[0].sourceUrl,
    );
    expect(within(ink).getByRole('link', { name: /Master file/ })).toHaveAttribute(
      'href',
      media.master,
    );
    expect(within(ink).getByRole('link', { name: /Published film/ })).not.toHaveAttribute(
      'href',
      media.films[0].src,
    );
    expect(screen.getByRole('link', { name: /Token metadata/, hidden: true })).toHaveAttribute(
      'href',
      work.provenance.metadataUrl,
    );
    expect(screen.getByRole('link', { name: /Media manifest/, hidden: true })).toHaveAttribute(
      'href',
      work.provenance.manifestUrl,
    );
    expect(screen.getByRole('link', { name: /Indexed record/, hidden: true })).toHaveAttribute(
      'href',
      work.provenance.recordUrl,
    );
  });

  it('keeps future expressions and original web films accessible without fabricating missing dimensions or sources', () => {
    const work = artwork();
    work.media = [
      {
        id: 'sculpture',
        label: 'Spatial study',
        films: [
          {
            id: 'normal',
            label: 'Film',
            src: 'https://a1.cosmicsignature.com/future/spatial.mp4',
            mimeType: 'video/mp4',
            variantKey: '31:spatial:normal',
            delivery: 'original-web',
          },
        ],
        source: 'published-manifest',
        availability: 'advertised',
      },
    ];
    render(<ArtworkSources work={work} locale="en" t={en} />);
    expect(screen.getByRole('heading', { name: 'Spatial study' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Published film/ })).toHaveAttribute(
      'href',
      work.media[0].films[0].src,
    );
    expect(
      screen.queryByRole('link', { name: /Published still|Master file/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/px$/)).not.toBeInTheDocument();
  });

  it('honestly indicates that media files are unavailable', () => {
    const work = { ...artwork(), media: [] };
    render(<ArtworkSources work={work} locale="en" t={en} />);
    expect(screen.getByText(en.noMediaFiles)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('identifies each longer film separately while linking its published original', () => {
    const work = artwork();
    const ink = work.media.find((entry) => entry.id === 'ink')!;
    ink.films = ['normal', 'medium', 'slow'].map((id) => ({
      ...ink.films[0],
      id,
      variantKey: `31:ink:${id}`,
      src: `/art/31-${id}-preview.mp4`,
      sourceUrl: `https://a1.cosmicsignature.com/original/${id}.mp4`,
    }));
    render(<ArtworkSources work={work} locale="en" t={en} />);
    for (const [label, id] of [
      [en.originalFilm, 'normal'],
      [en.longStudy, 'medium'],
      [en.extendedStudy, 'slow'],
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute(
        'href',
        `https://a1.cosmicsignature.com/original/${id}.mp4`,
      );
    }
  });
});
