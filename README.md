# cosmic.art

cosmic.art is the venue for the 72 Cosmic Signature works.

Each work is a recorded three-body orbit. Three bodies are set moving by a seed, simulated for two million steps, and rendered twice by the generator: as **Light**, trails on black, and as **Ink**, sumi on a paper sheet. The two are equal expressions of one work. The venue hangs them as plates and turns between them in the order each film made its marks. In the visitor's own browser it derives again, to the last bit, the orbit that made each work.

This repository is the venue:

- `src/`: a Next.js 16 application (React 19, TypeScript, Tailwind CSS 4);
- `scripts/`: the offline pipelines that measure the publisher's files, and the checks CI runs;
- `tests/`: the browser suites;
- `docs/`: the plans and records;
- `concepts/`: the earlier visual studies.

Where it stands:

- **Live** at [cosmic.art](https://cosmic.art), deployed from `main` (see [Hosting](#hosting)).
- **The auction is inactive.** It starts only once a reviewed contract's address and exact runtime code hash are configured. The application never simulates a live auction or shows an invented price.
- **Read next:** [ARCHITECTURE.md](ARCHITECTURE.md) for how the venue is built and why, and [docs/README.md](docs/README.md) for every plan and record.

## Principles, and the code that keeps them

Each principle is a promise to the visitor. Each names the code that keeps it and the test that checks it, so a change that breaks a promise fails a test instead of waiting for a reviewer to notice.

### The art is the Largest Contentful Paint

The first thing a visitor sees should be the work, and it should arrive first. Largest Contentful Paint (LCP) is when the largest thing in the first screen finished painting. On this venue that must be the plate.

- **Kept by:**
  - `src/lib/art/inline-preview.ts`: the page's hero carries its 640 px preview inline, as a data URI in the HTML, so it paints before any image request.
  - `src/components/artwork-media.tsx`: that preview loads eagerly, at high priority on the page's hero, and the full still follows behind it.
  - `src/lib/room.ts`: on a first visit to the home, First Light's gate keeps the plate alone from the first frame, with the running head held back.
  - `src/components/overture.tsx`: the performance itself loads by `import()`, and only on a first visit.
- **Checked by:**
  - `tests/e2e/budgets.spec.ts`: on a desk and on a phone, the largest paint must be the artwork's preview, still or film, within 2.5 s.
  - `tests/e2e/first-light-home.spec.ts`: a first visit opens on the plate.

### Stills are never altered

A work is its published still. A venue that recolours, crops or "enhances" it shows something else.

- **Kept by:**
  - `scripts/lib/origin.mjs`: every derivative (excerpt, clip, ladder rung, inline preview) is cut from a published source whose hash has been checked, recorded with that hash, and published under a content-addressed name.
  - `scripts/build-plate-clips.mjs` refuses a clip whose last frame is not the published still, and `scripts/build-still-ladder.mjs` proves each rung against both of its parents.
  - `src/lib/art/derivatives.ts` and `inline-preview.ts` bind a derivative to a work only when the hashes agree.
  - A plate is never cropped. It is contained, and letterboxed in the sheet's own measured tone (`npm run art:plates`).
  - The crossing shows only pixels of the two published stills, except across the soft edge of its front (`src/components/arrival-crossing.ts`).
- **Checked by:**
  - `scripts/build-plate-clips.test.mjs`, `scripts/build-still-ladder.test.mjs` and `src/lib/art/inline-preview.test.ts`;
  - `tests/e2e/crossing.spec.ts`: each work crosses "from its two stills and nothing else";
  - `tests/e2e/polish-responsive.spec.ts`: the plate keeps its proportion, contained.

### Derived views say "Analysis, not the work", and never stand where a work is for sale

The venue computes new pictures from the works: the When and Wavelength lenses, the film's score, the orbit drawn over the plate, and All the light. They teach, but they are not works, and a buyer must never mistake one for what is offered.

- **Kept by:**
  - Each says so in every locale (`src/lib/i18n/*.ts`):
    - the lenses and the orbit over the plate say "Analysis, not the work" (`analysisNotWork`);
    - the orbit's continuation past its window says "This is not the work: it is what the work's orbit does next";
    - All the light says "A derived view, not a work".
  - `src/components/artwork-room.tsx` offers the lenses and the score only when `derivedViews` is true, and the sale's viewer passes false (`artwork-viewer.tsx`).
  - `src/components/index-sheet.tsx` never offers the collection's indexes, All the light and the Orrery, on a sale.
  - `src/app/sitemap.ts` never offers All the light for discovery as if it were a work, and no derived view is ever a sharing card.
- **Checked by:**
  - `src/components/artwork-room.test.tsx`: the lenses and the score are never offered on a sale surface, by word, by key or in the key sheet;
  - `src/components/index-sheet.test.tsx`;
  - `tests/e2e/crossing.spec.ts` and `tests/e2e/wavelength-lens.spec.ts`: each lens carries its label.

### Light and Ink are equal

The generator published both expressions, and neither is the venue's default.

- **Kept by:**
  - One policy module decides which expression a plate opens on, and every surface asks it: the visitor's choice, else the day's expression (`src/lib/art/opening.ts`).
  - The day's expression alternates every UTC day (`src/lib/art/day.ts`, `work-of-the-day.ts`).
  - Lists hang both at equal size across the Turn's seam, and every plate's twin hangs beneath it. [docs/third-physics-phase-d.md](docs/third-physics-phase-d.md) §2 sets out the rule.
- **Checked by:**
  - `src/lib/art/work-of-the-day.test.ts`: the expression alternates day to day, through every pass of the pool;
  - `src/lib/art/opening.test.ts`.

### Reduced motion is the same venue, still

A visitor who asks for less motion gets every work, every fact and every instrument, as stills and as choices they make, never as a lesser page.

- **Kept by:**
  - `src/components/motion-provider.tsx`: the system's preference, overridden by the visitor's own Pause or Play. The server renders the quiet room.
  - Films begin as stills. First Light waits to be asked (_Watch it form_). The orbit section draws the whole orbit at once. The Turn takes a single frame.
- **Checked by:**
  - The `chromium-reduced-motion` and `webkit-reduced-motion` projects run the whole browser suite with the preference set;
  - `src/components/motion-provider.test.tsx`.

### Eight locales

English, Simplified Chinese, Traditional Chinese for Taiwan and for Hong Kong, Ukrainian, Korean, Japanese and Vietnamese. English addresses carry no prefix, and the others keep their exact tags.

- **Kept by:**
  - `src/lib/i18n/routing.ts` and `src/proxy.ts`.
  - One catalogue per locale, each typed by `Messages` (`src/lib/i18n/en.ts`).
  - Each CJK locale's own sliced face (`scripts/build-font-subsets.mjs`).
- **Checked by:**
  - `npm run type-check`: a missing string is a type error;
  - `npm run test:fonts`: every character in every locale is drawn by a shipped face;
  - `tests/e2e/accessibility.spec.ts`: axe runs on every route in every locale.

### A 12 px floor and 44 px targets

Small type and small targets shut people out.

- **Kept by:** `src/app/globals.css`, whose type scale stops at 12 px in every locale, and controls sized to at least 44 px.
- **Checked by:**
  - `src/app/stylesheet-floor.test.ts`: no stylesheet sets type below 12 px;
  - `tests/e2e/polish-responsive.spec.ts`: the viewing controls are at least 44 × 44 px, from a 320 px phone to a laptop.

### Say what is known, and how

The venue says where each fact comes from and what it cannot promise. It never fills a gap with something plausible.

- **Kept by:**
  - The record says it is "read from the Arbitrum indexer and may lag the chain by a few blocks". The media files are said to be "the publisher's; their hashes are recorded here and checked wherever a local copy is kept" (`honestyRecord` and `honestyMedia`, shown by `src/components/artwork-entry.tsx`).
  - Ownership that cannot be read is not invented, and indexed custody is never presented as the current owner.
  - The sale shows no price it did not read from the contract, and an action not yet confirmed is shown as unconfirmed.
- **Checked by:**
  - `src/components/artwork-entry.test.tsx`, `artwork-record.test.tsx` and `artwork-history.test.tsx`;
  - `src/lib/auction/client.test.ts` and `rules.test.ts`, held to the stricter coverage thresholds in `vitest.config.ts`.

## Run it

Use Node 22.12 or later and npm; the lockfile is authoritative.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4318`. No secrets are needed. Copy `.env.example` to `.env.local` only to change configuration. No private key belongs in this application: all signing stays in the visitor's wallet.

The venue's day decides the day's work and its expression. To pin it, for example for a screenshot, set `COSMIC_VENUE_DATE=2026-11-06` (an Ink day) for the build and the server.

## Test it

```sh
npm run lint
npm run type-check
npm run format:check
npm test                    # unit tests (Vitest)
npm run test:coverage       # the same, with coverage thresholds
npm run test:scripts        # the pipelines' and checks' own tests (node:test)
npm run test:fonts          # every glyph in every locale is drawn
npm run test:e2e            # the browser suite (Playwright, seven projects)
```

The browser suite reuses a server already running on its address, `http://127.0.0.1:4318` (set `PLAYWRIGHT_BASE_URL` for another), or starts `npm run dev`. On a new machine, install Playwright's browsers first (`npx playwright install`). The suite's seven projects are Chromium, Firefox and WebKit on a desk; Chromium and WebKit on a phone; and Chromium and WebKit with reduced motion. Choose one with `--project=chromium-desktop`.

## Verify it

CI (`.github/workflows/ci.yml`) runs everything above against a production build, plus the auction harness and the performance budgets. To check a change as CI will:

```sh
COSMIC_VENUE_DATE=2026-11-06 npm run build
COSMIC_VENUE_DATE=2026-11-06 npm run start      # in a second terminal
npm run test:e2e
npm run test:budgets:js       # first-load JavaScript per route, read from the build
npm run test:budgets:paint    # LCP and CLS in Chromium, on a desk and a phone
```

The budgets are set in [`scripts/budgets.json`](scripts/budgets.json): first-load JavaScript per route, and LCP within 2.5 s and CLS within 0.1 for the home and a work page. ARCHITECTURE.md, §12, records the baseline they were set from and how to change one. The paint budget is measured only on a production server. Against `npm run dev` it skips, because a development server's timings mean nothing.

## Hosting

_As checked on 8 November 2026._

- **Repository:** [PredictionExplorer/cosmic-signature-art](https://github.com/PredictionExplorer/cosmic-signature-art), public.
- **Deployment:** Vercel's `cosmic-signature-art` project, in the `Randomwalknft` team, deploys `main`. It installs with `npm ci` on Node 24, as configured when the project was created on 24 October 2026.
- **Domain:** `cosmic.art` is served by Vercel over HTTPS, with HSTS. Its DNS is on Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). `www.cosmic.art` and `cosmic-signature-art.vercel.app` both redirect to `https://cosmic.art`. The October DNS hold at the registrar is over.
- **Canonical addresses:** canonical links, language alternates, robots and the sitemap use `NEXT_PUBLIC_SITE_URL`, by default `https://cosmic.art`.
- **Sharing cards (open):** card images resolve against `NEXT_PUBLIC_DEPLOYMENT_URL` when it is set, and otherwise against a `*.vercel.app` host (`src/lib/site.ts`).
  - Production does not set it, so the live pages point crawlers at the branch alias `cosmic-signature-art-git-main-randomwalknft.vercel.app`. That alias sits behind Vercel's deployment protection and answers with a sign-in redirect.
  - On `cosmic.art` itself, the card routes answer 500, although they render on a local production build.
  - Two changes are the owner's: set `NEXT_PUBLIC_DEPLOYMENT_URL=https://cosmic.art` in production, as `.env.example` says to once the domain resolves, and read the card routes' function logs on Vercel.
- **The chain:** production and preview use Arbitrum (chain ID 42161), with `NEXT_PUBLIC_AUCTION_ADDRESS` and `NEXT_PUBLIC_AUCTION_CODE_HASH` empty. Publishing the gallery does not activate bidding.
- **Icons:** the favicon, app icons and web manifest are static files derived once from the three-body mark (`src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/favicon.ico`, `public/icons/`).

## The auction

Bidding is built and tested but inactive until a contract is reviewed and configured. Three layers verify it without a public wallet.

**The interface harness.** `npm run test:auction-ui` starts a loopback-only Vite fixture on port 4320. It renders the real auction components and styles against synthetic contract snapshots and a synthetic wallet, both labelled as such on the page. Its network policy blocks external connections. It checks the bidding interactions without the public configuration, a real wallet or a transaction. Stop any fixture you started by hand on that port first.

**The real contracts, locally.** Compile the sibling `Cosmic-Signature` repository's approved V4 branch in production mode (`HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile`), then run from this repository:

```sh
npm run test:auction:local:types
npm run test:auction:local
```

The runner owns a fresh Hardhat node on `127.0.0.1:8548` and a browser fixture on `127.0.0.1:4321`. It refuses occupied ports and stops its processes when it is done.

1. It freezes the compiler artifacts and checks them against every source input they reference.
2. It runs the real auction and NFT client tests.
3. It deploys the game and its production periphery, upgrades through V4, and finalizes a cycle, which issues eight auction NFTs.
4. Four browser profiles bid through the production bid panel and the unchanged transaction client.

Only the local game and NFT identities are substituted. The chain, destination, runtime hash, simulation and receipt checks all stay active. Browser RPC cannot call administrative methods or send to unrelated accounts. No `.env.local` is changed, and no test token is given a public artwork's image or provenance.

The runner prints a temporary evidence directory with the deployment, the issuance record, the artifact hashes and the node log. `ART_AUCTION_CONTRACT_ROOT` names another contracts checkout, and `ART_AUCTION_ARTIFACT_ROOT` names an artifact root frozen earlier. The record of the last full run is [docs/local-auction-rehearsal.json](docs/local-auction-rehearsal.json). These checks do not replace a fork rehearsal, real wallet hardware, native Arbitrum execution or an independent security review.

**The V4 contracts** live in the sibling `Cosmic-Signature` repository, on `codex/v4-art-auctions`, based on `v3-deployment` at `37fdc5e01fee9b4a1ef59fff35726d96775b3680`.

- **The rules.**
  - Each successful finalization issues eight more NFTs to the existing collection, at no extra CST cost. Minting and registration are atomic.
  - Each auction opens after a seven-day preview. The first funded bid starts a 48-hour clock, at a minimum of 0.00001 ETH.
  - Each raise is at least 10%, rounded up. A bid in the last ten minutes leaves ten minutes on the clock, however often it happens.
- **No administrator can intervene.** No one can cancel, pause, change terms, override winners or redirect liabilities.
- **Settlement.** Outbid funds become pull refunds. Delivery, refunds and forwarding can each be retried on their own. Proceeds go to the game's reserve through its explicit `donateEth()`.

The rules are recorded in [docs/contract-architecture-and-auction-rules.md](docs/contract-architecture-and-auction-rules.md). After an approved contract change, regenerate the frontend ABI with `node scripts/sync-auction-abi.mjs`. Activation needs the reviewed immutable address, chain and runtime hash in the environment, then a new build and a full verification.

## Records

The venue was authorized for implementation on 22 October 2026 and for publication on 24 October. Its decisions are in the [decision register](docs/decision-register.md), and every plan and record is indexed in [docs/README.md](docs/README.md). The Go indexer, the renderer and the generator are not modified by this repository. Additions suggested for them are documented in [docs/media-and-indexer-integration.md](docs/media-and-indexer-integration.md).
