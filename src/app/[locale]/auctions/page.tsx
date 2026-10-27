import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { auctionConfigured } from '@/lib/auction/config';
import { comingCycle } from '@/lib/auction/sale';
import type { LotTraitsById } from '@/lib/auction/catalogue';
import { collectionIndex } from '@/lib/art/collection-index';
import { curatedArtworks } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';
import { AuctionRules } from '@/components/auction-rules';
import { AuctionLaunch } from '@/components/auction-launch';
import styles from './sale.module.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/auctions', t.auctions, t.auctionIntro);
}

/** The words the index lends each lot's entry line: structure, underlay, fate and cycle. */
function lotTraits(): LotTraitsById {
  return Object.fromEntries(
    collectionIndex.works.map((work) => [
      work.id,
      {
        structure: work.traits.structure,
        underlay: work.traits.underlay,
        fate: work.traits.fate,
        cycle: work.cycle,
      },
    ]),
  );
}

/** The curated archive by token, so a lot paints from local files before its record arrives. */
function curatedById(): Record<number, Artwork> {
  return Object.fromEntries(curatedArtworks.map((work) => [work.id, work]));
}

/**
 * The sale as a bound catalogue. Its title spread is the one screen in the venue with no
 * work on it; the lots follow when a contract is configured, and the conditions of sale
 * close the book. Nothing here states a date: dates come from the chain, never from copy.
 */
export default async function Auctions({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const number = new Intl.NumberFormat(locale);
  return (
    <main id="main" className={`auction-page ${styles.sale}`}>
      <section className={styles.title} aria-labelledby="auction-title">
        <p className={`eyebrow ${styles.kicker}`}>{t.auctionKicker}</p>
        <h1 id="auction-title" className="cover">
          {fill(t.saleTitle, { n: '01' })}
        </h1>
        <p className="subtitle">{fill(t.saleSubtitle, { cycle: number.format(comingCycle()) })}</p>
        {!auctionConfigured ? <p className={styles.state}>{t.auctionNotLive}</p> : null}
        <div className={`reading ${styles.foreword}`}>
          <p>{t.auctionIntro}</p>
          <p>{t.auctionExhibitionCopy}</p>
        </div>
        <p className={styles.signed}>{t.statementSigned}</p>
        <a
          className={`text-link ${styles.enter}`}
          href={auctionConfigured ? '#auction-catalogue' : '#conditions'}
        >
          {auctionConfigured ? t.browseLots : t.conditionsOfSale}
        </a>
      </section>
      <div id="auction-catalogue" className={auctionConfigured ? styles.lots : styles.catalogue}>
        <AuctionLaunch
          locale={locale}
          t={t}
          cycle={comingCycle()}
          traits={auctionConfigured ? lotTraits() : undefined}
          curated={auctionConfigured ? curatedById() : undefined}
        />
      </div>
      <section id="conditions" className={styles.conditions} aria-labelledby="rules-title">
        <header className={styles.conditionsHead}>
          <h2 id="rules-title" className="chapter">
            {t.conditionsOfSale}
          </h2>
          <Link className="text-link" href={localizedPath(locale, '/terms')}>
            {t.auctionReadMore}
          </Link>
        </header>
        <AuctionRules t={t} />
      </section>
    </main>
  );
}
