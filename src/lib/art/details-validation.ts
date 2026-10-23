import { z } from 'zod';
import { ART_API_ORIGIN } from './constants';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const seed = z
  .string()
  .regex(/^(?:0x)?[a-f0-9]{1,64}$/i)
  .transform((value): `0x${string}` => `0x${value.replace(/^0x/i, '').toLowerCase()}`);

const metadataSchema = z.object({
  metadata_version: text.optional().catch(undefined),
  attributes: z.array(z.unknown()).max(64).optional(),
  properties: z.object({
    token_id: integer,
    seed,
    simulation: z
      .object({
        steps: integer.positive().optional().catch(undefined),
        integrator: text.optional().catch(undefined),
        braid: z
          .object({ crossings: integer.optional().catch(undefined) })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  }),
});

/** Published rendering facts, distinct from ownership and immutable chain records. */
export interface ArtworkDetails {
  tokenId: number;
  seed: `0x${string}`;
  sourceUrl: string;
  metadataVersion?: string;
  structure?: string;
  palette?: string;
  spectralClass?: string;
  massBalance?: string;
  fate?: string;
  chaos?: number;
  syzygies?: number;
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
  Palette: 'palette',
  'Spectral Class': 'spectralClass',
  'Mass Balance': 'massBalance',
  Fate: 'fate',
} as const;

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
    metadataVersion: document.metadata_version,
  };
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
  const chaos = integer.max(100).safeParse(uniqueValue('Chaos'));
  if (chaos.success) details.chaos = chaos.data;
  const syzygies = integer.safeParse(uniqueValue('Syzygies'));
  if (syzygies.success) details.syzygies = syzygies.data;
  details.integrator = document.properties.simulation?.integrator;
  details.simulationSteps = document.properties.simulation?.steps;
  details.braidCrossings = document.properties.simulation?.braid?.crossings;

  const hasDetails =
    Object.values(textTraits).some((key) => details[key] !== undefined) ||
    details.chaos !== undefined ||
    details.syzygies !== undefined ||
    details.integrator !== undefined ||
    details.simulationSteps !== undefined ||
    details.braidCrossings !== undefined;
  return { status: hasDetails ? 'available' : 'pending', details };
}
