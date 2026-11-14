import { describe, expect, it } from 'vitest';
import data from './orbit-frames.json' with { type: 'json' };
import { bindFrame, drawsPositions, frameOf, loadOrbitFrames, plateFrame } from './orbit-frames';
import { getCuratedArtwork } from './catalog';
import collection from './collection-index.json' with { type: 'json' };
import { getInterpretation } from './types';

const frames = loadOrbitFrames(data);

describe('the orbit frames', () => {
  it('frame every indexed work, each on the film it was measured against', () => {
    expect([...frames.keys()]).toEqual(collection.works.map((work) => work.id));
    for (const entry of frames.values()) {
      expect(entry.film.agreement).toBeGreaterThanOrEqual(data.parameters.accept.film);
      expect(entry.film.agreement).toBeGreaterThanOrEqual(
        data.parameters.accept.lead * entry.film.otherViews,
      );
      expect(entry.trace.src).toBe(
        `/art/traces/${entry.id}-light-${entry.trace.sha256.slice(0, 16)}.webp`,
      );
    }
  });

  it('carry every double exactly, from its decimal', () => {
    const entry = frames.get(23)!;
    const raw = data.frames.find((frame) => frame.id === 23)!;
    const frame = frameOf(entry);
    expect(frame.box.minX).toBe(Number(raw.box.minX));
    expect(frame.drift.config.scale).toBe(Number(raw.drift.scale));
    expect(frame.view).toEqual(raw.view.triple.map(Number));
    expect(frame).toMatchObject({
      width: 3456,
      height: 2234,
      projection: 'position',
      symmetry: 'none',
    });
  });

  it('bind to a work only while its record and its Light film agree', () => {
    const work = getCuratedArtwork(31)!;
    const light = getInterpretation(work, 'light')!;
    expect(plateFrame(31, light)).toEqual(frameOf(frames.get(31)!));
    const entry = frames.get(31)!;
    expect(bindFrame({ ...entry, seed: `0x${'0'.repeat(64)}` }, 31)).toBeUndefined();
    expect(bindFrame({ ...entry, traitsSha256: 'f'.repeat(64) }, 31)).toBeUndefined();
    const otherFilm = {
      films: light.films.map((film) =>
        film.id === 'normal' ? { ...film, sourceSha256: 'e'.repeat(64) } : film,
      ),
    };
    expect(bindFrame(entry, 31, otherFilm)).toBeUndefined();
    // A Light interpretation that advertises no film binds by its record alone.
    expect(bindFrame(entry, 31, { films: [] })).toEqual(frameOf(entry));
    expect(bindFrame({ ...entry, box: { ...entry.box, width: 0 } }, 31)).toBeUndefined();
    expect(bindFrame(undefined, 31)).toBeUndefined();
    expect(plateFrame(9_999)).toBeUndefined();
  });

  it('say which works draw the bodies where they were: positions, each stroke once', () => {
    // № 031 does; № 035 is plotted in cross-braid space, № 033 as a hodograph, № 001 as a phase
    // portrait in four-fold symmetry, and № 008 draws positions six times over.
    expect(drawsPositions(31)).toBe(true);
    for (const id of [35, 33, 1, 8]) expect(drawsPositions(id)).toBe(false);
    const all = [...frames.keys()];
    expect(all).toHaveLength(72);
    expect(all.filter((id) => !drawsPositions(id))).toEqual([
      1, 6, 7, 8, 10, 11, 13, 15, 19, 33, 35, 40, 43, 46, 50, 54, 64,
    ]);
    // Nothing is said of a number without a frame.
    expect(drawsPositions(9_999)).toBe(false);
  });

  it('refuse a malformed registry', () => {
    expect(() => loadOrbitFrames({ ...data, frames: [{ id: 1 }] })).toThrow(/art:frames/);
    expect(() => loadOrbitFrames({ ...data, schemaVersion: 2 })).toThrow(/malformed/);
  });
});
