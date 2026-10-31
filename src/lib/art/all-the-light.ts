import { z } from 'zod';
import data from './all-the-light.json' with { type: 'json' };
import ladder from './still-ladder.json' with { type: 'json' };

/**
 * All the light (scripts/build-all-the-light.mjs): every Light still added as light adds, kept as
 * the whole sky and as it stood after each cycle, at 1280 and 1920 pixels, beside a coarse grid
 * of how much of each work's light lies in each place. A derived view, never a work.
 *
 * The sky is the sum of particular files, so it binds only while every work's Light rungs are
 * still the ladder's own, file for file and hash for hash; a changed rung leaves the sky stale,
 * and a stale sky is never shown. Server side only.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const art = z.string().regex(/^\/art\/(?:light|stills)\/[a-z0-9-]+\.webp$/);
const rung = z.object({ src: art, sha256: hash });
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  builtOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  works: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      cycle: z.number().int().nonnegative(),
      rungs: z.object({ 1280: rung, 1920: rung }),
    }),
  ),
  cycles: z.array(z.number().int().nonnegative()).min(1),
  skies: z.array(
    z.object({
      upTo: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      src: art,
      sha256: hash,
      bytes: z.number().int().positive(),
    }),
  ),
  grid: z.object({
    src: art,
    sha256: hash,
    bytes: z.number().int().positive(),
    across: z.number().int().positive(),
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  parameters: z.object({ exposure: z.number().positive() }).passthrough(),
});
const ladderSchema = z.object({
  rungs: z.array(
    z.object({
      id: z.number(),
      expression: z.string(),
      width: z.number(),
      src: z.string(),
      sha256: z.string(),
    }),
  ),
});

/** The sky as a page shows it: one image per cycle, at both widths, and the naming grid. */
export interface AllTheLightSky {
  /** The works in the order the sky filled, with the Light rungs the sky was summed from. */
  works: { id: number; cycle: number; still: string; srcSet: string }[];
  /** Each cycle's sky, cumulative: the last is the whole collection. */
  skies: { upTo: number; src: string; srcSet: string; width: number; height: number }[];
  grid: { src: string; across: number; columns: number; rows: number };
}

/** The committed registry bound to the ladder, or nothing if any of its sources has changed. */
export function bindSky(raw: unknown, ladderRaw: unknown): AllTheLightSky | undefined {
  const parsed = registrySchema.safeParse(raw);
  const rungs = ladderSchema.safeParse(ladderRaw);
  if (!parsed.success || !rungs.success) return undefined;
  const { works, cycles, skies, grid } = parsed.data;
  const current = new Map(
    rungs.data.rungs
      .filter((entry) => entry.expression === 'light')
      .map((entry) => [`${entry.id}:${entry.width}`, entry]),
  );
  const intact = works.every((work) =>
    ([1280, 1920] as const).every((width) => {
      const now = current.get(`${work.id}:${width}`);
      return now?.src === work.rungs[width].src && now.sha256 === work.rungs[width].sha256;
    }),
  );
  if (!intact || !works.length) return undefined;
  const perCycle = cycles.map((upTo) => {
    const sizes = skies.filter((sky) => sky.upTo === upTo).sort((a, b) => a.width - b.width);
    return sizes.length
      ? {
          upTo,
          src: sizes[0].src,
          srcSet: sizes.map((sky) => `${sky.src} ${sky.width}w`).join(', '),
          width: sizes.at(-1)!.width,
          height: sizes.at(-1)!.height,
        }
      : undefined;
  });
  if (perCycle.some((sky) => !sky)) return undefined;
  return {
    works: works.map((work) => ({
      id: work.id,
      cycle: work.cycle,
      still: work.rungs[1280].src,
      srcSet: `${work.rungs[1280].src} 1280w, ${work.rungs[1920].src} 1920w`,
    })),
    skies: perCycle as AllTheLightSky['skies'],
    grid: { src: grid.src, across: grid.across, columns: grid.columns, rows: grid.rows },
  };
}

/** The collection's sky, when it is still the sum of the published stills. */
export function allTheLight(): AllTheLightSky | undefined {
  return bindSky(data, ladder);
}
