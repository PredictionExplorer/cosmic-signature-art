import { describe, expect, it } from 'vitest';
import { getCuratedArtwork } from './catalog';
import { plateFrame } from './orbit-frames';
import { orbitPlate } from './orbit-plate';
import { getInterpretation, type Artwork } from './types';

const work = getCuratedArtwork(31)!;

describe('the orbit section’s plate', () => {
  it('lays the frame over each expression’s still, from the ladder, on its own ground', () => {
    const plate = orbitPlate(work)!;
    expect(plate.frame).toEqual(plateFrame(31, getInterpretation(work, 'light')));
    for (const expression of ['light', 'ink'] as const) {
      const media = getInterpretation(work, expression)!;
      const still = plate.stills[expression]!;
      // The ladder's rungs, never the 3,456 px original.
      expect(still.srcSet).toBe(
        media
          .rungs!.filter((rung) => rung.width <= 1920)
          .map((rung) => `${rung.src} ${rung.width}w`)
          .join(', '),
      );
      expect(still.src).toMatch(
        new RegExp(`^/art/stills/31-${expression}-1920-[a-f0-9]{16}\\.webp$`),
      );
      expect(still.width / still.height).toBeCloseTo(3456 / 2234, 2);
      expect(still.tone).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('offers the Ink still only while its hollows bear the bodies out', () => {
    const republished: Artwork = {
      ...work,
      media: work.media.map((media) =>
        media.id === 'ink' ? { ...media, stillSha256: 'd'.repeat(64) } : media,
      ),
    };
    const plate = orbitPlate(republished)!;
    expect(plate.stills.light).toBeDefined();
    expect(plate.stills.ink).toBeUndefined();
  });

  it('is nothing without a frame that binds, and the orbit is drawn in its own plane', () => {
    const otherFilm: Artwork = {
      ...work,
      media: work.media.map((media) =>
        media.id === 'light'
          ? {
              ...media,
              films: media.films.map((film) =>
                film.id === 'normal' ? { ...film, sourceSha256: 'e'.repeat(64) } : film,
              ),
            }
          : media,
      ),
    };
    expect(orbitPlate(otherFilm)).toBeUndefined();
    expect(orbitPlate({ ...work, id: 9_999 })).toBeUndefined();
    // A still that could not be offered leaves the frame without a plate to draw on.
    const without: Artwork = {
      ...work,
      media: work.media.map((media) => ({ ...media, still: undefined })),
    };
    expect(orbitPlate(without)).toBeUndefined();
  });
});
