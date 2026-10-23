import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/cormorant-garamond';
import '../../src/app/globals.css';
import { LiveAuction } from '@/components/live-auction';
import { AuctionSummary } from '@/components/auction-summary';
import pageStyles from '../../src/app/[locale]/auctions/auction-pages.module.css';
import AuctionGallery from '@/components/auction-gallery';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { MotionProvider } from '@/components/motion-provider';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { catalogs } from '@/lib/i18n/messages';
import { isLocale } from '@/lib/i18n/routing';
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
createRoot(document.getElementById('root')!).render(
  <MotionProvider>
    <header style={{ padding: '16px', borderBottom: '1px solid', fontSize: '14px' }}>
      Local UI test fixture — no real auction or transactions
    </header>
    <main id="main" className={`section-wrap ${pageStyles.lotPage}`}>
      <header className={pageStyles.lotHeading}>
        <p className="eyebrow">{t.auctionKicker}</p>
        <h1>{t.signature} 31</h1>
      </header>
      {params.has('gallery') ? (
        <AuctionGallery locale={locale} t={t} />
      ) : (
        <div className={pageStyles.lotLayout}>
          <div className={pageStyles.lotArtwork}>
            <ArtworkViewer
              artwork={getCuratedArtwork(31)!}
              t={t}
              presentation="auction"
              initialStill
            />
          </div>
          <aside className={pageStyles.bidRail} aria-label={t.auctionRoom}>
            <LiveAuction locale={locale} t={t} tokenId={31} />
            <AuctionSummary locale={locale} t={t} />
          </aside>
        </div>
      )}
    </main>
  </MotionProvider>,
);
