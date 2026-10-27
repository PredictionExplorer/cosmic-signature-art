import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArtworkDetails } from '@/lib/art/server';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { detailsFromIndexedWork } from '@/lib/art/details-validation';
import { en } from '@/lib/i18n/en';
import type { Artwork } from '@/lib/art/types';
import { EntryBody, EntryView } from './artwork-entry';

vi.mock('@/lib/art/server', () => ({
  getArtworkDetails: vi.fn(),
  getArtworkHistory: vi.fn(),
}));

const holder = '0x6308A405B4FF1eA890870Efe2a6D036750B81F7C';
const recipient = '0x7406B34d25A9B7841CAC133E3173919e0af6Bc6c';
const details = detailsFromIndexedWork(indexedWork(31)!);

function artwork(): Artwork {
  return {
    ...structuredClone(getCuratedArtwork(31)!),
    owner: holder,
    originalRecipient: recipient,
    provenance: {
      ...getCuratedArtwork(31)!.provenance,
      source: 'live',
      checkedOn: undefined,
    },
  };
}

beforeEach(() => vi.mocked(getArtworkDetails).mockReset());

/** A paragraph matched on its whole text, since the entry's lines mix words and mono numerals. */
function paragraph(pattern: RegExp) {
  return screen.getByText(
    (_, element) => element?.tagName === 'P' && pattern.test(element.textContent ?? ''),
  );
}

describe('the entry', () => {
  it('types the work as a catalogue entry from the publisher’s own record', () => {
    const { container } = render(
      <EntryView
        work={artwork()}
        details={details}
        recordAt={new Date('2026-10-26T08:04:00Z')}
        locale="en"
        t={en}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Signature 031 — Eternal Dance',
    );
    expect(
      screen.getByText('One of 100,000 candidate orbits. Number 77,741 was chosen.'),
    ).toBeVisible();
    expect(
      screen.getByText(/Borda count · chaos weight 1 · equilibrium weight 5\.843/),
    ).toBeVisible();
    expect(paragraph(/^Cycle 1/)).toHaveTextContent('August 11, 2026');
    expect(screen.getByText(/Three-body orbit\./)).toHaveTextContent(en.inkMedium);
    expect(paragraph(/^3,456 × 2,234 px/)).toHaveTextContent('films 30 s');
    const traits = screen.getByText(/Orbit Ribbons/).closest('p')!;
    expect(traits).toHaveTextContent('Harmonic Weave');
    expect(traits).toHaveTextContent('Spectral class M');
    expect(traits).toHaveTextContent('632 nm');
    expect(traits).toHaveTextContent('Chaos 13 / 100');
    expect(traits).toHaveTextContent('Syzygies 0');
    // The custody line keeps the full addresses in the accessible names and states when it was read.
    const custody = paragraph(/^Minted to/);
    expect(within(custody).getByRole('link', { name: new RegExp(recipient) })).toHaveTextContent(
      '0x7406…Bc6c',
    );
    expect(within(custody).getByRole('link', { name: new RegExp(holder) })).toHaveTextContent(
      '0x6308…1F7C',
    );
    expect(
      screen.getAllByRole('button', { name: new RegExp(`^${en.copyAddress} 0x`) }),
    ).toHaveLength(4);
    expect(screen.getByText(/Arbitrum record as of Oct 26, 2026, 8:04 AM UTC/)).toBeVisible();
    expect(screen.getByText(/^Seed/)).toHaveTextContent('0x4a0d…f5b5');
    // The glossary is numbered in order of appearance, Signature and expression first.
    const glossary = screen.getByRole('complementary', { name: en.glossary });
    const notes = within(glossary).getAllByRole('listitem');
    expect(notes.map((note) => note.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `note-${index + 1}`),
    );
    expect(notes[0]).toHaveTextContent(en.glossarySignature);
    expect(notes[1]).toHaveTextContent(en.glossaryExpression);
    // The selection line reads first, so its Borda note precedes the traits' notes.
    expect(notes[2]).toHaveTextContent(en.glossaryBorda);
    expect(notes[3]).toHaveTextContent(en.glossaryUnderlay);
    expect(notes.at(-1)).toHaveTextContent(en.glossaryEccentricity);
    expect(screen.getByRole('link', { name: 'Note 1' })).toHaveAttribute('href', '#note-1');
    expect(screen.getByRole('link', { name: 'Note 10' })).toHaveAttribute('href', '#note-10');
    // Measured facts the entry does not sentence are quiet mono lines.
    expect(screen.getByText(en.masses).nextElementSibling).toHaveTextContent('130.7 : 251 : 125');
    expect(screen.getByText(en.eccentricity).nextElementSibling).toHaveTextContent('0.401');
    // Verify on chain holds the full proofs and the two honesty notes.
    const verify = screen.getByText(en.verifyOnChain).closest('details')!;
    expect(verify).toHaveTextContent(artwork().seed!);
    expect(verify).toHaveTextContent(artwork().media.find((m) => m.id === 'ink')!.stillSha256!);
    expect(within(verify).getByRole('link', { name: /Transaction/ })).toHaveAttribute(
      'href',
      `https://arbiscan.io/tx/${artwork().provenance.mintTransactionHash}`,
    );
    expect(verify).toHaveTextContent(en.honestyRecord);
    expect(verify).toHaveTextContent(en.honestyMedia);
    expect(screen.queryByText(en.preservedRecord)).not.toBeInTheDocument();
    const structured = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    expect(structured).toMatchObject({
      '@type': 'VisualArtwork',
      name: '№ 031',
      alternateName: 'Cosmic Signature 031',
      creator: { name: 'Cosmic Signature' },
      dateCreated: '2026-08-11',
      artworkSurface: 'kozo paper ground',
      isPartOf: { url: 'https://cosmic.art/collection' },
    });
    expect(structured.description).toContain('orbit ribbons');
  });

  it('stays bare and honest when the publisher’s record is unavailable', () => {
    const work = { ...artwork(), owner: undefined, originalRecipient: undefined };
    render(<EntryView work={work} details={null} unavailable recordAt={null} locale="en" t={en} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
    expect(screen.getByText(en.detailsUnavailable)).toBeVisible();
    expect(screen.queryByText(/candidate orbits/)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: en.glossary })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.queryByText(/Arbitrum record as of/)).not.toBeInTheDocument();
  });

  it('labels a preserved record with its own date and an owner-given name as text', () => {
    const work: Artwork = {
      ...getCuratedArtwork(31)!,
      title: '<b>A name</b>',
      provenance: { ...getCuratedArtwork(31)!.provenance, checkedOn: '2026-10-22' },
    };
    const { container } = render(
      <EntryView
        work={work}
        details={{ ...details, fate: undefined }}
        recordAt={null}
        locale="en"
        t={en}
      />,
    );
    expect(screen.getByText(en.preservedRecord)).toBeVisible();
    expect(screen.getByText('<b>A name</b>')).toBeVisible();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/Arbitrum record as of/)).toHaveTextContent('October 22, 2026');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
  });
});

describe('the entry’s source of record', () => {
  it('reads the live metadata for this token and seed', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({
      status: 'available',
      details: { ...details, fate: 'Live Fate' },
    });
    render(await EntryBody({ work: artwork(), locale: 'en', t: en }));
    expect(getArtworkDetails).toHaveBeenCalledWith(31, artwork().seed);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Live Fate');
  });

  it('lets the build-time index stand in only when the live read fails and the seed is identical', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    render(await EntryBody({ work: artwork(), locale: 'en', t: en }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Eternal Dance');
    expect(screen.queryByText(en.detailsUnavailable)).not.toBeInTheDocument();
  });

  it('never attaches the index to another seed, and leaves a pending record bare', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    const other = { ...artwork(), seed: `0x${'cd'.repeat(32)}` as `0x${string}` };
    const { unmount } = render(await EntryBody({ work: other, locale: 'en', t: en }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
    expect(screen.getByText(en.detailsUnavailable)).toBeVisible();
    unmount();
    vi.mocked(getArtworkDetails).mockResolvedValue({
      status: 'pending',
      details: {
        tokenId: 31,
        seed: artwork().seed!,
        sourceUrl: 'https://a1.cosmicsignature.com/metadata/31',
      },
    });
    render(await EntryBody({ work: artwork(), locale: 'en', t: en }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
    expect(screen.queryByText(en.detailsUnavailable)).not.toBeInTheDocument();
    expect(screen.queryByText(/candidate orbits/)).not.toBeInTheDocument();
  });
});
