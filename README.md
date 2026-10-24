# Cosmic Signature Art

The Next.js gallery for `cosmic.art`: Ink first, authentic movement, one existing Cosmic Signature collection. The production application lives in `src/`; the earlier visual studies remain in `concepts/`.

Implementation was authorized on October 22, 2026; website publication on GitHub and Vercel was authorized on October 24. Auction transactions remain inactive until a reviewed contract deployment address and exact runtime code hash are configured. There is no simulated live auction or fabricated price in the deployed application.

## Hosting

The repository is [PredictionExplorer/cosmic-signature-art](https://github.com/PredictionExplorer/cosmic-signature-art). Vercel's `cosmic-signature-art` project in the `Randomwalknft` team deploys `main`; the running gallery is available at [cosmic-signature-art.vercel.app](https://cosmic-signature-art.vercel.app/). Node 24 and `npm ci` are configured on Vercel. Canonical URLs, language alternatives, social metadata, robots and sitemap use `https://cosmic.art`.

As of October 24, 2026, the custom domain is pending: `cosmic.art` still belongs to the older `cosmic-art` Vercel project and uses `ns1.verification-hold.suspended-domain.com` / `ns2.verification-hold.suspended-domain.com` at its external registrar (PublicDomainRegistry, potentially via a reseller). Complete the registrar's contact verification and restore working DNS, then move the domain to the new project in Vercel. The Vercel DNS zone already exists; its intended nameservers are `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Preserve unrelated records and verify HTTPS after the change. The old project and its repository are preserved.

Production and preview explicitly use Arbitrum chain ID 42161 with empty `NEXT_PUBLIC_AUCTION_ADDRESS` and `NEXT_PUBLIC_AUCTION_CODE_HASH`; publishing the art gallery does not activate bidding. Local rehearsal configuration stays in its isolated test bundle.

## Run locally

Use Node 22.12+ and npm (the lockfile is authoritative).

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4318`. Copy `.env.example` to `.env.local` only when configuration is needed. No private key belongs in this application. All signing stays in the visitor's wallet.

```sh
npm run type-check
npm run lint
npm test
npm run test:coverage
npm run test:previews
npm run test:e2e
npm run test:auction-ui:types
npm run test:auction-ui
npm run build
npm audit
```

Browser tests use the locally running application or start the configured preview. Their matrix covers desktop, mobile and reduced motion. Install the pinned Playwright browsers when setting up a new machine.

`test:auction-ui` separately starts a loopback-only Vite fixture on port 4320. It renders the actual auction components and styles with synthetic contract snapshots and a synthetic wallet, clearly labelled in the page. Its network policy blocks external connections. It verifies bidding interactions without activating the public auction configuration, opening a real wallet, or submitting transactions. Stop any manually started fixture on that port before running it. This suite complements the production-page tests and the separately gated real-contract client rehearsal.

To exercise the real contracts locally, compile the sibling `Cosmic-Signature` repository's approved V4 branch in production mode (`HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile`), then run from this gallery:

```sh
npm run test:auction:local:types
npm run test:auction:local
```

This command owns a fresh Hardhat node on `127.0.0.1:8548` and an isolated browser fixture on `127.0.0.1:4321`, refuses occupied ports, and stops its processes when complete. It freezes and verifies compiler artifacts against all referenced source inputs, runs the real auction/NFT client tests, then deploys the actual game and production periphery, upgrades through V4, and finalizes a cycle to generate eight auction NFTs. Four browser profiles exercise the production bid panel and unchanged transaction client against that local deployment. Only local game/NFT identities are substituted in the test bundle; chain, destination, runtime hash, simulation and receipt verification remain active. Browser RPC cannot call administrative methods or send to unrelated accounts/contracts. No public wallet is used, no `.env.local` is changed, and no test token is assigned a public artwork's image or provenance.

The runner prints the temporary evidence directory containing the deployment, issuance record, artifact hashes and node log. Playwright retains verified transaction receipts and final accounting in its test attachments. `ART_AUCTION_CONTRACT_ROOT` can identify another local contracts checkout; `ART_AUCTION_ARTIFACT_ROOT` can identify a previously frozen artifact/cache root. Tests use disposable ETH, accelerated local time and the repository's Arbitrum precompile shims. These checks complement the separate pinned-state V3-to-V4 fork rehearsal and do not substitute for real extension/hardware-wallet compatibility or native Arbitrum execution.

## Architecture

- **Next.js App Router / React / TypeScript / Tailwind CSS 4.** Server-rendered discovery and metadata, with focused client components for motion, navigation and transactions.
- **The Passage:** a moving, uncropped Ink work on paper sampled directly from the films (`#f1ebdf`), with a cinematic change into Light. Original artwork colors are preserved.
- **The collection:** the full live catalogue is the default, with number/name search, pagination and Ink/Light views. `/collection?view=atlas` opens the moving editorial constellation. Newly indexed NFTs appear through revalidation without a frontend release; the catalogue never treats the curated archive as a collection total.
- **The viewing room:** full-width Ink/paper and Light/black environments with decoded-image cinematic material changes, comparison, and a full-window modal with optional native fullscreen. Inline motion uses compact excerpts only; complete films and longer variants load on explicit request. Keyboard focus, scroll position, playback memory, failure recovery and media resource release are tested. The editorial record below retains origin, seed, cycle, indexed custodian, known protocol-custody participant and independently paginated histories. Published composition characteristics remain separate from blockchain provenance. Original files remain accessible, and the interpretation model accommodates future modes.
- **The auction exhibition:** an authentic Ink introduction, spacious lot plates, and the same material transitions and full viewing room. A contained artwork area sits beside a readable bid panel on desktop and above it on mobile. Current price, minimum next bid, UTC deadline, wallet, review, and recovery actions have a deliberate hierarchy. Editorial art is labelled separately from available lots. Missing media never blocks contract discovery; stale financial reads hide current quotes and disable actions. The review preserves the exact entered total and funding amount.
- **Eight locales:** English, Simplified Chinese, Taiwan Traditional Chinese, Hong Kong Traditional Chinese, Ukrainian, Korean, Japanese and Vietnamese. English URLs are unprefixed; other locales retain their exact tags. The art venue has its own auction vocabulary; the existing app's vocabulary rules are unchanged.
- **Motion:** the catalogue gives one visible Ink work a playback slot, with focus/hover priority and restrained changes as scrolling settles. Only dedicated compact excerpts can use that slot; leaving it detaches the video source. Hidden tabs, pause, data saving and slow connections keep stills. Reduced motion starts with stills; explicit Resume can enable ambient playback while cinematic transitions remain disabled for the system preference. Native React view transitions connect matching token/expression surfaces when ready, with ordinary immediate navigation as the fallback. Fonts are self-hosted.
- **Data:** validated, bounded requests to the existing public indexer and renderer manifests. Fifteen authenticated archived works provide an explicitly labeled fallback. Unavailable ownership is not invented. Indexed custody is not represented as a guaranteed current wallet owner.
- **Transactions:** viem loads only in auction UI. EIP-6963 browser-wallet discovery, exact bigint amounts, direct-bid review, fresh chain reads, runtime-hash and destination verification, simulation, wallet-state recheck and receipt verification. An unconfirmed action remains unconfirmed.

Stable routes are `/`, `/collection`, `/art/[id]`, `/process`, `/auctions`, `/auctions/[id]`, `/terms`, and `/privacy`. Auction-specific URLs remain usable when media indexing fails. Financial state comes from the contract, not the renderer or collection indexer.

## V4 contracts

Source, game integration, tests and upgrade tooling live in the sibling `Cosmic-Signature` repository on **`codex/v4-art-auctions`**, based on `v3-deployment` at `37fdc5e01fee9b4a1ef59fff35726d96775b3680`.

The existing collection receives a separate batch of eight NFTs at successful finalization, without extra CST. Minting and registration are atomic. The immutable auction implements the agreed seven-day preview, first-bid 48-hour clock, 0.00001 ETH minimum, 10% raises rounded up, and uncapped ten-minute soft closes. No administrator can cancel, pause, change terms, override winners or redirect liabilities.

Outbid funds become pull refunds. Settlement creates a winner's entitlement and proceeds liability without external calls. NFT delivery, refunds and forwarding are independently retryable. Proceeds use the game's explicit `donateEth()` entry point; a raw ETH transfer would invoke the game's participation path and is deliberately not used.

Regenerate the frontend ABI after an approved contract change:

```sh
node scripts/sync-auction-abi.mjs
```

Activation requires the exact reviewed immutable address, chain and runtime hash in `.env.local`, followed by a new build and full verification. The deployed NFT's metadata controls and game upgrade powers remain inherited dependencies. Tests do not replace independent security review.

## Records and boundaries

- [Implementation and validation](docs/implementation-and-validation.md): completed work, evidence and release prerequisites.
- [Decision register](docs/decision-register.md): accepted rules and outstanding launch decisions.
- [Media and indexer integration](docs/media-and-indexer-integration.md): actual APIs, source hashes, manifest handling and suggested Go changes.
- [Collection preview delivery](docs/collection-preview-delivery.md): compact film excerpts, source binding and the repeatable offline publishing step (`npm run art:previews`).
- [Auction frontend review](docs/auction-frontend-review.md): transaction security review and evidence.
- [Local auction rehearsal record](docs/local-auction-rehearsal.json): verified artifact/source hashes, four-browser transactions and final accounting from the real-contract local run.
- [Contract architecture](docs/contract-architecture-and-auction-rules.md): design and trust boundaries.
- [Ecosystem plan](docs/ecosystem-and-delivery-plan.md): issuance, reserve economics and operations.
- [Art direction](docs/art-direction-exploration.md): Passage/Atlas rationale and earlier concepts.

The Go repository and renderer are not modified by this implementation. Their suggested additions are documented here. Publishing this website does not deploy, activate, or upgrade its auction or game contracts.
