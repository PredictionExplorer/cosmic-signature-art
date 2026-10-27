import type { AuctionRecord } from '@/lib/auction/rules';

/** What one read of a registered batch returns: its lots at one block, newest batch first. */
export interface BatchPage {
  count: bigint;
  ids: number[];
  lots: { tokenId: number; lot: AuctionRecord }[];
}

/** A batch holds eight consecutive tokens; one older than every id sought ends the walk. */
export const BATCH_SIZE = 8;
/** The walk reads at most this many batches, newest first: a bound, not an estimate. */
export const MAX_PAGES = 12;

export interface CycleLots {
  /** The lots the batches hold for the ids sought, by token id. */
  lots: Map<number, AuctionRecord>;
  /** True when a batch could not be read, so the list may be short. */
  partial: boolean;
}

/**
 * The lots of a cycle's works, read batch by batch from the newest registered batch down,
 * stopping once a batch lies entirely below the oldest id sought; each batch read is one
 * block, one deployment check and eight lots, where a lot-by-lot read would be that many
 * per work. A batch that cannot be read is skipped and the result says so.
 */
export async function collectCycleLots(
  ids: number[],
  readBatch: (page: number) => Promise<BatchPage>,
  maxPages = MAX_PAGES,
): Promise<CycleLots> {
  const sought = new Set(ids);
  const lots = new Map<number, AuctionRecord>();
  let partial = false;
  if (sought.size === 0) return { lots, partial };
  const oldest = Math.min(...sought);
  for (let page = 0; page < maxPages; page += 1) {
    let batch: BatchPage;
    try {
      batch = await readBatch(page);
    } catch {
      partial = true;
      continue;
    }
    if (BigInt(page) >= batch.count || batch.ids.length === 0) break;
    for (const { tokenId, lot } of batch.lots) if (sought.has(tokenId)) lots.set(tokenId, lot);
    if (lots.size === sought.size) break;
    if (Math.max(...batch.ids) < oldest) break;
  }
  return { lots, partial };
}
