import { createRoot } from 'react-dom/client';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../../src/app/globals.css';
import { LiveAuction } from '@/components/live-auction';
import { AuctionLot } from '@/components/auction-lot';
import pageStyles from '../../src/app/[locale]/auctions/auction-pages.module.css';
import saleStyles from '../../src/app/[locale]/auctions/sale.module.css';
import AuctionGallery from '@/components/auction-gallery';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { MotionProvider } from '@/components/motion-provider';
import { curatedArtworks, getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex } from '@/lib/art/collection-index';
import { workNumber } from '@/lib/art/number';
import { catalogs } from '@/lib/i18n/messages';
import { isLocale } from '@/lib/i18n/routing';
import type { LotTraitsById } from '@/lib/auction/catalogue';
import { fixture, provider } from './client';

const params = new URLSearchParams(location.search);
const requested = params.get('locale');
const locale = requested && isLocale(requested) ? requested : 'en';
const phase = params.get('phase');
if (phase === 'waiting' || phase === 'preview' || phase === 'ended' || phase === 'settled')
  fixture.phase = phase;
if (params.has('leader')) fixture.leader = '0x0000000000000000000000000000000000000031';
if (params.has('refund')) fixture.refund = 100000000000000000n;
if (params.has('wrong-chain')) fixture.walletChain = '0x1';
if (params.has('failure')) fixture.failure = true;
if (params.has('stale')) fixture.stale = true;
if (params.has('delivered')) fixture.delivered = true;
if (params.has('history-failure')) fixture.historyFailure = true;
if (params.has('history-partial')) fixture.historyPartial = true;
Object.assign(window, { __auctionFixture: fixture });
document.documentElement.lang = locale;
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid: 'local-fixture-only', name: 'Synthetic test wallet' }, provider },
    }),
  );
});
const t = catalogs[locale];
// The words the index lends each lot, and the curated plates, as the sale's server page hands them down.
const traits: LotTraitsById = Object.fromEntries(
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
const curated = Object.fromEntries(curatedArtworks.map((work) => [work.id, work]));
createRoot(document.getElementById('root')!).render(
  <MotionProvider>
    <header style={{ padding: '16px', borderBottom: '1px solid', fontSize: '14px' }}>
      Local UI test fixture — no real auction or transactions
    </header>
    {params.has('gallery') ? (
      <main id="main" className={`auction-page ${saleStyles.sale}`}>
        <h1 className={`eyebrow ${saleStyles.kicker}`} style={{ padding: '9px 16px' }}>
          {t.auctionKicker}
        </h1>
        <div id="auction-catalogue" className={saleStyles.lots}>
          <AuctionGallery locale={locale} t={t} traits={traits} curated={curated} />
        </div>
      </main>
    ) : (
      <main id="main" className={pageStyles.lotPage}>
        <ArtworkViewer
          artwork={getCuratedArtwork(31)!}
          t={t}
          locale={locale}
          presentation="auction"
          initialStill
        />
        <section className={pageStyles.lotStrip} aria-label={t.auctionRoom}>
          <div className={pageStyles.lotIdentity}>
            <h1 className={`eyebrow ${pageStyles.lotKicker}`}>
              {t.auctionKicker} · {workNumber(31)}
            </h1>
          </div>
          <AuctionLot
            tokenId={31}
            t={t}
            locale={locale}
            panel={<LiveAuction locale={locale} t={t} tokenId={31} />}
          />
        </section>
      </main>
    )}
  </MotionProvider>,
);
