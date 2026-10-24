import type { LocalAuctionFixture } from './chain-fixture';
export type Rehearsal = LocalAuctionFixture;
declare global {
  const __LOCAL_AUCTION__: Rehearsal;
}
