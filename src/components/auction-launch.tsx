'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { auctionConfigured } from '@/lib/auction/config';
import { localizedPath } from '@/lib/i18n/routing';
import styles from './auction-launch.module.css';
const AuctionGallery = dynamic(() => import('./auction-gallery'), { ssr: false });
export function AuctionLaunch({ locale, t }: { locale: Locale; t: Messages }) {
  return auctionConfigured ? (
    <AuctionGallery locale={locale} t={t} />
  ) : (
    <section className={`auction-opening ${styles.opening}`} aria-label={t.contractStatusLabel}>
      <div className={styles.title}>
        <p className="eyebrow">{t.contractStatusLabel}</p>
        <h2>{t.auctionNotLive}</h2>
      </div>
      <div className={styles.copy}>
        <p>{t.auctionNotLiveCopy}</p>
        <Link className="text-link" href={localizedPath(locale, '/collection')}>
          {t.auctionBrowseArt} ↗
        </Link>
      </div>
    </section>
  );
}
