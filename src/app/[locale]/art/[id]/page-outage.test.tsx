import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex, indexedWork } from '@/lib/art/collection-index';
import { fateLine } from '@/lib/art/fate-line';
import { workEnergy } from '@/lib/art/orbit-energy';
import { workOrbit } from '@/lib/art/orbit-records';
import { messages } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/routing';
import ArtworkPage from './page';

/**
 * The work's page while the indexer cannot be read, proved on the page's own function. The
 * server asks the indexer, never the browser, so no browser test can hold the indexer back by
 * routing: here the three real readers behind `@/lib/art/server` run on a fetch that fails, and
 * the page is rendered to HTML whole.
 */
const indexer = vi.hoisted(() => ({ fetch: vi.fn<(url: string) => Promise<Response>>() }));

vi.mock('@/lib/art/server', async () => {
  const { createArtRepository } = await import('@/lib/art/adapter');
  const { createArtworkDetailsRepository } = await import('@/lib/art/details');
  const { createArtworkHistoryRepository } = await import('@/lib/art/history');
  const config = { fetch: (url: string) => indexer.fetch(url) };
  return {
    ...createArtRepository(config),
    ...createArtworkDetailsRepository(config),
    ...createArtworkHistoryRepository(config),
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/art/17',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

/** In the index and not in the curated registry, as 57 of the 72 works are. */
const WORK = 17;
const offline = () => Promise.reject(new TypeError('fetch failed'));
const absent = async () =>
  new Response(JSON.stringify({ error: 'record not found' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

/** The page's HTML with every boundary settled, read as a document. */
async function page(id: number, locale: Locale = 'en') {
  const element = await ArtworkPage({
    params: Promise.resolve({ locale, id: String(id) }),
    searchParams: Promise.resolve({}),
  });
  // Prerendered, so every boundary has settled before the HTML is read; and with no size at
  // which React sets a settled boundary aside to send after its fallback, each is in its place.
  const errors: unknown[] = [];
  const { prelude } = await prerender(element, {
    progressiveChunkSize: Infinity,
    onError: (error) => void errors.push(error),
  });
  // Parsed in this document, where a set innerHTML runs no script and loads nothing.
  const sent = document.createElement('div');
  sent.innerHTML = await new Response(prelude).text();
  expect(errors).toEqual([]);
  return sent;
}

const text = (node: ParentNode, selector: string) =>
  [...node.querySelectorAll(selector)].map((element) => element.textContent);

// A block, not an expression: Vitest takes a function a hook returns for its cleanup and calls it.
beforeEach(() => {
  indexer.fetch.mockReset();
});

describe('a work’s page while the indexer cannot be read', () => {
  it('shows a work the index holds: its plate from the local rungs, its line and its record', async () => {
    expect(getCuratedArtwork(WORK)).toBeUndefined();
    indexer.fetch.mockImplementation(offline);
    const t = messages('en');
    const html = await page(WORK);

    expect(html.querySelector('main')).toHaveClass('work-page');
    expect(html.querySelector('.empty-state')).toBeNull();
    // The plate, in both expressions: the still's rungs are this origin's own files.
    for (const expression of ['ink', 'light']) {
      const still = [...html.querySelectorAll('img.art-still')].find((image) =>
        image.getAttribute('srcset')?.includes(`/art/stills/${WORK}-${expression}-1280-`),
      );
      expect(still, expression).toBeDefined();
      expect(still!.getAttribute('srcset')).toMatch(
        new RegExp(`^/art/stills/${WORK}-${expression}-1280-[a-f0-9]+\\.webp 1280w, /art/stills/`),
      );
    }
    // The line under the still is the orbit record's own, held in the venue.
    const line = fateLine(workOrbit(WORK)!, workEnergy(WORK), t, 'en')!;
    expect(line.length).toBeGreaterThan(0);
    for (const sentence of line)
      expect(html.querySelector('.viewing-room')!.textContent).toContain(sentence);
    // The record, with the venue's notices for a record it could not read afresh.
    const record = html.querySelector('#record')!;
    expect(record.querySelector('h1')).toHaveTextContent(/^Signature 017/);
    expect(text(record, '.notice')).toEqual(
      expect.arrayContaining([t.recordUnavailable, t.preservedRecord]),
    );
    expect(text(record, '.notice')).not.toContain(t.detailsUnavailable);
    expect(record.textContent).toContain(indexedWork(WORK)!.seed.slice(0, 6));
  });

  it('dates the record by the day the index was read, never by the moment of the visit', async () => {
    indexer.fetch.mockImplementation(offline);
    const html = await page(WORK);
    const custody = [...html.querySelectorAll('#record p')].find((paragraph) =>
      paragraph.textContent.startsWith('Arbitrum record as of'),
    )!;
    const day = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(collectionIndex.checkedOn),
    );
    expect(custody).toHaveTextContent(`Arbitrum record as of ${day}`);
    expect(custody.querySelector('time')).toHaveAttribute('datetime', collectionIndex.checkedOn);
    // A live record is stamped with the clock of its reading, in UTC; a snapshot has no clock.
    expect(custody.textContent).not.toMatch(/UTC|\d:\d\d/);
    // Nor a holder: the index keeps none, and a stale one would be a false statement.
    expect(html.querySelector('#record')!.textContent).not.toMatch(/Held by|Imprinted to/);
  });

  it('says so in the visitor’s language', async () => {
    indexer.fetch.mockImplementation(offline);
    const t = messages('uk');
    const html = await page(WORK, 'uk');
    expect(html.querySelector('main')).toHaveClass('work-page');
    expect(text(html, '#record .notice')).toEqual(
      expect.arrayContaining([t.recordUnavailable, t.preservedRecord]),
    );
    expect(html.querySelector('#record time[datetime]')).not.toBeNull();
  });

  it('still refuses a work the indexer says does not exist, whatever the index holds', async () => {
    indexer.fetch.mockImplementation(absent);
    // The page opens from the index before the indexer has answered (page-whole.test.tsx), so
    // the refusal comes by the stream, from the live record's own boundary.
    await expect(page(WORK)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('cannot say of a number the venue does not hold, and shows no work for it', async () => {
    indexer.fetch.mockImplementation(offline);
    expect(indexedWork(999)).toBeUndefined();
    const html = await page(999);
    expect(html.querySelector('main')).toHaveClass('empty-state');
    expect(html.querySelector('h1')).toHaveTextContent(messages('en').recordUnavailable);
    expect(html.querySelector('img')).toBeNull();
  });
});
