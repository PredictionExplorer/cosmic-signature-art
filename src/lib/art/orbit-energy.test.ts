import { describe, expect, it } from 'vitest';
import raw from './orbit-energy.json' with { type: 'json' };
import { bindEnergy, loadOrbitEnergies, workEnergy } from './orbit-energy';
import { orbitIds, workOrbit } from './orbit-records';
import { performedOrbits } from './orbit-windows';
import { ENERGY_HELD_WITHIN, deriveFate } from '@/lib/physics/orbit';

const energies = loadOrbitEnergies(raw);

describe('the energy each computation kept', () => {
  it('is measured for every work of the collection, against today’s tolerance', () => {
    expect([...energies.keys()]).toEqual(orbitIds());
    expect(energies.size).toBe(72);
    expect(Number(raw.heldWithin)).toBe(ENERGY_HELD_WITHIN);
    for (const id of energies.keys()) expect(workEnergy(id)).toBeDefined();
  });

  it('is what the browser’s own fate run finds, to the last bit', () => {
    // № 054 keeps its energy to its ejection; № 004 loses it 535,000 steps past its window.
    for (const id of [54, 4]) {
      const orbit = workOrbit(id)!;
      const [performed] = performedOrbits([id]);
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
        },
      );
      expect(workEnergy(id)).toEqual(fate.energy);
    }
    expect(workEnergy(54)!.broken).toBeNull();
    expect(workEnergy(4)!.broken).toMatchObject({ step: 1_535_000 });
    // Two fate runs of over a million steps each: seconds under CI's coverage.
  }, 30_000);

  it('counts as lost the fifteen runs whose energy moved by more than a part in a thousand', () => {
    const broken = orbitIds().filter((id) => workEnergy(id)!.broken);
    const fateOf = (id: number) => workOrbit(id)!.fate.outcome;
    expect(broken.filter((id) => fateOf(id) === 'ejection')).toEqual([
      4, 20, 22, 24, 53, 57, 58, 64, 66,
    ]);
    expect(broken.filter((id) => fateOf(id) === 'eternal_dance')).toEqual([21, 26, 44, 46, 55, 68]);
    // Three of them lose it inside the recorded window itself.
    expect(
      broken.filter((id) => workEnergy(id)!.broken!.step <= workOrbit(id)!.generation.steps),
    ).toEqual([22, 66, 68]);
    // The audit's other three windows (docs/after-the-frame.md §1.3) hold a smaller step in
    // their energy, inside the tolerance, and count as kept.
    for (const id of [32, 50, 65]) {
      const { windowChange, broken: lost } = workEnergy(id)!;
      expect(lost).toBeNull();
      expect(windowChange).toBeGreaterThan(1e-5);
      expect(windowChange).toBeLessThan(ENERGY_HELD_WITHIN);
    }
  });

  it('refuses a file that is malformed, or measured against another tolerance', () => {
    expect(() => loadOrbitEnergies({ ...raw, schemaVersion: 2 })).toThrow(/art:energy/);
    expect(() => loadOrbitEnergies({ ...raw, heldWithin: '0.01' })).toThrow(/stale/);
    const [first, ...rest] = raw.energies;
    expect(() =>
      loadOrbitEnergies({ ...raw, energies: [{ ...first, change: '-1' }, ...rest] }),
    ).toThrow(/malformed/);
  });

  it('refuses an entry at odds with itself, as a hand could leave one', () => {
    const withEntry = (id: number, change: object) => ({
      ...raw,
      energies: raw.energies.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    });
    // № 013 keeps its energy; № 004 loses it at step 1,535,000.
    expect(energies.get(13)!.broken).toBeNull();
    const lost = raw.energies.find((entry) => entry.id === 4)!.broken!;
    // Kept, beside a change that is not.
    expect(() => loadOrbitEnergies(withEntry(13, { change: '0.5' }))).toThrow(/malformed/);
    // A window that moved more than its whole run.
    expect(() => loadOrbitEnergies(withEntry(13, { windowChange: '9e-4' }))).toThrow(/malformed/);
    // Lost, at a change inside the tolerance, or greater than the run's own.
    expect(() =>
      loadOrbitEnergies(withEntry(4, { broken: { ...lost, change: '0.0005' } })),
    ).toThrow(/malformed/);
    expect(() => loadOrbitEnergies(withEntry(4, { broken: { ...lost, change: '1e9' } }))).toThrow(
      /malformed/,
    );
    // The same entries as committed are read.
    expect(() => loadOrbitEnergies(withEntry(13, {}))).not.toThrow();
  });

  it('binds an entry only while its seed and trait file are the record’s', () => {
    const entry = energies.get(31)!;
    expect(bindEnergy(entry, 31)).toEqual({
      first: entry.first,
      windowChange: entry.windowChange,
      change: entry.change,
      broken: null,
    });
    expect(bindEnergy({ ...entry, seed: `0x${'0'.repeat(64)}` }, 31)).toBeUndefined();
    expect(bindEnergy({ ...entry, traitsSha256: '0'.repeat(64) }, 31)).toBeUndefined();
    expect(bindEnergy(undefined, 31)).toBeUndefined();
    expect(workEnergy(9_999)).toBeUndefined();
  });
});
