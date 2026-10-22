import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { AuctionRules } from '@/components/auction-rules';
import { AuctionLaunch } from '@/components/auction-launch';
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
    <main id="main" className="section-wrap auction-page">
      <div className="page-heading">
        <p className="eyebrow">{t.auctionKicker}</p>
        <h1>{t.auctionTitle}</h1>
        <p>{t.auctionIntro}</p>
      </div>
      <AuctionLaunch locale={locale} t={t} />
      <AuctionRules t={t} />
      <Link className="text-link" href={localizedPath(locale, '/terms')}>
        {t.auctionTerms} ↗
      </Link>
    </main>
  );
}
