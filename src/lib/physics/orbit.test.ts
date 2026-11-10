import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  CHECK_INTERVAL,
  ENERGY_HELD_WITHIN,
  ENERGY_INTERVAL,
  EnergyWatch,
  FateWatch,
  HYSTERESIS,
  chosenBeginning,
  compare,
  compareFate,
  deriveFate,
  drawProfileAndWeights,
  energyAndMomentum,
  escapingBody,
  rederive,
  seedBytes,
  seedStream,
  sha3_256,
  shiftToCentreOfMass,
  type SeedStream,
} from './orbit';

/** Deterministic bytes without Math.random, so a failure names its own input. */
function bytes(length: number, salt: number) {
  return Uint8Array.from({ length }, (_, i) => (i * 131 + salt * 17 + (i >> 3)) & 255);
}

describe('the SHA3-256 the seeded stream is built on', () => {
  it.each([0, 1, 31, 32, 63, 64, 96, 135, 136, 137, 271, 272, 300])(
    'matches FIPS 202 for %i bytes, whole or in parts',
    (length) => {
      const message = bytes(length, length);
      const expected = createHash('sha3-256').update(message).digest('hex');
      const whole = Buffer.from(sha3_256([message])).toString('hex');
      const split = Buffer.from(
        sha3_256([message.subarray(0, length >> 1), message.subarray(length >> 1)]),
      ).toString('hex');
      expect(whole).toBe(expected);
      expect(split).toBe(expected);
    },
  );
});

describe('the seeded stream', () => {
  it('hashes the seed, then the seed twice with the first buffer, then seed and buffer', () => {
    const seed = seedBytes('0x1234');
    const stream = seedStream(seed);
    const sha = (...parts: Uint8Array[]) =>
      createHash('sha3-256').update(Buffer.concat(parts)).digest();
    const first = sha(seed);
    const second = sha(seed, seed, first);
    const third = sha(seed, second);
    const u64 = (buffer: Buffer, offset: number) =>
      Number(buffer.readBigUInt64LE(offset)) / 18446744073709551616;
    const draws = Array.from({ length: 12 }, () => stream.nextF64());
    const expected = [first, second, third].flatMap((buffer) =>
      [0, 8, 16, 24].map((o) => u64(buffer, o)),
    );
    expect(draws).toEqual(expected);
  });

  it('forks from the original seed and a domain', () => {
    const seed = seedBytes('0xabcd');
    const fork = seedStream(seed).fork('cosmic-retry/v1/1');
    const derived = createHash('sha3-256')
      .update(
        Buffer.concat([Buffer.from(seed), Buffer.from([0]), Buffer.from('cosmic-retry/v1/1')]),
      )
      .digest();
    expect(fork.nextF64()).toBe(seedStream(derived).nextF64());
  });

  it('refuses a seed that is not whole bytes of hex', () => {
    expect(() => seedBytes('0x123')).toThrow();
    expect(() => seedBytes('0xzz')).toThrow();
  });
});

describe('the draws before the candidates', () => {
  const scripted = (values: number[]): SeedStream => {
    let index = 0;
    return { nextF64: () => values[index++] ?? 0.5, fork: () => scripted([]) };
  };
  it('reads six base parameters, the structure, fifteen mode rolls and the Borda weights', () => {
    expect(drawProfileAndWeights(scripted([0, 0, 0, 0, 0, 0, 0.5]), true)).toBe(23);
    expect(drawProfileAndWeights(scripted([0, 0, 0, 0, 0, 0, 0.5]), false)).toBe(22);
  });
  it('reads one more for a Duet, whose structure roll falls in [0.35, 0.38)', () => {
    expect(drawProfileAndWeights(scripted([0, 0, 0, 0, 0, 0, 0.35]), true)).toBe(24);
    expect(drawProfileAndWeights(scripted([0, 0, 0, 0, 0, 0, 0.379]), true)).toBe(24);
    expect(drawProfileAndWeights(scripted([0, 0, 0, 0, 0, 0, 0.38]), true)).toBe(23);
  });
});

describe('the re-derivation, against the published record', () => {
  // A low index, a calm eternal dance, an orbit with a syzygy, and a Duet (24 draws).
  it.each([0, 31, 60, 71])(
    'derives № %i exactly',
    (id) => {
      const orbit = workOrbit(id)!;
      const derived = rederive(orbit.generation, { stride: 1_000 });
      const rows = compare(orbit.published, derived);
      expect(rows.filter((row) => !row.exact)).toEqual([]);
      expect(rows).toHaveLength(10);
      expect(derived.profileDraws).toBe(id === 71 ? 24 : 23);
      expect(derived.samples.count).toBe(1_000);
      expect(derived.syzygies).toHaveLength(orbit.published.syzygyCount);
    },
    30_000,
  );

  it('says when a published measurement differs, and by how much', () => {
    const orbit = workOrbit(0)!;
    const derived = rederive(orbit.generation, { stride: 1_000_000 });
    const altered = {
      ...orbit.published,
      totalEnergy: orbit.published.totalEnergy + 1e-9,
      braid: { ...orbit.published.braid, word: 's1' },
    };
    const differing = compare(altered, derived).filter((row) => !row.exact);
    expect(differing.map((row) => row.key)).toEqual(['totalEnergy', 'braidWord']);
    expect(differing[0].derived).toBe(String(orbit.published.totalEnergy));
  }, 30_000);

  it('finds the attempt by its masses only when retries ran', () => {
    const orbit = workOrbit(0)!;
    const retried = { ...orbit.generation, retryCount: 1 };
    expect(chosenBeginning(retried).attempt).toBe(0);
    const unknown = { ...retried, masses: [1, 2, 3] as const };
    expect(() => chosenBeginning(unknown)).toThrow(/No attempt/);
  });

  it('measures energy and momentum after one more move to the centre of mass', () => {
    const orbit = workOrbit(31)!;
    const { bodies } = chosenBeginning(orbit.generation);
    shiftToCentreOfMass(bodies);
    expect(energyAndMomentum(bodies)).toEqual({
      energy: orbit.published.totalEnergy,
      angularMomentum: orbit.published.angularMomentum,
    });
  });
});

describe('the fate, as the generator classifies it', () => {
  // Two heavy bodies a unit apart, and a light one beside them.
  const masses = [100, 100, 1] as const;
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const at = (speed: number) => [0, 0, 0, 0, 0, 0, speed, 0, 0];

  it('names the first body whose energy in the centre-of-mass frame exceeds the threshold', () => {
    expect(escapingBody(masses, positions, at(0), -0.3)).toBeNull();
    expect(escapingBody(masses, positions, at(100), -0.3)).toBe(2);
    // The frame is taken on a copy: the bodies handed in are not moved.
    const velocities = at(100);
    escapingBody(masses, positions, velocities, -0.3);
    expect(velocities).toEqual(at(100));
  });

  it('leaves out the pull of a body closer than the generator’s floor', () => {
    // Bodies 1 and 2 coincide, so only the far third binds them, by 9.8 / 100: too little.
    const together = [0, 0, 0, 0, 0, 0, 100, 0, 0];
    expect(escapingBody([1, 1, 1], together, [0, 0, 0, 0, 0, 0, 0, 0, 0], -0.3)).toBe(0);
  });

  it('asks on the generator’s rhythm and dates an escape by the first of five answers', () => {
    expect([1, 10_000, 10_001, 20_001, 20_002].map((taken) => FateWatch.asks(taken))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    const watch = new FateWatch(masses, -0.3);
    const ask = (round: number, speed: number) =>
      watch.observe(round * CHECK_INTERVAL + 1, positions, at(speed));
    expect(ask(1, 100)).toBeNull();
    expect(ask(2, 0)).toBeNull();
    expect(watch.run).toBe(0);
    for (let round = 3; round < 3 + HYSTERESIS - 1; round++) expect(ask(round, 100)).toBeNull();
    expect(ask(3 + HYSTERESIS - 1, 100)).toEqual({ escaper: 2, ejectionStep: 3 * CHECK_INTERVAL });
    // Between the rhythm's beats the watch does not ask; once confirmed, the answer stands.
    expect(watch.observe(5, positions, at(0))).toEqual(watch.ejection);
  });

  it('meets № 054’s published ejection from the first step of its window', () => {
    const orbit = workOrbit(54)!;
    const [performed] = performedOrbits([54]);
    const fate = deriveFate(
      {
        masses: orbit.published.masses,
        dt: orbit.generation.dt,
        positions: performed.window.positions,
        velocities: performed.window.velocities,
      },
      {
        steps: orbit.generation.steps,
        threshold: orbit.fate.escapeThreshold,
        horizonSteps: orbit.fate.horizonSteps,
        lead: 30_000,
      },
    );
    expect(compareFate(orbit.fate, fate)).toEqual({
      key: 'fate',
      derived: `ejection ${orbit.fate.escaper}@${orbit.fate.ejectionStep}`,
      published: `ejection ${orbit.fate.escaper}@${orbit.fate.ejectionStep}`,
      exact: true,
    });
    // The approach is kept on the rhythm, at least the lead before the escape and never inside
    // the window; the window's end is kept for After the frame.
    expect(fate.approach!.taken % CHECK_INTERVAL).toBe(0);
    expect(fate.approach!.taken).toBeLessThanOrEqual(fate.ejectionStep! - 30_000);
    expect(fate.approach!.taken).toBeGreaterThanOrEqual(orbit.generation.steps);
    expect(fate.windowEnd.positions).toHaveLength(9);
  });

  it('calls a bound orbit an eternal dance through its horizon, and says when a fate differs', () => {
    const orbit = workOrbit(31)!;
    const [performed] = performedOrbits([31]);
    const fate = deriveFate(
      {
        masses: orbit.published.masses,
        dt: orbit.generation.dt,
        positions: performed.window.positions,
        velocities: performed.window.velocities,
      },
      {
        steps: orbit.generation.steps,
        threshold: orbit.fate.escapeThreshold,
        horizonSteps: orbit.generation.steps + 50_000,
      },
    );
    expect(fate).toMatchObject({ outcome: 'eternal_dance', escaper: null, approach: null });
    const row = compareFate(orbit.fate, fate);
    expect(row.exact).toBe(false);
    expect(row.published).toBe('eternal_dance through 8000000');
    expect(row.derived).toBe('eternal_dance through 1050000');
  });
});

describe('the energy the computation keeps', () => {
  /** A work's fate run from its window's first step, to its own horizon or a nearer one. */
  function fateOf(id: number, horizonSteps?: number) {
    const orbit = workOrbit(id)!;
    const [performed] = performedOrbits([id]);
    return deriveFate(
      {
        masses: orbit.published.masses,
        dt: orbit.generation.dt,
        positions: performed.window.positions,
        velocities: performed.window.velocities,
      },
      {
        steps: orbit.generation.steps,
        threshold: orbit.fate.escapeThreshold,
        horizonSteps: horizonSteps ?? orbit.fate.horizonSteps,
      },
    );
  }

  it('asks every thousand steps how far the energy stands from its first value', () => {
    // Two unit masses two apart, at rest: the energy is the pull between them, −9.8 / 2.
    const positions = Float64Array.from([-1, 0, 0, 1, 0, 0, 0, 1e6, 0]);
    const velocities = new Float64Array(9);
    const watch = new EnergyWatch([1, 1, 1e-12], positions, velocities, 2 * ENERGY_INTERVAL);
    expect(watch.kept.first).toBeCloseTo(-4.9, 9);
    // Between its beats it only notes how close the bodies come.
    positions[0] = -0.25;
    positions[3] = 0.25;
    watch.observe(1);
    positions[0] = -1;
    positions[3] = 1;
    velocities[0] = 0.01;
    watch.observe(ENERGY_INTERVAL);
    // Half a unit of mass at a hundredth of a unit of speed: far inside the tolerance.
    expect(watch.kept.change).toBeCloseTo((0.5 * 0.01 ** 2) / 4.9, 12);
    expect(watch.kept.windowChange).toBe(watch.kept.change);
    expect(watch.kept.broken).toBeNull();
    // Past the window the watch goes on; a change over the tolerance is dated once, with the
    // closest pass since it last asked.
    positions[0] = -0.5;
    watch.observe(2 * ENERGY_INTERVAL + 1);
    velocities[0] = 1;
    positions[0] = -1;
    watch.observe(3 * ENERGY_INTERVAL);
    expect(watch.kept.windowChange).toBeLessThan(ENERGY_HELD_WITHIN);
    expect(watch.kept.change).toBeCloseTo(0.5 / 4.9, 9);
    expect(watch.kept.broken).toEqual({
      step: 3 * ENERGY_INTERVAL,
      change: watch.kept.change,
      closest: 1.5,
    });
    velocities[0] = 2;
    watch.observe(4 * ENERGY_INTERVAL);
    expect(watch.kept.broken!.step).toBe(3 * ENERGY_INTERVAL);
  });

  it('finds № 054’s energy held to nine digits, to its ejection', () => {
    const fate = fateOf(54);
    expect(fate.ejectionStep).toBe(1_090_000);
    expect(fate.energy.broken).toBeNull();
    expect(fate.energy.change).toBeLessThan(1e-9);
    expect(fate.energy.first).toBeCloseTo(-2864.2062873, 6);
  });

  it('finds № 004’s ejection a pass the fixed step could not follow', () => {
    const fate = fateOf(4);
    // The record dates an ejection, and the derivation meets it to the step…
    expect(compareFate(workOrbit(4)!.fate, fate).exact).toBe(true);
    // …but the window held, and 535,000 steps past it two bodies pass a ninth of a unit apart.
    expect(fate.energy.windowChange).toBeLessThan(1e-9);
    expect(fate.energy.broken!.step).toBe(1_535_000);
    expect(fate.energy.broken!.closest).toBeCloseTo(0.11436, 4);
    // The computed energy, negative for a bound triple, is by then several times over positive.
    expect(fate.energy.broken!.change).toBeGreaterThan(7);
    expect(fate.energy.change).toBeGreaterThan(12);
  });

  it('finds the break inside № 022’s recorded window', () => {
    const fate = fateOf(22, 1_050_000);
    expect(fate.energy.broken!.step).toBe(44_000);
    expect(fate.energy.broken!.closest).toBeCloseTo(0.18505, 4);
    expect(fate.energy.windowChange).toBeCloseTo(0.5753, 3);
  });
});
