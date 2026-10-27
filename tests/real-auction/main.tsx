import { createRoot } from 'react-dom/client';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../../src/app/globals.css';
import { LiveAuction } from '@/components/live-auction';
import { AuctionSummary } from '@/components/auction-summary';
import { MotionProvider } from '@/components/motion-provider';
import { en } from '@/lib/i18n/en';
import { localProvider, submitted } from './wallet';
const accounts = __LOCAL_AUCTION__.accounts.slice(1, 4);
const names = ['Local Alice', 'Local Bob', 'Local Keeper'];
window.addEventListener('eip6963:requestProvider', () => {
  accounts.forEach((account, index) =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: `real-local-wallet-${index}`, name: names[index] },
          provider: localProvider(account),
        },
      }),
    ),
  );
});
Object.assign(window, { __localAuctionSubmissions: submitted });
createRoot(document.getElementById('root')!).render(
  <MotionProvider>
    <header style={{ padding: '18px', borderBottom: '1px solid' }}>
      Local contract rehearsal — disposable ETH on chain31337. No public transactions.
    </header>
    <main
      id="main"
      className="section-wrap"
      style={{ maxWidth: '900px', marginInline: 'auto', paddingBlock: '40px' }}
    >
      <p className="eyebrow">Real V4 contract lifecycle</p>
      <h1>Local work {__LOCAL_AUCTION__.tokenId}</h1>
      <p>
        The locally generated token is tested without borrowing another artwork’s image or
        provenance.
      </p>
      <LiveAuction tokenId={__LOCAL_AUCTION__.tokenId} locale="en" t={en} />
      <AuctionSummary locale="en" t={en} />
    </main>
  </MotionProvider>,
);
