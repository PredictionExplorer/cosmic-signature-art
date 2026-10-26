import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { AuctionRules } from '@/components/auction-rules';
import { AuctionLaunch } from '@/components/auction-launch';
import { AuctionExhibition } from '@/components/auction-exhibition';
import { getArtwork } from '@/lib/art/server';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { auctionConfigured } from '@/lib/auction/config';
import styles from './auction-pages.module.css';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/auctions', t.auctions, t.auctionIntro);
}
export default async function Auctions({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main" className={`section-wrap auction-page ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="auction-title">
        <header className={styles.introduction}>
          <p className="eyebrow">{t.auctionKicker}</p>
          <h1 id="auction-title">{t.auctionTitle}</h1>
          <p className={styles.lead}>{t.auctionExhibition}</p>
          {!auctionConfigured ? <p className={styles.preparing}>{t.auctionNotLive}</p> : null}
        </header>
        <Suspense
          fallback={<AuctionExhibition work={getCuratedArtwork(23)!} locale={locale} t={t} />}
        >
          <ExhibitionArtwork locale={locale} t={t} />
        </Suspense>
        <div className={styles.invitation}>
          <p className={styles.copy}>{t.auctionExhibitionCopy}</p>
          <a
            className="text-link"
            href={auctionConfigured ? '#auction-catalogue' : '#auction-info'}
          >
            {auctionConfigured ? t.browseLots : t.auctionAtAGlance} ↓
          </a>
        </div>
      </section>
      <div id="auction-catalogue" className={styles.catalogue}>
        <AuctionLaunch locale={locale} t={t} />
      </div>
      <section id="auction-info" className={styles.rules} aria-labelledby="rules-title">
        <header className={styles.rulesHeading}>
          <div>
            <p className="eyebrow">{t.auctionBeforeBid}</p>
            <h2 id="rules-title">{t.auctionRules}</h2>
          </div>
          <Link className="text-link" href={localizedPath(locale, '/terms')}>
            {t.auctionReadMore}
          </Link>
        </header>
        <AuctionRules t={t} />
      </section>
    </main>
  );
}

async function ExhibitionArtwork({ locale, t }: { locale: Locale; t: Messages }) {
  const { artwork } = await getArtwork(23);
  return <AuctionExhibition work={artwork ?? getCuratedArtwork(23)!} locale={locale} t={t} />;
}
