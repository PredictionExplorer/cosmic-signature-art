# Cosmic Signature Art

The Next.js gallery for `cosmicsignature.art`: Ink first, authentic movement, one existing Cosmic Signature collection. The production application lives in `src/`; the earlier visual studies remain in `concepts/`.

Implementation was authorized on October 22, 2026. This checkout is local and has not been published. Auction transactions remain inactive until a reviewed deployment address and exact runtime code hash are configured. There is no simulated live auction or fabricated price.

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
npm run build
npm audit
```

Browser tests use the locally running application or start the configured preview. Their matrix covers desktop, mobile and reduced motion. Install the pinned Playwright browsers when setting up a new machine.

## Architecture

- **Next.js App Router / React / TypeScript / Tailwind CSS 4.** Server-rendered discovery and metadata, with focused client components for motion, navigation and transactions.
- **The Passage:** a moving, uncropped Ink work on paper sampled directly from the films (`#f1ebdf`), with a cinematic change into Light. Original artwork colors are preserved.
- **The collection:** the full live catalogue is the default, with number/name search, pagination and Ink/Light views. `/collection?view=atlas` opens the moving editorial constellation. Newly indexed NFTs appear through revalidation without a frontend release; the catalogue never treats the curated archive as a collection total.
- **The viewing room:** full-width Ink/paper and Light/black environments with decoded-image cinematic material changes, comparison, and a full-window modal with optional native fullscreen. Inline motion uses compact excerpts only; complete films and longer variants load on explicit request. Keyboard focus, scroll position, playback memory, failure recovery and media resource release are tested. The editorial record below retains origin, seed, cycle, indexed custodian, known protocol-custody participant and independently paginated histories. Published composition characteristics remain separate from blockchain provenance. Original files remain accessible, and the interpretation model accommodates future modes.
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
- [Contract architecture](docs/contract-architecture-and-auction-rules.md): design and trust boundaries.
- [Ecosystem plan](docs/ecosystem-and-delivery-plan.md): issuance, reserve economics and operations.
- [Art direction](docs/art-direction-exploration.md): Passage/Atlas rationale and earlier concepts.

The Go repository and renderer are not modified by this implementation. Their suggested additions are documented here. No production deployment, contract upgrade, external transaction or push to a remote branch is included.
