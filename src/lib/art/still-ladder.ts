import { z } from 'zod';
import registry from './still-ladder.json';
import { isExpression, type ArtInterpretation, type Artwork, type StillRung } from './types';
import { seedPackageUrl } from './constants';

/**
 * The still ladder (scripts/build-still-ladder.mjs): 1280 and 1920 px rungs of each published
 * still, cut from its 16-bit master and proved against both the master and the published
 * still. A rung binds only to the exact still it was cut beside: same token, seed, master
 * and still hash. The phone rests on the 1280 rung; the loupe opens on it.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const match = z.object({ mean: z.number().nonnegative(), max: z.number(), over: z.number() });
const entrySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  seed: z.string().regex(/^0x[a-f0-9]{64}$/),
  expression: z.enum(['ink', 'light']),
  width: z.union([z.literal(1280), z.literal(1920)]),
  height: z.union([z.literal(828), z.literal(1242)]),
  src: z.string().regex(/^\/art\/stills\/[0-9]+-(?:ink|light)-(?:1280|1920)-[a-f0-9]{16}\.webp$/),
  sha256: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(1536 * 1024),
  masterUrl: z.string(),
  masterSha256: hash,
  stillSha256: hash,
  masterMatch: match,
  publishedMatch: match,
});
type Entry = z.infer<typeof entrySchema>;
const registrySchema = z.object({ schemaVersion: z.literal(1), rungs: z.array(entrySchema) });
const masterPath = { ink: 'images/source/ember.png', light: 'images/source/master.png' } as const;
const HEIGHTS = { 1280: 828, 1920: 1242 } as const;

export function createStillLadderLookup(raw: unknown) {
  const parsed = registrySchema.safeParse(raw);
  const entries = new Map<string, Entry[]>();
  if (parsed.success) {
    const seen = new Map<string, number>();
    for (const entry of parsed.data.rungs) {
      const key = `${entry.id}:${entry.expression}`;
      const rungKey = `${key}:${entry.width}`;
      seen.set(rungKey, (seen.get(rungKey) ?? 0) + 1);
      entries.set(key, [...(entries.get(key) ?? []), entry]);
    }
    // A width recorded twice for one expression is ambiguous; neither copy is trusted.
    for (const [key, list] of entries)
      entries.set(
        key,
        list.filter((entry) => seen.get(`${key}:${entry.width}`) === 1),
      );
  }
  return (work: Pick<Artwork, 'id' | 'seed'>, media: ArtInterpretation): ArtInterpretation => {
    const clean = { ...media };
    delete clean.rungs;
    if (!work.seed || !isExpression(media.id) || !media.stillSha256) return clean;
    const expression = media.id;
    const rungs = (entries.get(`${work.id}:${expression}`) ?? [])
      .filter(
        (entry) =>
          entry.seed === work.seed &&
          entry.stillSha256 === media.stillSha256 &&
          entry.height === HEIGHTS[entry.width] &&
          entry.masterUrl === seedPackageUrl(work.seed, masterPath[expression]) &&
          entry.src.startsWith(`/art/stills/${work.id}-${expression}-${entry.width}-`) &&
          entry.src.endsWith(`-${entry.sha256.slice(0, 16)}.webp`),
      )
      .sort((a, b) => a.width - b.width)
      .map<StillRung>((entry) => ({
        src: entry.src,
        width: entry.width,
        height: entry.height,
        sha256: entry.sha256,
        bytes: entry.bytes,
      }));
    if (rungs.length) clean.rungs = rungs;
    return clean;
  };
}

const lookup = createStillLadderLookup(registry);
export function withStillLadder(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return media.map((interpretation) => lookup(work, interpretation));
}

/** The largest rung no wider than `width`, or the smallest rung when none is small enough. */
export function rungFor(rungs: StillRung[] | undefined, width: number): StillRung | undefined {
  if (!rungs?.length) return undefined;
  const fitting = rungs.filter((rung) => rung.width >= width);
  return fitting[0] ?? rungs[rungs.length - 1];
}
