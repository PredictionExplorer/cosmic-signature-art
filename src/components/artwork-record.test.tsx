import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { en } from '@/lib/i18n/en';
import type { Artwork } from '@/lib/art/types';
import {
  ArtworkSources,
  ChainAddress,
  compactAddress,
  recordTime,
  shortHash,
} from './artwork-record';

const holder = '0x1111111111111111111111111111111111111111';

function artwork(): Artwork {
  return structuredClone(getCuratedArtwork(31)!);
}

describe('chain addresses', () => {
  it('compacts an address while keeping the full one in the accessible name, with one word to copy it', () => {
    render(
      <ChainAddress address={holder} compact copy={{ label: en.copyAddress, copied: en.copied }} />,
    );
    const link = screen.getByRole('link', { name: new RegExp(holder) });
    expect(link).toHaveAttribute('href', `https://arbiscan.io/address/${holder}`);
    expect(link).toHaveTextContent('0x1111…1111');
    expect(screen.getByRole('button', { name: `${en.copyAddress} ${holder}` })).toHaveTextContent(
      en.copyAddress,
    );
    expect(compactAddress(holder)).toBe('0x1111…1111');
    expect(shortHash('4179abcd'.padEnd(64, '0').replace(/0000$/, '66e4'))).toBe('4179…66e4');
    expect(recordTime(new Date('2026-10-26T08:04:00Z'), 'en')).toMatch(
      /Oct 26, 2026, 8:04 AM UTC$/,
    );
  });
});

describe('published artwork files', () => {
  it('states each file with its dimensions, size and hash from the publisher, linking the original', () => {
    const work = artwork();
    const ink = work.media.find((entry) => entry.id === 'ink')!;
    const facts = indexedWork(31)!.media.ink!;
    render(<ArtworkSources work={work} locale="en" t={en} />);
    const section = screen.getByRole('region', { name: en.sources });
    const inkFiles = within(section)
      .getByRole('heading', { name: en.ink, level: 3 })
      .closest('article')!;
    const still = within(inkFiles).getByRole('link', { name: /^Still · WebP · 3,456 × 2,234 px/ });
    expect(still).toHaveAttribute('href', ink.sourceUrl);
    expect(still).toHaveTextContent(`515 kB · sha256 ${shortHash(ink.stillSha256!)} ↗`);
    // The master's hash comes from the still ladder, which hashed the file it cut the rungs from.
    const master = within(inkFiles).getByRole('link', {
      name: new RegExp(`^Master file · PNG · sha256 ${shortHash(ink.masterSha256!)} ↗$`),
    });
    expect(master).toHaveAttribute('href', ink.master);
    const film = within(inkFiles).getByRole('link', { name: /^Film · 30 s/ });
    expect(film).toHaveAttribute('href', ink.films[0].sourceUrl);
    expect(film).not.toHaveAttribute('href', ink.films[0].src);
    expect(film).toHaveTextContent(`100.8 MB · sha256 ${shortHash(facts.films.main.sha256!)} ↗`);
    expect(screen.getByRole('link', { name: /Token metadata/ })).toHaveAttribute(
      'href',
      work.provenance.metadataUrl,
    );
    expect(screen.getByRole('link', { name: /Media manifest/ })).toHaveAttribute(
      'href',
      work.provenance.manifestUrl,
    );
    expect(screen.getByRole('link', { name: /Indexed record/ })).toHaveAttribute(
      'href',
      work.provenance.recordUrl,
    );
    // Every link in this section leaves the venue and says so.
    for (const link of within(section).getAllByRole('link')) expect(link).toHaveTextContent('↗');
    // Every hash has one word to copy it in full, and the published hashes can be checked against a download.
    expect(
      within(inkFiles).getByRole('button', { name: `${en.copyAddress} ${ink.stillSha256}` }),
    ).toBeInTheDocument();
    expect(
      within(inkFiles).getByRole('button', {
        name: `${en.copyAddress} ${facts.films.main.sha256}`,
      }),
    ).toBeInTheDocument();
    const verify = within(section).getByText(en.verifyDownload).closest('details')!;
    expect(
      within(verify).getByText(`${en.ink} · ${en.film} · videos/web/ember.mp4`),
    ).toBeInTheDocument();
    expect(
      within(verify).getByText(`${en.ink} · ${en.still} · images/web/ember_full.webp`),
    ).toBeInTheDocument();
    expect(
      within(verify).getByText(facts.films.main.sha256!, { selector: 'code' }),
    ).toBeInTheDocument();
    expect(
      within(verify).getByText(`${en.ink} · ${en.masterFile} · images/source/ember.png`),
    ).toBeInTheDocument();
    expect(within(verify).getByText(ink.masterSha256!, { selector: 'code' })).toBeInTheDocument();
  });

  it('never borrows the index’s sizes for a different seed', () => {
    const work = { ...artwork(), seed: `0x${'ab'.repeat(32)}` as `0x${string}` };
    render(<ArtworkSources work={work} locale="en" t={en} />);
    const still = screen.getAllByRole('link', { name: /^Still · WebP/ })[0];
    expect(still).not.toHaveTextContent('MB');
    expect(still).not.toHaveTextContent('kB');
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
    expect(screen.getByRole('link', { name: /^Film ↗$/ })).toHaveAttribute(
      'href',
      work.media[0].films[0].src,
    );
    expect(screen.queryByRole('link', { name: /Still|Master file/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/px/)).not.toBeInTheDocument();
  });

  it('honestly indicates that media files are unavailable', () => {
    const work = { ...artwork(), media: [] };
    render(<ArtworkSources work={work} locale="en" t={en} />);
    expect(screen.getByText(en.noMediaFiles)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('identifies each longer film and the spectral sweep separately while linking its published original', () => {
    const work = artwork();
    const ink = work.media.find((entry) => entry.id === 'ink')!;
    ink.films = ['normal', 'medium', 'slow'].map((id) => ({
      ...ink.films[0],
      id,
      variantKey: `31:ink:${id}`,
      src: `/art/31-${id}-preview.mp4`,
      sourceUrl: `https://a1.cosmicsignature.com/original/${id}.mp4`,
    }));
    const light = work.media.find((entry) => entry.id === 'light')!;
    light.films = [
      {
        id: 'sweep',
        label: 'Spectral sweep',
        src: 'https://a1.cosmicsignature.com/original/spectral_sweep.mp4',
        durationSeconds: 10,
        mimeType: 'video/mp4',
        variantKey: '31:light:sweep',
        delivery: 'original-web',
      },
    ];
    render(<ArtworkSources work={work} locale="en" t={en} />);
    for (const [label, id] of [
      [en.film, 'normal'],
      [en.longStudy, 'medium'],
      [en.extendedStudy, 'slow'],
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label} ·`) })).toHaveAttribute(
        'href',
        `https://a1.cosmicsignature.com/original/${id}.mp4`,
      );
    }
    expect(screen.getByRole('link', { name: /^Spectral sweep · 10 s ↗$/ })).toHaveAttribute(
      'href',
      light.films[0].src,
    );
  });
});
