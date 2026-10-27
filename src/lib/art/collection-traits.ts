import { seedPackageUrl } from './constants';

/**
 * The part of the collection index a client may hold: the six published text traits the
 * collection can be narrowed by, and the compact view the Index of numbers hangs from. This
 * module carries no data and no schema, so a client component importing it never bundles the
 * index itself; the server reader (collection-index.ts) re-exports these names.
 */
export const TRAIT_KEYS = [
  'structure',
  'underlay',
  'palette',
  'spectralClass',
  'massBalance',
  'fate',
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export interface WorkFilter {
  cycle?: number;
  traits?: Partial<Record<TraitKey, string>>;
}

export type Expression = 'ink' | 'light';

/** What a client view needs to hang a numeral with the work behind it; nothing more. */
export interface CompactWork {
  id: number;
  /** The token's seed, sent once; preview URLs are built from it on the client. */
  seed?: string;
  cycle?: number;
  mintedAt?: string;
  wavelengthNm?: number;
  /** The publisher's manifest paths of the 640 px previews, per expression, when advertised. */
  previews?: Partial<Record<Expression, string>>;
  /** The published text traits, so the Index sheet can offer real filter chips. */
  traits?: Partial<Record<TraitKey, string>>;
}

/** The absolute URL of a compact work's preview, or nothing when the publisher advertised none. */
export function compactPreviewUrl(work: CompactWork, expression: Expression): string | undefined {
  const path = work.previews?.[expression];
  if (!path || !work.seed || !/^0x[a-f0-9]{64}$/.test(work.seed)) return undefined;
  return seedPackageUrl(work.seed as `0x${string}`, path);
}
