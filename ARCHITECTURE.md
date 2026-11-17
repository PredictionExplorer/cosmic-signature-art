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
- **Catalogues stay on the server.** A catalogue holds every string the venue says in one language. A client component names the strings it reads, and a server component hands it those alone, because every prop that crosses to the browser is written into the document (§10). `src/lib/i18n/client-boundary.test.ts` fails the suite if a client component can reach a catalogue through its imports, or is handed a whole one.
- **Measured once, offline.** The pipelines that read the publisher's films and stills run by hand, never in the build, and commit what they measured (§9). Every visitor and every build sees the same facts.

## 2. Routes

Every page sits under `src/app/[locale]/`. The proxy (`src/proxy.ts`) gives an address without a locale to English, so `/art/31` is served by `/en/art/31`. It also refuses a work, an exhibition or an orbit number that does not exist, using the short lists in `src/lib/addresses.ts`: a true 404, said before any page renders. The proxy runs for every address except the venue's own files, which its matcher names by folder and by name (a matcher is read at build time and cannot be computed); `src/proxy.test.ts` reads `public/` and fails for a file the matcher does not name.

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

The sharing cards (`opengraph-image.tsx`, `twitter-image.tsx`, drawn by `src/components/sharing-card.tsx`), `sitemap.ts`, `robots.ts` and `manifest.ts` are routes too. The sitemap lists every work in the collection index, in every locale, and names no address the proxy would refuse. An address no route answers gets the venue's own 404 (`src/app/global-not-found.tsx`), which speaks the visitor's language.

**A page is sent whole.** No route keeps a `loading.tsx`. A loading file wraps every page beneath it in a Suspense boundary, and React sets a boundary's content aside once it is large (over 500 bytes, in a document already past 12,800): it goes to the end of the document in a `<div hidden>`, and an inline script moves it into place. A browser that runs no script was left with the loading plate, on the home, the collection and every work. So a page the venue can set from what it holds itself is rendered with no boundary around it, and only what the live indexer must answer streams after it:

- **A work** opens its plate from the registry or the build-time index (`src/lib/art/held.ts`), and sets its entry from the index (`HeldEntry` in `src/components/artwork-entry.tsx`). The live record streams, and the live entry takes the held one's place. The index's copy names the same stills and films the indexer answers, so the plate does not change when the record arrives.
- **A work imprinted since the index was read** has nothing to open from. Its page keeps a plate's place (`src/components/waiting-room.tsx`) behind a boundary of its own, around the wait alone. The results of a name search stream in the same way.
- **With no script**, the document's `<noscript>` stylesheet (`src/lib/without-script.ts`) shows the still that script would have settled, takes away what only waited for the stream, and shows a streamed part that has no stand-in. The instruments (the Turn, the films, the Index sheet, the orbit's derivation) are script, and their controls still stand on such a page.

A page's own `notFound()` is therefore a true 404 wherever the page refuses before it waits: a lot, a First Light proof. A page already streaming behind its waiting plate can only answer 200, marked `noindex`, which is why the proxy refuses a number first. `tests/e2e/without-script.spec.ts` reads each page as it is sent, and again in a browser with script off.

**The document.** `src/app/venue-document.tsx` is the `<html>` every locale shares. Before anything paints, it runs three small inline scripts:

- `roomScript` (`src/lib/room.ts`) chooses the ground, paper or night, so the running head is never the wrong material for a frame. On the home, a first visit is marked `<html data-overture="pending">`, which is First Light's gate.
- `revealScript` (`src/lib/reveal.ts`) lets WebKit paint a streamed page that it would otherwise hold back.
- `settleScript` (`src/lib/settle.ts`) shows a plate's still as soon as the still has loaded and decoded. The server sends the still clear over its inline preview, and without this script it would stay clear until the route's script had hydrated the plate.

The document also holds the motion provider, the running head, the index and key sheets, and the colophon. Around every page it provides the error page's two strings (`[locale]/error-context.tsx`). Next renders `error.tsx` itself and gives it the error and nothing else, so no parent can hand it props; a context whose value never changes is how the document tells it the visitor's language. Next's `catchError` makes a boundary that takes props, but importing it brings the Pages Router's error page along: every route measured 14.6 KiB of script heavier with it, 4.5 KiB as sent.

**When a page fails.** Two pages stand for a fault, and both say the same line and the same word, in the visitor's language.

- `[locale]/error.tsx` stands for a fault inside a route: a render that threw, on the server or in the browser. It stands inside the document, which gives it its words.
- `src/app/global-error.tsx` stands for a fault in the document itself, which no route's page can catch because it lives inside the document. Next renders it in place of every layout, so it brings its own `<html>` and styles, reads the language from the address, and carries its words written out (`global-error.words.ts`, held to the catalogs by its test).

Both do two things with the error they are handed (`src/lib/fault.ts`). **Try again** calls Next's `retry`, which asks the server for the route's data again and renders it again; `reset`, which only renders the same data again, could not mend a record that failed to arrive. For one fault it loads the page afresh instead: a file of script the page asks for that a newer deployment no longer has, which rendering again would only ask for again. And when the fault was the server's, the page shows the **reference** Next sends in place of the server's message (its digest): the same reference stands beside the real error in the host's log, so a visitor's report can be matched to it. Nothing about a fault leaves the browser.

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
| `src/lib/crossing/`    | The sheet a Turn is drawn on: the field that says where its front stands, what a pixel is made of there, and the When lens (§8).                                                     |
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

- **The Turn** is `src/components/turn.tsx`. Its `SeamController` drives one CSS property, `--seam`, and `data-turning` on the document. Ground, work and running head all follow that one value, so they cannot drift apart. The word `Light` or `Ink`, the keys, holding `L` to peek, a finger across the plate, First Light's landing and the scroll into the night wing all drive the same seam.
- **The sheet.** Every Turn is one sheet turned by one front ([docs/turn-one-sheet.md](docs/turn-one-sheet.md)). `src/lib/crossing/sheet.ts` lays one field for a stage: when the front reaches each point, by the work's **arrival map** on the work (`npm run art:arrival`, `arrival-maps.json`: when each mark first arrived in its film) and at the ground's own pace beyond it. `sheetTime`, `frontAt` and `passed` are the only place a Turn's place is read from, so the plate, the head, the strip and the page cannot drift apart. Night spreads in the order the work's Light film drew it, and paper returns in the order the Ink film's sumi came to rest.
- **The crossing** is `src/components/arrival-crossing.ts`: where the page meets the sheet. One WebGL canvas over the whole stage paints both grounds and both published stills (`sheet-painter.ts`); small canvases behind the running head and the page paint their grounds from the same field (`sheet-grounds.ts`); and every word wears the ink of the ground beneath each glyph (`sheet-words.ts`). The two grounds are mixed nowhere but across the front's few pixels, and at either end of a Turn the plate is the published still. The straight seam remains where WebGL is absent.
- **The viewing room** turns by the same sheet (`room-crossing.ts`). It sets one expression at a time, so its canvas paints only what the Turn brings, over the room as it stands, and the change is made once the front has crossed. Its strip holds room for the other expression's words (`HeldStrip` in `artwork-room.tsx`), so the work stands in one place in both.
- **The commit** follows the seam. Thirty milliseconds after its travel the page sets the new expression by an ordinary update (`useArtworkExpression` in `artwork-stage.tsx`), never by a React transition. A transition is the one update React sets aside for every other, and holds until the images it mounts have decoded. On a slow machine a film's clock or an orbit being derived once kept the Turn's commit waiting until React's own five-second limit, and for that long the strip, the keys and the screen reader still had the expression the picture had left. The room's commit is an ordinary update too wherever its sheet has drawn the Turn. Only where the sheet cannot be painted does the room's stage commit by a transition, because there the browser's snapshot is the Turn. The room's own film can set that transition aside in the same way, so it is given one second from the moment its still has decoded (`commitDeadline`). Past that the same commit is made by an ordinary update, without the snapshot, and the transition changes nothing when it lands. One second is longer than anything a transition rightly waits for: React stops waiting for its images after 800 ms, and the snapshot before it fades for 650 ms. A calm room commits in about 20 ms, and in under half a second on a machine twenty times slower.
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
- **One word for one thing.** Key parity says every language has every string; it does not say a language calls a thing by one name. So the terms the venue leans on are held by tests of their own (`messages.test.ts`): wherever English names Ink, each language names it by its one word (Туш, 墨, 먹, mực), and a second name is refused; a plate is «аркуш», 図版, 도판, «bản in» and, in Chinese, 图版 (圖版); the publisher has one name in each language; chaos is named by its label wherever a note or a trail says what it is; in Chinese the film's pace is 速度, so that 节奏 is rhythm alone; Hong Kong spells 發佈 and 公佈, and Taiwan 發布; a control's key line opens with the word on the control. A phrase that must be said one way is one key: the tagline is `shapeOfMotion`, for the page and for its title alike.
  - **The table of terms.** The terms that the language reviews of November 2026 found with two names in one catalogue are the rows of one table in that file, `ONE_NAME`, and each row makes a test. A row gives what English calls the thing, the one name in each language, and the second name: no string of that catalogue may hold it (`never`), or none of the strings where English names the thing, when the word is rightly said of something else (`notHere`). Its rows are a fate (the published trait and the row of the orbit's own table say one word: 行く末, 최종 상태, 归宿, «kết cục»), the recorded window (記録区間, 기록된 구간, 记录区间, 紀錄區間, «khoảng được ghi lại»), a measurement, a published trait, a rendering, gravity, a hash, a plate in Chinese, the orbit derived again («наново»), the viewing room, an expression («втілення», «biểu đạt»), an imprint, the spectral class, a braid's crossings, the long study, the Borda count and the drift.
  - **Where two forms stand**, a test says which strings each keeps to, and its comment says why. In Chinese 幅 is the plate's measure word, and stands for it where the noun is understood (整幅, 第 3 幅). Ukrainian «вимір» is a measure that a trait or a trail goes by, and «вимірювання» a row of the table of the orbit derived again: the result and the act of one verb, as English says measure and measurement. Vietnamese «khởi điểm» is one of the candidate beginnings drawn from the seed, and «trạng thái ban đầu» the state a path follows from: two things, as English says beginnings and start.
  - Add a row when a review finds a term with two names.
- **What a stranger reads.** A work's description for a search result, a shared link and the page's structured data is the line the venue sets under its still, in the page's language (`workDescription` in `src/lib/art/work-description.ts`, from `fateLine`). It is never the token's own text, which is one English sentence for every language and says "fate: eternal dance". A test reads all 72 works in all eight languages (`work-description.test.ts`), and a browser spec reads the page as a crawler does (`tests/e2e/record.spec.ts`).
- **Never of an orbit.** The venue has measured that it cannot know how an orbit ends (`docs/after-the-frame.md` § 1.3), so no string in any catalogue says eternal, for ever or always. `tests/word-rules.ts` holds each language's words, and a test reads every string of every catalogue against them. The publisher's own name for a fate is the one exception: it is quoted as published, among the publisher's other names (`fatePublished`), with a note of what the two names mean and how far the record looked (`glossaryFate`). A work is titled by its number, and the Index's filter reads `fateAsPublished`.
- **A number is said as what it measures.** A trail's rule and note, and a glossary note, say what the number measures in the terms of whoever measured it. Read the generator's source before wording a published trait: the published chaos index is how widely the motion is spread across frequencies, not how sensitive the orbit is to its start, and the published "eccentricity" is the camera's drift ellipse, not the orbit's. A measure the venue takes itself is named as the venue's (`orbitElongation`, which hangs the Long Curve). When a page's words change because they were untrue, the page says so in a line of its own, dated by its month (`statementCorrected`, `trailLongCurveCorrected`, `trailChaosCorrected`): the month, because the day a change is published is the owner's to choose.
- **Words in the browser.** A server component holds the whole catalogue (`messages(locale)`). A client component does not:
  - It lists the keys it reads in a file beside it (`key-sheet.words.ts` beside `key-sheet.tsx`), and its `t` prop is typed from that list, so reading a string the list does not name is a type error.
  - A list includes the lists of the client components and helpers it hands `t` on to (`artwork-viewer.words.ts` spreads the room's, the gatefold's and the rest), so the lists compose as the components do.
  - The server picks the strings with `words(t, LIST)` (`words.ts`) where it renders the component. Pick once and reuse the object where a page renders a component twice: React writes an object into the document once however often it is handed over.
  - The venue's 404 is told its language by the server too: inside the frame, `not-found.tsx` reads the locale as a root parameter (`next/root-params`), since a not-found file is given no params.
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

**A fault fails the test.** Every spec imports `test` from `tests/e2e/fixtures.ts`, never from Playwright (a lint rule holds them to it). That `test` listens while a test runs: an uncaught error, an error on the console or a 5xx from the venue fails the test that met it, whatever else it was checking. A test that provokes a fault on purpose (it visits the 404, or cuts a file off) names it with `faults.allow`. `tests/e2e/fixtures.spec.ts` proves each kind of fault is caught.

**Guards that read the code.** A few unit tests read the repository instead of running it, so a house rule fails the suite when it is broken:

- `src/lib/art/client-boundary.test.ts`: the registries stay on the server (§1);
- `src/app/stylesheet-floor.test.ts`: the 12 px floor and the motion tokens;
- `src/app/stylesheet-classes.test.ts`: every `styles.name` a component reads exists in its CSS module, and every class a module defines is read;
- `src/app/image-optimizer.test.ts`: Next's image optimizer stays closed, and nothing imports it;
- `src/proxy.test.ts`: the proxy runs for no file the venue serves;
- `src/lib/without-script.test.tsx`: no route keeps a loading file, and the stylesheet for a reader with no script still names what React and the venue render (§2).

**Guards that read the screen.** Three of the venue's rules can be kept in a stylesheet and broken on the screen, and a check that reads the stylesheet's answer then passes all the same. So the browser suite measures what is drawn (`tests/e2e/drawn.spec.ts`; the readers are in `tests/e2e/helpers.ts`):

- **Nothing is cut off at a side.** Every line of text and every control lies between the screen's sides, and inside any box around it that clips and does not scroll, at 320 px in English, Ukrainian and Japanese on every kind of page. The venue's frame clips its own overflow (`.site` in `globals.css`), so a line too wide for the screen is cut at the glass while the page's width still reads 320 px. `noHorizontalOverflow`, which most specs call, reads the same boxes.
- **No type under 12 px.** On a Chinese, Japanese or Korean page every Han, kana or Hangul character is as wide as the same character set plainly at its line's size. A face asked for small capitals it does not have is given them by the browser at 70 %, and the computed size does not say so.
- **Targets of 44 px.** Every control on a work's page is measured by its own box, its disclosures opened. A link set in a line of words is let be, as WCAG 2.5.8 lets it.

`tests/e2e/helpers.spec.ts` tests the suite's own helpers, as `fixtures.spec.ts` tests its fixture: a helper that returns before the page is hydrated does not fail where it is wrong, it lets the next press be lost.

**The browsers the venue supports** are named once, in `package.json` (`browserslist`): Chrome, Edge and Firefox 111 and Safari 16.4, which are Next's own targets. `tsconfig.json`'s `lib` stops at ES2022, the language all of them have, so the compiler refuses a newer built-in; the two later array methods that every one of them does have, `findLast` and `findLastIndex`, are declared by name in `src/supported-language.d.ts`. The DOM's types carry no dates, so a newer browser call still compiles: test for a feature before calling it, as the engines' own components do. The one call that got through, `AbortSignal.any`, is refused by name in `eslint.config.mjs`; `src/lib/abort.ts` does its work with what every supported browser has.

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

**Paint and layout.** `npm run test:budgets:paint` runs `tests/e2e/budgets.spec.ts` in Chromium, on a desk and on a phone, against a production server. It loads four pages: the home on a first visit (measured through the whole of First Light), the home for a returning visitor, `/art/31`, and a work's proof, `/verify/orbit/31`, the one page that grows by a screen while it is read. It loads `/art/31` once more, at rest on its still, with every script of the route held back for three seconds, which is longer than the budget: neither the still nor the largest paint may wait for script. Each is loaded three times in a fresh browser context. A `PerformanceObserver` records every LCP candidate and layout shift. The median LCP must be within 2,500 ms and the median CLS within 0.1, the Core Web Vitals lines for "good". The spec also checks what was painted: the largest paint must lie in the artwork's media (its inline preview, its still or its film). Text or a placeholder fails. The proof has no work on its first screen, so its largest paint is type, and it is held to the time and to the shift alone. Sometimes the page removes the painted element before its entry is read, as when a plate rendered again after hydration replaces its media with the same media. The spec then matches the entry's URL against the media taken out of an artwork's frame. CI runs the spec on a runner of its own, one page at a time, because a timing measured beside other tests measures them too. The browser jobs skip it with `--grep-invert @budget`.

**The baseline**, measured on 8 November 2026 on an Apple M4 Max with Playwright's Chromium 156, against a production build (`COSMIC_VENUE_DATE=2026-11-06 npm run build`, then `next start`). The spec ran three times; each figure is a median of three loads, and a range spans the three runs' medians.

| Page                                       | Desk (1440 × 1000): LCP, element     | Phone (390 × 844): LCP, element              | CLS, desk / phone |
| :----------------------------------------- | :----------------------------------- | :------------------------------------------- | :---------------- |
| The home, first visit, through First Light | 704–776 ms, the Ink still (1,920 px) | 36–56 ms, the inline preview                 | 0 / 0.0089        |
| The home, returning                        | 668–672 ms, the Ink still            | 40–128 ms, the inline preview or the excerpt | 0 / 0             |
| `/art/31`                                  | 676–696 ms, the Ink still            | 68–156 ms, the inline preview or the excerpt | 0 / 0             |

- **The still does not wait for script.** Until 13 November 2026 the still stayed clear over its preview until React had hydrated the plate, so on a desk the LCP waited for the route's script to download, compile and run. The document's `settleScript` (§2) now shows a still when it has loaded and decoded, and the plate hydrates around it. Measured that day on the same machine with Playwright's Chromium, three runs before the change and three after; a range spans the three runs' medians:

  | Load                                            | Before: LCP              | After: LCP | Before: the still begins to show | After    |
  | :---------------------------------------------- | :----------------------- | :--------- | :------------------------------- | :------- |
  | Desk, the home, first visit                     | 736–1,092 ms             | 724–760 ms | 125–134 ms                       | 51–57 ms |
  | Desk, the home, returning                       | 668–688 ms               | 568–572 ms | 128–137 ms                       | 36–49 ms |
  | Desk, `/art/31`                                 | 696–700 ms               | 596–620 ms | 170–172 ms                       | 60–72 ms |
  | Desk, `/art/31`, its script three seconds late  | 3,676–3,684 ms           | 576–596 ms | 3,135–3,149 ms                   | 47–55 ms |
  | Phone, `/art/31`                                | 68–76 ms                 | 68–72 ms   | 143–145 ms                       | 64–67 ms |
  | Phone, `/art/31`, its script three seconds late | 52–60 ms, or about 3.1 s | the same   | 3,118–3,120 ms                   | 47–55 ms |

  Loopback hides most of the gain, because there the script arrives about a tenth of a second after the document; the rows with the script held back show what a slow connection gains. Three things in these figures are not obvious. Chromium usually reports the still's paint when its 500 ms fade ends, so a desk's LCP is the moment the still begins to show plus about 530 ms; in a few loads it reports it at once (88–108 ms). On a phone the LCP is the inline preview either way, so the gain there is in when the sharp still shows, not in the LCP. And on a phone with a late script the excerpt's first frame, which can only come after the script, is sometimes counted as the LCP at about 3.1 s (the next point), before this change and after it; the budget's late-script load is therefore asked to rest on its still (`?view=still`), where it measured 108–592 ms on the desk and 48–52 ms on the phone.

  A phone's plate changes its film once it knows its screen, which starts a new media session and mounts its images again (`artwork-media.tsx`, `ArtworkMedia`). A still already shown would have dropped to its preview and faded in a second time, so the session that takes its place shows it in the commit that mounts it, decoded in step with that first paint. `tests/e2e/plate-settle.spec.ts` holds the scripts back, sees the still at full strength, then lets them through and watches every frame: the still must never dim.

- **The phone's LCP is earlier.** On a phone the inline preview already fills the plate at its displayed size. The full still, painted later, is no larger, so it is not a new LCP candidate. Where the plate's catalogue excerpt starts playing, its first frame is a few pixels larger than the preview, so it can become the LCP instead. Either way, the largest paint is the art.
- **The phone's first-visit CLS** comes from the statement section, which shifts twice by 0.0045 within a few milliseconds, at about 1 s and again at about 12 s, while First Light performs. The two bursts are seconds apart, so CLS is one of them, 0.0089.
- **CI's margin.** With the GPU off (SwiftShader) and the CPU slowed fourfold, the desk's worst load was 1,104 ms and the phone's 488 ms. CI's own runner (four vCPUs, no GPU) first ran the spec on 8 November 2026. Its medians were 1,284 / 932 / 916 ms on the desk and 112 / 120 / 364 ms on the phone (home first visit / home returning / `/art/31`), with CLS as above. Its slowest single load was 1,316 ms, so about half the 2.5 s line is left.
- **The proof does not push its own page down.** Until 16 November 2026 `/verify/orbit/31` shifted five times while it derived, each time a part of the derivation printed and pushed down what stood beneath it: CLS 0.0798 on a desk and 0.1194 on a phone, over the line, on a page no budget measured. The derivation now fills the first screen from the first paint (`.firstScreen` in `verify.module.css`), so the note that follows it starts below the fold and the section grows where nothing in view is moved. Measured that day on the same machine, three loads each: CLS 0.0013 on a desk and 0 on a phone, with the largest paint, a line of type, at 36 to 56 ms and at 32 to 36 ms. `tests/e2e/verify-orbit.spec.ts` holds the worker back and proves that nothing on the screen moves while the derivation prints.

First-load JavaScript, in KiB as sent (Brotli, quality 3), measured again on 14 November 2026, when the message catalogues left the browser's script:

| Route                         | Sent KiB | Budget | Route                                       | Sent KiB | Budget |
| :---------------------------- | -------: | -----: | :------------------------------------------ | -------: | -----: |
| `/[locale]` (the home)        |    229.8 |    255 | `/[locale]/collection`                      |    197.5 |    220 |
| `/[locale]/art/[id]`          |    265.5 |    295 | `/[locale]/collection/all-the-light`        |    194.9 |    215 |
| `/[locale]/auctions/[id]`     |    328.0 |    365 | `/[locale]/collection/orrery`               |    193.7 |    215 |
| `/[locale]/auctions`          |    205.7 |    230 | `/[locale]/exhibitions`                     |    191.3 |    215 |
| `/[locale]/first-light/[id]`  |    210.7 |    235 | `/[locale]/exhibitions/[slug]`              |    197.2 |    220 |
| `/[locale]/verify/orbit`      |    192.0 |    215 | `/[locale]/process`                         |    198.1 |    220 |
| `/[locale]/verify/orbit/[id]` |    195.4 |    215 | `/[locale]/statement`, `/terms`, `/privacy` |    191.1 |    215 |
| `/_not-found`                 |    163.3 |    180 |                                             |          |        |

Of every route's total, 132.0 KiB is the root files every page loads first: React and the Next.js runtime. About 59 KiB more is shared by every page under `[locale]`: the venue's document and what its pages have in common. The rest is the page's own. The sale's page is the heaviest because it carries the contract client: viem and the wallet discovery.

- **What left with the catalogues.** Until then every route also loaded the copy of all eight locales, one chunk of 96.8 KiB as sent (336 KiB before compression): the error page and the 404 imported every catalogue to find their own two and six strings. The home was 326.4 KiB and a work's page 362.1. The two are now given their strings by the server (§2, §10), and every route lost that chunk.
- **Why Brotli at quality 3.** It is what Vercel sends a browser that accepts it. On 8 November 2026 every Brotli chunk cosmic.art served matched quality 3 to within a byte. Gzip, the old column's measure, can mislead, because its window is 32 KiB. While every route carried the locales' copy, the three Chinese catalogues came to about 31 KiB each, so gzip compressed each against the one before; copy that pushed them past 32 KiB would have added some 20 KiB of gzip to every route, while what visitors downloaded grew by about 3 KiB.

**Changing a budget.** When a route grows on purpose, raise its number in `scripts/budgets.json` in the same change and say why in the commit. When it grows by accident, `npx next analyze` shows which module did it, and `import()` moves what the first paint does not need out of the first load. The paint budgets may become stricter than the field's lines, but never looser.

INP is not measured here. It needs real interactions, so it is the field's to report.

## 13. What a page may load

Every response carries a Content-Security-Policy: the list of places a page may load from and send to. The browser refuses anything else, whatever put it on the page. The list is written in one file, [`src/lib/security-headers.ts`](src/lib/security-headers.ts), from the constants the code itself loads from, and `next.config.ts` sends it with every path.

| Directive                                    | Allows                                                 | Because                                                                                                                                 |
| :------------------------------------------- | :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`                                | the venue                                              | Anything no directive below names.                                                                                                      |
| `script-src`                                 | the venue's files, and inline scripts                  | See below. No `'unsafe-eval'`: no string is run as code.                                                                                |
| `worker-src`                                 | the venue                                              | The workers are the venue's own modules (§5).                                                                                           |
| `style-src`                                  | the venue's files, and inline styles                   | A plate's measured ground and the Turn's seam travel as custom properties in `style` attributes.                                        |
| `img-src`, `media-src`                       | the venue, the publisher's three hosts, `data:` images | The stills and films (`ART_MEDIA_ORIGINS`), and the 640 px preview inline in the document.                                              |
| `font-src`, `manifest-src`                   | the venue                                              | Every face is served from the venue.                                                                                                    |
| `connect-src`                                | the venue, and the chain's endpoint                    | The sale's client reads the chain at `NEXT_PUBLIC_RPC_URL`. A wallet is an extension of the browser: the page speaks to it in the page. |
| `frame-src`, `object-src`, `frame-ancestors` | nothing                                                | Nothing is framed or embedded, here or around the venue. `X-Frame-Options: DENY` says the last to older browsers.                       |
| `base-uri`, `form-action`                    | nothing, and the venue                                 | No `<base>` moves the venue's addresses, and no form posts elsewhere.                                                                   |

`Cross-Origin-Opener-Policy: same-origin` goes with it: a window that opens the venue, or that the venue opens, keeps no reference to it.

**Why inline scripts are allowed.** Next writes each page's data into the document as inline scripts, and their text differs on every page and after every revalidation, so no list of hashes can name them. A nonce can, but a nonce is made for one response: the page must be rendered for each request. The home, Process and the other prerendered pages are files, written before any request and served from the host's edge, which is what makes them the first paint (§12). Rendering them on request to give them a nonce would spend that. So the enforced policy allows inline script, and everything else in it bounds what such a script could do: it can load no script from elsewhere, evaluate nothing, and send what it reads to no place but the venue and the chain's endpoint.

**The second policy.** The pages rendered for each request (a work, the collection, a lot, a verification; `renderedOnRequest` in `src/lib/addresses.ts`) can carry a nonce, and do. The proxy makes one for each document, and writes a second policy with it: a script runs only if it carries the nonce or is one of the document's own three by hash (`src/lib/document-scripts.ts`), and whatever such a script loads is trusted in turn (`'strict-dynamic'`). Next reads the nonce from the request's copy of the header and puts it on every script it writes. This policy is sent as `Content-Security-Policy-Report-Only`: the browser enforces nothing of it, and tells the page what it would have refused.

- **Why report-only.** Some wallets write their provider into the page as an inline script, which this policy would refuse, on the one page where a wallet matters. That has not been watched with real wallets, so the policy is not yet enforced. A visitor also moves between pages without loading a new document, so the policy of the document they arrived on stays with them: it has to be right everywhere before it is enforced anywhere.
- **Where the reports go.** Nowhere. The policy names a report group (`REPORT_GROUP`) and no header gives that group an address, so nothing is sent. The name is needed all the same: WebKit ignores a report-only policy that names none. Giving the group an address (a `Reporting-Endpoints` header) is how reports from visitors' browsers would begin to arrive, and is the owner's decision.
- **To enforce it**, send the same value as `Content-Security-Policy` from the proxy. The browser then enforces both policies, and a script must pass each.

**Held by.** `src/lib/security-headers.test.ts` and `src/proxy.test.ts` hold the text and where it is sent. The browser suite's own `test` (§11) fails any test whose page breaks either policy, in every engine, by reading the page's `securitypolicyviolation` events. `tests/e2e/security-headers.spec.ts` reads the headers as sent, checks that every script of a page rendered on request is named by the nonce or a hash, and makes the policy refuse what it is there to refuse.

`next dev` adds `'unsafe-eval'` and `ws:`: React rebuilds server stack traces with `eval` there, and the dev server speaks over a socket.

**The configuration finds the policy from its own address.** `next.config.ts` requires `src/lib/security-headers.ts` with `createRequire(import.meta.url)`, not with an `import`. Next 16.4 runs the compiled configuration with no filename (`next/dist/build/next-config-ts/require-hook.js`), so Node looks for a plain `import` of a neighbour from the working directory, and `next start` pointed at a build in another directory stopped at "Cannot find module", or loaded another checkout's copy. Required from the file's own address it is found wherever `next` is started; a unit test loads the configuration with Next's own loader from an empty directory. Outside Next the same line has Node read TypeScript itself, so the unit tests ask for Node 22.18 or later (`package.json`, `engines`), and the policy file keeps to TypeScript that needs only its types taken away. The headers a started server sends are the ones written into the build (`.next/routes-manifest.json`), whatever directory it was started from.
