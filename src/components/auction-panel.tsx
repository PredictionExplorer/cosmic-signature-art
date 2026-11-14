'use client';
import dynamic from 'next/dynamic';
import type { Locale } from '@/lib/i18n/routing';
import type { LiveAuctionWords } from './live-auction.words';
import { auctionConfigured } from '@/lib/auction/config';
const LiveAuction = dynamic(() => import('./live-auction').then((module) => module.LiveAuction), {
  ssr: false,
});
export function AuctionPanel({
  tokenId,
  t,
  locale,
}: {
  tokenId: number;
  t: LiveAuctionWords;
  locale: Locale;
}) {
  return auctionConfigured ? <LiveAuction tokenId={tokenId} t={t} locale={locale} /> : null;
}
