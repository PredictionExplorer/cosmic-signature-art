import { z } from 'zod';
import type { ArtworkNameEvent, ArtworkTransferEvent } from './history-types';

export const MAX_HISTORY_PAGE_SIZE = 50;
export const DEFAULT_HISTORY_PAGE_SIZE = 12;

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value as `0x${string}`);
const transactionHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value as `0x${string}`);

/** The service's continuation is opaque. Never construct or interpret its payload. */
export const historyCursorSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);

const eventSchema = z.object({
  nftTokenId: integer,
  eventLogId: integer.min(1),
  blockNumber: integer,
  transactionHash,
  occurredAt: z.iso.datetime({ offset: true }),
});

const zero = '0x0000000000000000000000000000000000000000';
const transferSchema = eventSchema
  .extend({
    fromAddress: address,
    toAddress: address,
    transferType: z.enum(['mint', 'transfer', 'burn']),
  })
  .refine((event) => {
    const fromZero = event.fromAddress === zero;
    const toZero = event.toAddress === zero;
    if (event.transferType === 'mint') return fromZero && !toZero;
    if (event.transferType === 'burn') return !fromZero && toZero;
    return !fromZero && !toZero;
  }, 'Transfer classification must agree with the ERC-721 endpoints');

const nameSchema = eventSchema.extend({
  tokenName: z.string().max(512),
  changedByAddress: address.refine((value) => value !== zero),
});

const metadataSchema = z.object({
  limit: integer.min(1).max(MAX_HISTORY_PAGE_SIZE),
  nextCursor: historyCursorSchema.nullish(),
});
const transferPageSchema = z.object({
  data: z.array(transferSchema).max(MAX_HISTORY_PAGE_SIZE),
  meta: metadataSchema,
});
const namePageSchema = z.object({
  data: z.array(nameSchema).max(MAX_HISTORY_PAGE_SIZE),
  meta: metadataSchema,
});

interface PageScope {
  tokenId: number;
  limit: number;
  cursor?: string;
}

function validPage(
  page: {
    data: Array<{ nftTokenId: number; eventLogId: number; blockNumber: number }>;
    meta: { limit: number; nextCursor?: string | null };
  },
  scope: PageScope,
): boolean {
  if (page.meta.limit !== scope.limit || page.data.length > scope.limit) return false;
  if (page.meta.nextCursor && (page.data.length === 0 || page.meta.nextCursor === scope.cursor))
    return false;
  return page.data.every((event, index) => {
    if (event.nftTokenId !== scope.tokenId) return false;
    const previous = page.data[index - 1];
    return (
      !previous ||
      (event.eventLogId < previous.eventLogId && event.blockNumber <= previous.blockNumber)
    );
  });
}

/** Reject the entire affected stream on malformed rows rather than silently losing history. */
export function parseTransferHistoryPage(
  raw: unknown,
  scope: PageScope,
): { items: ArtworkTransferEvent[]; nextCursor: string | null } | null {
  const parsed = transferPageSchema.safeParse(raw);
  if (!parsed.success || !validPage(parsed.data, scope)) return null;
  return {
    items: parsed.data.data.map(({ transferType, ...event }) => ({ ...event, kind: transferType })),
    nextCursor: parsed.data.meta.nextCursor ?? null,
  };
}

export function parseNameHistoryPage(
  raw: unknown,
  scope: PageScope,
): { items: ArtworkNameEvent[]; nextCursor: string | null } | null {
  const parsed = namePageSchema.safeParse(raw);
  if (!parsed.success || !validPage(parsed.data, scope)) return null;
  return {
    items: parsed.data.data.map(({ tokenName, ...event }) => ({
      ...event,
      kind: 'name',
      newName: tokenName,
    })),
    nextCursor: parsed.data.meta.nextCursor ?? null,
  };
}
