import {
  chosenBeginning,
  drawProfileAndWeights,
  energyAndMomentum,
  randomBodies,
  seedBytes,
  seedStream,
  shiftToCentreOfMass,
  type OrbitGeneration,
} from './orbit';

/**
 * Every beginning the studio drew for a work, re-derived in the generator's order.
 *
 * select_best_trajectory_shortlist (sim.rs) draws all of an attempt's candidates from the seeded
 * stream before it simulates any: three random bodies each, moved at once to their centre of
 * mass. It then puts every one through a quick gate on its total energy and angular momentum,
 * and only the beginnings that pass are set in motion, for up to two million steps each, and
 * scored. That search cannot run in a browser; everything before it can, so this module walks
 * the candidates as the generator drew them and measures each at the gate, exactly. It imports
 * only the port in ./orbit, so the worker, the tests and Node run the same code.
 */

/** The quick gate: a beginning whose energy is above 10, or whose |L| is below 10, is discarded. */
export const QUICK_GATE = { maxEnergy: 10, minAngularMomentum: 10 } as const;

/** The generator's `e > 10.0 || ang < 10.0`, negated, so even a NaN fares as it would there. */
export function passesQuickGate(energy: number, angularMomentum: number): boolean {
  return !(energy > QUICK_GATE.maxEnergy || angularMomentum < QUICK_GATE.minAngularMomentum);
}

/** Beginnings handed on together; 2,500 make forty chunks of a hundred thousand. */
export const BEGINNINGS_CHUNK = 2_500;

/** Consecutive beginnings from `start`, each measured as the gate measures it. */
export interface BeginningsChunk {
  /** The first beginning's index in its attempt, the generator's `i`. */
  start: number;
  /** calculate_total_energy of each, on its bodies moved once to their centre of mass. */
  energies: Float64Array;
  /** The magnitude of calculate_total_angular_momentum of each, on the same bodies. */
  momenta: Float64Array;
  /** 1 where the beginning passes the quick gate, 0 where the generator discards it. */
  passed: Uint8Array;
}

/** The chosen beginning, as the gate measured it. */
export interface ChosenAtTheGate {
  index: number;
  /**
   * The gate's energy and momentum. The record measures the bodies moved to their centre of
   * mass once more, so its values can differ from these in the last bit (№ 000's momentum).
   */
  energy: number;
  angularMomentum: number;
  passed: boolean;
  masses: [number, number, number];
  /** Whether those masses are the published masses, bit for bit: the stream's own check. */
  massesExact: boolean;
}

export interface Beginnings {
  /** Beginnings drawn in the attempt that holds the chosen one. */
  count: number;
  /** How many of them pass the quick gate. */
  passed: number;
  chosen: ChosenAtTheGate;
  /** Draws the profile and weights took before the candidates. */
  profileDraws: number;
  /** The aesthetic attempt the chosen beginning came from: 0 unless retries ran. */
  attempt: number;
  milliseconds: number;
}

/**
 * Walk every beginning of the attempt that holds the chosen candidate, in the generator's order,
 * handing them on `chunk` at a time. Pure and synchronous: the browser runs it in a worker.
 */
export function deriveBeginnings(
  generation: OrbitGeneration,
  {
    chunk = BEGINNINGS_CHUNK,
    onChunk,
  }: { chunk?: number; onChunk?: (chunk: BeginningsChunk) => void } = {},
): Beginnings {
  const started = performance.now();
  // With one attempt, the chosen candidate is the first attempt's. When retries ran, the attempt
  // holding it is the one chosenBeginning finds by the published masses; each retry draws from a
  // fork of its own after one draw for its Borda weights. No work in the collection has retried.
  const attempt = generation.retryCount === 0 ? 0 : chosenBeginning(generation).attempt;
  const main = seedStream(seedBytes(generation.seed));
  const profileDraws = drawProfileAndWeights(main, generation.weightsRandomized);
  let stream = main;
  if (attempt > 0) {
    stream = main.fork(`cosmic-retry/v1/${attempt}`);
    stream.nextF64(); // retry_borda_weights
  }
  const count = generation.candidatesPerAttempt;
  const size = Math.max(1, Math.floor(chunk));
  let passed = 0;
  let chosen: ChosenAtTheGate | null = null;
  for (let start = 0; start < count; start += size) {
    const length = Math.min(size, count - start);
    const energies = new Float64Array(length);
    const momenta = new Float64Array(length);
    const flags = new Uint8Array(length);
    for (let k = 0; k < length; k++) {
      const bodies = randomBodies(stream);
      shiftToCentreOfMass(bodies);
      const { energy, angularMomentum } = energyAndMomentum(bodies);
      const passes = passesQuickGate(energy, angularMomentum);
      energies[k] = energy;
      momenta[k] = angularMomentum;
      flags[k] = passes ? 1 : 0;
      if (passes) passed += 1;
      if (start + k === generation.selectedIndex)
        chosen = {
          index: start + k,
          energy,
          angularMomentum,
          passed: passes,
          masses: [...bodies.masses],
          massesExact: bodies.masses.every((mass, b) => Object.is(mass, generation.masses[b])),
        };
    }
    onChunk?.({ start, energies, momenta, passed: flags });
  }
  if (!chosen) throw new Error('The chosen candidate lies beyond its attempt’s beginnings');
  return {
    count,
    passed,
    chosen,
    profileDraws,
    attempt,
    milliseconds: performance.now() - started,
  };
}
