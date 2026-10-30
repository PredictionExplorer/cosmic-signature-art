import { z } from 'zod';
import data from './orbit-windows.json' with { type: 'json' };
import { workOrbit } from './orbit-records';
import type { OrbitWindow } from '@/lib/physics/orbit';

/**
 * Where each work's orbit stands at the first step of its recorded window, and the plane it is
 * drawn in (scripts/build-orbit-windows.mjs). Not published: re-derived from the seed by the
 * same arithmetic the browser runs, and written only when that derivation matched every
 * published measurement and the window, replayed from these very decimals, reached the
 * published closest approach exactly. A window binds to its orbit record only while the seed
 * and the trait file's hash agree; a stale one is dropped, never drawn. Server side: 90 KB.
 *
 * Doubles travel as their exact decimal strings and become numbers here, by Number(); the
 * bundler's JSON loader does not round-trip every double.
 */
const decimal = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/)
  .transform(Number)
  .pipe(z.number().finite());
const three = z.tuple([decimal, decimal, decimal]);
const nine = z.array(decimal).length(9);
const windowSchema = z.object({
  id: z.number().int().nonnegative(),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  traitsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  positions: nine,
  velocities: nine,
  plane: z.object({
    mean: three,
    axes: z.tuple([three, three]),
    bounds: z.tuple([decimal, decimal, decimal, decimal]),
  }),
});
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  derivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stride: z.literal(100),
  windows: z.array(windowSchema),
});
type WindowEntry = z.infer<typeof windowSchema>;

/** One orbit as the Orrery performs it: its window, and the hues its bodies are drawn in. */
export interface PerformedOrbit {
  id: number;
  window: OrbitWindow;
  bodyHues: [number, number, number];
}

/** The committed windows must parse; a malformed file fails the build rather than the page. */
export function loadOrbitWindows(raw: unknown): Map<number, WindowEntry> {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('src/lib/art/orbit-windows.json is malformed; run `npm run art:windows`');
  return new Map(parsed.data.windows.map((entry) => [entry.id, entry]));
}

/** A window bound to its orbit record, or nothing when the two no longer agree. */
export function bindWindow(entry: WindowEntry | undefined, id: number): PerformedOrbit | undefined {
  const orbit = workOrbit(id);
  if (!entry || !orbit) return undefined;
  if (entry.seed !== orbit.generation.seed || entry.traitsSha256 !== orbit.traitsSha256)
    return undefined;
  const [u0, u1, v0, v1] = entry.plane.bounds;
  if (!(u1 > u0 && v1 > v0)) return undefined;
  return {
    id,
    window: {
      masses: orbit.published.masses,
      dt: orbit.generation.dt,
      steps: orbit.generation.steps,
      positions: entry.positions,
      velocities: entry.velocities,
      plane: entry.plane,
    },
    bodyHues: orbit.bodyHues,
  };
}

const windows = loadOrbitWindows(data);

/** Every work's orbit the Orrery can perform, in number order. */
export function performedOrbits(ids: readonly number[]): PerformedOrbit[] {
  return ids.flatMap((id) => {
    const bound = bindWindow(windows.get(id), id);
    return bound ? [bound] : [];
  });
}
