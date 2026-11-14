# Codebase review, 9–10 November 2026

_What stands between this codebase and one a student could learn excellent web engineering from. Made for [After the frame](after-the-frame.md) §4, step 11._

## How it was made

- A first audit of main at `f48082d` scored the code 8.2 out of 10 and named twelve gaps.
- Seven reviewers then each took one dimension (architecture, types, tests, performance, accessibility and languages, security and operations, CSS and consistency) and looked for what the audit had missed: 56 findings.
- A sceptic re-read the code for each finding, told to refute it. The 46 below were re-read and every one was confirmed, most with a correction to a count or a claim. The accessibility, CSS and half of the first audit's findings were not re-read before a usage limit, and are not listed.
- Six entries were fixed on 10 November, the small and independent ones first; each says so below, with what the fix found that the review had not. The rest are as they were. Each entry is checked again by whoever fixes it.

## What to keep

The reviewers were also asked what the codebase does unusually well:

- **Product rules as machine checks:** the two-clock lint rule, the 12 px floor and motion tokens as tests, key parity by type, font coverage in CI.
- **Trust boundaries:** origin-pinned, size-bounded, timed requests; sixteen zod-parsed registries that fail the build when malformed; the auction client checks block freshness and the deployed code hash.
- **Real physics:** a bit-exact port tested against the published records, run in workers and shared by browser, scripts and tests.
- **Comments that say why**, in one voice.
- **First paint and fallbacks:** streamed pages with inline previews, lazily loaded engines, reduced motion as two whole browser projects, axe on thirteen routes in eight languages.

## First (priority 1)

### Whole message catalogs are sent to client components

_Defect._

- **Where:** src/app/venue-document.tsx:82-92; src/app/[locale]/error.tsx:3; src/app/[locale]/not-found-view.tsx:4; the right pattern is at src/components/first-light.tsx:22
- **Why it matters:** Unused bytes on every page, against "fast, then dazzling": the document hands all 569 strings to components that read 6, 19 and 11 of them, and two client files import all eight catalogs.
- **Proposed:** Pass each client component only the strings it reads.
- **The sceptic's correction:** The counts are right for direct reads (569 keys; 6/19/11; 28 client files; 348,171 bytes of catalogs). Dynamic lookups add a few keys (for example four navigation labels in the running head), and React serialises the catalog once per document, not once per component.

### Every Turn first downloads and decodes the 3,456 px original, whatever the screen shows

_Defect._

- **Where:** src/components/artwork-stage.tsx:17,98-176 (probe at 110 and 169-171); src/components/artwork-viewer.tsx:366-374,404,621,626,638 (callers), 924-925 (twin layer already eager); src/components/artwork-media.tsx:630-643;
- **Why it matters:** The Turn is the venue's signature interaction, and on a phone it starts only after a 0.14 to 0.79 MB download from the image host and a 31 MB decode of a file the phone will not display: seconds of 'Opening this expression...' on slow 4G.
- **Proposed:** Ready what the plate shows: give the probe the layer's srcset and sizes (stillSourceSet(target) and PLATE_SIZES) so it resolves to the rung already in cache, or call decode() on the twin layer's own img.art-still. Keep the original for the loupe and the room. Add a browser test that a Turn at 390 px wide requests no 3456w file.
- **The sceptic's correction:** Nothing wrong in the counts or lines. It understates the problem in three ways. The probe runs on every Turn, not only the first to each expression (later ones come from cache but decode again), and on the room's material switch too (src/components/artwork-viewer.tsx:1114).
- **Fixed, 10 November:** the plate, the room and the Turn's probe now ask for a still through one function (`stillRequest` in `artwork-media.tsx`), so the probe resolves to the rung its surface shows. Two things the review had not seen: in Chromium the plate then took the original for itself, since it prefers a wider candidate once one is cached; and WebKit acts on each image attribute as it is set, so the order they go on and come off decides what is fetched. Left for later: the crossing's own preparation still loads a rung wider than a height-fitted plate shows, because `arrival-crossing.ts` reads a responsive image's `naturalWidth`, which is its density-corrected width.

### Class names are unchecked in both directions; one mistake shows on the sale page now

_Defect._

- **Where:** src/components/auction-launch.module.css:26-32 with src/components/auction-launch.tsx:40; src/components/auction-summary.module.css:12,47 (the correct form); src/components/orrery.tsx:241 with src/components/orrery.module.css:67;
- **Why it matters:** styles is typed as a string index, so a typo compiles and renders as a missing style. Visitors already see one result. A teaching codebase should show how the seam between CSS and TypeScript is closed.
- **Proposed:** Write :global(.eyebrow) in auction-launch.module.css:26 and :29; delete styles.cell and the five dead classes. Then guard the seam with one unit test in the style of src/lib/art/client-boundary.test.ts: every styles.x exists in its stylesheet and every local class is read, with a short allow-list.
- **The sceptic's correction:** Counts match except trivia: I count 646 static reads against 640 claimed, and 101 className template literals with a simpler pattern against 103. Three more classes (gallery, home, auction in artwork-viewer.module.css) are read only through styles[presentation] at artwork-viewer.tsx:1022, so a …
- **Fixed, 10 November:** `:global(.eyebrow)` in `auction-launch.module.css` (the line was 18 px where an eyebrow is 12), and `src/app/stylesheet-classes.test.ts` reads both directions, with the one computed read listed. The counts held: one read no stylesheet defined and five classes nothing read. Four are gone; the fifth, `.line .folio` in `artwork-viewer.module.css`, is excused by name in the test until a change open on those lines has landed.

### Nothing fails a test when the page throws or the console reports an error

_Weakness._

- **Where:** every spec in tests/e2e (no shared fixture; tests/e2e/helpers.ts holds functions only); the only pageerror listeners: tests/e2e/artwork-immersion.spec.ts:511,685; tests/e2e/collection-motion.spec.ts:307,340,385; tests/e2e/home.spec.ts:61;
- **Why it matters:** Uncaught errors are the cheapest regressions to catch and the commonest to miss. One shared fixture is how a professional suite catches them in every test at once, and here it would also turn each silent engine fallback (a shader that will not compile, a worker that throws) into a named failure instead of a quiet degradation.
- **Proposed:** Add tests/e2e/fixtures.ts that exports test = base.extend with an automatic fixture: it collects pageerror events, console messages of type error and warning, and same-origin responses of 500 or more, and asserts the list empty after each test, with a per-test allow-list for the cases that provoke a failure on purpose (artwork-immersion.spec.ts:509 aborts an image, for …
- **The sceptic's correction:** The counts hold exactly: 33 spec files all import test from @playwright/test, nothing calls .extend, 8 pageerror listeners sit in 4 specs and cover 15 tests, and my own count of tests per project is 308. One sentence is wrong: 'no test reads them'.
- **Fixed, 10 November:** `tests/e2e/fixtures.ts` exports the suite's `test`, every spec imports it, and a lint rule refuses Playwright's own. Warnings are left out, as the sceptic advised. Not foreseen: WebKit reports the requests it cuts short when a page is left as errors, and `next start` on a loopback address fetches every English address from itself, which now and then answers a prefetch with a 500; the fixture sets both aside and says why. It found one fault of the venue's own: on a phone the orbit in depth cancels a touchmove the browser will no longer let be cancelled. Not done: making `console.error` throw in the unit tests.

### The server/client boundary is guarded by a direct-import regex, and one registry crosses it on every route through the 404 view

_Weakness._

- **Where:** src/lib/art/client-boundary.test.ts:5-9, 32-34, 50-66; src/lib/art/plate-records.ts:1; src/app/[locale]/not-found-page.tsx:13-14; src/app/[locale]/not-found-view.tsx:9; src/components/artwork-media.tsx:15; src/lib/art/derivatives.ts:18-31;
- **Why it matters:** Measured against "Fast, then dazzling": a privacy page downloads a media player and a table of every work's paper tone because the 404 view shows a plate. The guard that should catch it has a blind spot and an empty PENDING list, so it reads as proof.
- **Proposed:** (1) Make the test walk the graph: from every module with the directive follow value imports (about 25 lines of resolver) and fail on any reachable SERVER_ONLY module, any .json above a few KB, and i18n/messages.ts unless listed.
- **The sceptic's correction:** The counts hold: 65 client modules, 83 component modules of which 26 carry no directive, 17 JSON files, 12 importers of getPlateGround, 14 client modules that reach plate-grounds.json, and the chunk sizes in the cited build. Four caveats. Of the 26, 19 are reachable from client modules;

### The image optimizer is open to any file on the media host and any local file, and no component uses it

_Weakness._

- **Where:** next.config.ts:10; tests/auction-harness/image.tsx:1 (the only next/image import in the repository). Framework source read at …
- **Why it matters:** An unused, unauthenticated endpoint that fetches and transcodes is attack surface and metered cost with no benefit: the venue serves its own hash-named derivatives and never calls the optimizer. A teaching codebase closes what it does not use, and checks that it stays closed.
- **Proposed:** Set images: { unoptimized: true } in next.config.ts and drop remotePatterns; the handler then renders the 404 (next-server.js:193). Add one browser check that /_next/image?url=%2Fart%2F23-ink.webp&w=640&q=75 answers 404. If the optimizer is ever wanted, allow only remote pathname '/images/new/cosmicsignature/**' and localPatterns [{ pathname: '/art/**' }].
- **The sceptic's correction:** None on the facts. Two additions: on the host the path is served by the platform's optimizer from the build manifest (the Node handler answers 400 in minimal mode, next-server.js:160-163), so the 404 at line 193 is what `next start` shows.
- **Fixed, 10 November:** `images.unoptimized` in `next.config.ts`, with a unit test that holds the setting and the absence of any `next/image` import together, and a browser check that the endpoint answers 404. Checked under `next start`; a preview deployment has not been asked.

## Second (priority 2)

### The sale has no client data layer: one lot is polled by two independent loops, and the loop exists in three copies

_Defect._

- **Where:** src/components/live-auction.tsx:29-33, 84-118, 154-192, 264, 277; src/components/auction-lot.tsx:13-17, 43-91, 118; src/components/auction-gallery.tsx:28, 71, 75-109; src/components/your-activity.tsx:14, 43-62; src/components/bid-sheet.tsx:11-13;
- **Why it matters:** This is the money surface: two caches for one lot mean two truths on one page and twice the chain traffic, and three copies of the loop mean any change (back-off, error mapping, staleness) must be made three times.
- **Proposed:** Add src/lib/auction/live.ts: a keyed, reference-counted store in the shape src/components/film-score-store.ts already uses. Keys `lot:<tokenId>:<account or empty>` and `batch:<page>`; one poller per key, started by the first subscriber and stopped by the last;
- **The sceptic's correction:** The counts and lines hold: three copies of the loop (39, 39 and 30 lines), 7 RPC calls a read and 8 with an account. Two points are softer than stated. The transport is created with batch: true (src/lib/auction/client.ts:33), so a read is about three HTTP requests, not seven or eight.

### One call needs a newer browser than the framework targets, and nothing checks for that

_Defect._

- **Where:** src/components/auction-gallery.tsx:130-161 (the call at :132, the catch at :159); src/app/[locale]/auctions/page.tsx:40-43; tsconfig.json:4; package.json (no browserslist key); eslint.config.mjs:39-45
- **Why it matters:** A visitor on Safari 16.4 to 17.3, or a Chrome or Firefox from early 2023, would meet a sale whose new lots have no pictures, and the catch keeps it silent. For students it shows that lib esnext plus DOM types answers 'does this exist somewhere', never 'does it exist for our visitors'.
- **Proposed:** Replace the call with a small helper that links the two signals by hand, or test 'any' in AbortSignal and fall back to the timeout signal. State the target in package.json (browserslist: chrome 111, edge 111, firefox 111, safari 16.4). Set lib to [dom, dom.iterable, es2022] and adjust the two test lines.
- **The sceptic's correction:** The facts hold, but the defect is latent, not live: AuctionGallery mounts only when a contract is configured (auction-launch.tsx:31) and .env.example leaves the address empty, so no visitor meets it until a sale opens.
- **Fixed, 10 November:** `browserslist` in `package.json` (equal to Next's default: the build's files are unchanged), `src/lib/abort.ts` in place of the call, `lib` at ES2022, and a lint rule that names `AbortSignal.any`. `eslint-plugin-compat` 7.0.2 was tried with ESLint 10.13 and does not report this call, nor `Promise.withResolvers` or `Object.groupBy`, so it was not added. A check that follows types into browser-compat-data would catch the next one, and is still to be written.

### An indexer outage blanks 57 of the 72 work pages, though the venue holds each one's record and stills

_Defect._

- **Where:** src/app/[locale]/art/[id]/page.tsx:49,109-143; src/lib/art/adapter.ts:34-59,80,85-95; src/lib/art/collection-cards.ts:26-105; src/components/artwork-entry.tsx:86-91; src/app/[locale]/auctions/[id]/page.tsx:76-82,105-107;
- **Why it matters:** The north star says the work is the first paint and the site is self-contained. For four works in five the first paint depends on another host answering twice, and an outage turns the gallery's main pages into empty 200s that a crawler may index. A teaching codebase should show graceful degradation from data it already ships;
- **Proposed:** Treat the build-time index as the second local source. In adapter.getArtwork's catch, fall back to artworkFromIndex(indexedWork(id)) when the curated registry has no entry, with notice 'indexer-unavailable' and labelled as the snapshot it is (its checkedOn is already carried, collection-cards.ts:85).
- **The sceptic's correction:** Counts hold: 15 curated, 72 indexed, 288 local rungs (4 for each of the 72, all files present). Two corrections. (1) 57 is the Light-day figure for pages that wait: only works 23, 31 and 35 hold a local Ink still, and page.tsx:124-126 paints at once only when the registry holds the opening …

### The sitemap lists 15 of the 72 works, and an address with a dot in it slips past the 404 proxy

_Defect._

- **Where:** src/app/sitemap.ts:20,23,25; src/app/sitemap.test.ts:28-36; src/lib/addresses.ts:6-8,28,36-40,47; src/lib/addresses.test.ts:169-172; src/proxy.ts:22,32,37; src/proxy.test.ts:123-137; tests/e2e/not-found.spec.ts:49-56; src/app/global-not-found.tsx:19;
- **Why it matters:** The works are what the venue most wants found, and the sitemap is the one place it states what exists: four in five are absent while every verification page is present. The proxy was built so that what does not exist is a true 404, and a blanket exclusion reopens that hole for a common malformed link, such as /uk/art/31.
- **Proposed:** Build the work entries from the collection index and add a test that every indexed work is listed in every locale; add lastModified from mintedAt. Narrow the matcher's exclusion to the static prefixes and real file extensions (the /art files, icons/, fonts/, _next/, the metadata files), add '/uk/art/31.5' to the matcher cases in proxy.test.ts and a status check to …
- **The sceptic's correction:** Part 1 holds exactly: 103 addresses per locale, 824 in all, 456 work addresses missing. Part 2 is true of the matcher but smaller than stated: the three dotted examples reach their routes and render [locale]/not-found.tsx, which reads no header, as a 200 that carries noindex.
- **Fixed, 10 November:** the sitemap lists every indexed work; the proxy's matcher names the venue's files instead of skipping every dot, and `src/proxy.test.ts` reads `public/` to keep it so. The 404 now trusts only an address the proxy could have written: the old check read two characters, and `/en//host` came out as a link to another site (only for a client that sent the header itself). `lastModified` was not added: a mint date is not when a page changed.

### Errors and field vitals are not reported

_Weakness._

- **Where:** src/app/[locale]/error.tsx:6; no global-error.tsx or instrumentation.ts
- **Why it matters:** The north star asks for field Core Web Vitals, and failures are invisible today.
- **Proposed:** Consented error and web-vitals reporting, and a global error boundary.
- **The sceptic's correction:** The 46 are bindingless 'catch {' blocks and none is empty: each sets a failed state, returns a fallback or carries a comment such as 'Storage is optional'. Seven '.catch(() => {})' calls are outside that count. Six console.warn calls is exact, all in the First Light and sculpture fallbacks.

### CI never runs the sale against the contract; the tests that do are opt-in and were last recorded on 24 October

_Weakness._

- **Where:** src/lib/auction/client.integration.test.ts:25,76,174-183; .github/workflows/ci.yml:25-26,100; scripts/run-local-auction-rehearsal.mjs:126-128,160; src/lib/auction/client.test.ts:27-31,92-113; tests/auction-harness/vite.config.ts:42-45;
- **Why it matters:** The sale is the one flow where a defect costs a visitor ETH, and its only proof against the real contract is a manual run that nothing keeps current. A student reading 95 % coverage on client.ts would conclude the client is proven against the contract; it is proven against a description of the contract written by the same hand.
- **Proposed:** 1) Commit the four compiled artifacts the suite reads (auction, NFT, test game, test actor) under tests/real-auction/artifacts with their SHA-256, add hardhat as a devDependency, and add a CI job that starts a Hardhat node on loopback and runs the suite with ART_AUCTION_REHEARSAL_RPC set; in that job a skipped suite is a failure.
- **The sceptic's correction:** The core facts hold; three details are off. (1) activity.ts does not read logs: it reads contract state through readContract and readBatch (activity.ts:38-110). Only history.ts is an untested log reader, so 'compare readActivity with the receipts' events' does not apply as written.

### The engine tests ask the app whether to assert, so a broken engine becomes a skip, not a failure

_Weakness._

- **Where:** tests/e2e/first-light.spec.ts:31-37,52-58; tests/e2e/first-light-home.spec.ts:27,48,73; tests/e2e/first-light-shared.spec.ts:30; tests/e2e/helpers.ts:159-165; tests/e2e/indexes.spec.ts:335,363,380,481; src/components/first-light.tsx:43,92-94,123-125;
- **Why it matters:** First Light is the venue's opening moment and the Orrery one of its indexes. A test that cannot fail when its subject breaks gives false confidence, which is worse than no test. Students should see that a capability probe must be independent of the code under test.
- **Proposed:** Replace each self-reported skip with a probe evaluated in the page: a webgl2 context on a new canvas for First Light, transferControlToOffscreen on HTMLCanvasElement.prototype for the Orrery (the component's own test at orrery.tsx:33-36). Assert the app's state against the probe: where the probe says the browser can draw, 'unavailable' or 'plates' is a failure.
- **The sceptic's correction:** Ten places in four specs is right. Two of the ten (first-light-home.spec.ts:27, first-light-shared.spec.ts:30) are if-guards, not skips: the test passes with the performance assertions silently not run, which is worse than a skip because nothing reports it.

### Two standing rules are guarded by tests that read a fraction of the site: the 12 px floor and no overflow at 320 px

_Weakness._

- **Where:** src/app/stylesheet-floor.test.ts:17,33-35,64-68; src/app/globals.css:73-80; src/app/typefaces.css:173-262; src/components/artwork-entry.module.css:62; src/components/orbit-score.module.css:420; tests/e2e/room.spec.ts:67;
- **Why it matters:** A rule is only as strong as the test that guards it, and a test named 'declares no font size below 12 px' that can compare 14 % of the declarations teaches the wrong lesson about static checks. Overflow on a small phone and type that is too small are the two defects a mobile reviewer finds first.
- **Proposed:** In the unit test, read custom properties too and resolve var() before comparing; fail on em and % sizes unless they are floored as orbit-score.module.css:420 does with max(12px, 0.75em); and decide in writing whether the 92 % Latin cut is inside the rule.
- **The sceptic's correction:** None of substance. Replaying the test's two regular expressions gives 45 stylesheets, 256 font declarations, 35 with a px or rem literal (13.7 %), 214 that are var(--fs-...) and 7 others (six inherit, one 0.9em).

### The hidden twin costs the first paint more than the hero: five inline copies of two previews, and both stills preloaded as equals

_Weakness._

- **Where:** src/app/[locale]/page.tsx:64-67; src/app/[locale]/art/[id]/page.tsx:146-151; src/components/artwork-viewer.tsx:888-891,920-931,1009-1013,1065-1071; src/components/artwork-media.tsx:330-332,587,618-643; src/lib/art/inline-previews.json
- **Why it matters:** Real and cheap to fix. On the home and the three works with inline previews, bytes that paint nothing sit between the hero and the scripts that hydrate it, and the hero's sharp still (which gates 'settled' and the film) shares the connection with a hidden one. The inline hero preview itself is right and should stay.
- **Proposed:** Inline only the opening expression's preview (the server already computes the opening); give the twin layer and the wing's fallback the 640 px URL (/art/N-...-640.webp, 11.6 to 26.7 KB, immutable) with lazy loading. Put fetchPriority="high" on the current layer's still and "low" on the twin's. Removes 46 to 107 KB from the home's HTML before compression.
- **The sceptic's correction:** Five copies confirmed (three in markup, two in the flight payload), and 88,695 to 151,835 follows from 2 x hero + 3 x twin. The title fails for work 31 on an Ink day (hero 2 x 35,631 = 71,262, twin 3 x 22,471 = 67,413). Only on a Light day does a twin copy precede the hero's preview in the HTML;

### Three guards are kept by hand, and one already has a hole

_Weakness._

- **Where:** src/lib/art/client-boundary.test.ts:8-34; src/lib/art/inline-preview.ts:6; src/lib/art/validation.ts:1,93; eslint.config.mjs:5-27,46,48,61-68; package.json:14; .github/workflows/ci.yml:23; scripts/lib/origin.mjs:18; scripts/build-collection-index.mjs:15;
- **Why it matters:** Each guard encodes a house rule the documents teach ('fast, then dazzling', 'two clocks'). A guard that can be passed without noticing teaches false confidence, and the heaviest registry is the one the list forgot.
- **Proposed:** Make the boundary test walk the import graph from every 'use client' file and derive its list (any module that imports zod or a JSON registry) instead of naming 20; or put import 'server-only' at the top of those modules and alias it to an empty module in vitest.config.ts and the two harness Vite configs.
- **The sceptic's correction:** The barrel probe is weaker than stated: the consumer's import passes, but the barrel itself ('export * from ./countdown') is reported by no-restricted-imports, so it could only be written inside the two exempt files.

## Third (priority 3)

### No Content-Security-Policy, and no test reads a header

_Weakness._

- **Where:** next.config.ts:47-50; inline scripts at src/app/venue-document.tsx:75,77
- **Why it matters:** The page asks wallets to sign, and sets four security headers, none a Content-Security-Policy.
- **Proposed:** A nonce- or hash-based policy, and a test of the response headers.
- **The sceptic's correction:** Tests do read headers: content-type (exhibitions.spec.ts:138), location (not-found.spec.ts:87) and Cache-Control (api/art/[id]/route.test.ts:30,42). None asserts the four security headers. artwork-entry.tsx:546 is a JSON-LD data block, which a CSP does not govern;

### The browser suite is not hermetic and leans on timing

_Weakness._

- **Where:** tests/e2e/; src/lib/art/constants.ts:1; playwright.config.ts:16
- **Why it matters:** Most specs read the live image host, so runs are flaky and load production; fixed waits and timeout overrides hide timing assumptions.
- **Proposed:** Serve fixtures for remote media and data; drive tests from page state and clocks.
- **The sceptic's correction:** 24 of 31 specs intercept nothing, not 25: orbit.spec.ts:132 stubs a film through the standInFilm helper. Fixed waits are 19 in tests/e2e (the 20th is tests/auction-harness/auction-live.spec.ts:286), and about half are deliberate 'nothing happens for N ms' checks.

### The keyboard path is exercised by one Tab press, and axe never sees an open sheet

_Weakness._

- **Where:** tests/e2e/artwork-immersion.spec.ts:749-758 (the one Tab); tests/e2e/accessibility.spec.ts:7-35; src/components/running-head.tsx:208-210 and src/app/globals.css:497-510 (the skip link);
- **Why it matters:** The north star promises keyboard and screen-reader paths. axe's static rules cannot tell whether Tab reaches a control, in what order, or whether focus can be seen. Those are the failures keyboard and screen-reader users actually meet, and they regress silently when markup moves.
- **Proposed:** Add keyboard.spec.ts over the same 13 routes: the first Tab lands on the skip link and Enter moves to main; Tab then visits every visible control once, each in view with a visible focus ring (a computed outline or box-shadow that differs from its unfocused state), and never lands on body.
- **The sceptic's correction:** The counts hold: Tab once (artwork-immersion.spec.ts:750, in a ten-press loop), 7,431 lines, Escape 21 times in tests/e2e (24 with the harness), Enter 8, 50 :focus-visible lines, 6 outline: none, and index-sheet.tsx is 585 lines.

### The WebGPU engine runs in no test, and the engines' unit tests count calls on a double that says yes to everything

_Weakness._

- **Where:** src/components/first-light-gpu.ts:47,203,428-499; src/components/first-light-gpu.test.ts:55-112 (75,78,94),282-291; src/components/first-light-engines.ts:6,20-29,35; src/components/first-light-engine.test.ts:17-49 (31-33),133-134,166-173;
- **Why it matters:** The extended-range engine is what the brightest screens, the ones designers own, are meant to see. Tests that pin the number of blur passes fail on a harmless change of look and pass on a shader that does not compile: they hold the implementation still without proving the picture.
- **Proposed:** Export the shader sources and add a bench spec like tests/e2e/frames.spec.ts: a blank page on its own origin that compiles every GLSL program with the browser's own compiler and reads the info log, in each engine that has WebGL 2, and that compiles both WGSL modules and creates the five pipelines in one Chromium project launched with WebGPU on a software adapter.
- **The sceptic's correction:** The title overstates: the engine's JavaScript does run in 22 unit tests against the fake device. What no test executes is the WGSL and a real device, as the body says. The counts hold: 862 lines, two modules (:47, :203), five pipelines (:469-475), 57 expect lines of which 22 assert calls.

### The browser suite only ever meets an Ink day

_Weakness._

- **Where:** .github/workflows/ci.yml:66; tests/e2e/venue-day.ts:1-5; playwright.config.ts:8,44; src/components/first-light-overture.tsx:41-42; src/lib/room.ts:77; src/lib/art/day.ts:21-25; tests/e2e/first-light-home.spec.ts:31,35,42,86,97;
- **Why it matters:** 'Light and Ink are equal' is a standing rule, and the day takes turns: about half of all first visits arrive on a Light day. A suite that knows one of the two days cannot say whether the venue's opening works on the other.
- **Proposed:** Add a second pinned day to CI as a small job: build with a Light day (by day.ts's arithmetic on the three-work pool, 2026-11-07 is one, and its work is No. 031) and run only the specs that read the day: home, first-light-home, first-light-shared, orbit-plate, plate-rewind, process, and the accessibility scan of / and /art/31.
- **The sceptic's correction:** Four specs, not five, call workOfTheDay(): process, home, collection and plate-rewind. The rest holds: 29 'ink' data-expression literals across 7 specs, and no spec refers to expressionOfTheDay. By day.ts's arithmetic 2026-11-07 is a Light day with No.

### Shared page flags follow four different ownership rules; the theatre's has two writers and a re-assert effect

_Weakness._

- **Where:** src/components/motion-provider.tsx:61-73; src/components/live-auction.tsx:73-77; src/components/auction-sheet.tsx:72-79; src/components/room-ground.tsx:15-27, 39-67; src/components/split-head.ts:10-16; src/components/orbit-presence.ts:27-32;
- **Why it matters:** Partly a real defect (the theatre flips inside the bid flow, where the venue promises films hold still; Sit behaves differently on the sale surface), partly duplication. A flag several components may hold at once needs holders, not a setter; four rules for one problem, each re-plumbed by hand, is what a student will copy.
- **Proposed:** src/lib/store.ts with two primitives. `createStore<T>(initial)` gives { get, set, subscribe } and `useStore(store, serverValue)`. `createClaims<T>(resolve)` gives `claim(holder, value)` and `release(holder)`, publishing a value resolved from the live claims: theatre is hushed while any claim stands; the room is the latest claim;
- **The sceptic's correction:** The counts hold: 16 reader files, 8 listener sets, 9 noSubscription declarations, 9 copies of the motion predicate under four names, 10 files listening for visibilitychange (media-policy.ts is one of them), three head observers with one rootMargin.

### The two expressions are declared six times and passed as string; the collection's URL grammar has two builders and three parsers

_Weakness._

- **Where:** src/lib/art/types.ts:4-13; src/components/turn.tsx:40, 43-45, 290-292, 332, 362; src/lib/auction/catalogue.ts:13; src/lib/art/collection-traits.ts:23; src/components/orbit-picture.ts:15; src/lib/first-light/material.ts:12;
- **Why it matters:** A type-modelling weakness; I found no wrong behaviour today. "Light and Ink are equal" is a standing rule, yet in the types an unknown id silently becomes one or the other depending on the file; the compiler could hold the rule if the seam were typed.
- **Proposed:** (1) One Expression in src/lib/art/types.ts, with groundOf, twinOf, isExpression and seamFor beside it; the other declarations re-export it or go, and Material becomes an alias. Props that can only be one of the two take Expression; props that may carry a future medium take InterpretationId and narrow once with isExpression, with the fallback written in one place.
- **The sceptic's correction:** The declarations and inline copies are as counted (4 Expression, 2 Material, 5 inline signatures; 8 inline grounds, 4 inline twins); with a wider pattern I find 28 expression-named string props, so 24 is a floor.

### Five of the eight languages wait for a 54 to 253 KB stylesheet of unicode-range tables before anything paints

_Weakness._

- **Where:** src/app/venue-document.tsx:70-74; src/lib/fonts.ts:9-15; scripts/build-font-subsets.mjs:58-84,121-137; next.config.ts:39-45
- **Why it matters:** Real defect for five locales. 'The work is the first paint' holds in English; in zh-HK the plate's inline preview cannot paint until a stylesheet twice the size of the whole site's CSS (3.6 times under gzip) has arrived, and blocking buys nothing because every face swaps in later anyway.
- **Proposed:** Take the sheet off the critical path: preload it and apply it after first paint (a non-blocking link, or a media swap), and block only on a small generated first-screen sheet holding the few slices the frame's own strings need (the script knows each slice's range; check-font-coverage.mjs already scans the text).
- **The sceptic's correction:** Sizes, rule counts and Brotli figures reproduce exactly (the Brotli is quality 11). The title's 54 to 253 KB is uncompressed: on the wire it is 8.5 to 24 KB at Brotli 11, 12 to 38 KB at Brotli 5, and 14 to 83 KB under gzip.

### A work's page is rendered on every request and cannot be prefetched whole; most works also wait on the image host before the plate is sent

_Weakness._

- **Where:** src/app/[locale]/art/[id]/page.tsx:93-106,124-134,166,189-197; src/lib/art/adapter.ts:34-38,76-84; src/lib/art/constants.ts:10-12; src/lib/art/collection-cards.ts:7-26; src/app/[locale]/verify/orbit/[id]/page.tsx:44-48;
- **Why it matters:** This is the page a shared link lands on and the target of nearly every link in the venue. Each visit pays a server render before its content, and each in-site navigation shows the loading plate while the server works, where a cached page would be prefetched whole. Next's data cache hides the upstream wait only while it is warm.
- **Proposed:** Small step first: paint from the index (`curated ?? artworkFromIndex(indexed)`) and stream the live record for every work through the existing `live` prop and Suspense (page.tsx:166, 189-197); the proxy already refuses unknown numbers.
- **The sceptic's correction:** Counts and lines are right (15 curated works, 3 with Ink, so 57 or 69 of 72 wait; the Next docs say what is quoted; 230 MB over 576 pages is about 400 KB each).

### Code the first screen never runs is in the first chunks: the 404's film player on every page, the study room on every plate, the orbit section on every work

_Weakness._

- **Where:** src/app/[locale]/not-found-view.tsx:1,9,52-58; src/app/[locale]/not-found.tsx:8-10; src/components/artwork-viewer.tsx:34,1107-1125; src/app/[locale]/art/[id]/page.tsx:26,174-184; src/components/orbit-score.tsx:1,28,132,184-189;
- **Why it matters:** A mid-range phone downloads, parses and compiles all of it before the plate answers a tap, and the Privacy page ships a film player. The codebase already splits its engines this way (overture.tsx:19, first-light-engines.ts:23, auction-panel.tsx:6), so these are omissions, not a different taste.
- **Proposed:** Render the 404's plate as a plain server <img> passed to the client view as children. Load the room with lazy(() => import('./artwork-room')), warmed at idle or on the first hover or focus of Study and Film. Keep the orbit section's heading and published record as server markup and load the performing part from a small presence gate when it is near.
- **The sceptic's correction:** The counts are exact: my own walk of static value imports gives 103,831 B in 8 modules reachable only through the 404 view, 72,157 B for the rest of the frame, 7 modules and 85,759 B for the room, and 24 modules and 229,968 B for the orbit section. Two shadings.

### Main-thread and GPU work is sized in fixed counts, not time: the still-motion physics and the crossing's preparation

_Weakness._

- **Where:** src/components/orbit-twin.tsx:38,171-176; src/components/orbit-beyond.ts:43,203-211; src/lib/physics/orbit.ts:609-716; src/lib/physics/continuation.ts:9-13,95-100; src/components/arrival-crossing.ts:124-131,235-249,260-280,645-648;
- **Why it matters:** The comment says 'so the page stays responsive', but a batch that fits a frame on the author's machine takes several on a mid-range phone, and the visitors on that path are the ones who asked for reduced motion. Not measured here: the counts are read from the code.
- **Proposed:** Time-box the batches (advance until about 8 ms have passed, by performance.now) or have the worker return the sampled path. Prepare the crossing on first intent (hover, focus, key or touch on a Turn control; whenReady(400) already allows for a crossing not yet ready) and cap its stills at the 1920 rung.
- **The sceptic's correction:** The step arithmetic is right (9 roots and 54 divisions a step; horizon 8,000,000, so up to 35 frames), and it can now be called measured: a copy of the integrator timed in Node on an Apple M4 Max takes 36 ms for 400,000 steps (one still twin frame) and 9 ms for 100,000, so the twin's batch already …

### Four trust boundaries are typed by assertion, so the checks behind them look like dead code

_Weakness._

- **Where:** src/components/live-auction.tsx:89-96; src/components/your-activity.tsx:45-52; src/components/auction-gallery.tsx:138-146; src/lib/auction/config.ts:3,11,12; src/lib/auction/client.ts:109,133,177,220,245; src/lib/auction/history.ts:197;
- **Why it matters:** A wallet's announcement and the sale's own configuration are the most sensitive inputs on a page that asks people to sign. Typed by assertion, the validation is one 'remove unnecessary condition' away from deletion, and it exists in two copies.
- **Proposed:** One module with isProviderDetail(value: unknown): value is ProviderDetail and a WindowEventMap entry for 'eip6963:announceProvider', used by both components. Read the response as unknown and narrow the fields the gallery uses with one guard.
- **The sceptic's correction:** Only the wallet announcement is input from a third party: /api/art/[id] is the venue's own same-origin route, the environment values are the operator's at build time, and curated-media.json is a repository file.

### 31 leftovers only type-aware rules can see: 21 deprecated calls and 10 assertions that assert nothing

_Weakness._

- **Where:** src/lib/art/orbit-hollows.ts:19,21,22,51,53; src/lib/art/ink-clocks.ts:47,48,55; src/lib/art/orbit-frames.ts:23,84; src/lib/art/orbit-records.ts:16; src/lib/art/orbit-windows.ts:23; src/lib/art/details-validation.ts:6; src/lib/art/all-the-light.ts:46;
- **Why it matters:** Deprecated calls break on the next major of zod and @types/react and show readers the old spelling beside the new one. An assertion that does nothing trains readers to skip assertions. The count also prices what the first audit could only name: the type-aware preset costs 43 edits in production code.
- **Proposed:** Replace the 21 calls and delete the 10 assertions (most are auto-fixes). Then add tseslint.configs.recommendedTypeChecked and no-deprecated for src files outside tests, with parserOptions.projectService. For tests, turn off require-await and unbound-method, and give the act callbacks braces before enabling no-floating-promises there.
- **The sceptic's correction:** None on the counts that carry the claim. One side figure differs: tests/e2e/frames.spec.ts carries 136 of the 179 reports in tests/ in my run, not 125. Severity is low: every deprecated call still works today, and .finite() changes nothing in zod 4.

### Ten stricter compiler options cost 17 edits, and two of them guard the scripts' way of loading TypeScript

_Weakness._

- **Where:** tsconfig.json:3-18; package.json:18,37-41; src/components/turn.tsx:87; src/lib/art/request.ts:8; src/lib/auction/client.ts:50; src/components/overture.tsx:39,43,46; src/lib/auction/activity.ts:96; src/app/[locale]/sharing-routes.test.tsx:12-13;
- **Why it matters:** A rule the code already keeps but the compiler does not enforce is kept by luck. Students copy tsconfig files; this one can show the current set, with the reason for two of the flags visible in the build scripts.
- **Proposed:** Turn the ten on in tsconfig.json and make the 17 edits: parameter properties become declared fields, overture.tsx gets three override modifiers, one unused parameter and one unused field go. Convert the 11 scripts that load TypeScript to .ts and add scripts/**/*.ts to the tsconfig include (eslint.config.mjs:48 already expects such files); leave the other 38 until then.
- **The sceptic's correction:** 'Kept by luck' overstates it: CI runs test:scripts (ci.yml:29), which loads these modules through Node's stripper, so a slip fails there, only later and less clearly. scripts/ holds 48 .mjs files, not 49 (the 49th is tests/real-auction/seed-contracts.mjs), so 37 would be left.

### The domain's primitives are restated, and none carries its type

_Weakness._

- **Where:** src/lib/art/types.ts:6; src/components/turn.tsx:40; src/lib/auction/catalogue.ts:13; src/lib/art/collection-traits.ts:23,45; src/components/orbit-picture.ts:15; src/lib/first-light/material.ts:12; src/components/film-score-band.tsx:30;
- **Why it matters:** The venue's central idea is one work in two expressions, and types.ts:5 already expects a further medium; that would be an 11-file change today. A rule written 16 times drifts, and a type lost at the schema is put back by cast.
- **Proposed:** Export Expression (and EXPRESSIONS as const) once from src/lib/art/types.ts, import it at the other ten sites and type the three lookups with it. Add src/lib/art/patterns.ts (plain regular expressions, safe for the client) and a server-side schema-primitives.ts built on it: sha256, seed (z.templateLiteral or a transform to `0x${string}`), txHash, address, integer.
- **The sceptic's correction:** 'No seed schema yields the type' is wrong: validation.ts:8-12 and details-validation.ts:20-23 transform to `0x${string}`; it is the 12 strict registry schemas that yield string, and the five casts sit downstream of those.

### The proxy asks the indexer, uncached, on every request for a work beyond the index

_Weakness._

- **Where:** src/proxy.ts:28; src/lib/addresses.ts:78-83,94,103-107,159-167; src/lib/art/request.ts:79; src/lib/art/adapter.ts:80; src/app/api/art/[id]/route.ts:13-15; tests/e2e/not-found.spec.ts:70-75,197-207.
- **Why it matters:** The works beyond the index are the newest ones, born at the end of a cycle and most likely to be visited that day: their time to first byte is tied to the indexer on every request until the next deploy.
- **Proposed:** Remember definite answers in the proxy's module scope: a small capped map (say 1,024 numbers; 'recorded' for five minutes, 'record not found' for one minute), never an outage; it is best-effort per instance and that is enough. Better still, ask one bounded question at most once a minute, the newest token's number (the first row of /api/cosmicgame/cst/list/all/0/1;
- **The sceptic's correction:** The behaviour is deliberate and documented (addresses.ts:152-158; docs/media-and-indexer-integration.md:15), and it degrades safely: a 2 s deadline, then the page decides. The collection index's total is 72, so today every such address is a number with no record;

### The freshness guard trusts the visitor's clock, and its refusal is worded as an RPC outage

_Weakness._

- **Where:** src/lib/auction/client.ts:44,57-62,107,117,131,137,162,248; src/lib/auction/client.test.ts:234-242; src/components/live-auction.tsx:166-175; src/components/auction-lot.tsx:55-63; src/components/auction-gallery.tsx:87-88,217;
- **Why it matters:** Failing closed is right; failing closed for a reason that is not the stated one is not. A collector with a drifting desktop clock is told the chain's data is unavailable when it was fresh, can do nothing about it, and misses the close.
- **Proposed:** assertBlockFresh already takes `now` as a parameter. Measure the device's offset from the venue's own server once per session (the Date header of a same-origin response read with fetch is enough for a 30 s window) and pass Date.now() + offset; keep the same window.
- **The sceptic's correction:** The bounds, the six call sites and the generic message are as stated. At exactly 31 s slow only a block under one second old trips the check, so failures are intermittent there and constant from about 33 s; 121 s fast always fails.

### What production runs is not what was checked: Node 24 against CI's Node 22, and environment values that no build validates

_Weakness._

- **Where:** README.md:9; .github/workflows/ci.yml:2-10,19,22,71,97; package.json:7,71; .env.example:16-18; src/lib/auction/config.ts:3-12; src/lib/auction/client.ts:68-75; src/lib/site.ts:6,43; src/app/robots.ts:4; src/app/sitemap.ts:25;
- **Why it matters:** The sale opens by setting two variables on release day. A typing slip should fail the deploy, not quietly show 'not live' or tell bidders the configuration is wrong. And a suite that passes on one Node major proves nothing about another; students should see one pinned runtime from laptop to CI to host.
- **Proposed:** Add src/lib/env.ts: one zod schema (zod is already a dependency) parsed at import, and import it from next.config.ts so `next build` fails on a bad value. Rules: address empty or 20 bytes of hex; code hash required when the address is set on chain 42161; chain id 42161 or 31337; RPC and site addresses https, with SITE_URL reduced to its origin;
- **The sceptic's correction:** The Node 24 figure rests on README.md:9 alone; the host setting is not in the repository. README.md:19 tells contributors to use Node 22.12+, and package.json:71 is @types/node ^22. A malformed address fails closed (no funds at risk), so this is a missing guardrail, not a live fault.

## Later (priority 4)

### Six giant component functions steered by flag refs

_Weakness._

- **Where:** src/components/artwork-viewer.tsx:168 (961 lines); orbit-score.tsx:101 (941); artwork-room.tsx:322 (844); artwork-media.tsx:184 (681); live-auction.tsx:47 (580); all-the-light.tsx:105 (542)
- **Why it matters:** No student can hold them, and impossible states are representable.
- **Proposed:** A reducer or explicit state machine for each, effects in named hooks, drawing in pure modules.
- **The sceptic's correction:** The line counts, the 19 useState calls, the refs at 259-267 and the 316-594 closure are exact. artwork-room has four mode flags (showFilm, loupe, when, wavelength) for five modes, not five flags.

### Strictness is at the default

_Taste._

- **Where:** tsconfig.json:7; eslint.config.mjs:40; scripts/
- **Why it matters:** Rules a machine could keep are kept by habit: no noUncheckedIndexedAccess, no type-checked lint rules, untyped scripts.
- **Proposed:** Raise strictness in stages, starting outside the numeric kernels.
- **The sceptic's correction:** noUncheckedIndexedAccess raises 1,730 errors today, not about 1,400: 914 in shipped code and 816 in tests. The numeric kernels (src/lib/physics, first-light, crossing) hold 737 of the 914, with 340 in physics/orbit.ts alone.

### The pipeline repeats the same work seven times, and one step can stop it for reasons outside the code

_Weakness._

- **Where:** .github/workflows/ci.yml:22,53-75; tests/e2e/accessibility.spec.ts:7-49; tests/e2e/not-found.spec.ts:16-18; tests/e2e/frames.spec.ts:81-83; tests/e2e/sale-configured.spec.ts:50-55,57-69,71-104,106-114; playwright.config.ts:15,41; vitest.config.ts:8-9;
- **Why it matters:** A slow pipeline is one people stop waiting for, and a gate that can turn red with no change to the code teaches people to re-run rather than read. The time spent repeating one static scan seven times is the time the missing checks (open sheets, 320 px, the keyboard, a Light day) need.
- **Proposed:** Build once in a build job, upload .next, and have the browser jobs download it. Give accessibility.spec.ts the 'one project asks' treatment (one desktop and one phone project) and spend the saved runs on the checks above.
- **The sceptic's correction:** The facts hold: seven builds, 308 tests per project by my own count with 104 of them accessibility, 91 uncompared screenshots, next dev spawned at sale-configured.spec.ts:75-98, npm audit at ci.yml:22, 5 of 152 unit files opting out of jsdom, and workers: process.env.CI ? 2 : 2.

### The html element is the page's state store: the Turn's controller parses its own state back from the DOM, and the crossing watches it with a MutationObserver

_Weakness._

- **Where:** src/components/turn.tsx:90-107, 119-125, 165-186, 224-236; src/components/arrival-crossing.ts:514-517, 574, 608-610, 626, 638, 657-669, 695; src/components/artwork-viewer.tsx:222-225, 261-263, 283, 354, 386, 410;
- **Why it matters:** A design hazard rather than a bug seen today. CSS legitimately needs these attributes (44 selectors key on them); the problem is that TypeScript reads them back. State held as untyped strings on a global node cannot be followed with find-references, can be changed by any module, and makes impossible combinations representable …
- **Proposed:** (1) src/lib/root-state.ts names every root attribute and custom property once and exports a typed `mirror(name, value)`; nothing else touches documentElement attributes. (2) SeamController owns `{ mode: TurnMode | null; to: Room | null; seam: number | null;
- **The sceptic's correction:** The counts are right to within one: 33 imperative writes in 10 modules (34 in 11 with the JSX data-room in src/app/venue-document.tsx), 13 reads in 4 modules plus the observer, 44 CSS selector lines. Three statements go too far.

### The orbit worker's reply stream is folded into state twice by hand, and seven worker clients repeat one lifecycle

_Weakness._

- **Where:** src/components/orbit-derivation.ts:53-58, 62-120; src/components/orbit-verifier.tsx:26-37, 87-149; src/components/orbit-score.tsx:185-189, 270-303; src/components/choice-field.tsx:170-174, 185-196, 278-320; src/components/film-score-store.ts:45-58;
- **Why it matters:** Duplication with latent drift; I found no wrong behaviour today. The re-derivation is the museum's central proof, shown on the work page and on Verify an orbit; its client state should be the clearest reducer in the repository and shared by both pages, so they cannot disagree about what counts as failed.
- **Proposed:** (1) A pure module beside the worker, src/lib/physics/orbit-derivation.ts: `type Derivation = { stage: 'deriving'; progress } | { stage: 'measured'; result; comparisons; framed?: FramedSamples | null; fate?: {...} | 'failed'; space?: PlateSpace | null } | { stage: 'failed' }` and `reduce(state, reply)`; the worker posts `{ type: 'end' }` last so no client infers the end.
- **The sceptic's correction:** Both clients and the seven sites are as described. Four corrections. The messageerror scenario does not hold: a reply that cannot be cloned throws in the worker at postMessage, where each one-shot worker's try/catch turns it into a 'failed' reply (or the Worker's error event fires), and every site …

### Two light engines share a contract buried in the WebGL file; frame set-up and about thirty shader constants are written twice with no parity test

_Weakness._

- **Where:** src/components/first-light-engine.ts:100-205, 230-293, 425, 491-502, 517-523, 539-540, 560-577, 634-641; src/components/first-light-gpu.ts:2, 29-34, 48-66, 136-198, 217-218, 244-265, 425, 511-519, 547, 660, 719-734, 767-794, 808-828;
- **Why it matters:** Duplication with unguarded parity. I compared the two shader sets and found no drift today, but the header's promise ("the maths is the WebGL engine's, shader for shader") is kept by eye: one tuned constant in one file would make standard and high-range screens show different light for the same work.
- **Proposed:** (1) src/lib/first-light/engine.ts holds the contract and the pure helpers both back ends call: `bufferSize(css, ratio)`, `frameOf(exposure, space, canvas, look)` returning { head, ratio, vertices, headSpan }, `copyMatrix(copy)`, `GLOW_PASSES`.
- **The sceptic's correction:** None of substance. Every cited pair matches, the head gain is a uniform fed 2.6 in GLSL and the literal 2.6 in WGSL (src/components/first-light-gpu.ts:158), and the WGSL Frame struct does pack to the 36 floats and the offsets the code uses, so nothing has drifted. I count about 33 shared literals.

### The 2D drawing code repeats itself: After the frame and the twin are two copies of one performance, and the arrival map is read three ways

_Weakness._

- **Where:** src/components/orbit-beyond.ts:28-43, 69-103, 130-159, 198-248; src/components/orbit-twin.tsx:29-38, 47-78, 103-147, 171-219; src/components/orbit-score.tsx:438-491, 542; src/components/arrival-crossing.ts:99-104, 134-145;
- **Why it matters:** Duplication, not a visible bug. These are the lessons' own drawings, and each pair must stay identical for the pictures to agree: the twin reads as one line with the work only while both trace alike, and the orbit in the hand lands on the flat drawing only while both palettes match. Today that is kept by copying.
- **Proposed:** (1) src/components/orbit-continued.ts: `continuedTrails({ context, picture, ratio })` returning { trace(path, colour, first, last, alpha), retrace(paths), fade() } and `performPast({ advance(elapsed), draw(), speak(), resting(), frame })`, with one block of constants. performBeyond and performTwin keep only what differs (one path and the escape's settling;
- **The sceptic's correction:** The counts hold: 24 fields in each stage interface, 21 with the same name; the five constants, place, trace, retrace, the fade and the 250 ms throttle are the same. Two overstatements.

### The still ladder has two rungs, so the largest iPhones take the 1,920 px file and 720 px phones take 1,280

_Weakness._

- **Where:** scripts/build-still-ladder.mjs:42-45; src/lib/art/types.ts:208-214; src/components/artwork-media.tsx:40; public/art/stills (288 files)
- **Why it matters:** A matter of degree, not a bug: the ladder is correct, only coarse. But the phones with the least to spare are sent the most surplus, twice per plate.
- **Proposed:** Add a rung near 960 and one near 1440 to RUNGS (the pipeline already proves each rung against its master) and regenerate. Do it after the media leave git, since it adds files.
- **The sceptic's correction:** Byte means re-measured and exact. 428 pt iPhones (1,284 px) are caught as well as 430 and 440. The 1920 choice is WebKit's rule (the first candidate at or above the screen's density), so it holds for every browser on an iPhone;

### The layout serialises the whole collection into every document for a closed dialog, and media records cross to the client unprojected

_Weakness._

- **Where:** src/app/venue-document.tsx:85-91; src/lib/art/collection-index.ts:171-186; src/components/index-sheet.tsx:203-225; src/lib/art/view-media.ts:13-16,42-44; src/app/[locale]/exhibitions/page.tsx:65;
- **Why it matters:** Small per page once compressed, but it is an unbudgeted crossing that grows by itself, and the authors' own figure for the frame (about 400 KB a prerendered page) is why two routes gave up prerendering. Distinct from the catalog finding: this is data, not strings.
- **Proposed:** Load the index when the sheet first opens, or at idle, from a build-time JSON file served immutable. Hand thumbnails and hangs artworkForView(work, 'still'). Add a per-route check on flight bytes beside the budgets the open pull request brings.
- **The sceptic's correction:** Figures reproduce: compactWorks() is 30,555 B as JSON (4,463 B gzip by my count, not 4,370), the row is 30,706 B in each built document and the second largest on /privacy after the 34,416 B layout row that carries the catalog; /exhibitions is 200,459 B with 539 64-hex hashes against 89.

### Indexed access: 50 guards the compiler calls dead today; the flag costs 100 production edits outside the numeric kernels

_Weakness._

- **Where:** tsconfig.json:7; src/components/artwork-room.tsx:387-444 (29 of the guards); src/components/hang.tsx:67-82; src/lib/art/collection-index.ts:165-166; src/lib/art/history-validation.ts:83-85; src/lib/physics/orbit.ts (340 errors);
- **Why it matters:** This is the price list the first audit estimated by search. The index flag is affordable outside the kernels and protects code already written as if it were on. The optional-property flag would cost 240 edits and catch nothing here, which is worth recording so nobody tries it twice.
- **Proposed:** Do not add '!' to 814 kernel reads. Add a second pass, npm run type-check:index, about 40 lines on the compiler API: the same tsconfig with noUncheckedIndexedAccess on, failing only for files outside src/lib/physics, first-light, crossing and the seven engine files.
- **The sceptic's correction:** The numbers hold. The 29 artwork-room guards run from :387 to :961; 16 of them are inside the cited :387-444. No failing site exists, as the claim says, and the 'dead' reading appears only under a lint rule the project does not run.

### Every chain read goes to one RPC named in a public variable: no second endpoint, no backoff, and a paid key would ship to every visitor

_Weakness._

- **Where:** src/lib/auction/client.ts:31-34,68-102,104-126,128-164; src/lib/auction/config.ts:10; .env.example:6; src/components/live-auction.tsx:154-192; src/components/auction-lot.tsx:43-81; src/components/auction-gallery.tsx:75-104;
- **Why it matters:** A timed sale in real ETH should not close on a bidder because one shared, rate-limited endpoint had a bad minute, and fixed-interval polling from every open tab is how a struggling endpoint is kept down. docs/implementation-and-validation.md:60 already says RPC must be funded and operated;
- **Proposed:** Give reads two routes. Either use a provider key restricted to the site's origin at the provider, or, better, add a route handler (/api/rpc) built from the rehearsal gateway: POST only, the read methods only, eth_call and eth_getLogs only to the auction and NFT addresses, a body bound and a deadline, server-only RPC_URLS with viem's fallback() across two providers.
- **The sceptic's correction:** None of this runs today: the address is empty in production (README.md:15) and the polling components mount only when auctionConfigured is true. The transport is not bare: batch: true folds the 7 to 8 calls into about three HTTP posts, and retryCount 1 is one retry with viem's own backoff, so 'no …

### No way to report a vulnerability, and the privacy statement names one of the six things the site stores

_Weakness._

- **Where:** absent SECURITY.md and public/.well-known/security.txt (public/ holds only art/ and icons/); src/components/colophon.tsx:39; src/app/[locale]/privacy/page.tsx:21-23; src/lib/i18n/en.ts:190-192; src/lib/storage-keys.ts:7-33;
- **Why it matters:** A site that asks wallets to sign should say where a researcher, or a collector who has met a copy of it, can write; a security.txt (RFC 9116) costs minutes and is what a reviewer looks for first.
- **Proposed:** Add SECURITY.md and public/.well-known/security.txt (Contact, Expires, Preferred-Languages, Canonical); its path has a dot, so the proxy already leaves it alone. Put the same contact in one line on /privacy or /terms.
- **The sceptic's correction:** None on the facts. The storage half is taste, as the claim itself says: all six keys hold interface state, five for the visit only, and none identifies a person. Only the missing report channel is a real gap.
