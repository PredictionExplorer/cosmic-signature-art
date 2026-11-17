import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArtworkDetails } from '@/lib/art/server';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { indexedWork } from '@/lib/art/collection-index';
import { detailsFromIndexedWork } from '@/lib/art/details-validation';
import { en } from '@/lib/i18n/en';
import { ja } from '@/lib/i18n/ja';
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

/** A paragraph matched on its whole text, since the entry's lines mix words, figures and mono. */
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
    // The title is the work's number. The published fate is not a title: it stands last among
    // the publisher's names, labelled as published and quoted, with a note of its own.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
    expect(
      screen.getByText('One of 100,000 candidate orbits. Number 77,741 was chosen.'),
    ).toBeVisible();
    expect(
      screen.getByText(/Borda count · chaos weight 1 · equilibrium weight 5\.843/),
    ).toBeVisible();
    // A label and its number, a number and its unit, never part: their spaces are no-break spaces.
    expect(paragraph(/^Cycle\u00a01\u00a0· /)).toHaveTextContent('August 11, 2026');
    expect(screen.getByText(/Three-body orbit\./)).toHaveTextContent(en.inkMedium);
    expect(paragraph(/^3,456\u00a0×\u00a02,234\u00a0px\u00a0· films 30\u00a0s/)).toBeVisible();
    const traits = screen.getByText(/Orbit Ribbons/).closest('p')!;
    expect(traits).toHaveTextContent('Harmonic Weave');
    expect(traits).toHaveTextContent('Spectral class M');
    expect(traits).toHaveTextContent('632 nm');
    expect(traits).toHaveTextContent('Chaos 13 / 100');
    expect(traits).toHaveTextContent('Syzygies 0');
    expect(traits).toHaveTextContent(/Stellar Selection\s· Published fate: “Eternal Dance”9$/);
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
      Array.from({ length: 11 }, (_, index) => `note-${index + 1}`),
    );
    expect(notes[0]).toHaveTextContent(en.glossarySignature);
    expect(notes[1]).toHaveTextContent(en.glossaryExpression);
    // The selection line reads first, so its Borda note precedes the traits' notes.
    expect(notes[2]).toHaveTextContent(en.glossaryBorda);
    expect(notes[3]).toHaveTextContent(en.glossaryUnderlay);
    // The fate's note says what the publisher's two names mean, and how far the record looked.
    expect(notes[8]).toHaveTextContent(
      'Fate is a trait the publisher gives each token, kept here as published: “Ejection” where its record finds one body free of the other two, “Eternal Dance” where it finds none by step 8,000,000, where it stops looking.',
    );
    expect(notes.at(-1)).toHaveTextContent(en.glossaryEccentricity);
    expect(screen.getByRole('link', { name: 'Note 1' })).toHaveAttribute('href', '#note-1');
    expect(screen.getByRole('link', { name: 'Note 9' })).toHaveAttribute('href', '#note-9');
    expect(screen.getByRole('link', { name: 'Note 11' })).toHaveAttribute('href', '#note-11');
    // Measured facts the entry does not sentence are quiet mono lines.
    expect(screen.getByText(en.masses).nextElementSibling).toHaveTextContent('130.7 : 251 : 125');
    expect(screen.getByText(en.eccentricity).nextElementSibling).toHaveTextContent('0.401');
    // Verify on chain holds the full proofs and the two honesty notes.
    const verify = screen.getByText(en.verifyOnChain).closest('details')!;
    expect(verify).toHaveTextContent(artwork().seed!);
    expect(verify).toHaveTextContent(artwork().media.find((m) => m.id === 'ink')!.stillSha256!);
    const transaction = within(verify).getByRole('link', { name: /Transaction/ });
    const hash = artwork().provenance.mintTransactionHash!;
    expect(transaction).toHaveAttribute('href', `https://arbiscan.io/tx/${hash}`);
    // The hash reads whole, and its last characters are one unbroken run with the arrow: a
    // hash wraps wherever its line ends, and the arrow alone must never be what wraps.
    expect(transaction.textContent).toBe(`${hash} ↗`);
    expect(transaction.querySelector('span')?.textContent).toBe(`${hash.slice(-4)} ↗`);
    expect(verify).toHaveTextContent(en.honestyRecord);
    expect(verify).toHaveTextContent(en.honestyMedia);
    expect(screen.queryByText(en.preservedRecord)).not.toBeInTheDocument();
    const structured = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    expect(structured).toMatchObject({
      '@type': 'VisualArtwork',
      name: '№\u00a0031',
      alternateName: 'Cosmic Signature 031',
      creator: { name: 'Cosmic Signature' },
      dateCreated: '2026-08-11',
      // The medium as the entry words it, and the line under the still: the venue's own words.
      artMedium: `${en.inkMedium} ${en.lightMedium}`,
      description:
        'Three bodies, together for all 1,000,000 steps this work records. They are still bound to one another at step 8,000,000, where the record stops looking.',
      isPartOf: { url: 'https://cosmic.art/collection' },
    });
    // The work is digital and its ground simulated: no surface is claimed for it.
    expect(structured).not.toHaveProperty('artworkSurface');
    // The token's own sentence ("… fate: eternal dance. Imprinted in Round 1 …") is not the
    // venue's to repeat to a machine.
    expect(details.description).toContain('fate: eternal dance');
    expect(JSON.stringify(structured)).not.toMatch(/eternal|\bRound\b|kozo paper/i);
  });

  it('tells a machine of the work in the page’s language, never in the token’s English', () => {
    const { container } = render(
      <EntryView work={artwork()} details={details} recordAt={null} locale="ja" t={ja} />,
    );
    const structured = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    // Japanese runs two sentences together with nothing between them.
    expect(structured.artMedium).toBe(`${ja.inkMedium}${ja.lightMedium}`);
    expect(structured.description).toBe(
      '三つの天体は、この作品が記録する 1,000,000 ステップのあいだ、ずっと共にあります。記録が見届けた最後の第 8,000,000 ステップでも、三つはまだ互いに束縛されています。',
    );
    expect(structured.url).toBe('https://cosmic.art/ja/art/31');
    // A work with no Ink published names the one medium it has.
    const lightOnly = { ...artwork(), media: artwork().media.filter((m) => m.id === 'light') };
    const { container: alone } = render(
      <EntryView work={lightOnly} details={details} recordAt={null} locale="ja" t={ja} />,
    );
    expect(
      JSON.parse(alone.querySelector('script[type="application/ld+json"]')!.textContent!).artMedium,
    ).toBe(ja.lightMedium);
  });

  it('keeps a published fate, labelled, without a note where it holds no orbit record', () => {
    // The note states how far the record looked, which is the orbit record's to say.
    render(
      <EntryView
        work={{ ...artwork(), id: 9999 }}
        details={details}
        recordAt={null}
        locale="en"
        t={en}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 9999$/);
    const traits = screen.getByText(/Orbit Ribbons/).closest('p')!;
    expect(traits).toHaveTextContent(/Published fate: “Eternal Dance”$/);
    const notes = within(screen.getByRole('complementary', { name: en.glossary }));
    expect(notes.getAllByRole('listitem')).toHaveLength(10);
    expect(notes.queryByText(/Fate is a trait/)).not.toBeInTheDocument();
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

  it('dates a record from the index by the index’s own day, whatever the clock says now', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    const snapshot: Artwork = {
      ...artworkFromIndex(indexedWork(17)!),
      provenance: {
        ...artworkFromIndex(indexedWork(17)!).provenance,
        source: 'index-snapshot',
        checkedOn: '2026-10-26',
      },
    };
    vi.useFakeTimers({ now: new Date('2026-11-13T23:15:00Z') });
    try {
      render(await EntryBody({ work: snapshot, locale: 'en', t: en }));
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByText(en.preservedRecord)).toBeVisible();
    const custody = screen.getByText(/Arbitrum record as of/);
    expect(custody).toHaveTextContent(/^Arbitrum record as of October 26, 2026$/);
    expect(within(custody).getByText('October 26, 2026')).toHaveAttribute('datetime', '2026-10-26');
    // The index's own characteristics stand in for the identical seed.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 017$/);
    expect(screen.getByText(/^Published fate: “/)).toBeVisible();
    expect(screen.queryByText(en.detailsUnavailable)).not.toBeInTheDocument();
  });

  it('stamps the moment of reading on a live record only', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    vi.useFakeTimers({ now: new Date('2026-11-13T23:15:00Z') });
    try {
      render(await EntryBody({ work: artwork(), locale: 'en', t: en }));
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByText(/Arbitrum record as of/)).toHaveTextContent(
      /Nov 13, 2026, 11:15\sPM\sUTC/,
    );
    expect(screen.queryByText(en.preservedRecord)).not.toBeInTheDocument();
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
    expect(screen.getByText(/Orbit Ribbons/).closest('p')).toHaveTextContent(
      'Published fate: “Live Fate”',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Signature 031$/);
  });

  it('lets the build-time index stand in only when the live read fails and the seed is identical', async () => {
    vi.mocked(getArtworkDetails).mockResolvedValue({ status: 'unavailable', details: null });
    render(await EntryBody({ work: artwork(), locale: 'en', t: en }));
    expect(screen.getByText(/Orbit Ribbons/).closest('p')).toHaveTextContent(
      'Published fate: “Eternal Dance”',
    );
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
