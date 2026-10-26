import { z } from 'zod';
import data from './collection-index.json';
import { seedPackageUrl } from './constants';

/**
 * The build-time index of every published record (scripts/build-collection-index.mjs):
 * cycle membership, mint dates, the publisher's measurements and the manifest facts for each
 * expression. Everything is the publisher's own data, validated here and never inferred.
 * Server components read the full index; clients receive only what a view needs.
 */
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const asset = z.object({
  path: z.string().max(240),
  sha256: sha.optional(),
  bytes: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});
const expressionMedia = z.object({
  still: asset.optional(),
  preview: asset.optional(),
  films: z.record(z.string(), asset),
});
const workSchema = z.object({
  id: z.number().int().nonnegative(),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  cycle: z.number().int().nonnegative().optional(),
  mintedAt: z.string().datetime().optional(),
  mintTransactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
  name: z.string().max(512).optional(),
  metadataVersion: z.string().max(40).optional(),
  description: z.string().max(1000).optional(),
  traits: z.object({
    structure: z.string().optional(),
    underlay: z.string().optional(),
    palette: z.string().optional(),
    spectralClass: z.string().optional(),
    massBalance: z.string().optional(),
    fate: z.string().optional(),
    allocation: z.string().optional(),
  }),
  chaos: z.number().int().min(0).max(100).optional(),
  syzygies: z.number().int().nonnegative().optional(),
  wildcard: z.boolean().optional(),
  imprintedAt: z.string().datetime().optional(),
  wavelengthNm: z.number().min(380).max(700).optional(),
  hueDegrees: z.tuple([z.number(), z.number(), z.number()]).optional(),
  paletteFamily: z.string().optional(),
  underlayAlpha: z.number().optional(),
  eccentricity: z.number().optional(),
  borda: z
    .object({
      selectedIndex: z.number().int().nonnegative(),
      totalCandidates: z.number().int().positive(),
      chaosWeight: z.number().optional(),
      equilibriumWeight: z.number().optional(),
      aestheticScore: z.number().optional(),
      selectionScore: z.number().optional(),
      weightsRandomized: z.boolean().optional(),
    })
    .optional(),
  masses: z.tuple([z.number(), z.number(), z.number()]).optional(),
  integrator: z.string().optional(),
  simulationSteps: z.number().int().nonnegative().optional(),
  braidCrossings: z.number().int().nonnegative().optional(),
  fateOutcome: z.string().optional(),
  media: z.object({ light: expressionMedia.optional(), ink: expressionMedia.optional() }),
});
const indexSchema = z.object({
  schemaVersion: z.literal(1),
  origin: z.string().url(),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total: z.number().int().nonnegative(),
  works: z.array(workSchema),
});

export type IndexedWork = z.infer<typeof workSchema>;
export interface CollectionIndex {
  checkedOn: string;
  total: number;
  works: IndexedWork[];
}
export interface CycleSummary {
  cycle: number;
  count: number;
  /** The earliest mint in the cycle; every work of a cycle is imprinted in one transaction. */
  mintedAt?: string;
  ids: number[];
}
/** What a client view needs to hang a numeral with the work behind it; nothing more. */
export interface CompactWork {
  id: number;
  cycle?: number;
  mintedAt?: string;
  wavelengthNm?: number;
  /** Absolute URLs of the publisher's 640 px previews. */
  inkPreview?: string;
  lightPreview?: string;
}

/** Only a well-formed, duplicate-free index is kept; a malformed one is an empty collection. */
export function parseCollectionIndex(raw: unknown): CollectionIndex {
  const parsed = indexSchema.safeParse(raw);
  if (!parsed.success) return { checkedOn: '1970-01-01', total: 0, works: [] };
  const seen = new Set<number>();
  const works = parsed.data.works
    .filter((work) => (seen.has(work.id) ? false : (seen.add(work.id), true)))
    .sort((a, b) => a.id - b.id);
  return { checkedOn: parsed.data.checkedOn, total: works.length, works };
}

export const collectionIndex = parseCollectionIndex(data);
const byId = new Map(collectionIndex.works.map((work) => [work.id, work]));

export function indexedWork(id: number): IndexedWork | undefined {
  return byId.get(id);
}

/** The URL of a published asset for one indexed work, built from its seed and the manifest path. */
export function indexedAssetUrl(work: IndexedWork, path?: string): string | undefined {
  return path ? seedPackageUrl(work.seed as `0x${string}`, path) : undefined;
}

export function cycles(index: CollectionIndex = collectionIndex): CycleSummary[] {
  const groups = new Map<number, CycleSummary>();
  for (const work of index.works) {
    if (work.cycle === undefined) continue;
    const group = groups.get(work.cycle) ?? { cycle: work.cycle, count: 0, ids: [] };
    group.count += 1;
    group.ids.push(work.id);
    if (work.mintedAt && (!group.mintedAt || work.mintedAt < group.mintedAt))
      group.mintedAt = work.mintedAt;
    groups.set(work.cycle, group);
  }
  return [...groups.values()].sort((a, b) => a.cycle - b.cycle);
}

/** Works ordered along the visible spectrum; those without a wavelength form the unmeasured shelf. */
export function spectrum(index: CollectionIndex = collectionIndex): {
  measured: IndexedWork[];
  unmeasured: IndexedWork[];
} {
  const measured = index.works
    .filter((work) => work.wavelengthNm !== undefined)
    .sort((a, b) => a.wavelengthNm! - b.wavelengthNm! || a.id - b.id);
  const unmeasured = index.works.filter((work) => work.wavelengthNm === undefined);
  return { measured, unmeasured };
}

/** The nearest redder or bluer neighbour by published wavelength, for "next by wavelength". */
export function spectralNeighbour(
  id: number,
  direction: 'redder' | 'bluer',
  index: CollectionIndex = collectionIndex,
): { work: IndexedWork; deltaNm: number } | undefined {
  const work = index.works.find((candidate) => candidate.id === id);
  if (!work || work.wavelengthNm === undefined) return undefined;
  const ordered = spectrum(index).measured;
  const position = ordered.findIndex((candidate) => candidate.id === id);
  const neighbour = ordered[direction === 'redder' ? position + 1 : position - 1];
  if (!neighbour) return undefined;
  return { work: neighbour, deltaNm: Math.abs(neighbour.wavelengthNm! - work.wavelengthNm) };
}

export function compactWorks(index: CollectionIndex = collectionIndex): CompactWork[] {
  return index.works.map((work) => ({
    id: work.id,
    cycle: work.cycle,
    mintedAt: work.mintedAt,
    wavelengthNm: work.wavelengthNm,
    inkPreview: indexedAssetUrl(work, work.media.ink?.preview?.path),
    lightPreview: indexedAssetUrl(work, work.media.light?.preview?.path),
  }));
}
