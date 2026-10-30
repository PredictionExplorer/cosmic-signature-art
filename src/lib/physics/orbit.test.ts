import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import {
  chosenBeginning,
  compare,
  drawProfileAndWeights,
  energyAndMomentum,
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
