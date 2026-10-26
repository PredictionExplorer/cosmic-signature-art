import Link from 'next/link';
import { formatEther } from 'viem';
import { MINIMUM_BID } from '@/lib/auction/rules';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import styles from './auction-summary.module.css';

export function AuctionSummary({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className={styles.summary} aria-label={t.auctionAtAGlance}>
      <p className="eyebrow">{t.auctionAtAGlance}</p>
      <dl>
        <div>
          <dt>{t.openingBid}</dt>
          <dd>
            {formatEther(MINIMUM_BID)} <span>ETH</span>
          </dd>
        </div>
        <div>
          <dt>{t.ruleFirst}</dt>
          <dd>{t.auctionDuration}</dd>
        </div>
        <div>
          <dt>{t.ruleTime}</dt>
          <dd>{t.auctionSoftClose}</dd>
        </div>
      </dl>
      <p>
        {t.ruleRaise} · {t.auctionNoFee}
      </p>
      <Link className="text-link" href={localizedPath(locale, '/terms')}>
        {t.auctionReadMore}
      </Link>
    </section>
  );
}

export function AuctionAvailability({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <div className={styles.availability}>
      <p className="eyebrow">{t.contractStatusLabel}</p>
      <h2>{t.auctionNotLive}</h2>
      <p>{t.auctionNotLiveCopy}</p>
      <AuctionSummary locale={locale} t={t} />
    </div>
  );
}
