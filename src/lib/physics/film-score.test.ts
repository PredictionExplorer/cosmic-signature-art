import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  SCORE_PAIRS,
  SCORE_SAMPLES,
  closestApproachSeconds,
  filmShare,
  pairName,
  physicsAt,
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
