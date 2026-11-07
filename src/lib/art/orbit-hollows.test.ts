import { describe, expect, it } from 'vitest';
import data from './orbit-hollows.json' with { type: 'json' };
import frames from './orbit-frames.json' with { type: 'json' };
import { bearsOut, bindHollows, inkBearsOrbit, loadOrbitHollows } from './orbit-hollows';
import { frameFilmSha256 } from './orbit-frames';
import { getCuratedArtwork } from './catalog';
import { getInterpretation, type ArtInterpretation } from './types';

const { accept, entries } = loadOrbitHollows(data);

describe('the orbit hollows', () => {
  it('place every framed work’s bodies on its Ink still, at the window’s last step', () => {
    expect([...entries.keys()]).toEqual(frames.frames.map((frame) => frame.id));
    for (const entry of entries.values()) {
      expect(entry.step).toBe(999_999);
      expect(entry.filmSha256).toBe(frameFilmSha256(entry.id));
      expect(entry.ink.rung.src).toBe(
        `/art/stills/${entry.id}-ink-1920-${entry.ink.rung.sha256.slice(0, 16)}.webp`,
      );
      // Every body on the sheet, on paper; at least one in a hollow of its own.
      for (const body of entry.bodies) {
        expect(body.x).toBeGreaterThanOrEqual(0);
        expect(body.x).toBeLessThanOrEqual(3456);
        expect(body.y).toBeGreaterThanOrEqual(0);
        expect(body.y).toBeLessThanOrEqual(2234);
      }
      expect(bearsOut(entry, accept)).toBe(true);
    }
  });

  it('let the orbit be drawn on an Ink plate only while the record, film and still agree', () => {
    const work = getCuratedArtwork(31)!;
    const ink = getInterpretation(work, 'ink')!;
    expect(inkBearsOrbit(31, ink)).toBe(true);
    const entry = entries.get(31)!;
    const film = frameFilmSha256(31);
    const bind = (
      change: Partial<typeof entry>,
      still: Pick<ArtInterpretation, 'stillSha256'> = ink,
    ) => bindHollows({ ...entry, ...change }, 31, still, { accept, filmSha256: film });
    expect(bind({})).toBe(true);
    expect(bind({ seed: `0x${'0'.repeat(64)}` })).toBe(false);
    expect(bind({ traitsSha256: 'f'.repeat(64) })).toBe(false);
    expect(bind({ filmSha256: 'e'.repeat(64) })).toBe(false);
    // A republished Ink still is not the one whose hollows were read.
    expect(bind({}, { stillSha256: 'd'.repeat(64) })).toBe(false);
    expect(bind({}, { stillSha256: undefined })).toBe(false);
    // Without a frame there is no film the hollows were placed by.
    expect(bindHollows(entry, 31, ink, { accept, filmSha256: undefined })).toBe(false);
    expect(bindHollows(undefined, 31, ink, { accept, filmSha256: film })).toBe(false);
    expect(inkBearsOrbit(9_999, ink)).toBe(false);
    expect(inkBearsOrbit(31)).toBe(false);
  });

  it('ask every body to stand on paper and one in a hollow of its own', () => {
    const entry = entries.get(31)!;
    const [first, second, third] = entry.bodies;
    const open = { ...first, hollow: null };
    expect(bearsOut({ ...entry, bodies: [first, open, open] }, accept)).toBe(true);
    expect(bearsOut({ ...entry, bodies: [open, open, open] }, accept)).toBe(false);
    expect(
      bearsOut({ ...entry, bodies: [first, second, { ...third, paper: false }] }, accept),
    ).toBe(false);
    const wide = { ...first, hollow: { offset: 0.1, radius: 2.4 } };
    const off = { ...first, hollow: { offset: 0.6, radius: 1 } };
    expect(bearsOut({ ...entry, bodies: [wide, off, open] }, accept)).toBe(false);
  });

  it('refuse a malformed registry', () => {
    expect(() => loadOrbitHollows({ ...data, hollows: [{ id: 1 }] })).toThrow(/art:hollows/);
    expect(() => loadOrbitHollows({ ...data, schemaVersion: 2 })).toThrow(/malformed/);
  });
});
