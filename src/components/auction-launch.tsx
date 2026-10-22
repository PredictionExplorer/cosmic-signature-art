'use client';
import dynamic from 'next/dynamic';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { auctionConfigured } from '@/lib/auction/config';
const AuctionGallery = dynamic(() => import('./auction-gallery'), { ssr: false });
export function AuctionLaunch({ locale, t }: { locale: Locale; t: Messages }) {
  return auctionConfigured ? (
    <AuctionGallery locale={locale} t={t} />
  ) : (
    <section className="auction-opening">
      <span className="opening-orbit" aria-hidden="true">
        ∴
      </span>
      <div>
        <h2>{t.auctionNotLive}</h2>
        <p>{t.auctionNotLiveCopy}</p>
      </div>
    </section>
  );
}
