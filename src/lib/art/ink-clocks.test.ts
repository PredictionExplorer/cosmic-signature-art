import { describe, expect, it } from 'vitest';
import raw from './ink-clocks.json' with { type: 'json' };
import clipsRaw from './plate-clips.json' with { type: 'json' };
import { bindInkClock, inkClock, loadInkClocks } from './ink-clocks';
import { workOrbit } from './orbit-records';
import { inkFilmFirstInked } from '@/lib/physics/ink-film';
import { lightFilmFrames } from '@/lib/physics/light-film';

const clocks = loadInkClocks(raw);

describe('the Ink films’ clocks', () => {
  it('bind every work’s Ink film, its first ink re-derived from its certificate’s duration and pre-roll', () => {
    expect(clocks.size).toBe(72);
    for (const [id, entry] of clocks) {
      const clock = inkClock(id)!;
      expect(clock).toBeDefined();
      expect(entry.frames).toBe(lightFilmFrames(entry.steps));
      expect(clock.firstInked).toBe(
        inkFilmFirstInked(entry.steps, Number(entry.duration), Number(entry.preRoll)),
      );
      // Bare paper for at least the first two thirds of a second, and ink well before the end.
      expect(clock.firstInked).toBeGreaterThan(40);
      expect(clock.firstInked).toBeLessThan(entry.frames / 4);
      expect(clock.films[0]).toBe(entry.film.sha256);
    }
    expect(inkClock(31)!.firstInked).toBe(71);
    expect(inkClock(9999)).toBeUndefined();
  });

  it('name every Ink plate’s settling clip among the films on the clock', () => {
    const settling = clipsRaw.clips.filter(
      (clip) => clip.expression === 'ink' && clip.kind === 'settling',
    );
    expect(settling).toHaveLength(72);
    for (const clip of settling) expect(inkClock(clip.id)!.films).toContain(clip.sha256);
  });

  it('drop an entry another record, or a malformed one, would leave', () => {
    const entry = clocks.get(31)!;
    expect(bindInkClock(entry, 31)).toEqual(inkClock(31));
    expect(bindInkClock({ ...entry, seed: `0x${'0'.repeat(64)}` }, 31)).toBeUndefined();
    expect(bindInkClock({ ...entry, traitsSha256: '0'.repeat(64) }, 31)).toBeUndefined();
    expect(bindInkClock({ ...entry, steps: 999_999 }, 31)).toBeUndefined();
    expect(bindInkClock({ ...entry, firstInked: entry.frames }, 31)).toBeUndefined();
    expect(bindInkClock(entry, 32)).toBeUndefined();
    expect(bindInkClock(undefined, 31)).toBeUndefined();
    expect(workOrbit(31)!.generation.steps).toBe(entry.steps);
    expect(() => loadInkClocks({ ...raw, clocks: [{ ...entry, firstInked: -1 }] })).toThrow(
      /art:ink/,
    );
  });
});
