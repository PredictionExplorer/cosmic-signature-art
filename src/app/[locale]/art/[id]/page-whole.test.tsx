import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex, indexedWork } from '@/lib/art/collection-index';
import { fateLine } from '@/lib/art/fate-line';
import { workEnergy } from '@/lib/art/orbit-energy';
import { workOrbit } from '@/lib/art/orbit-records';
import { messages } from '@/lib/i18n/messages';
import ArtworkPage from './page';
import AuctionWork from '../../auctions/[id]/page';

/**
 * A work's page as it is sent before the indexer has answered, and as a reader with no script
 * keeps it: read from the page's own function, with the three real readers behind
 * `@/lib/art/server` on a fetch the test holds. What React sets aside in a hidden segment is
 * not on the page for such a reader, so every reading here leaves the segments out.
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
/** Beyond the index: a work imprinted since the index was read. */
const UNINDEXED = collectionIndex.works.length + 20;
const t = messages('en');
const silent = () => new Promise<Response>(() => {});
const offline = () => Promise.reject(new TypeError('fetch failed'));
const absent = async () =>
  new Response(JSON.stringify({ error: 'record not found' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

const props = (id: number) => ({
  params: Promise.resolve({ locale: 'en', id: String(id) }),
  searchParams: Promise.resolve({}),
});

/** The page's own function, which must not wait for the indexer where the venue holds the work. */
async function rendered(page: Promise<ReactNode>): Promise<ReactNode> {
  const late = Symbol('late');
  const first = await Promise.race([
    page,
    new Promise<typeof late>((resolve) => setTimeout(() => resolve(late), 1000)),
  ]);
  if (first === late) throw new Error('The page waited for the indexer before it rendered.');
  return first;
}

/**
 * What has been sent a moment after the page begins, parsed as a browser with no script has
 * it: each boundary still waiting shows its fallback, and whatever arrived for a boundary sits
 * in a hidden segment that nothing moves.
 */
async function sent(element: ReactNode, errors: unknown[] = []) {
  // Inside the document's body, as the locale's layout places a page. A boundary at the very
  // root could still bring the <html> itself, and React sends nothing until it knows.
  const stream = await renderToReadableStream(<div className="site">{element}</div>, {
    onError: (error) => void errors.push(error),
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const pause = () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 150));
  let html = '';
  for (;;) {
    const next = await Promise.race([reader.read(), pause()]);
    if (!next || next.done) break;
    html += decoder.decode(next.value, { stream: true });
  }
  void reader.cancel().catch(() => {});
  const page = document.createElement('div');
  // A set innerHTML runs no script, as the reader's browser runs none.
  page.innerHTML = html;
  return page;
}

/** The page with every boundary settled and in its place, as script leaves it. */
async function settled(element: ReactNode, errors: unknown[] = []) {
  const { prelude } = await prerender(element, {
    progressiveChunkSize: Infinity,
    onError: (error) => void errors.push(error),
  });
  const page = document.createElement('div');
  page.innerHTML = await new Response(prelude).text();
  return page;
}

/** Elements a reader with no script has: not in a segment set aside, not waiting on the stream. */
const standing = (page: ParentNode, selector: string) =>
  [...page.querySelectorAll(selector)].filter(
    (element) => !element.closest('[hidden], [data-awaits-stream]'),
  );

// A block, not an expression: Vitest takes a function a hook returns for its cleanup and calls it.
beforeEach(() => {
  indexer.fetch.mockReset();
});

describe('a work’s page before the indexer has answered', () => {
  it('is whole for a work the index holds: its plate, its line and its entry', async () => {
    expect(getCuratedArtwork(WORK)).toBeUndefined();
    indexer.fetch.mockImplementation(silent);
    const page = await sent(await rendered(ArtworkPage(props(WORK))));

    const [main, ...others] = standing(page, 'main');
    expect(others).toEqual([]);
    expect(main).toHaveClass('work-page');
    expect(page.querySelector('.loading-room')).toBeNull();
    // The plate, in both expressions, from this origin's own rungs.
    for (const expression of ['ink', 'light']) {
      const still = standing(main, 'img.art-still').find((image) =>
        image.getAttribute('srcset')?.includes(`/art/stills/${WORK}-${expression}-1280-`),
      );
      expect(still, expression).toBeDefined();
    }
    // The line under the still is the orbit record's own, held in the venue.
    for (const sentence of fateLine(workOrbit(WORK)!, workEnergy(WORK), t, 'en')!)
      expect(main.querySelector('.viewing-room')!.textContent).toContain(sentence);
    // The entry: the page's heading, the published characteristics, the glossary, the files.
    const [record, ...records] = standing(main, '#record');
    expect(records).toEqual([]);
    expect(standing(main, 'h1').map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^Signature 017/),
    ]);
    const indexed = indexedWork(WORK)!;
    expect(record.textContent).toContain(indexed.traits.structure);
    expect(record.textContent).toContain(indexed.seed.slice(0, 6));
    expect(record.querySelector('[aria-label="Glossary"] li')).not.toBeNull();
    expect(record.querySelector('[aria-labelledby="sources-title"]')).not.toBeNull();
    // It states the day the venue read it, never the moment of the visit.
    expect(record.querySelector(`time[datetime^="${collectionIndex.checkedOn}"]`)).not.toBeNull();
    // Nothing a reader with no script keeps says that it is still opening.
    expect(standing(main, '[aria-busy="true"]')).toEqual([]);
    expect(standing(main, '*').some((element) => element.textContent === t.recordLoading)).toBe(
      false,
    );
    // The custody history is the indexer's alone: its section waits on the stream, and says so.
    expect(record.querySelector('[aria-labelledby="provenance-title"]')).toHaveAttribute(
      'data-awaits-stream',
    );
    // The held entry leaves the structured data to the live one, which states it once.
    expect(standing(main, 'script[type="application/ld+json"]')).toEqual([]);
  });

  it('opens a registry work from the registry, with its entry from the index', async () => {
    indexer.fetch.mockImplementation(silent);
    const page = await sent(await rendered(ArtworkPage(props(31))));
    const [main] = standing(page, 'main');
    // The registry's plate paints its preview from the document itself.
    expect(standing(main, 'img.art-preview[src^="data:image/webp"]').length).toBeGreaterThan(0);
    expect(standing(main, 'h1').map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^Signature 031/),
    ]);
    // The index names every published file; the registry keeps only what the venue holds.
    const files = standing(main, '[aria-labelledby="sources-title"]')[0].textContent;
    expect(Object.keys(indexedWork(31)!.media.ink!.films).length).toBeGreaterThan(1);
    expect(files).toContain(t.longStudy);
    expect(files).toContain(t.extendedStudy);
  });

  it('keeps the held entry standing until the live one can take its place whole', async () => {
    // The record itself cannot be read, and says so at once; its characteristics are slow.
    indexer.fetch.mockImplementation((url) => (url.includes('/metadata/') ? silent() : offline()));
    const page = await sent(await rendered(ArtworkPage(props(WORK))));
    // Were the live entry handed on now, it would open on a line where the entry's words were.
    expect(standing(page, '#record h1').map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^Signature 017/),
    ]);
    expect(standing(page, '#record .notice')).toEqual([]);
  });

  it('gives its place to the live entry, and states the work once', async () => {
    indexer.fetch.mockImplementation(offline);
    const errors: unknown[] = [];
    const page = await settled(await rendered(ArtworkPage(props(WORK))), errors);
    expect(errors).toEqual([]);
    expect(page.querySelectorAll('main')).toHaveLength(1);
    expect(page.querySelectorAll('#record')).toHaveLength(1);
    expect(page.querySelectorAll('h1')).toHaveLength(1);
    expect(page.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    // The live entry it is: it says that the record could not be read afresh.
    expect(page.querySelector('#record .notice')).toHaveTextContent(t.recordUnavailable);
    expect(page.querySelector('[data-awaits-stream]')).toBeNull();
  });

  it('refuses, by the stream, a held work the indexer says was never imprinted', async () => {
    // Only the indexer can say that a work does not exist, and it says so after the plate has
    // been sent: the refusal is thrown in the live record's boundary, where Next catches it
    // and sets the venue's not-found in the page's place.
    indexer.fetch.mockImplementation(absent);
    const errors: unknown[] = [];
    const page = await sent(await rendered(ArtworkPage(props(WORK))), errors);
    expect(errors.map(String)).toEqual(['Error: NEXT_NOT_FOUND']);
    // Until then the page stood, from what the venue holds.
    expect(standing(page, 'main.work-page img.art-still').length).toBeGreaterThan(0);
  });

  it('opens the sale’s page of a held work without waiting either', async () => {
    indexer.fetch.mockImplementation(silent);
    const page = await sent(await rendered(AuctionWork(props(WORK))));
    const [main] = standing(page, 'main');
    expect(standing(main, 'img.art-still').length).toBeGreaterThan(0);
    expect(standing(main, 'h1')).toHaveLength(1);
  });
});

describe('the page of a work imprinted since the index was read', () => {
  it('keeps a plate’s place while its record is read, and marks it as only waiting', async () => {
    expect(indexedWork(UNINDEXED)).toBeUndefined();
    indexer.fetch.mockImplementation(silent);
    const page = await sent(await rendered(ArtworkPage(props(UNINDEXED))));
    const waiting = page.querySelector('main')!;
    expect(waiting).toHaveClass('loading-room');
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    expect(waiting).toHaveAttribute('data-awaits-stream');
    expect(page.querySelectorAll('main')).toHaveLength(1);
  });

  it('marks what the stream brings, so a reader with no script is shown it', async () => {
    indexer.fetch.mockImplementation(offline);
    const page = await sent(await rendered(ArtworkPage(props(UNINDEXED))));
    // The page that arrived: here, the plain statement that the record could not be read.
    const arrived = [...page.querySelectorAll('main')].find(
      (main) => !main.matches('.loading-room'),
    )!;
    expect(arrived).toHaveAttribute('data-streamed');
    expect(arrived.querySelector('h1')).toHaveTextContent(t.recordUnavailable);
  });

  it('refuses a number the indexer says was never imprinted', async () => {
    indexer.fetch.mockImplementation(absent);
    const errors: unknown[] = [];
    await sent(await rendered(ArtworkPage(props(UNINDEXED))), errors);
    expect(errors.map(String)).toEqual(['Error: NEXT_NOT_FOUND']);
  });
});
