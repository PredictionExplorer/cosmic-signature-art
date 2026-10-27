'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { auctionConfigured } from '@/lib/auction/config';
import { localizedPath } from '@/lib/i18n/routing';
import styles from './auction-launch.module.css';
const AuctionGallery = dynamic(() => import('./auction-gallery'), { ssr: false });

/**
 * The lots, when a contract is configured; until then the coming cycle's chapter strip,
 * stated plainly. Readiness and eligibility are the chain's to announce, never the copy's.
 */
export function AuctionLaunch({
  locale,
  t,
  cycle,
}: {
  locale: Locale;
  t: Messages;
  cycle: number;
}) {
  if (auctionConfigured) return <AuctionGallery locale={locale} t={t} />;
  const number = new Intl.NumberFormat(locale);
  return (
    <section className={`auction-opening ${styles.opening}`} aria-label={t.contractStatusLabel}>
      <div className={styles.strip}>
        <span className="chapter">{`${t.cycle} ${number.format(cycle)}`}</span>
      </div>
      <div className={styles.copy}>
        <p className="eyebrow">{t.contractStatusLabel}</p>
        <p>{t.auctionNotLiveCopy}</p>
        <Link className="text-link" href={localizedPath(locale, '/collection')}>
          {t.auctionBrowseArt}
        </Link>
      </div>
    </section>
  );
}
