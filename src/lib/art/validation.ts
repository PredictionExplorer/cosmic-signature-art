import { z } from 'zod';
import { ART_API_ORIGIN, ART_HEIGHT, ART_WIDTH, seedPackageUrl } from './constants';
import type { Artwork } from './types';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const transaction = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const seed = z
  .string()
  .trim()
  .regex(/^(?:0x)?[0-9a-fA-F]{1,64}$/)
  .transform((value): `0x${string}` => `0x${value.replace(/^0x/i, '').toLowerCase()}`);

export const tokenRecordSchema = z.object({
  TokenId: integer,
  TokenName: z.string().trim().max(512).optional().catch(undefined),
  Seed: seed.optional().catch(undefined),
  RoundNum: integer.optional().catch(undefined),
  CurOwnerAddr: address.optional().catch(undefined),
  WinnerAddr: address.optional().catch(undefined),
  StakedOwnerAddr: address.optional().catch(undefined),
  Staked: z.boolean().optional().catch(undefined),
  WasUnstaked: z.boolean().optional().catch(undefined),
  Tx: z
    .object({
      TxHash: transaction.optional().catch(undefined),
      BlockNum: integer.optional().catch(undefined),
      TimeStamp: integer.max(8_640_000_000_000).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

export const successEnvelopeSchema = z.object({
  status: z.union([z.literal(1), z.literal('1')]),
});

export function parseTokenRecord(raw: unknown): Artwork | null {
  const parsed = tokenRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  const mintedAt = row.Tx?.TimeStamp ? new Date(row.Tx.TimeStamp * 1000).toISOString() : undefined;
  const media = row.Seed
    ? [
        {
          id: 'light',
          label: 'Light',
          still: seedPackageUrl(row.Seed, 'images/web/full.webp'),
          thumbnail: seedPackageUrl(row.Seed, 'images/web/preview.webp'),
          width: ART_WIDTH,
          height: ART_HEIGHT,
          films: [],
          source: 'legacy-url' as const,
          availability: 'unverified' as const,
        },
      ]
    : [];
  return {
    id: row.TokenId,
    title: row.TokenName || `Signature ${row.TokenId}`,
    seed: row.Seed,
    cycle: row.RoundNum,
    mintedAt,
    owner: row.CurOwnerAddr,
    originalRecipient: row.WinnerAddr,
    anchoring:
      row.Staked === undefined
        ? undefined
        : {
            active: row.Staked,
            previouslyUsed: row.WasUnstaked,
            participant: row.Staked ? row.StakedOwnerAddr : undefined,
          },
    media,
    provenance: {
      source: 'live',
      recordUrl: `${ART_API_ORIGIN}/api/cosmicgame/cst/info/${row.TokenId}`,
      metadataUrl: `${ART_API_ORIGIN}/metadata/${row.TokenId}`,
      manifestUrl: row.Seed ? seedPackageUrl(row.Seed, 'metadata/assets.json') : undefined,
      mintTransactionHash: row.Tx?.TxHash,
      mintBlock: row.Tx?.BlockNum,
      ownership: row.CurOwnerAddr ? 'indexed' : 'unavailable',
    },
    availability: {
      record: 'indexed',
      media: media.length ? 'unverified' : 'unavailable',
      ink: 'unknown',
    },
  };
}

/** Strict ID parsing prevents Infinity, coercion, truncation, signs and path injection. */
export function parseArtworkId(value: string | number): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (!/^\d+$/.test(value) || value.length > 16) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
