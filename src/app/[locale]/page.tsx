import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { metadata } from '@/lib/site';
import { Passage } from '@/components/passage';
import { WorkGrid } from '@/components/work-grid';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/', `${t.shape} ${t.ofMotion}`, t.intro);
}
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main">
      <Passage artwork={getCuratedArtwork(23)!} locale={locale} t={t} />
      <section className="editorial-intro section-wrap">
        <p className="eyebrow">{t.choreography}</p>
        <h2>
          {t.follow}
          <br />
          <em>{t.movesYou}</em>
        </h2>
        <div>
          <p>{t.intro}</p>
          <Link href={localizedPath(locale, '/process')} className="text-link">
            {t.exploreProcess}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="home-selection section-wrap">
        <div className="section-heading">
          <p className="eyebrow">{t.selectedWorks}</p>
          <Link className="text-link" href={localizedPath(locale, '/collection')}>
            {t.viewCollection}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <WorkGrid works={[getCuratedArtwork(31)!, getCuratedArtwork(35)!]} locale={locale} t={t} />
      </section>
      <section className="auction-invitation section-wrap">
        <p className="eyebrow">{t.auctionKicker}</p>
        <h2>
          {t.eightWorks}
          <br />
          <em>{t.continuingStory}</em>
        </h2>
        <div>
          <p>{t.auctionIntro}</p>
          <Link href={localizedPath(locale, '/auctions')} className="text-link">
            {t.exploreAuctions}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <span className="invitation-eight" aria-hidden="true">
          8
        </span>
      </section>
    </main>
  );
}
