import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtFilm, Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { NoticeRoom, noticeLines, noticeWords } from './room-notice';

afterEach(cleanup);

const preserved = getCuratedArtwork(31)!;
const film = preserved.media[0].films[0];
/** 031 with a long study on Ink and the spectral sweep on Light, as its page has them. */
const artwork: Artwork = {
  ...preserved,
  media: preserved.media.map((media) => ({
    ...media,
    films:
      media.id === 'ink'
        ? [film, { ...film, id: 'medium', durationSeconds: 115.8 }]
        : [...media.films, { ...film, id: 'sweep' }],
  })),
};
const isStudy = (item: ArtFilm) => item.id === 'medium';
const numbers = new Intl.NumberFormat('en');
const lines = (over: Partial<Parameters<typeof noticeLines>[0]> = {}) =>
  noticeLines({
    artwork,
    t: en,
    derivedViews: true,
    fullscreenAvailable: true,
    constrained: false,
    isStudy,
    numbers,
    ...over,
  });
const words = (over?: Parameters<typeof lines>[0]) => lines(over).map((line) => line.words);

describe('the room’s notice', () => {
  it('joins a line’s parts in order, the dot kept with the words before it', () => {
    expect(noticeWords(en.analysisNotWork, en.whenInk)).toBe(
      `${en.analysisNotWork}\u00a0· ${en.whenInk}`,
    );
    expect(noticeWords(en.analysisNotWork, en.whenInk, '')).toBe(
      noticeWords(en.analysisNotWork, en.whenInk),
    );
    expect(noticeWords('', false, null, undefined)).toBe('');
  });

  it('holds room for each lens’s line, label first, and for the line it says through a Turn', () => {
    const held = lines();
    for (const caption of [en.whenInk, en.whenLight]) {
      const line = held.find((item) => item.words === noticeWords(en.analysisNotWork, caption));
      // The When lens's ramp stands after its line, so the room is held for both.
      expect(line).toMatchObject({ ramp: true });
      expect(held).toContainEqual(
        expect.objectContaining({
          words: noticeWords(en.analysisNotWork, caption, en.preparingExpression),
          ramp: true,
        }),
      );
    }
    for (const caption of [en.wavelengthCaption, en.wavelengthLoading])
      expect(held).toContainEqual(
        expect.objectContaining({ words: noticeWords(en.analysisNotWork, caption), ramp: false }),
      );
    expect(words()).toEqual(
      expect.arrayContaining([en.whenUnavailable, en.wavelengthUnavailable, en.loadingFilm]),
    );
    // No line is held twice.
    expect(new Set(held.map((line) => JSON.stringify(line))).size).toBe(held.length);
  });

  it('holds no room for what this room cannot say', () => {
    // A sale surface offers no lens.
    const sale = words({ derivedViews: false });
    expect(sale.some((line) => line.includes(en.analysisNotWork))).toBe(false);
    expect(sale).not.toContain(en.whenUnavailable);
    expect(sale).not.toContain(en.wavelengthUnavailable);
    // Fullscreen is refused only where it is offered.
    expect(words()).toContain(en.fullScreenUnavailable);
    expect(words({ fullscreenAvailable: false })).not.toContain(en.fullScreenUnavailable);
    // A work without a sweep, or without a study, holds no room for theirs.
    const plain = words({ artwork: preserved, isStudy: () => false });
    expect(plain.some((line) => line.includes(en.wavelengthCaption))).toBe(false);
    expect(plain.some((line) => line.startsWith(en.slowRoom))).toBe(false);
    // A work with one expression is never turned.
    const single = words({ artwork: { ...artwork, media: artwork.media.slice(0, 1) } });
    expect(
      single.some(
        (line) => line.includes(en.analysisNotWork) && line.includes(en.preparingExpression),
      ),
    ).toBe(false);
  });

  it('holds the Slow room’s line with its clock, and a held study’s word only on a constrained connection', () => {
    expect(words()).toContain(noticeWords(en.slowRoom, fill(en.elapsed, { time: '00:00' })));
    expect(words()).not.toContain(en.studyWaits);
    expect(lines({ constrained: true })).toContainEqual({
      words: en.studyWaits,
      ramp: false,
      press: { word: en.playAnyway, meta: fill(en.durationSeconds, { n: 116 }) },
    });
  });

  it('holds the loupe’s readout at its widest: the plate’s far corner at the widest scale', () => {
    expect(words()).toContain(
      fill(en.detailOf, {
        n: '031',
        scale: fill(en.scaleReadout, { ratio: '88.8' }),
        x: '3,456–3,456',
        y: '2,234–2,234',
      }),
    );
  });

  it('draws the held lines from attributes: none of their words is text, and none is read out', () => {
    const held = lines({ constrained: true });
    const { container } = render(
      <NoticeRoom lines={held} first={en.whenFirst} last={en.whenLast} />,
    );
    const room = container.firstElementChild!;
    expect(room).toHaveAttribute('aria-hidden', 'true');
    // Only the spaces that part a line from its ramp or its word are text.
    expect(room.textContent?.trim()).toBe('');
    expect([...room.children].map((line) => line.getAttribute('data-line'))).toEqual(
      held.map((line) => line.words),
    );
    const ramps = room.querySelectorAll('[data-first]');
    expect(ramps).toHaveLength(held.filter((line) => line.ramp).length);
    for (const ramp of ramps) {
      expect(ramp).toHaveAttribute('data-first', en.whenFirst);
      expect(ramp).toHaveAttribute('data-last', en.whenLast);
    }
    // A held word is a box of the word's size, never a control.
    expect(room.querySelector('button')).toBeNull();
    const press = [...room.querySelectorAll('[data-line]')].find((item) =>
      item.getAttribute('data-line')?.startsWith(en.playAnyway),
    );
    expect(press).toHaveAttribute('data-line', `${en.playAnyway} · `);
    expect(press?.firstElementChild).toHaveAttribute(
      'data-line',
      fill(en.durationSeconds, { n: 116 }),
    );
  });
});
