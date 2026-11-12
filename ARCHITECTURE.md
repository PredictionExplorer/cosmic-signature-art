# Architecture

_How cosmic.art is built, and why. Written on 8 November 2026 against main at 85af476 and the two test fixes of PR #26, for a reader who knows some TypeScript and React and wants to learn from a working venue. Each section names the files to open next. What the venue is and the principles it keeps are in the [README](README.md). The plans and records behind each part are indexed in [docs/README.md](docs/README.md)._

## 1. The shape

A request passes through four layers. Each layer may use the layers below it, never the ones above.

```
request ─▶ src/proxy.ts             the address: its locale, and a true 404 for a work that does not exist
        ─▶ src/app/[locale]/…       routes: server components that read data and render HTML
        ─▶ src/components/…         what pages are made of; client components hydrate here
        ─▶ src/lib/…                data, physics, policy, words: plain TypeScript, no React
              └─ src/lib/art/*.json registries, measured offline by `npm run art:*` and committed
```

The reasons:

- **The server renders the work.** Every page is a server component. It reads the registries and the public indexer and sends HTML that already holds the plate. The day's plate even carries its own 640 px preview inline (`src/lib/art/inline-preview.ts`). JavaScript adds motion, instruments and choices; the art never waits for it.
- **The library is plain TypeScript.** Nothing in `src/lib` renders. `src/lib/physics/orbit.ts` imports nothing at all, so one file runs in a browser worker, in the build scripts (through Node's type stripping) and in the tests. A page and the script that checked it can never disagree.
- **Registries stay on the server.** The JSON registries in `src/lib/art/` are measured offline and weigh more than a page should carry. A server component reads them and hands each client component only its own work's facts. `src/lib/art/client-boundary.test.ts` fails the suite if a client component imports a module that carries one.
- **Measured once, offline.** The pipelines that read the publisher's films and stills run by hand, never in the build, and commit what they measured (§9). Every visitor and every build sees the same facts.

## 2. Routes

Every page sits under `src/app/[locale]/`. The proxy (`src/proxy.ts`) gives an address without a locale to English, so `/art/31` is served by `/en/art/31`. It also refuses a work, an exhibition or an orbit number that does not exist, using the short lists in `src/lib/addresses.ts`. Every route streams behind its loading plate (`[locale]/loading.tsx`), so by the time a page's own `notFound()` runs, the response has already begun as a 200. A true 404 has to be said before that.

| Address                               | What it is                                                                                                                                                | Rendered                                      |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| `/`                                   | The home: the day's work in the day's expression, its twin one Turn away, then the statement. On a first visit, First Light performs over the plate (§7). | prerendered per locale, refreshed every 5 min |
| `/collection`                         | The catalogue of every indexed work, ordered by number, cycle or spectrum, with search and pages of eighteen.                                             | on request                                    |
| `/collection/all-the-light`           | All the light: every Light still added as light adds. A derived view.                                                                                     | prerendered                                   |
| `/collection/orrery`                  | The Orrery: every orbit performed at once, from where its recorded window begins. A derived view.                                                         | prerendered                                   |
| `/art/[id]`                           | A work: the plate and its room, the orbit section ("The orbit, re-performed"), and the record.                                                            | on request                                    |
| `/verify/orbit`, `/verify/orbit/[id]` | Verify an orbit: the door, then the work's orbit derived again from its seed in the visitor's browser, as a transcript (§6).                              | prerendered, then on request                  |
| `/first-light/[id]`                   | First Light's proof page (F0), kept out of search engines.                                                                                                | on request                                    |
| `/process`, `/statement`              | How a work is made, and the venue's statement.                                                                                                            | prerendered                                   |
| `/exhibitions`, `/exhibitions/[slug]` | The exhibitions: a hang, the trails, and each cycle's results.                                                                                            | prerendered, then on request                  |
| `/auctions`, `/auctions/[id]`         | The sale. It stays inactive until a reviewed contract address and runtime hash are configured.                                                            | prerendered, then on request                  |
| `/terms`, `/privacy`                  | The terms and the privacy notice.                                                                                                                         | prerendered                                   |
| `/api/art/[id]`                       | One work's public record as JSON. It has no signing, wallet or financial authority.                                                                       | on request                                    |

The sharing cards (`opengraph-image.tsx`, `twitter-image.tsx`, drawn by `src/components/sharing-card.tsx`), `sitemap.ts`, `robots.ts` and `manifest.ts` are routes too. An address no route answers gets the venue's own 404 (`src/app/global-not-found.tsx`), which speaks the visitor's language.

**The document.** `src/app/venue-document.tsx` is the `<html>` every locale shares. Before anything paints, it runs two small inline scripts:

- `roomScript` (`src/lib/room.ts`) chooses the ground, paper or night, so the running head is never the wrong material for a frame. On the home, a first visit is marked `<html data-overture="pending">`, which is First Light's gate.
- `revealScript` (`src/lib/reveal.ts`) lets WebKit paint a streamed page that it would otherwise hold back.

The document also holds the motion provider, the running head, the index and key sheets, and the colophon.

## 3. Components and library

`src/components/` holds what pages are made of. Most of a work's page is three components:

- `artwork-viewer.tsx` composes the plate, the Turn and the room.
- `artwork-media.tsx` paints one expression: the inline preview, then the still, then a film if motion is welcome.
- `artwork-room.tsx` is the full viewing room, with the films and the lenses.

Beneath them stands the orbit section, "The orbit, re-performed". `orbit-score.tsx` is where its parts meet, and two rules shape them:

- **Each thing that changes has one owner**, a hook: the recorded window's clock (`orbit-clock.ts`), After the frame (`orbit-beyond-state.ts`), the twin (`orbit-twin-state.ts`), the choosing by hand (`orbit-choosing.ts`) and the picture's room on the page (`orbit-room.ts`).
- **Each thing that can stand on its stage has one performer**, a plain function with no hooks, which draws and keeps time: the recorded window (`orbit-window.ts`), the question (`orbit-choice.ts`), After the frame (`orbit-beyond.ts`) and the twin (`orbit-twin.tsx`). All four draw with one painter (`orbit-painter.ts`) on one picture (`orbit-picture.ts`).

[docs/after-the-frame.md](docs/after-the-frame.md) §8.5 lists every file and says how the section was parted without changing what a visitor meets.

`src/lib/` holds what pages know:

| Folder                 | What it holds                                                                                                                                                                        |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/art/`         | The works: the indexer adapter (`adapter.ts`, `server.ts`), validation, the curated archive, every registry and the module that reads it, and the policy for which expression opens. |
| `src/lib/physics/`     | The orbit, its frame and its clocks, re-derived exactly (§4), and the workers' entry points (§5).                                                                                    |
| `src/lib/first-light/` | First Light's camera, timeline, pace and samples (§7).                                                                                                                               |
| `src/lib/crossing/`    | The crossing's clock, its front beyond the plate, and the When lens (§8).                                                                                                            |
| `src/lib/i18n/`        | The eight locales, their catalogues and their formats (§10).                                                                                                                         |
| `src/lib/auction/`     | The sale's rules, its contract client and its configuration. viem is loaded only here.                                                                                               |

Two rules hold across the library.

- **Validate at the edge.** The indexer's and the publisher's data is parsed with zod at the boundary (`src/lib/art/validation.ts`) and read with bounded requests (`request.ts`). A field the publisher did not state stays absent. It is never inferred.
- **A derivative binds only when its hashes agree.** `withLocalDerivatives` (`src/lib/art/derivatives.ts`) attaches the venue's own cuts (excerpts, clips, the still ladder, arrival maps, sweep spans) only when the token, the seed and the published hashes match its registry. A stale registry can therefore never paint the wrong file.

## 4. The physics

Each work is a recorded three-body orbit. The generator, `CS-Image-Generation`, is written in Rust and is not in this repository. It drew the orbit from the work's seed, simulated it, and rendered the stills and films. The venue does not trust a description of that orbit. It computes the orbit again, from the seed, exactly as the generator did.

**From the seed** (`src/lib/physics/orbit.ts`, a line-for-line port):

1. **The stream.** The seed feeds `Sha3RandomByteStream`, where each refill hashes the seed with the last buffer using SHA3-256 (FIPS 202, implemented in the file). The stream forks by domain, as the generator's does.
2. **The draws.** The visual profile's draws and the Borda weights come first, in the generator's order. Then come the candidates: each is three random bodies, moved to their centre of mass.
3. **The motion.** The chosen candidate runs 1,000,000 warm-up steps and 1,000,000 recorded steps of the fourth-order Yoshida integrator. Yoshida-4 is symplectic: over millions of steps its energy error stays bounded instead of drifting, which a long recorded orbit needs. That holds only while no two bodies pass closer than the fixed step can follow. At such a pass the computed energy jumps, and it does so inside the recorded window of six works (`docs/after-the-frame.md` §1.3).
4. **The measurements.** The trait analyses the publisher records come last: masses, energy, angular momentum, the closest approach, the syzygies, the braid word and the fate.

**Why exactly.** Every operation keeps the generator's order and uses only + − × ÷ and √. IEEE 754 and ECMAScript define those to the last bit, so the result is the published record to the last bit in every engine. Trigonometric functions are not defined that tightly (V8 on arm64 and on x86-64 can differ in the last bit), so the orbit uses none. The note in [docs/third-physics-phase-a.md](docs/third-physics-phase-a.md) tells how this was proved.

**Frames.** `frame-derivation.ts` re-derives where the recorded window falls on the Light film. It follows the generator's own path from simulation to film: the projection (`framing.ts`), the best of four seeded views by the generator's proxy score, the camera's elliptical drift (`drift.ts`) and the fit. `npm run art:frames` checks each frame against the published film, frame by frame, and records it in `orbit-frames.json`. A frame is what lets the venue draw a body exactly where the film drew it.

**Windows.** `orbit-windows.json` holds each orbit's state at the first step of its recorded window, and the plane it is drawn in (`plane.ts`). From there, integrating the window again replays it step for step. The Orrery and First Light start there instead of running two million steps first.

**Film clocks.** `light-film.ts` is the Light film's clock. The film aims at 1,800 frames at 60 fps, so each frame adds ⌊steps ÷ 1,800⌋ recorded steps, and a last frame closes on the final step. With the clock, a page can say which step is on screen at any moment of the film, which is how the orbit section and the score keep time with the film. The Ink films keep their own timing.

**One trap.** A double imported from JSON can shift by one unit in the last place when Turbopack bundles it. Registries that must stay exact store each double as its shortest exact decimal string and read it with `Number()`.

## 5. Workers

Anything that takes more than a frame runs in a Web Worker. The page keeps answering, and the result is handed back by transfer, without a copy. Each worker is a module next to the code it runs, created with `new Worker(new URL('…worker.ts', import.meta.url), { type: 'module' })` so the bundler can find it.

| Worker                                  | Started by                           | What it does                                                                                                                                                                                                                                   |
| :-------------------------------------- | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/physics/orbit.worker.ts`       | `src/components/orbit-proof.ts`      | Re-derives a work's orbit, compares it with the record, and samples it for drawing. It replays the window on the plate, runs on past the window to the fate when asked, and last carries the orbit's path past the window for After the frame. |
| `src/lib/physics/score.worker.ts`       | `src/components/film-score-store.ts` | Measures a Light film's score from the window's verified first state.                                                                                                                                                                          |
| `src/lib/physics/beginnings.worker.ts`  | `src/components/choice-field.tsx`    | Walks a work's hundred thousand beginnings, the candidates the generator drew, and measures each at the generator's gate.                                                                                                                      |
| `src/lib/physics/orrery.worker.ts`      | `src/components/orrery.tsx`          | Performs all 72 orbits on 72 `OffscreenCanvas`es. It keeps no beat of its own: the page lends it frames (`orrery-pace.ts`).                                                                                                                    |
| `src/lib/first-light/samples.worker.ts` | `src/components/first-light-show.ts` | Samples the window in the generator's view space for First Light.                                                                                                                                                                              |

The build scripts use Node's worker threads in the same way (`scripts/lib/orbit-*-worker.mjs`).

## 6. The verification chain

The venue claims that each work's orbit is the one the generator recorded. The claim is checked twice, offline and in the visitor's browser.

```
seed ─▶ orbit ─▶ published record ─▶ EXACT
```

1. **The seed** is the work's own, recorded on chain and named in the publisher's package.
2. **The orbit** is derived from it by `src/lib/physics/orbit.ts` (§4).
3. **The published record** is the package's `metadata/nft_traits.json`. `npm run art:orbits` (`scripts/build-orbit-records.mjs`) reads it with a bounded, hashed read. It keeps the inputs that chose the orbit and every measurement the publisher states. It writes `src/lib/art/orbit-records.json` **only when every measurement of every work matches exactly**.
4. **EXACT.** Every number is compared with `Object.is`, never within a tolerance: the derived double and the published one must be identical, bit for bit (`compare` in `orbit.ts`). The closest approach's pair and step, the braid word and the fate must match exactly too. On a work's page and on `/verify/orbit/[id]`, every row reads _exact_ or _differs_, and a differing row shows both values. The verdict is one sentence: "Every measurement is the published record, to the last bit." (`src/components/orbit-proof.ts`, `src/components/orbit-verifier.tsx`).

5. **What the record does not say.** The generator publishes no measure of whether its computation kept the energy it began with, so the venue asks for itself: `EnergyWatch` (`orbit.ts`) rides the fate run, and the record's note and After the frame say what it finds. Nothing in this step is compared with the record (`energyText` in `src/components/orbit-proof.ts`).

Verify an orbit prints the derivation as a transcript while the worker reports: the seed, the candidates up to the chosen one, the warm-up, the recorded window and the braid's second pass. A visitor can watch their own machine reach the published record.

## 7. First Light

First Light is the home's one timed event. On a first visit, the orbit that made the day's work is computed in front of the visitor and lands on the still. The plan is [docs/first-light.md](docs/first-light.md), and §12–13 there record what was built.

- **The gate.** `roomScript` marks `<html data-overture="pending">` on a first visit, before anything paints. The day's plate stands alone from the first frame and is the page's Largest Contentful Paint. The running head is held back.
- **The performance** is `src/components/first-light-overture.tsx`. `src/components/overture.tsx` loads it with `lazy(() => import(…))`, so a returning visitor never downloads it. Any input ends it at once and presses nothing beneath. A hidden tab, a new width, Pause or reduced motion end it too. It plays once per browser.
- **The show** is `src/components/first-light-show.ts`, shared by the home and the proof page. It holds the sampling, the colours (each point takes its hue from the still, where its light came to rest), the camera's moves and the frame loop.
- **The camera** is `src/lib/first-light/camera.ts`. It opens the picture with a reverse dolly zoom, finds the event's own middle, travels while time runs back and then plays forward on the Light film's clock (`timeline.ts`). It lands on the generator's flat view, contained where the page has put the still.
- **The engine.** `src/components/first-light-engine.ts` draws the trails as ribbons in linear light with a glow, in WebGL 2. `createEngine` (`first-light-engines.ts`) chooses an engine before a canvas is asked for a context, so WebGPU and HDR can arrive behind the same interface. Where nothing can draw, the still simply stays. It is never a loading screen.
- **Pace.** `quality.ts` lets the drawing buffer give way, from twice the CSS pixels down to the CSS pixels, when frames come slowly. The motion never stutters.

## 8. The Turn and the crossing

Every plate has two expressions, Ink and Light, and the Turn moves between them.

- **The Turn** is `src/components/turn.tsx`. Its `SeamController` drives one CSS property, `--seam`, and `data-turning` on the document. Ground, work and running head all follow that one value, so they cannot drift apart. The word `Light` or `Ink`, the keys, holding `L` to peek, a finger across the plate, the Dusk and the scroll into the night wing all drive the same seam.
- **The crossing** is `src/components/arrival-crossing.ts`. It replaces the wipe: night spreads in the order the work's Light film drew it, and paper returns in the order the Ink film's sumi came to rest. A WebGL shader reveals one published still over the other, ordered by the work's **arrival map**. The map records, for each pixel, when its mark first arrived in the film (`npm run art:arrival`, `arrival-maps.json`). Every pixel shown is a pixel of one of the two stills, except across the soft edge of the front, where the two are mixed as it passes.
- **Beyond the plate**, the walls, the running head and the strip turn when the same front reaches them (`src/lib/crossing/front.ts`). One clock, read from the same CSS tokens as the seam, keeps all of it in step (`timing.ts`).
- **The When lens** (`src/lib/crossing/when.ts`) shows that order itself: the still with each mark coloured by when its film reached it, blue first, then rose, then pale gold. It is labelled "Analysis, not the work".

## 9. The pipelines

Everything the venue measures from the publisher's files is measured offline, by a script run by hand. Each script checks its result and writes a registry under `src/lib/art/`, which is committed. No build runs them, so every build and every visitor sees the same measured facts.

The scripts share one discipline, `scripts/lib/origin.mjs`:

- every read is bounded;
- every published byte is checked against the manifest's hash before it is measured or cut;
- every output is content-addressed;
- every registry is written by an atomic rename under a lock.

Nothing writes a published asset, and nothing records a fact the publisher did not state.

| Command                | Script                          | Writes                                     | What it proves or measures                                                                  |
| :--------------------- | :------------------------------ | :----------------------------------------- | :------------------------------------------------------------------------------------------ |
| `npm run art:index`    | `build-collection-index.mjs`    | `collection-index.json`                    | Every published record, copied verbatim after validation.                                   |
| `npm run art:orbits`   | `build-orbit-records.mjs`       | `orbit-records.json`                       | Every orbit re-derived from its seed matches every published measurement exactly (§6).      |
| `npm run art:windows`  | `build-orbit-windows.mjs`       | `orbit-windows.json`                       | Each window's first state and plane, kept only when the same derivation matches the record. |
| `npm run art:frames`   | `build-orbit-frames.mjs`        | `orbit-frames.json`                        | Each work's frame on its Light film, checked against the film frame by frame.               |
| `npm run art:hollows`  | `build-orbit-hollows.mjs`       | `orbit-hollows.json`                       | Where each body came to rest on the Ink still, found as the hollow it left in the ink.      |
| `npm run art:energy`   | `build-orbit-energy.mjs`        | `orbit-energy.json`                        | Whether each computation kept its energy to its published fate, which every run must meet.  |
| `npm run art:arrival`  | `build-arrival-maps.mjs`        | `arrival-maps.json`                        | When each part of each still arrived in its film, for the crossing.                         |
| `npm run art:light`    | `build-all-the-light.mjs`       | `all-the-light.json`                       | All the light, summed in linear light from the verified stills.                             |
| `npm run art:sweep`    | `build-sweep-spans.mjs`         | `sweep-spans.json`                         | Which wavelengths each work's spectral sweep travels, for the Wavelength lens.              |
| `npm run art:previews` | `build-collection-previews.mjs` | `collection-previews.json`                 | The catalogue's eight-second Ink excerpts.                                                  |
| `npm run art:clips`    | `build-plate-clips.mjs`         | `plate-clips.json`                         | Settling and opening clips. A clip whose last frame is not the published still is refused.  |
| `npm run art:ladder`   | `build-still-ladder.mjs`        | `still-ladder.json`                        | 1,280 and 1,920 px rungs from the 16-bit masters, each proved against both parents.         |
| `npm run art:plates`   | `build-plate-records.mjs`       | `plate-records.json`, `plate-grounds.json` | Each still's own ground, centre and detail windows, keyed to the still's hash.              |
| `npm run art:inline`   | `build-inline-previews.mjs`     | `inline-previews.json`                     | The 640 px previews a hero paints from the HTML, each hash-checked.                         |

Each script has a `node:test` file beside it (`scripts/*.test.mjs`), which CI runs as `npm run test:scripts`. The fonts are the one pipeline run at build time: `npm run fonts` copies the CJK slices and the complete Literata cuts into `public/fonts/`, which is generated and never committed.

## 10. Eight locales

English, Simplified Chinese, Traditional Chinese for Taiwan and for Hong Kong, Ukrainian, Korean, Japanese and Vietnamese (`src/lib/i18n/routing.ts`).

- **Addresses.** English addresses carry no prefix, and every other locale keeps its exact tag: `/art/31`, `/zh-TW/art/31`. `localizedPath` builds them, and the proxy rewrites the unprefixed ones.
- **Words.** Each locale is one catalogue (`en.ts`, `zh.ts`, …). `en.ts` defines the `Messages` type, so a missing string in any catalogue is a type error, not a blank on the page. `fill` (`format.ts`) puts values into a string's `{placeholders}` and leaves an unknown name visible rather than dropping it. Every date the venue prints is formatted in UTC, the venue's day.
- **Faces.** Each CJK locale links only its own sliced display face (`scripts/build-font-subsets.mjs`, `src/lib/fonts.ts`), so the English venue loads none of them. `npm run test:fonts` (`scripts/check-font-coverage.mjs`) fails if any string in any locale has a character the shipped faces do not draw, or asks Literata for a feature its cuts lack.

## 11. Testing

| Layer      | Tool                                  | Where                    | What it covers                                                                                                                                                 |
| :--------- | :------------------------------------ | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | Vitest in jsdom, with Testing Library | `src/**/*.test.ts(x)`    | The library and the components. Coverage thresholds are in `vitest.config.ts`, stricter for the auction's rules, client and live panel, and for media binding. |
| Scripts    | `node:test`                           | `scripts/**/*.test.mjs`  | The pipelines, their proofs and the budget check.                                                                                                              |
| Browsers   | Playwright                            | `tests/e2e/*.spec.ts`    | The venue in real engines, with axe for accessibility.                                                                                                         |
| Auction UI | Playwright, against a Vite fixture    | `tests/auction-harness/` | The bid panel with a synthetic contract and wallet.                                                                                                            |

**A golden master** (`tests/golden/`, `npm run test:golden`) records the orbit section through its unit tests: every canvas call and property set in order, every change of the page, the focus and the scrolls. It is for a change that must alter nothing a visitor meets: record before, compare after.

**Playwright's seven projects** (`playwright.config.ts`): Chromium, Firefox and WebKit on a desk (1440 × 1000); Chromium and WebKit on a phone (390 × 844, touch); and Chromium and WebKit with reduced motion. Reduced motion is a project of its own because it is a promise, not a setting (README, principles). The suite meets the venue as a returning visitor, and a spec starts afresh when it needs a first visit.

**The venue day.** The day's work and the day's expression follow the UTC date. Tests pin the day, `COSMIC_VENUE_DATE=2026-11-06`, an Ink day, for the build and the server alike. `tests/e2e/global-setup.ts` refuses a server built on another day.

**CI** (`.github/workflows/ci.yml`) runs on every pull request and on `main`, with actions pinned by commit:

- `checks`: audit, lint, types, format, unit coverage, the scripts' tests and the glyph check;
- `browsers`: one runner for each of the seven projects, in Playwright's own image, against a production build;
- `auction`: the auction harness;
- `budgets`: the performance budgets (§12);
- `verify`: the one check a pull request needs, which passes only when every other job passed.

**CI has no GPU.** Its runners draw WebGL with SwiftShader, on the CPU. First Light performs there, slowly, and Firefox there cannot draw it at all, so its gate lifts before the page has even loaded. Screenshots taken while WebGL is busy are two to four times slower than on a laptop, and coverage makes the unit suite four to five times slower (hence the 15 s test timeout on CI). Size timing assertions to the runner, not to a laptop, and when CI fails, read its trace first.

## 12. Performance budgets

The targets are set in [docs/first-light.md](docs/first-light.md) §9: the still painted within a second; at the 75th percentile, LCP within 2.5 s, INP within 200 ms and CLS within 0.1. Two budgets hold the venue to them in CI. Their numbers live in one file, [`scripts/budgets.json`](scripts/budgets.json).

**First-load JavaScript, per route.** `npm run test:budgets:js` (`scripts/check-js-budgets.mjs`) reads the production build. For each route it counts the framework's root main files plus the client chunks of every layout and page on the route. It compresses each chunk as Vercel sends it to a browser, Brotli at quality 3, and holds the total to the route's budget. Next 16 no longer prints this "First Load JS" column, but still writes the chunk list to `.next/diagnostics/route-bundle-stats.json`, which is what the script reads. Script loaded later by `import()`, such as First Light's performance or the workers, is not counted, because it does not hold up the first paint. A route without a budget fails, and so does a budget for a route that is gone. Each budget is the size measured below plus about a tenth, rounded up to 5 KiB: room to grow, but not to hide a library pulled into a page by mistake.

**Paint and layout.** `npm run test:budgets:paint` runs `tests/e2e/budgets.spec.ts` in Chromium, on a desk and on a phone, against a production server. It loads three pages: the home on a first visit (measured through the whole of First Light), the home for a returning visitor, and `/art/31`. Each is loaded three times in a fresh browser context. A `PerformanceObserver` records every LCP candidate and layout shift. The median LCP must be within 2,500 ms and the median CLS within 0.1, the Core Web Vitals lines for "good". The spec also checks what was painted: the largest paint must lie in the artwork's media (its inline preview, its still or its film). Text or a placeholder fails. Sometimes the page removes the painted element before its entry is read, as when a plate rendered again after hydration replaces its media with the same media. The spec then matches the entry's URL against the media taken out of an artwork's frame. CI runs the spec on a runner of its own, one page at a time, because a timing measured beside other tests measures them too. The browser jobs skip it with `--grep-invert @budget`.

**The baseline**, measured on 8 November 2026 on an Apple M4 Max with Playwright's Chromium 156, against a production build (`COSMIC_VENUE_DATE=2026-11-06 npm run build`, then `next start`). The spec ran three times; each figure is a median of three loads, and a range spans the three runs' medians.

| Page                                       | Desk (1440 × 1000): LCP, element     | Phone (390 × 844): LCP, element              | CLS, desk / phone |
| :----------------------------------------- | :----------------------------------- | :------------------------------------------- | :---------------- |
| The home, first visit, through First Light | 704–776 ms, the Ink still (1,920 px) | 36–56 ms, the inline preview                 | 0 / 0.0089        |
| The home, returning                        | 668–672 ms, the Ink still            | 40–128 ms, the inline preview or the excerpt | 0 / 0             |
| `/art/31`                                  | 676–696 ms, the Ink still            | 68–156 ms, the inline preview or the excerpt | 0 / 0             |

- **The phone's LCP is earlier.** On a phone the inline preview already fills the plate at its displayed size. The full still, painted later, is no larger, so it is not a new LCP candidate. Where the plate's catalogue excerpt starts playing, its first frame is a few pixels larger than the preview, so it can become the LCP instead. Either way, the largest paint is the art.
- **The phone's first-visit CLS** comes from the statement section, which shifts twice by 0.0045 within a few milliseconds, at about 1 s and again at about 12 s, while First Light performs. The two bursts are seconds apart, so CLS is one of them, 0.0089.
- **CI's margin.** With the GPU off (SwiftShader) and the CPU slowed fourfold, the desk's worst load was 1,104 ms and the phone's 488 ms. CI's own runner (four vCPUs, no GPU) first ran the spec on 8 November 2026. Its medians were 1,284 / 932 / 916 ms on the desk and 112 / 120 / 364 ms on the phone (home first visit / home returning / `/art/31`), with CLS as above. Its slowest single load was 1,316 ms, so about half the 2.5 s line is left.

First-load JavaScript from the same build, in KiB as sent (Brotli, quality 3):

| Route                         | Sent KiB | Budget | Route                                       | Sent KiB | Budget |
| :---------------------------- | -------: | -----: | :------------------------------------------ | -------: | -----: |
| `/[locale]` (the home)        |    317.4 |    350 | `/[locale]/collection`                      |    288.4 |    320 |
| `/[locale]/art/[id]`          |    331.9 |    370 | `/[locale]/collection/all-the-light`        |    274.9 |    305 |
| `/[locale]/auctions/[id]`     |    416.0 |    460 | `/[locale]/collection/orrery`               |    273.6 |    305 |
| `/[locale]/auctions`          |    273.4 |    305 | `/[locale]/exhibitions`                     |    282.3 |    315 |
| `/[locale]/first-light/[id]`  |    289.2 |    320 | `/[locale]/exhibitions/[slug]`              |    288.3 |    320 |
| `/[locale]/verify/orbit`      |    271.8 |    300 | `/[locale]/process`                         |    289.6 |    320 |
| `/[locale]/verify/orbit/[id]` |    274.4 |    305 | `/[locale]/statement`, `/terms`, `/privacy` |    270.9 |    300 |
| `/_not-found`                 |    247.2 |    275 |                                             |          |        |

Of every route's total, 131.9 KiB is the root files every page loads first: React and the Next.js runtime. About 139 KiB more is the venue's locale layout, shared by every page under `[locale]`. Most of that, 88.7 KiB, is the copy of all eight locales, which every page carries. The rest is the page's own. The sale's page is the heaviest because it carries the contract client: viem and the wallet discovery.

- **Why Brotli at quality 3.** It is what Vercel sends a browser that accepts it. On 8 November 2026 every Brotli chunk cosmic.art served matched quality 3 to within a byte. Gzip, the old column's measure, would mislead here, because its window is 32 KiB. The three Chinese locales' copy came to about 31 KiB each, so gzip compressed each against the one before. Copy that pushes them past 32 KiB would add some 20 KiB of gzip to every route, while what visitors download grows by about 3 KiB.

**Changing a budget.** When a route grows on purpose, raise its number in `scripts/budgets.json` in the same change and say why in the commit. When it grows by accident, `npx next analyze` shows which module did it, and `import()` moves what the first paint does not need out of the first load. The paint budgets may become stricter than the field's lines, but never looser.

INP is not measured here. It needs real interactions, so it is the field's to report.
