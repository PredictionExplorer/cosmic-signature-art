import type { WordList, Words } from '@/lib/i18n/words';

/**
 * The live panel of one lot: its phase and figures, the wallet, the bid and its review, the
 * transaction's progress, and every action the contract offers once the sale has ended.
 */
export const LIVE_AUCTION_WORDS = [
  'auctions',
  'auctionKicker',
  'status',
  'refresh',
  'liveUnavailable',
  'unregistered',
  'configMismatch',
  // The lot's phase, and its figures.
  'waiting',
  'preview',
  'active',
  'ended',
  'settled',
  'openingBid',
  'highest',
  'minimum',
  'eligible',
  'ends',
  'bidCountdown',
  'previewCountdown',
  'chainClock',
  'leadingWallet',
  // The wallet.
  'connect',
  'disconnect',
  'chooseWallet',
  'walletMissing',
  'walletPending',
  'wrongNetwork',
  // The bid and its review.
  'bidTotal',
  'bidReviewAction',
  'bidReview',
  'bidWarning',
  'funding',
  'reviewChanged',
  'cancel',
  'confirmBid',
  'yourBid',
  'invalidAmount',
  'bidTooLow',
  'invalidAddress',
  // The transaction, and what follows the sale.
  'transactionPending',
  'transactionConfirmed',
  'transactionFailed',
  'settle',
  'winner',
  'delivered',
  'recipient',
  'claim',
  'proceedsSent',
  'forward',
  'refund',
  'withdraw',
  'viewChain',
  'contract',
] as const satisfies WordList;
export type LiveAuctionWords = Words<typeof LIVE_AUCTION_WORDS>;
