import { z } from 'zod';
import registry from './sweep-spans.json' with { type: 'json' };
import { indexedWork } from './collection-index';
import { activeSpan } from './spectral-sweep';
import type { ArtFilm, ArtInterpretation, Artwork } from './types';

/**
 * The sweep spans (scripts/build-sweep-spans.mjs): the band of the spectrum each work's
 * published spectral sweep travels, read from its published bins. A span binds to the Light
 * sweep only when the token, its seed and the hash of the film agree with the registry, and it
 * carries the work's dominant wavelength from the index beside it. A stale span is dropped,
 * never used: without one the film's wavelengths are unknown. Server side only.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bin = z.number().int().min(0).max(63);
const entrySchema = z
  .object({
    id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    seed: z.string().regex(/^0x[a-f0-9]{64}$/),
    sweepSha256: hash,
    firstLit: bin.nullable(),
    lastLit: bin.nullable(),
    start: bin,
    end: bin,
  })
  .refine((entry) => {
    const derived = activeSpan(entry.firstLit ?? undefined, entry.lastLit ?? undefined);
    return entry.start < entry.end && derived.start === entry.start && derived.end === entry.end;
  });
type Entry = z.infer<typeof entrySchema>;
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spans: z.array(z.unknown()),
});

export function createSweepSpanLookup(raw: unknown) {
  const parsed = registrySchema.safeParse(raw);
  const entries = new Map<number, Entry>();
  if (parsed.success) {
    const duplicates = new Set<number>();
    for (const candidate of parsed.data.spans) {
      const entry = entrySchema.safeParse(candidate);
      if (!entry.success) continue;
      if (entries.has(entry.data.id)) duplicates.add(entry.data.id);
      entries.set(entry.data.id, entry.data);
    }
    duplicates.forEach((id) => entries.delete(id));
  }
  return (
    work: Pick<Artwork, 'id' | 'seed'>,
    media: ArtInterpretation,
    dominantNm?: number,
  ): ArtInterpretation => {
    if (!media.films.some((film) => film.id === 'sweep' || film.span)) return media;
    const entry = entries.get(work.id);
    const bound = (film: ArtFilm): ArtFilm => {
      const clean = { ...film };
      delete clean.span;
      if (
        film.id !== 'sweep' ||
        media.id !== 'light' ||
        !entry ||
        !work.seed ||
        entry.seed !== work.seed ||
        entry.sweepSha256 !== (film.sourceSha256 ?? film.sha256)
      )
        return clean;
      clean.span = { start: entry.start, end: entry.end };
      if (dominantNm !== undefined) clean.span.dominantNm = dominantNm;
      return clean;
    };
    return { ...media, films: media.films.map(bound) };
  };
}

const lookup = createSweepSpanLookup(registry);
export function withSweepSpans(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  const indexed = indexedWork(work.id);
  const dominantNm = indexed && indexed.seed === work.seed ? indexed.wavelengthNm : undefined;
  return media.map((interpretation) => lookup(work, interpretation, dominantNm));
}
