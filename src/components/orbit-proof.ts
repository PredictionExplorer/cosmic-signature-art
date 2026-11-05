import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { Comparison, MeasurementKey, OrbitGeneration, Progress } from '@/lib/physics/orbit';

/*
  The proof, in words: what the orbit section (orbit-score.tsx) and Verify an orbit
  (orbit-verifier.tsx) both print of one derivation. The published record as text, each
  measurement's label, the worker's progress, a value derived here that differs, and the
  verdict. One module, so the two pages never word the same check two ways.
*/

export const MINUS = '−';
/** A double at full precision, its sign a true minus. */
export const exact = (value: number) => (value < 0 ? `${MINUS}${-value}` : String(value));
/** A pair of bodies as a reader numbers them: bodies 0 and 2 are "1–3". */
export const pairWords = (pair: readonly number[]) => pair.map((body) => body + 1).join('–');
/** The seed, shortened: "0x4a0d…f5b5". */
export const seedShort = (seed: string) => `${seed.slice(0, 6)}…${seed.slice(-4)}`;

/** The worker is a module of its own; tests replace the global Worker. */
export function orbitWorker(): Worker {
  return new Worker(new URL('../lib/physics/orbit.worker.ts', import.meta.url), { type: 'module' });
}

/** Every measurement the record publishes, in the order the proof prints it: the fate last. */
export const MEASUREMENTS = [
  'mass1',
  'mass2',
  'mass3',
  'totalEnergy',
  'angularMomentum',
  'closestDistance',
  'closestWhere',
  'syzygies',
  'braidCrossings',
  'braidWord',
  'fate',
] as const satisfies readonly MeasurementKey[];

export function measurementLabels(t: Messages): Record<MeasurementKey, string> {
  return {
    mass1: fill(t.orbitMass, { n: 1 }),
    mass2: fill(t.orbitMass, { n: 2 }),
    mass3: fill(t.orbitMass, { n: 3 }),
    totalEnergy: t.orbitEnergy,
    angularMomentum: t.orbitMomentum,
    closestDistance: t.orbitClosest,
    closestWhere: t.orbitClosestWhere,
    syzygies: t.orbitSyzygies,
    braidCrossings: t.orbitBraidCrossings,
    braidWord: t.orbitBraidWord,
    fate: t.orbitFate,
  };
}

/** The published record as the proof prints it: doubles in full, counts in the reader's digits. */
export function recordValues(
  { published, fate }: Pick<WorkOrbit, 'published' | 'fate'>,
  t: Messages,
  number: Intl.NumberFormat,
): Record<MeasurementKey, string> {
  const closest = published.closestApproach;
  return {
    mass1: exact(published.masses[0]),
    mass2: exact(published.masses[1]),
    mass3: exact(published.masses[2]),
    totalEnergy: exact(published.totalEnergy),
    angularMomentum: exact(published.angularMomentum),
    closestDistance: exact(closest.distance),
    closestWhere: fill(t.orbitBodiesAt, {
      pair: pairWords(closest.pair),
      step: number.format(closest.step),
    }),
    syzygies: number.format(published.syzygyCount),
    braidCrossings: number.format(published.braid.crossings),
    braidWord: `${published.braid.word}${published.braid.truncated ? ' …' : ''}`,
    fate:
      fate.outcome === 'ejection'
        ? fill(t.orbitFateEjection, {
            body: (fate.escaper ?? 0) + 1,
            step: number.format(fate.ejectionStep ?? 0),
          })
        : fill(t.orbitFateDance, { steps: number.format(fate.horizonSteps) }),
  };
}

/** A value derived here that differs from the record, as the proof sets it beneath the record's. */
export function derivedValue(row: Comparison, t: Messages) {
  return fill(t.orbitDerivedValue, { value: row.derived.replace(/^-/, MINUS) });
}

/**
 * The worker's progress in words: the candidates read from the seed up to the chosen one, the
 * chosen one's warm-up, the recorded window, and the second pass that follows the crossings.
 */
export function progressText(
  progress: Progress,
  generation: Pick<OrbitGeneration, 'selectedIndex'>,
  t: Messages,
  number: Intl.NumberFormat,
): string {
  const done = number.format(progress.done);
  const total = number.format(progress.total);
  switch (progress.phase) {
    case 'beginnings':
      return fill(t.orbitProgressBeginnings, { done, total });
    case 'warm-up':
      return fill(t.orbitProgressWarmUp, {
        index: number.format(generation.selectedIndex),
        done,
        total,
      });
    case 'window':
      return fill(t.orbitProgressWindow, { done, total });
    case 'braid':
      return fill(t.orbitProgressBraid, { done, total });
  }
}

/** The verdict on the rows checked: every one is the record, or so many of them differ. */
export function verdict(rows: readonly Comparison[], t: Messages): string {
  const differing = rows.filter((row) => !row.exact).length;
  return differing
    ? fill(t.orbitSomeDiffer, { count: differing, total: rows.length })
    : t.orbitAllExact;
}
