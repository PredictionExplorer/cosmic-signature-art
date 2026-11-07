import { describe, expect, it } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import frames from '@/lib/art/orbit-frames.json' with { type: 'json' };
import {
  DriftPath,
  MAX_ARC_FRACTION,
  driftOrientation,
  driftParameters,
  normalizeAngle,
  orbitalAxes,
  orientationMatrix,
  randomDriftConfig,
  solveKepler,
  type Drift,
} from './drift';
import { seedStream, streamAfterSearch, type SeedStream } from './orbit';

const scripted = (values: number[]): SeedStream => {
  let index = 0;
  return { nextF64: () => values[index++] ?? 0.5, fork: () => scripted([]) };
};

describe('the drift a seed draws (drift_config.rs)', () => {
  it('reads scale, sweep and eccentricity in that order, in their curated ranges', () => {
    expect(randomDriftConfig(scripted([0, 0, 0]))).toEqual({
      scale: 0.85,
      arcFraction: 0,
      eccentricity: 0.4,
    });
    const top = randomDriftConfig(scripted([1, 0.5, 1]));
    expect(top.scale).toBeCloseTo(1.3, 15);
    expect(top.arcFraction).toBe(0.5 * 1.35);
    expect(top.eccentricity).toBeCloseTo(0.5, 15);
  });

  it('caps the sweep, scale × arc, at 1.30 without moving the scale', () => {
    const capped = randomDriftConfig(scripted([1, 1, 0]));
    expect(capped.arcFraction).toBe(1.3 / capped.scale);
    // test_drift_sweep_product_stays_capped and test_drift_scale_always_above_floor
    for (let byte = 0; byte < 256; byte++) {
      const short = randomDriftConfig(seedStream(Uint8Array.from([byte, 0x5c])));
      expect(short.scale * short.arcFraction).toBeLessThanOrEqual(1.3 + 1e-12);
      const long = randomDriftConfig(seedStream(new Uint8Array(32).fill(byte)));
      expect(long.scale).toBeGreaterThanOrEqual(0.85);
      expect(long.scale).toBeLessThanOrEqual(1.3);
    }
  });

  it('clamps what it is given, as DriftParameters::new does', () => {
    expect(driftParameters({ scale: -5, arcFraction: 2, eccentricity: 1 })).toEqual({
      scale: 0,
      arcFraction: MAX_ARC_FRACTION,
      eccentricity: 0.95,
    });
    expect(driftParameters({ scale: 1, arcFraction: 1.35, eccentricity: 0.45 }).arcFraction).toBe(
      1.35,
    );
  });

  it('draws the ellipse’s orientation and starting phase next', () => {
    expect(driftOrientation(scripted([0.5, 0.5, 0.25, 1]))).toEqual({
      inclination: Math.PI / 2,
      ascendingNode: Math.PI,
      argumentOfPeriapsis: Math.PI / 2,
      initialMeanAnomaly: Math.PI,
    });
  });

  // A calm eternal dance, the day's work of the suite's venue day, and a Duet whose profile
  // reads one more draw before the candidates.
  it.each([23, 31, 71])(
    'reaches № %i’s published drift from its seed, to the last bit',
    (id) => {
      const orbit = workOrbit(id)!;
      const entry = frames.frames.find((frame) => frame.id === id)!;
      const config = randomDriftConfig(streamAfterSearch(orbit.generation));
      // The registry keeps the trait file's own values, which the build compared exactly.
      expect(config).toEqual({
        scale: Number(entry.drift.scale),
        arcFraction: Number(entry.drift.arcFraction),
        eccentricity: Number(entry.drift.eccentricity),
      });
    },
    30_000,
  );
});

describe('the drift’s ellipse (drift.rs)', () => {
  it('brings angles into [−π, π] by the remainder of a turn', () => {
    expect(normalizeAngle(0.5)).toBe(0.5);
    expect(normalizeAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 14);
    expect(normalizeAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 14);
    expect(normalizeAngle(7 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('solves Kepler’s equation, and leaves a circle’s anomaly as it is', () => {
    expect(solveKepler(1.2, 0)).toBe(1.2);
    for (const [mean, e] of [
      [0.3, 0.4],
      [-2.9, 0.5],
      [3.1, 0.45],
    ]) {
      const anomaly = solveKepler(mean, e);
      expect(anomaly - e * Math.sin(anomaly)).toBeCloseTo(mean, 11);
    }
  });

  it('sizes the ellipse by the widest span of the viewed orbit', () => {
    const { semiMajor, semiMinor } = orbitalAxes([300, -500, 200], {
      scale: 1.2,
      arcFraction: 1,
      eccentricity: 0.6,
    });
    expect(semiMajor).toBe(0.5 * 500 * 1.2);
    expect(semiMinor).toBe(semiMajor * Math.sqrt(1 - 0.36));
    expect(orbitalAxes([0, 0, 0], { scale: 0, arcFraction: 1, eccentricity: 0 })).toEqual({
      semiMajor: 0.5 * 1e-6 * 1e-6,
      semiMinor: 1e-6,
    });
  });

  it('turns the ellipse’s plane by a proper rotation', () => {
    const m = orientationMatrix({
      inclination: 0.7,
      ascendingNode: 2.1,
      argumentOfPeriapsis: -0.4,
      initialMeanAnomaly: 0,
    });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const dot = m[r * 3] * m[c * 3] + m[r * 3 + 1] * m[c * 3 + 1] + m[r * 3 + 2] * m[c * 3 + 2];
        expect(dot).toBeCloseTo(r === c ? 1 : 0, 14);
      }
  });

  const drift: Drift = {
    config: { scale: 1, arcFraction: 0.5, eccentricity: 0.4 },
    orientation: {
      inclination: 0,
      ascendingNode: 0,
      argumentOfPeriapsis: 0,
      initialMeanAnomaly: 0,
    },
    semiMajor: 100,
    semiMinor: 100 * Math.sqrt(1 - 0.16),
  };

  it('carries the camera along half a turn of its ellipse over the window', () => {
    const path = new DriftPath(drift, 1001, 0.001);
    const at = (step: number) => [...path.offset(step, new Float64Array(3))];
    // Periapsis at the start, apoapsis at the end: the mean anomaly runs from 0 to π.
    expect(at(0)[0]).toBeCloseTo(100 * (1 - 0.4), 12);
    expect(at(1000)[0]).toBeCloseTo(100 * (-1 - 0.4), 9);
    expect(at(500)[1]).toBeGreaterThan(0);
    for (const step of [0, 500, 1000]) expect(at(step)[2]).toBe(0);
  });

  it('stays put without a sweep, a scale or a second step, as the generator leaves it', () => {
    for (const [still, steps] of [
      [{ ...drift, config: { ...drift.config, arcFraction: 0 } }, 1000],
      [{ ...drift, config: { ...drift.config, scale: 0 } }, 1000],
      [{ ...drift, semiMinor: 0 }, 1000],
      [drift, 1],
    ] as const)
      expect([...new DriftPath(still, steps, 0.001).offset(9, [1, 2, 3])]).toEqual([0, 0, 0]);
  });
});
