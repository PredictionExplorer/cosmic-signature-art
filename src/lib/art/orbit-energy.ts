import { z } from 'zod';
import data from './orbit-energy.json' with { type: 'json' };
import { workOrbit } from './orbit-records';
import { ENERGY_HELD_WITHIN, type EnergyKept } from '@/lib/physics/orbit';

/**
 * Whether each work's computation kept its energy, from the first step of its recorded window to
 * its published fate (scripts/build-orbit-energy.mjs; docs/after-the-frame.md §1.3). Not
 * published: the venue's own measure, taken by the fate run the browser also makes
 * (EnergyWatch in src/lib/physics/orbit.ts), and written only when that run met the published
 * fate to the body and the step. The server words the line under each still from it
 * (fate-line.ts); a work's page finds the same numbers again in its own worker.
 *
 * An entry binds to its orbit record only while the seed and the trait file's hash agree, and
 * the whole file only while it was measured against today's tolerance. Server side: 27 KB.
 *
 * Doubles travel as their exact decimal strings and become numbers here, by Number(); the
 * bundler's JSON loader does not round-trip every double.
 */
const decimal = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/)
  .transform(Number)
  .pipe(z.number().finite());
const share = decimal.pipe(z.number().nonnegative());
const entrySchema = z.object({
  id: z.number().int().nonnegative(),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  first: decimal,
  windowChange: share,
  change: share,
  broken: z.object({ step: z.number().int().positive(), change: share, closest: share }).nullable(),
});
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  derivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heldWithin: decimal,
  energies: z.array(entrySchema),
});
type EnergyEntry = z.infer<typeof entrySchema>;

/**
 * An entry as the watch writes one: the window's change is part of the run's, and a break is
 * dated exactly when the run's change passes the tolerance. A file edited by hand can say
 * "kept" beside a change that is not.
 */
function agrees({ windowChange, change, broken }: EnergyEntry): boolean {
  if (windowChange > change) return false;
  if (!broken) return change <= ENERGY_HELD_WITHIN;
  return broken.change > ENERGY_HELD_WITHIN && broken.change <= change;
}

/**
 * The committed measures must parse, must have been taken against the tolerance the code holds
 * today, and must each agree with itself; anything else fails the build rather than the page.
 */
export function loadOrbitEnergies(raw: unknown): Map<number, EnergyEntry> {
  const parsed = registrySchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.heldWithin !== ENERGY_HELD_WITHIN ||
    !parsed.data.energies.every(agrees)
  )
    throw new Error(
      'src/lib/art/orbit-energy.json is malformed or stale; run `npm run art:energy`',
    );
  return new Map(parsed.data.energies.map((entry) => [entry.id, entry]));
}

/** An entry bound to its orbit record, or nothing when the two no longer agree. */
export function bindEnergy(entry: EnergyEntry | undefined, id: number): EnergyKept | undefined {
  const orbit = workOrbit(id);
  if (!entry || !orbit) return undefined;
  if (entry.seed !== orbit.generation.seed || entry.traitsSha256 !== orbit.traitsSha256)
    return undefined;
  const { first, windowChange, change, broken } = entry;
  return { first, windowChange, change, broken };
}

const energies = loadOrbitEnergies(data);

/** What the energy watch found on a work's run to its published fate; nothing without a record. */
export function workEnergy(id: number): EnergyKept | undefined {
  return bindEnergy(energies.get(id), id);
}
