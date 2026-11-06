# Third Physics, Phase E — the score, the lenses, and Verify an orbit

*Plan of 5 November 2026, kept as the record. Written against main at b053b18 (Phases A–D merged).*

---

## 0. The owner's direction

On 5 November 2026 the owner asked to implement the next phase if the work was not done, for a world-class venue and codebase. Of what the plan still held, the owner chose the score and the lenses.

Many physics (the old Phase E) waits for material packages that are not yet published, and opening night waits for the pipeline to publish traits early. This phase takes the three inventions the published record already allows:
- **§5.5, the score.** The Light film's transport becomes the orbit's score.
- **§5.3, the Wavelength lens**, from the published spectral sweep.
- **§5.12, Verify an orbit**, a public tool for any token.

## 1. The score as built (§5.5)

**Measured here, not shipped.**
- A worker measures the work's recorded window again from its verified first state (`orbit-windows.ts`), with the generator's own measurements.
- The window's measurement is now one function, `measureWindow`, which the re-derivation calls after its warm-up. The physics tests still pass bit for bit.
- For №031, №060 and №071 the score's closest approach, syzygies and braid crossings are the record's, exactly. A test holds this.
- The window takes about 0.2 s in V8.

**Sampled for the transport.**
- About 2,000 samples of the three separations are kept: every 500th step of a million-step window, 24 KB.
- They are handed back by transfer.

**One clock.**
- The score is laid out on the Light film's own map from step to time (`light-film.ts`).
- The Light film is an exposure, so everything the score lights is in the frame on screen. The film's settling clip opens with 73% of the score lit.

**Drawn as the orbit section draws its score.**
- One drawing serves both (`score-drawing.ts`):
  - the three pairs' separations on a logarithmic scale, apart upward;
  - ticks rising from the base at each braid crossing, each syzygy and the closest approach, so an encounter dips to the tick that marks it.
- Each pair takes the hue halfway between its two bodies' hues, the short way round the circle.

**Where it stands.**
- The score lies along the foot of the Light plate's screen, 9 px tall. It stands beneath the hanging numeral's foot, on the plate's own night.
- The time line moved to the same place.
  - On a desk that is the viewport's foot, where it always was.
  - On a phone the line used to lie on the paper twin beneath the plate, cream on cream. Now it stays with its plate.
- The score arrives over the time line once it is measured, and fades with the strip when the visitor sits.

**The physics of the moment.**
- While the Light film plays its own frames, the strip reads which bodies are nearest and how far apart: *bodies 1–3 · 80.2 apart*, in each locale's figures.
- On a desk the reading leads the strip's words. On a phone it takes the live state's place beneath them, so the words keep their one line.

**Closest approach.**
- The plate's options offer the closest approach with its moment in the film: 00:07 for №031, frame 460.
- It opens the room's complete film two seconds before, so the visitor sees it happen.
- The moment is the record's, so it is offered before anything is measured.

**In the room.**
- The complete Light film's transport carries the same score, beneath its 1 px line, so the hand drags the thumb across the orbit's encounters.
- The room's readout adds the physics of the moment: *00:07 · 00:30 · bodies 1–3 · 124.4 apart*.
- Only the complete Light film carries it, the one whose clock it shares. The longer studies, the Ink films, the still and a sale surface carry none.

**What carries no score.**
- **The Ink films** keep their own timing and their time line.
- **A sale's page.** The viewer drops the orbit on the auction presentation, and the lot page never passes it.
- **A phone's excerpt** is a clockless preview, and now carries no time line either. This was the excerpt's stated intent: the test that said so could not fail, and now it can.

**The worker.**
- There is one worker a work, only while a score is wanted.
- It stops when no viewer waits any longer.
- A measured score is kept for the visit.
- Strict Mode's second mount keeps the same worker, and a test proves it.

**Weight.**
- The viewer reads a score without loading the generator's port, 48 KB of source with top-level tables.
- The measuring is its own module (`score-window.ts`), loaded only by the worker.
- The pair order is spelled out where scores are read, and a test holds it to the port's.

**Found while building.**
- **The room lost the plate's time in development.** React mounts the room's film twice in development, and an Activity can replay it in production. The first mount's cleanup ran before the film had metadata, and remembered its meaningless 0 as the visitor's place. The second mount then began at 0, not where the plate was. A film now has a place to remember only once its metadata has arrived or it has moved. A test mounts the room in Strict Mode.
- **The orbit section painted some pairs in the wrong hue.** It took the arithmetic mean of two bodies' hues. For №035, whose bodies 1 and 2 sit at 344° and 33°, either side of red, that painted their pair cyan. The shared drawing takes the short way round.
- **The pane's preview reports itself hidden.** The browser then pauses video-only media, so a film cannot be replayed there. The score was checked in headless Chromium at twice the pixel density, on a desk and on a phone.
- **A stand-in film must answer byte ranges.** The browser suite stands a local film in for the published original. Served whole, a film cannot be sought before it has all arrived, so the room began at 0. The suite's helper (`standInFilm`) now answers ranges, as the published host does.

## 2. Verify an orbit as built (§5.12)

It was built in its own worktree and brought in whole, with two changes noted below.

**The door, `/verify/orbit`.**
- It takes a work's number, or offers every number the registry holds a record for, each a link to its page.
- An unknown number is answered in place: "№ 099 has no published record."
- A number sent before the page has its script (`?work=31`) still goes on to that work once it loads.

**One work, `/verify/orbit/<id>`.**
- The work's number and full seed stand in the margin. Beside them, on night, the visitor's own browser derives the orbit from the seed with the orbit section's worker, and prints a transcript as it reports:
  - the seed;
  - one line for each phase: the candidates read, the warm-up, the recorded window, and the braid's second pass, each stamped with the second it began;
  - every measurement of the published record, with *exact* or the value derived here, and the fate last;
  - the time taken, then the verdict.
- Only the verdict is announced. The section is busy while it derives, and a row the browser could not check says so and is never counted as the record.
- №031 is checked whole, fate included, in about 1.5 s.

**One wording of the proof.** The orbit section's labels, record values, progress, differing values and verdict moved to one module (`orbit-proof.ts`), so the two pages word the same check one way. The section's tests pass unchanged.

**Links in.** The record links to it beside Verify a download, and the orbit section's note links to the transcript. Both routes are in the sitemap and the accessibility sweep, in all eight locales.

**Changed when brought in.**
- **Rendered on request, as a work's page is.** Each work's page was prerendered for every work in every locale: 576 pages, which added about 233 MB to the build. Nearly all of that was the venue's own frame, repeated on each page. The page is one record and a few lines, so it is now rendered when asked for (`connection()`), and nothing is built ahead or kept for a number someone made up.
- **What an unknown number answers.** Prerendered, an unknown number was a true 404, on Next's plain page. Rendered on request, it is the venue's own not-found page, marked `noindex`, with the status 200. The page has already begun to stream behind `[locale]/loading.tsx` when the number is refused, exactly as an unknown work's page does (`/art/9999`). Limiting the numbers (`dynamicParams = false`) was tried: it has no effect on a page rendered on request. A true 404 with the venue's own page needs two things, for the works and the verifier alike: the number refused before the page streams, in the proxy, and the venue's own page for an address that matches nothing (`global-not-found`). It is noted below as open.
- **One name for a pair.** The proof module's pair helper and the score's were the same function. Both pages and the strip now use one (`pairName`).

## 3. The Wavelength lens as built (§5.3)

It was built in its own worktree and brought in whole.

**What it shows.** In the room, for the Light expression, the word Wavelength (key N) holds the work's published spectral sweep on the frame that shows one wavelength. A slider sets the wavelength on the 380–700 nm rule, which also marks the work's dominant wavelength, and the lens opens on that wavelength (632 nm for №031). The caption says *The sweep at one wavelength · Analysis, not the work*. It is a derived view: never on a sale surface, and never in Ink, since the sweep is a film of Light.

**The map from wavelength to frame is the generator's own.**
- It was read from the generator's spectral output (`spectral_output.rs`, `constants.rs`, `spectrum.rs`):
  - 600 frames at 60 fps, climbing from the first lit bin to the last over frames 0–299, then back down;
  - a small vibrato on the climb that fades to nothing at both ends;
  - bin *b* centred on 380 + (b + ½) · 5 nm.
- The port (`spectral-sweep.ts`) matches the generator bit for bit on all 2,400 frames compared.
- Each wavelength appears twice in the film; the lens holds the first, rising pass.

**Each work's own range.**
- The generator sweeps only from the first bin with light to the last, each widened by two, and that range is not published. 15 of the 72 works sweep a narrower band: №043 reaches only 452.5–522.5 nm.
- A new pipeline (`npm run art:sweep`, `scripts/build-sweep-spans.mjs`) reads each range from the published spectral bins, where a dark bin is an all-zero 16-bit image. It writes the ranges to `sweep-spans.json`, bound to each film's hash.
- The slider covers only what the film holds.
- Checked against the films themselves: №031's sweep is violet at frame 0, green at frames 150 and 449, and red at 299. №043's frame 299 is green, not red.

**Seeking.**
- One seek is in flight at a time, and the last decoded frame stays up; the still shows until the first frame arrives.
- A fast drag in Chromium passed through 196 values with 59 seeks and no long tasks, and the right frame landed about 0.4 s after release.

**Shared.**
- The rule and its slider (`spectrum-rule.tsx`) also serve the process essay's sweep player.
- The essay's dominant-wavelength figure is no longer set in an accidental false italic.

**Found when brought in.** The room listed the sweep among its films as *spectral sweep*, the lower-case form written for running text, so a phone's strip read "Film spectral sweep". The list now has its own sentence-case word in all eight locales (`sweepFilm`).

## 4. An independent review, and what it changed

It found three defects in the score, one in the lens, and smaller things in all three parts. All are fixed and tested.

**The score.**
- **A room entered on the still had no score.** The score was measured only while the plate's film played or the room opened on a film, so Study, then Film in the room, gave the complete film no band. It is now measured whenever the room is open on Light.
- **On an iPhone the room's words lay over the score.** The room's clock and status stood at the home indicator's inset, where the band now lies. They stand 12 px above the transport's line wherever the device sets it: as before on a desk, and clear of the band on an iPhone, with nothing moving when the band arrives.
- **The closest approach outlived a Turn in the room.** After opening on it, I or L started the other expression's film at the same moment. A Turn now clears it.
- **Smaller things.**
  - The option's word now sits in its box as Study and Sit do.
  - The band draws again on a display of another density.
  - Its lit edge keeps pace with the room's thumb rather than trailing it.
  - The room reads each film's clock from that film alone, so another film never flashes the last one's moment.

**The lens.**
- **Keys stopped working after the lens closed.** A dragged or keyed slider kept the focus. When the lens left (N, Z, T, a film, or a click Safari does not focus), the focus fell to the page, outside the dialog that hears the room's keys. It now returns to the lens's word.
- **Smaller things.**
  - Space on the slider no longer switches to the film.
  - A seek settled a hair from the time asked for can no longer ask for the same frame forever: the lens holds the frame it asked for.
  - The word is offered only where the work has a sweep. The home's curated media carry none, so it was a word that could only say it could not be shown.
  - The pipeline's comment now counts the narrower works as fifteen.

**Verify an orbit.**
- The transcript begins afresh when its derivation is asked again.
- A number without a record, sent before the page could answer it, is now answered in place, as one typed would be.

**Checks on the final tree.**
- Type-check, lint, format, 1,155 unit tests, 63 script tests and glyph coverage all pass.
- The production build passes.
- Every browser spec passes on the six local projects. Two collection tests failed once under four parallel workers, and pass alone, repeated. This phase touches nothing in the collection, and CI runs two workers.

**Found on CI.**
- **WebKit on Linux counts a frame sought while paused as played.** The lens only ever seeks, yet the sweep reported played ranges. The spec now records every film the page asks to play, and the sweep is never among them.
- **The test of the venue's clock read CI's date pin.** CI pins the venue's date for the whole job, the unit tests included. The test of the unpinned clock read the pin, and passed only while the pinned day was still ahead: it failed every pull request from midnight UTC on 6 November. It now clears the pin and sets the clock, and a second test reads the pin from the environment.
- **The score tests measured an orbit inside their first test's budget.** Measuring №031's window took about five seconds under CI's coverage, the whole of a test's default budget. The window is now measured once before the tests that read it, with its own budget, as the physics tests' are.
- **CI's budget is sized to its runner.** CI took four to five times as long over the suite as a developer's machine, and a dozen tests from earlier phases already took half their five seconds or more. CI now allows fifteen.
- **The browser suite outgrew its hour.** Run as one job, the suite's seven projects took 41 to 57 minutes on CI, and with the checks before them the job reached GitHub's limit of 60 minutes. PR #14 was cancelled 1,771 tests into 1,876, with none failed, and PR #16 passed with 37 seconds to spare. On PR #15 a slow package mirror spent 41 minutes of the hour installing the browsers' system packages. The workflow now runs four kinds of job in parallel, each with its own budget: the checks, one job for each browser project, and the auction harness. The browser and auction jobs run in Playwright's own image, which carries the browsers and their system packages, so no job waits on Ubuntu's mirror: on some runners it crawled at 20 to 50 kB/s, and installs ran out of their ten minutes. One `verify` job passes only when every other job has.

## 5. Open

- **True 404s with the venue's own page.** Unknown works and unknown numbers on the verifier answer the venue's not-found page as a soft 404 (200, `noindex`), because the locale's loading boundary has begun to stream. The proxy could refuse them before anything renders, and a site-wide `global-not-found` would give that refusal the venue's own page.
- **Real iPhone Safari** for the lens and the score: the mobile WebKit project is desktop WebKit at a phone's size.
- **Firefox** runs on CI only; it cannot launch on this machine.
- **The Ink films' score** waits for their own map from step to time, with their pre-roll.

