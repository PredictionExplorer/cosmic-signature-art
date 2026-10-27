import { z } from 'zod';
import { ART_API_ORIGIN } from './constants';
import type { IndexedWork } from './collection-index';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite();
const text = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const prose = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const triple = z.tuple([finite, finite, finite]);
const seed = z
  .string()
  .regex(/^(?:0x)?[a-f0-9]{1,64}$/i)
  .transform((value): `0x${string}` => `0x${value.replace(/^0x/i, '').toLowerCase()}`);

/** Every optional branch is caught: one malformed field never discards the whole record. */
const metadataSchema = z.object({
  metadata_version: text.optional().catch(undefined),
  name: text.optional().catch(undefined),
  description: prose.optional().catch(undefined),
  attributes: z.array(z.unknown()).max(64).optional(),
  properties: z.object({
    token_id: integer,
    seed,
    generation: z
      .object({
        palette: z
          .object({
            dominant_wavelength_nm: finite.min(380).max(700).optional().catch(undefined),
            body_base_hues_deg: triple.optional().catch(undefined),
            family: text.optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
        borda: z
          .object({
            selected_index: integer.optional().catch(undefined),
            total_candidates: integer.optional().catch(undefined),
            chaos_weight: finite.optional().catch(undefined),
            equil_weight: finite.optional().catch(undefined),
            aesthetic_score: finite.optional().catch(undefined),
            selection_score: finite.optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
        drift: z
          .object({ orbit_eccentricity: finite.optional().catch(undefined) })
          .optional()
          .catch(undefined),
        structure: z
          .object({
            underlay: z
              .object({ alpha: finite.optional().catch(undefined) })
              .optional()
              .catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    simulation: z
      .object({
        steps: integer.positive().optional().catch(undefined),
        integrator: text.optional().catch(undefined),
        braid: z
          .object({ crossings: integer.optional().catch(undefined) })
          .optional()
          .catch(undefined),
        masses: triple.optional().catch(undefined),
        fate: z
          .object({ outcome: text.optional().catch(undefined) })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  }),
});

/** The Borda selection that chose this orbit from its candidates. */
export interface BordaSelection {
  selectedIndex: number;
  totalCandidates: number;
  chaosWeight?: number;
  equilibriumWeight?: number;
  aestheticScore?: number;
  selectionScore?: number;
}

/** Published rendering facts, distinct from ownership and immutable chain records. */
export interface ArtworkDetails {
  tokenId: number;
  seed: `0x${string}`;
  sourceUrl: string;
  metadataVersion?: string;
  name?: string;
  description?: string;
  structure?: string;
  underlay?: string;
  palette?: string;
  spectralClass?: string;
  massBalance?: string;
  fate?: string;
  allocation?: string;
  wildcard?: boolean;
  chaos?: number;
  syzygies?: number;
  round?: number;
  imprintedAt?: string;
  wavelengthNm?: number;
  hueDegrees?: [number, number, number];
  paletteFamily?: string;
  underlayAlpha?: number;
  eccentricity?: number;
  borda?: BordaSelection;
  masses?: [number, number, number];
  fateOutcome?: string;
  integrator?: string;
  simulationSteps?: number;
  braidCrossings?: number;
}

export interface ArtworkDetailsResult {
  status: 'available' | 'pending' | 'unavailable';
  details: ArtworkDetails | null;
}

const namedTrait = z.object({ trait_type: z.string(), value: z.unknown() });
const textTraits = {
  Structure: 'structure',
  Underlay: 'underlay',
  Palette: 'palette',
  'Spectral Class': 'spectralClass',
  'Mass Balance': 'massBalance',
  Fate: 'fate',
  Allocation: 'allocation',
} as const;
/** The fields that make a record a rendering record; identity and dates alone leave it pending. */
const renderingKeys = [
  ...Object.values(textTraits),
  'wildcard',
  'chaos',
  'syzygies',
  'wavelengthNm',
  'hueDegrees',
  'paletteFamily',
  'underlayAlpha',
  'eccentricity',
  'borda',
  'masses',
  'fateOutcome',
  'integrator',
  'simulationSteps',
  'braidCrossings',
] as const satisfies readonly (keyof ArtworkDetails)[];

/** Never attach another token's or another seed's rendering traits to this artwork. */
export function parseArtworkDetails(
  raw: unknown,
  expectedId: number,
  expectedSeed: string | undefined,
): ArtworkDetailsResult {
  const parsed = metadataSchema.safeParse(raw);
  const identity = seed.safeParse(expectedSeed);
  if (
    !parsed.success ||
    !identity.success ||
    parsed.data.properties.token_id !== expectedId ||
    parsed.data.properties.seed !== identity.data
  )
    return { status: 'unavailable', details: null };

  const document = parsed.data;
  const details: ArtworkDetails = {
    tokenId: expectedId,
    seed: identity.data,
    sourceUrl: `${ART_API_ORIGIN}/metadata/${expectedId}`,
  };
  /** A field the publisher did not state is absent, never present as undefined. */
  const assign = <Key extends keyof ArtworkDetails>(key: Key, value: ArtworkDetails[Key]) => {
    if (value !== undefined) details[key] = value;
  };
  assign('metadataVersion', document.metadata_version);
  assign('name', document.name);
  assign('description', document.description);
  const traits = (document.attributes ?? []).flatMap((candidate) => {
    const parsed = namedTrait.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
  const uniqueValue = (name: string): unknown => {
    const matches = traits.filter((trait) => trait.trait_type === name);
    // Repeated keys are ambiguous, even when one copy appears well formed.
    return matches.length === 1 ? matches[0].value : undefined;
  };
  for (const [name, key] of Object.entries(textTraits)) {
    const value = text.safeParse(uniqueValue(name));
    if (value.success) details[key] = value.data;
  }
  const wildcard = uniqueValue('Wildcard');
  if (wildcard === 'Yes' || wildcard === 'No') details.wildcard = wildcard === 'Yes';
  const chaos = integer.max(100).safeParse(uniqueValue('Chaos'));
  if (chaos.success) details.chaos = chaos.data;
  const syzygies = integer.safeParse(uniqueValue('Syzygies'));
  if (syzygies.success) details.syzygies = syzygies.data;
  const round = integer.safeParse(uniqueValue('Round'));
  if (round.success) details.round = round.data;
  const imprinted = integer.max(8_640_000_000_000).safeParse(uniqueValue('Imprinted'));
  if (imprinted.success) details.imprintedAt = new Date(imprinted.data * 1000).toISOString();

  const generation = document.properties.generation;
  assign('wavelengthNm', generation?.palette?.dominant_wavelength_nm);
  assign('hueDegrees', generation?.palette?.body_base_hues_deg);
  assign('paletteFamily', generation?.palette?.family);
  assign('underlayAlpha', generation?.structure?.underlay?.alpha);
  assign('eccentricity', generation?.drift?.orbit_eccentricity);
  const borda = generation?.borda;
  if (
    borda &&
    borda.selected_index !== undefined &&
    borda.total_candidates !== undefined &&
    borda.total_candidates > 0 &&
    borda.selected_index < borda.total_candidates
  ) {
    details.borda = {
      selectedIndex: borda.selected_index,
      totalCandidates: borda.total_candidates,
      chaosWeight: borda.chaos_weight,
      equilibriumWeight: borda.equil_weight,
      aestheticScore: borda.aesthetic_score,
      selectionScore: borda.selection_score,
    };
  }
  const simulation = document.properties.simulation;
  assign('masses', simulation?.masses);
  assign('fateOutcome', simulation?.fate?.outcome);
  assign('integrator', simulation?.integrator);
  assign('simulationSteps', simulation?.steps);
  assign('braidCrossings', simulation?.braid?.crossings);

  const hasDetails = renderingKeys.some((key) => details[key] !== undefined);
  return { status: hasDetails ? 'available' : 'pending', details };
}

/**
 * The build-time index carries the same publisher fields for every work; it stands in only
 * when the live metadata read fails, and only for the identical seed (the caller checks).
 */
export function detailsFromIndexedWork(work: IndexedWork): ArtworkDetails {
  return {
    tokenId: work.id,
    seed: work.seed as `0x${string}`,
    sourceUrl: `${ART_API_ORIGIN}/metadata/${work.id}`,
    metadataVersion: work.metadataVersion,
    name: work.metadataName,
    description: work.description,
    structure: work.traits.structure,
    underlay: work.traits.underlay,
    palette: work.traits.palette,
    spectralClass: work.traits.spectralClass,
    massBalance: work.traits.massBalance,
    fate: work.traits.fate,
    allocation: work.traits.allocation,
    wildcard: work.wildcard,
    chaos: work.chaos,
    syzygies: work.syzygies,
    round: work.cycle,
    imprintedAt: work.imprintedAt,
    wavelengthNm: work.wavelengthNm,
    hueDegrees: work.hueDegrees,
    paletteFamily: work.paletteFamily,
    underlayAlpha: work.underlayAlpha,
    eccentricity: work.eccentricity,
    borda: work.borda,
    masses: work.masses,
    fateOutcome: work.fateOutcome,
    integrator: work.integrator,
    simulationSteps: work.simulationSteps,
    braidCrossings: work.braidCrossings,
  };
}
