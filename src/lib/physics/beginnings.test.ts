import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import {
  BEGINNINGS_CHUNK,
  deriveBeginnings,
  passesQuickGate,
  QUICK_GATE,
  type BeginningsChunk,
} from './beginnings';
import {
  drawProfileAndWeights,
  energyAndMomentum,
  randomBodies,
  seedBytes,
  seedStream,
  shiftToCentreOfMass,
} from './orbit';

describe('the quick gate', () => {
  it('keeps a beginning whose energy is at most 10 and whose momentum is at least 10', () => {
    expect(QUICK_GATE).toEqual({ maxEnergy: 10, minAngularMomentum: 10 });
    expect(passesQuickGate(10, 10)).toBe(true);
    expect(passesQuickGate(-2142.8907060284882, 45072.95196766655)).toBe(true);
    expect(passesQuickGate(10.000000000000002, 10)).toBe(false);
    expect(passesQuickGate(-5, 9.999999999999998)).toBe(false);
  });

  it('compares as the generator does, so a beginning it cannot measure is not discarded', () => {
    expect(passesQuickGate(NaN, 10)).toBe(true);
    expect(passesQuickGate(0, NaN)).toBe(true);
  });
});

describe('every beginning of a work', () => {
  it('walks № 031’s hundred thousand in chunks and meets the chosen one at its published values', () => {
    const orbit = workOrbit(31)!;
    const chunks: BeginningsChunk[] = [];
    const walk = deriveBeginnings(orbit.generation, { onChunk: (chunk) => chunks.push(chunk) });
    expect(walk.count).toBe(100_000);
    expect(walk.passed).toBe(100_000);
    expect(walk.attempt).toBe(0);
    expect(walk.profileDraws).toBe(23);
    // For № 031 the gate's measurement is the record's, bit for bit.
    expect(walk.chosen).toEqual({
      index: 77_741,
      energy: -2142.8907060284882,
      angularMomentum: 45072.95196766655,
      passed: true,
      masses: [...orbit.published.masses],
      massesExact: true,
    });
    expect(walk.chosen.energy).toBe(orbit.published.totalEnergy);
    expect(walk.chosen.angularMomentum).toBe(orbit.published.angularMomentum);

    // Forty consecutive chunks of 2,500, the chosen one where its index says.
    expect(BEGINNINGS_CHUNK).toBe(2_500);
    expect(chunks).toHaveLength(40);
    expect(chunks.map((chunk) => chunk.start)).toEqual(
      Array.from({ length: 40 }, (_, k) => k * 2_500),
    );
    for (const chunk of chunks) {
      expect(chunk.energies).toHaveLength(2_500);
      expect(chunk.momenta).toHaveLength(2_500);
      expect(chunk.passed).toHaveLength(2_500);
    }
    const holder = chunks[Math.floor(77_741 / 2_500)];
    expect(holder.energies[77_741 - holder.start]).toBe(walk.chosen.energy);
    expect(holder.momenta[77_741 - holder.start]).toBe(walk.chosen.angularMomentum);
    const passing = chunks.reduce((sum, chunk) => sum + chunk.passed.reduce((a, b) => a + b, 0), 0);
    expect(passing).toBe(walk.passed);
    expect(chunks.every((chunk) => chunk.energies.every((energy) => energy < 0))).toBe(true);
  }, 30_000);

  it('measures the bodies once moved, as the gate does, not twice, as the record does', () => {
    // № 000's record measures momentum after a second move to the centre of mass and so ends
    // in a different last digit; the gate saw 101192.16682871929.
    const orbit = workOrbit(0)!;
    const chunks: BeginningsChunk[] = [];
    const walk = deriveBeginnings(orbit.generation, {
      chunk: 30_000,
      onChunk: (chunk) => chunks.push(chunk),
    });
    expect(walk.chosen.index).toBe(5_084);
    expect(walk.chosen.energy).toBe(-3123.789910594996);
    expect(walk.chosen.angularMomentum).toBe(101192.16682871929);
    expect(orbit.published.angularMomentum).toBe(101192.1668287193);
    expect(walk.chosen.massesExact).toBe(true);
    expect(walk.passed).toBe(100_000);
    // A last chunk shorter than the rest.
    expect(chunks.map((chunk) => [chunk.start, chunk.passed.length])).toEqual([
      [0, 30_000],
      [30_000, 30_000],
      [60_000, 30_000],
      [90_000, 10_000],
    ]);
  }, 30_000);

  it('walks the retry that holds the chosen candidate, from its own fork', () => {
    const orbit = workOrbit(0)!;
    // The masses attempt 1 would have chosen at the same index, read from its fork.
    const main = seedStream(seedBytes(orbit.generation.seed));
    drawProfileAndWeights(main, orbit.generation.weightsRandomized);
    const fork = main.fork('cosmic-retry/v1/1');
    fork.nextF64();
    for (let candidate = 0; candidate < orbit.generation.selectedIndex; candidate++)
      randomBodies(fork);
    const bodies = randomBodies(fork);
    shiftToCentreOfMass(bodies);
    const generation = { ...orbit.generation, retryCount: 1, masses: bodies.masses };
    const walk = deriveBeginnings(generation, { chunk: 50_000 });
    expect(walk.attempt).toBe(1);
    expect(walk.chosen.massesExact).toBe(true);
    expect(walk.chosen.energy).toBe(energyAndMomentum(bodies).energy);
    expect(walk.chosen.angularMomentum).toBe(energyAndMomentum(bodies).angularMomentum);
  }, 30_000);

  it('says when the chosen masses are not the published ones', () => {
    const orbit = workOrbit(31)!;
    const generation = {
      ...orbit.generation,
      candidatesPerAttempt: 77_742,
      masses: [1, 2, 3] as const,
    };
    const walk = deriveBeginnings(generation);
    expect(walk.count).toBe(77_742);
    expect(walk.chosen.massesExact).toBe(false);
  }, 30_000);

  it('refuses a record whose chosen index lies beyond its beginnings', () => {
    const orbit = workOrbit(31)!;
    expect(() =>
      deriveBeginnings({ ...orbit.generation, candidatesPerAttempt: 10, selectedIndex: 10 }),
    ).toThrow(/beyond/);
  });
});
