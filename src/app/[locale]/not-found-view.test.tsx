import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fill } from '@/lib/i18n/format';
import { catalogs } from '@/lib/i18n/messages';
import { workNumber } from '@/lib/art/number';
import { NotFoundPage } from './not-found-page';
import { NOT_FOUND_WORDS } from './not-found-view.words';

// A not-found file is given no params; the route's language is a root parameter.
let rootLocale = 'ja';
vi.mock('next/root-params', () => ({ locale: async () => rootLocale }));
// The plate has its own tests; here it is the picture the 404 names.
vi.mock('@/components/artwork-media', () => ({
  ArtworkMedia: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

afterEach(() => {
  rootLocale = 'ja';
});

describe('the venue’s not-found', () => {
  it('says a number the collection does not hold has not been imprinted, in the language named', () => {
    const uk = catalogs.uk;
    render(<NotFoundPage locale="uk" address="/uk/art/999" />);
    // The number is bound to its sign by a no-break space, which the raw text keeps.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      fill(uk.notImprinted, { work: workNumber(999) }),
    );
    expect(screen.getByRole('link', { name: uk.collection })).toHaveAttribute(
      'href',
      '/uk/collection',
    );
  });

  it('says a page is not here when the address names no work', () => {
    const en = catalogs.en;
    render(<NotFoundPage locale="en" address="/zzz" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.pageNotFound);
    expect(screen.getByRole('img')).toHaveAccessibleName(`${workNumber(31)} · ${en.light}`);
    expect(
      screen.getByRole('link', { name: fill(en.nextDoor, { work: workNumber(31) }) }),
    ).toHaveAttribute('href', '/art/31');
  });

  it('hands the view the six strings it says and none of the rest of the catalog', () => {
    const page = NotFoundPage({ locale: 'ko', address: '/ko/art/abc' });
    expect(Object.keys(page.props.t).sort()).toEqual([...NOT_FOUND_WORDS].sort());
    expect(page.props.t.notFound).toBe(catalogs.ko.notFound);
    expect(page.props.locale).toBe('ko');
  });

  it('speaks the route’s language inside the venue’s frame, where no address is handed on', async () => {
    const { default: NotFound } = await import('./not-found');
    render(await NotFound());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(catalogs.ja.notFound);
    expect(screen.getByRole('link', { name: catalogs.ja.collection })).toHaveAttribute(
      'href',
      '/ja/collection',
    );
  });

  it('falls back to the first language if the root parameter names none the venue speaks', async () => {
    rootLocale = 'xx';
    const { default: NotFound } = await import('./not-found');
    render(await NotFound());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(catalogs.en.notFound);
  });
});
