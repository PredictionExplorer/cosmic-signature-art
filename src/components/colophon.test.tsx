import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { collectionIndex } from '@/lib/art/collection-index';
import { Colophon } from './colophon';

describe('colophon', () => {
  it('states what the plates are, when the record was read, and repeats the one vocabulary', () => {
    render(<Colophon locale="en" t={en} />);
    const nav = screen.getByRole('navigation', { name: en.colophon });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      en.collection,
      en.auctions,
      en.process,
      en.statement,
      en.terms,
      en.privacy,
      `${en.openProtocol} ↗`,
    ]);
    expect(links.at(-1)).toHaveAttribute('href', 'https://cosmicsignature.com');
    expect(screen.getByRole('img', { name: en.markLabel })).toBeInTheDocument();
    expect(screen.getByText(en.colophonPlates)).toBeInTheDocument();
    expect(screen.getByText(en.colophonFilms)).toBeInTheDocument();
    expect(screen.getByText(en.colophonType)).toBeInTheDocument();
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${collectionIndex.checkedOn}T00:00:00Z`),
    );
    expect(screen.getByText(`Arbitrum record as of ${date}`)).toBeInTheDocument();
    // The only outward arrow on the page belongs to the one link that leaves the venue.
    expect(screen.getAllByText(/↗/)).toHaveLength(1);
  });
});
