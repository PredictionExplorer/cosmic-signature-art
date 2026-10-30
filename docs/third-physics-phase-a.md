# Third Physics, Phase A — the orbit, re-performed

Phase A of [Third Physics](third-physics.md) puts the physics beneath every work on its page. This note records what shipped, how it is proved, what it settled, and what it leaves for later.

## What shipped

**A new section on every work page**, between the plate and the entry, titled "The orbit, re-performed".
- When the visitor comes within a screen of the section, a Web Worker re-derives the work's orbit from its published seed, in the generator's own order:
  - the seeded SHA3 stream;
  - the draws the visual profile and the Borda weights take;
  - every earlier candidate;
  - the chosen candidate, moved to its centre of mass;
  - 1,000,000 warm-up steps and 1,000,000 recorded steps of the fourth-order Yoshida integrator.
- It then measures what the publisher's `nft_traits.json` states: the three masses, total energy, angular momentum, the closest approach (distance, pair and step), the syzygies, and the braid crossings and word.
- Each measurement is shown beside the published value as *exact* or *differs*. When a value differs, both values are shown.
- The orbit is drawn in light on black, in the plane of its greatest extent, at the Light film's pace. Beneath it runs a score of the three pairwise separations, with ticks for the closest approach, the syzygies and the braid crossings.
- Reduced motion, Pause and the auction hush draw the whole orbit at once.
- While the section stands beneath the running head, it lends the head the night.

**The parts**, all in the repository:

| Part | Where |
|---|---|
| The physics: stream, profile draws, integrator, analyses, comparison | `src/lib/physics/orbit.ts` (no imports, so Node and the browser run the same file) |
| The worker | `src/lib/physics/orbit.worker.ts` |
| The Light film's clock | `src/lib/physics/light-film.ts` |
| The drawing plane | `src/lib/physics/plane.ts` |
| The registry: inputs and published measurements for 72 works | `src/lib/art/orbit-records.json`, read and validated by `orbit-records.ts` (server only) |
| The registry build | `scripts/build-orbit-records.mjs` (`npm run art:orbits`), with a worker pool in `scripts/lib/orbit-verify*.mjs` |
| The section | `src/components/orbit-score.tsx` and `.module.css` |
| The words | 32 keys in each of the eight locales |
| The head's ground | `lendPlateTone` / `returnPlateTone` in `room-ground.tsx`. Only the lender can return a lent ground; a plate's null no longer takes it from under the section. |

## How it is proved

- **Build time.** `npm run art:orbits` reads every work's trait file (bounded and hashed). It re-derives all 72 orbits across worker threads (4.8 s) and writes the registry only if every measurement of every work matches. On 29–30 October 2026 all 72 matched: 720 measurements plus the braid words.
- **CI.**
  - `scripts/build-orbit-records.test.mjs` re-derives the whole committed registry.
  - `src/lib/physics/orbit.test.ts` checks the Keccak against Node's `sha3-256` at thirteen lengths and in parts. It also checks the stream's refill rule against hand-built SHA3 chains, the profile-draw rule, and four works end to end (000, 031, 060, 071).
- **Every engine.** `tests/e2e/orbit.spec.ts` re-derives № 031 and № 071 in the page and expects all ten measurements exact.
  - Chromium and WebKit pass locally on desktop, phone and reduced motion: 18 of 18.
  - Firefox runs on CI (it cannot launch on this Mac).
  - Exactness across engines is expected, because the port uses only + − × ÷ and `Math.sqrt`, all exactly specified.
- **Regression.** The artwork, immersion, record, accessibility, chrome, responsive and room specs pass in the same six projects: 680 passed, 0 failed. The full unit suite passes with 92.6 % line coverage, and the new physics code is covered at about 100 %.

## What it settled

- **The stream offset is derived, not located.** The visual profile reads six base parameters, the structure roll and fifteen mode rolls from the main stream. A structure roll in [0.35, 0.38) is a Duet and reads one more for its dropped edge; the extended rolls come from a fork. Randomized Borda weights then read one. That makes 23 draws, or 24 for a Duet: 69 works and 3 works. So the masses are now an independent check, not a locator.
- **The Light film's clock.** The renderer aims at 1,800 frames, so every frame adds ⌊1,000,000 / 1,800⌋ = 555 steps, and a final frame closes on step 999,999. That gives 1,802 frames at 60 fps (30.03 s), as the published films measure. № 031's closest approach (step 255,842) is first drawn in frame 460, 7.67 s in. The Ink films come from another renderer with its own pre-roll and are not mapped yet.
- **Every recorded window is bound.** All 36 ejections in the collection happen after the film. The earliest is № 054, 90,000 steps after its window closes. This is the material for "After the frame" (Phase D).
- **All 100,000 beginnings pass the quick gate** for the works checked (energy ≤ 10 and angular momentum ≥ 10). The choosing happens entirely in the million-step simulations.

## A finding outside the orbit

**The bundler does not round-trip every double in an imported JSON file.** Turbopack compiled `124.96327743951707` from `orbit-records.json` into the literal `124.96327743951709`, one ulp away. The first browser run therefore reported two measurements as differing. The derivation was right; the "published" side had been altered.
- The registry now keeps every measured double as its shortest exact decimal string, and `Number()` converts it on the server. ECMAScript defines that conversion as correctly rounded, and a test pins the values.
- `collection-index.json` has the same latent issue: № 031's third mass compiles to `…709`. Nothing shows the index's values at full precision today, but anything that does in future should take them from strings.

## Limits, and what is next

- The drawing is the orbit in its own plane. It is not registered to the Light still: that needs the camera drift and framing ported (Phase D, the Overture).
- The score is the section's own transport. It does not yet drive the plate's film or jump it to an event (§5.5 of the plan).
- A work whose search used aesthetic retries would be matched to its attempt by its masses. No work in the collection has retries.
- The rule for the profile draws belongs to generator 1.x. A future pipeline version must be checked again; the build fails loudly if it is not.

Phase B, the crossing in the order the work was made, is next.
