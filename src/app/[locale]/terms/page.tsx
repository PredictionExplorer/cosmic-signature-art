import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { AuctionRules } from '@/components/auction-rules';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/terms', t.terms, t.trustIntro);
}
export default async function Terms({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main" className="type-page legal-page">
      <div className="page-heading">
        <p className="eyebrow">{t.terms}</p>
        <h1>{t.trustTitle}</h1>
        <p>{t.trustIntro}</p>
      </div>
      <AuctionRules t={t} />
      <div className="legal-copy">
        {[t.trustRefund, t.trustDelivery, t.trustFailures, t.trustRisk, t.trustMedia].map(
          (copy) => (
            <p key={copy}>{copy}</p>
          ),
        )}
      </div>
    </main>
  );
}
