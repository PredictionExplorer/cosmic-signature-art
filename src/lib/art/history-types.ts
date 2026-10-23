/** Indexed historical events, not live ownerOf() or proof of a commercial sale. */
export interface ArtworkHistoryEvent {
  nftTokenId: number;
  /** Indexer event identifier. This is not an Ethereum logIndex. */
  eventLogId: number;
  blockNumber: number;
  transactionHash: `0x${string}`;
  occurredAt: string;
}

export interface ArtworkTransferEvent extends ArtworkHistoryEvent {
  kind: 'mint' | 'transfer' | 'burn';
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
}

export interface ArtworkNameEvent extends ArtworkHistoryEvent {
  kind: 'name';
  /** An empty name means the owner cleared the name. Preserve its exact text. */
  newName: string;
  changedByAddress: `0x${string}`;
}

export interface ArtworkHistoryPage<Event extends ArtworkHistoryEvent> {
  /** Descending indexer event order within this independent stream. */
  items: Event[];
  status: 'available' | 'unavailable';
  sourceUrl: string;
  cursor: string | null;
  nextCursor: string | null;
  limit: number;
}

export interface ArtworkHistory {
  tokenId: number;
  /** Separate streams deliberately avoid implying a complete merged chronology. */
  transfers: ArtworkHistoryPage<ArtworkTransferEvent>;
  names: ArtworkHistoryPage<ArtworkNameEvent>;
}

export interface ArtworkHistoryOptions {
  transferCursor?: string;
  nameCursor?: string;
  limit?: number;
}
