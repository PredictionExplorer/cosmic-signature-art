import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { PlateSequence, RHYTHM, sequenceRows } from './plate-sequence';

const coordinator = vi.hoisted(() => ({
  use: vi.fn(),
  intent: vi.fn(),
  clearIntent: vi.fn(),
  fail: vi.fn(),
  rest: vi.fn(),
}));
vi.mock('./collection-motion', () => ({ useCollectionMotion: coordinator.use }));
vi.mock('./motion-provider', () => ({ useMotion: () => ({ paused: true, theatre: 'playing' }) }));
vi.mock('./artwork-transition', () => ({
  ArtworkTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/** A work that looks like Signature 031 but carries another number and cycle. */
function clone(id: number, cycle: number, withPreview = true): Artwork {
  const archived = getCuratedArtwork(31)!;
  return {
    ...archived,
    id,
    cycle,
    media: archived.media.map((media) => ({
      ...media,
      previewFilm:
        withPreview && media.id === 'ink'
          ? {
              ...media.films[0],
              src: `/art/previews/${id}-ink.mp4`,
              durationSeconds: 8,
              startSeconds: 6,
            }
          : undefined,
    })),
  };
}
const works: Artwork[] = [31, 23, 35].map((id) => {
  const archived = getCuratedArtwork(id)!;
  return {
    ...archived,
    media: archived.media
      .filter((media) => id !== 35 || media.id === 'light')
      .map((media) => ({
        ...media,
        previewFilm:
          id === 31 && media.id === 'ink'
            ? {
                ...media.films[0],
                src: '/art/previews/31-ink.mp4',
                durationSeconds: 8,
                startSeconds: 6,
              }
            : undefined,
      })),
  };
});
const cycles = [
  { cycle: 1, count: 24, mintedAt: '2026-08-11T23:38:26.000Z', ids: [] },
  { cycle: 2, count: 24, mintedAt: '2026-10-05T10:14:37.000Z', ids: [] },
];

function card(id: number) {
  return screen.getByRole('link', { name: new RegExp(`^№ ${String(id).padStart(3, '0')} ·`) });
}

beforeEach(() => {
  coordinator.use.mockReset();
  coordinator.intent.mockReset();
  coordinator.clearIntent.mockReset();
  coordinator.fail.mockReset();
  coordinator.rest.mockReset();
  coordinator.use.mockReturnValue({
    gridRef: { current: null },
    activeId: null,
    intent: coordinator.intent,
    clearIntent: coordinator.clearIntent,
    fail: coordinator.fail,
    rest: coordinator.rest,
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('the sequence rows', () => {
  it('walks eighteen works through the fixed rhythm', () => {
    const page = Array.from({ length: 18 }, (_, index) => clone(71 - index, 2));
    const rows = sequenceRows(page, RHYTHM, 'boundaries');
    expect(rows.map((row) => row.shape)).toEqual([1, 2, 3, 1, 2, 1, 3, 1, 2, 2]);
    expect(rows.flatMap((row) => row.works).map((work) => work.id)).toEqual(
      page.map((work) => work.id),
    );
    expect(rows.every((row) => row.chapter === undefined)).toBe(true);
  });

  it('never lets a row straddle two cycles and places the chapter strip at the boundary', () => {
    const page = [
      ...Array.from({ length: 7 }, (_, index) => clone(53 - index, 2)),
      ...Array.from({ length: 5 }, (_, index) => clone(46 - index, 1)),
    ];
    const rows = sequenceRows(page, RHYTHM, 'boundaries');
    // 1 · 2 · 3 fill the first six of cycle 2; the next row of one takes the seventh, then
    // the rhythm continues into cycle 1 with a strip before it.
    expect(rows.map((row) => [row.shape, row.works.length, row.chapter])).toEqual([
      [1, 1, undefined],
      [2, 2, undefined],
      [3, 3, undefined],
      [1, 1, undefined],
      [2, 2, 1],
      [1, 1, undefined],
      [3, 2, undefined],
    ]);
    const straddling = [clone(49, 2), clone(48, 2), clone(47, 1)];
    expect(
      sequenceRows(straddling, [3], 'all').map((row) => [row.works.length, row.chapter]),
    ).toEqual([
      [2, 2],
      [1, 1],
    ]);
    expect(sequenceRows(straddling, [3], 'none').every((row) => row.chapter === undefined)).toBe(
      true,
    );
  });
});

describe('the plate sequence', () => {
  it('keeps ordinary selections static unless browsing motion is explicitly enabled', () => {
    const { container } = render(<PlateSequence works={works} locale="en" t={en} />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: false, ids: [31] });
    expect(container.querySelector('[data-collection-preview]')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(3);
    // 031 and 035 are cycle 1, 023 is cycle 0: the spread breaks at the seam, so three rows hang.
    expect(container.querySelectorAll('[data-shape]')).toHaveLength(3);
    expect(container.querySelector('[data-shape="1"]')).toHaveStyle({
      '--plate-ground': '#efe9dd',
    });
  });

  it('only grants eligibility to a verified compact Ink excerpt outside a row of stills', () => {
    const { container } = render(<PlateSequence works={works} locale="en" t={en} animated />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31] });
    // The third row falls on the rhythm's row of three: stills only, no preview session.
    expect(container.querySelectorAll('[data-collection-preview]')).toHaveLength(2);
    expect(card(31)).toHaveAttribute('data-preview-available', 'true');
    expect(card(23)).toHaveAttribute('data-preview-available', 'false');
    expect(card(35)).toHaveAttribute('data-preview-available', 'false');
    expect(container.querySelector('video')).toBeNull();
    // A row of three stills never moves, even when every work has an excerpt.
    const stills = [1, 2, 3].map((id) => clone(id, 0));
    render(<PlateSequence works={stills} locale="en" t={en} animated rhythm={[3]} />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [] });
    expect(card(1)).toHaveAttribute('data-preview-available', 'false');
  });

  it('names every card by its number and expression and carries the expression in the link', () => {
    render(<PlateSequence works={works} locale="ja" t={en} animated />);
    expect(card(31)).toHaveAttribute('aria-label', '№ 031 · Ink');
    expect(card(31)).toHaveAttribute('href', '/ja/art/31');
    expect(card(35)).toHaveAttribute('aria-label', '№ 035 · Light');
    expect(card(35)).toHaveAttribute('href', '/ja/art/35?expression=light');
    expect(card(31)).toHaveTextContent('031');
    expect(card(31)).not.toHaveTextContent('Signature');
  });

  it('shows Light for every work when the view asks for it, and stops the Ink lease', () => {
    render(<PlateSequence works={works} locale="ja" t={en} animated expression="light" />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: false, ids: [31] });
    for (const id of [31, 23, 35]) {
      expect(card(id)).toHaveAttribute('href', `/ja/art/${id}?expression=light`);
      expect(card(id)).toHaveAttribute('data-preview-available', 'false');
    }
  });

  it('routes keyboard focus to the shared coordinator without replacing the artwork link', () => {
    render(<PlateSequence works={works} locale="en" t={en} animated />);
    fireEvent.focus(card(31));
    expect(coordinator.intent).toHaveBeenLastCalledWith(31, 'focus');
    fireEvent.blur(card(31));
    expect(coordinator.clearIntent).toHaveBeenLastCalledWith(31, 'focus');
    expect(card(31).tagName).toBe('A');
    expect(card(31)).not.toHaveAttribute('role', 'button');
  });

  it('labels a moving excerpt by its true place in the film, never as the work’s film', () => {
    coordinator.use.mockReturnValue({
      gridRef: { current: null },
      activeId: 31,
      intent: coordinator.intent,
      clearIntent: coordinator.clearIntent,
      fail: coordinator.fail,
      rest: coordinator.rest,
    });
    render(<PlateSequence works={works} locale="en" t={en} animated />);
    expect(card(31)).toHaveAttribute('data-motion', 'active');
    expect(card(31)).toHaveTextContent(`${en.excerpt} 00:06–00:14`);
    expect(card(31)).not.toHaveTextContent(en.mediaPreview);
    expect(card(23)).not.toHaveTextContent(en.excerpt);
  });

  it('opens each cycle with a strip that reads the cycle, its count and its date', () => {
    const page = [clone(48, 2), clone(47, 1), clone(46, 1)];
    render(<PlateSequence works={page} locale="en" t={en} chapters="all" cycles={cycles} />);
    const strips = screen.getAllByRole('heading', { level: 2 });
    expect(strips.map((strip) => strip.textContent)).toEqual([
      'Cycle 224 worksimprinted October 5, 2026',
      'Cycle 124 worksimprinted August 11, 2026',
    ]);
    expect(strips[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-05T10:14:37.000Z');
  });
});
