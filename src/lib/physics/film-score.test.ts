import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  SCORE_PAIRS,
  SCORE_SAMPLES,
  closestApproachSeconds,
  filmShare,
  markedAt,
  markedFrom,
  pairName,
  physicsAt,
  scoreClock,
  showsClosestApproach,
  type FilmScore,
} from './film-score';
import { PAIRS } from './orbit';
import { scoreWindow } from './score-window';
import { lightFilmDuration, lightFilmSeconds } from './light-film';

const scores = new Map<number, FilmScore>();
function scored(id: number) {
  if (!scores.has(id)) scores.set(id, scoreWindow(performedOrbits([id])[0].window));
  return scores.get(id)!;
}

describe('a Light film’s score', () => {
  // A calm eternal dance, one with a syzygy, and an ejection that rolled a Duet.
  it.each([31, 60, 71])(
    'measures № %i’s window from its verified first state as the record does',
    (id) => {
      const published = workOrbit(id)!.published;
      const score = scored(id);
      expect(score.closestApproach).toEqual({
        distance: published.closestApproach.distance,
        pair: [...published.closestApproach.pair],
        step: published.closestApproach.step,
      });
      expect(score.syzygies).toHaveLength(published.syzygyCount);
      expect(score.crossings).toHaveLength(published.braid.crossings);
      // A few kilobytes: about two thousand samples of three separations.
      expect(score.count).toBe(Math.ceil(score.steps / score.stride));
      expect(Math.abs(score.count - SCORE_SAMPLES)).toBeLessThanOrEqual(1);
      expect(score.separations).toHaveLength(score.count * 3);
    },
    30_000,
  );

  it('samples the pairs in the order the generator lists them, and names them from one', () => {
    expect(SCORE_PAIRS).toEqual(PAIRS);
    expect(SCORE_PAIRS.map(pairName)).toEqual(['1–2', '1–3', '2–3']);
  });

  it('places every step on the film’s own clock', () => {
    const score = scored(31);
    expect(filmShare(score, 0)).toBe(0);
    expect(filmShare(score, score.steps - 1)).toBeCloseTo(
      (lightFilmDuration(score.steps) - 1 / 60) / lightFilmDuration(score.steps),
      9,
    );
    expect(closestApproachSeconds(score)).toBe(
      lightFilmSeconds(score.closestApproach.step, score.steps),
    );
  });

  it('reads the pair nearest each other at any moment, the closest approach included', () => {
    const score = scored(31);
    const { pair, distance } = physicsAt(score, closestApproachSeconds(score));
    expect(pair).toEqual(score.closestApproach.pair);
    // The nearest sample falls within a stride of the closest step itself.
    expect(distance).toBeGreaterThanOrEqual(score.closestApproach.distance * 0.999);
    expect(distance).toBeLessThan(score.closestApproach.distance * 1.5);
    // Before the film begins and after it ends, the first and last samples answer.
    expect(physicsAt(score, -5)).toEqual(physicsAt(score, 0));
    expect(physicsAt(score, 999).distance).toBeGreaterThan(0);
  });
});

describe('the clock a film keeps', () => {
  const ink = { firstInked: 71, films: ['a'.repeat(64), 'b'.repeat(64)] };
  const steps = 1_000_000;

  it('is the Light film’s for every Light film, and the Ink film’s only on a film checked against it', () => {
    expect(scoreClock({ ink }, 'light', {})).toEqual({ material: 'light', from: 0 });
    expect(scoreClock({}, 'light', { sha256: 'c'.repeat(64) })).toEqual({
      material: 'light',
      from: 0,
    });
    expect(scoreClock({ ink }, 'ink', { sha256: 'b'.repeat(64) })).toEqual({
      material: 'ink',
      from: 71,
    });
    expect(scoreClock({ ink }, 'ink', { sha256: 'c'.repeat(64) })).toBeNull();
    expect(scoreClock({ ink }, 'ink', {})).toBeNull();
    expect(scoreClock({}, 'ink', { sha256: 'a'.repeat(64) })).toBeNull();
    expect(scoreClock({ ink }, 'sweep', { sha256: 'a'.repeat(64) })).toBeNull();
    expect(scoreClock(undefined, 'light', {})).toBeNull();
    expect(scoreClock({ ink }, 'light', undefined)).toBeNull();
  });

  it('marks the Ink film from its first ink, and shows the closest approach only after it', () => {
    const light = { material: 'light' as const, from: 0 };
    const inked = { material: 'ink' as const, from: 71 };
    expect(markedAt(light, 0)).toBe(true);
    expect(markedAt(inked, 70 / 60)).toBe(false);
    expect(markedAt(inked, 71 / 60)).toBe(true);
    expect(markedFrom(light, { steps })).toBe(0);
    expect(markedFrom(inked, { steps })).toBe(71 / 1802);
    // № 031's closest approach, first shown on frame 460, after its first ink at 71.
    const closest = { steps, closestApproach: { step: 255_842 } };
    expect(showsClosestApproach(inked, closest)).toBe(true);
    expect(showsClosestApproach({ material: 'ink', from: 461 }, closest)).toBe(false);
    expect(showsClosestApproach({ material: 'ink', from: 460 }, closest)).toBe(true);
    expect(showsClosestApproach(light, { steps, closestApproach: { step: 32 } })).toBe(true);
  });
});
