# Third Physics, Phase C — the indexes

Phase C of [Third Physics](third-physics.md) adds the collection's two other indexes, each the whole collection at once: its light in one exposure, and every orbit performed together. This note records what shipped, how it is built, how it is proved, what it settled, and what it leaves for later.

## What shipped

**All the light**, at `/collection/all-the-light`.
- Every Light still in the collection, added as light adds: one exposure of 72 orbits, white where they crowd and coloured at their edges.
- Pointing names the orbits of the sky on view that pass through that place, up to five, brightest first. Once the pointer rests there, each is lit as its own still, added over the dimmed sky.
- Choosing leaves one orbit alone, as its own untouched still, with the way to its page (in Light) and back. Escape returns to the whole sky.
- The cycle control shows the sky as it stood after each cycle. While motion plays, Replay fills it again cycle by cycle, and Pause stops it where it stands.
- The orbits' index, numerals by cycle, does all of this from the keyboard. On a wide screen it stands beside the sky, so the light a numeral names is where the eye already is; on a phone it lies beneath, and choosing there brings the sky into view. Numerals of cycles not yet in the sky on view are quieter, and still legible. When the chosen orbit's words leave, the focus returns to its numeral.
- It says what it is: "a derived view, not a work", never a sharing card, never offered where a work is for sale.
- The browser sums nothing and needs no WebGL. The skies are built offline, so every visitor sees the same image.

**The Orrery**, at `/collection/orrery`.
- Every work's orbit performed at once, hung by cycle, each cell over its numeral and leading to its work.
- One worker draws on 72 canvases handed to it. Each orbit starts at the first step of its recorded window and is drawn as the work page draws it: every hundredth step, in light, at the Light film's pace. Cells out of view wait where they are. A finished window is held for three seconds, then performed again.
- Pause, reduced motion and the auction hush draw each orbit whole, once.
- Pointing at a work, or focusing it, shows its own Light still in the cell.
- Where a canvas cannot be handed to a worker, or the worker fails, every work's Light still stands in, and the page says so.
- A hidden page draws nothing, and a silence in the frames (a hidden tab, a busy thread) is a pause: every cell resumes where it stood.

**Both are reached from the Index sheet**, under "The whole collection at once", with the one on view marked. The group is not offered on a sale page. The Orrery is in the sitemap. All the light, a derived image, is not: the plan keeps derived images out of sitemaps (§9). On both pages, the running head takes the night while the page stands beneath it.

**The parts**, all in the repository:

| Part | Where |
|---|---|
| Where each recorded window begins: the state, the plane, exact | `src/lib/art/orbit-windows.json` (90 KB), built by `scripts/build-orbit-windows.mjs` (`npm run art:windows`), bound by `orbit-windows.ts` (server only) |
| The window performed again, and its closest approach | `WindowPerformance` and `closestApproachOf` in `src/lib/physics/orbit.ts` |
| The Orrery's engine and its worker | `src/lib/physics/orrery.ts`, `orrery.worker.ts` |
| The Orrery | `src/components/orrery.tsx` and `.module.css`; `src/app/[locale]/collection/orrery/page.tsx` |
| The skies and the naming grid | `public/art/light/` (2.5 MB in all), built by `scripts/build-all-the-light.mjs` (`npm run art:light`); the registry `src/lib/art/all-the-light.json`, bound by `all-the-light.ts` (server only) |
| Naming the orbits under a point | `src/lib/art/sky-names.ts` |
| All the light | `src/components/all-the-light.tsx` and `.module.css`; `src/app/[locale]/collection/all-the-light/page.tsx` |
| The Index sheet's group, the sitemap | `src/components/index-sheet.tsx`; `src/app/sitemap.ts` |
| One path for each film frame, on the work page too | `lightFilmFrame` in `src/lib/physics/light-film.ts`; the Orrery's engine and `src/components/orbit-score.tsx` |
| The words | 24 keys in each of the eight locales |

## How they are built

- **Where each window begins.** Phase A re-derives a work's orbit from its seed in about a second; seventy-two at once would be too much for a page. So the build re-derives every orbit once, across worker threads, and keeps the state at the first step of its recorded window: three masses, positions and velocities (18 doubles), the time step, and the plane of greatest extent with its bounds.
  - Every double is kept as its shortest exact decimal string, `-0` included, because the bundler does not round-trip every imported double (Phase A).
  - The registry is written only if a replay from each stored window reproduces the published closest approach exactly, distance, pair and step, for all 72 works. It does.
  - The binder refuses an entry whose seed or traits hash no longer matches the published record.
  - A worker thread that stops without reporting an error fails the build, rather than leaving it waiting with its registry locked.
- **The sky.** The build reads each work's Light still from the venue's hash-verified rungs at 1280 and 1920 px. A work joins the sky once the ladder holds its Light still at both widths, so a cycle minted before its stills are published waits, and does not stop the build.
  - It turns each byte to linear light, adds the stills at float precision, and returns to the screen through a soft shoulder, 1 − e^(−0.42 · sum), so the crowded centre turns white and the edges keep their colour.
  - It keeps the sky after each cycle at both widths, as WebP at quality 90 (241–604 KB each).
  - Nothing alters a still. The skies are new images, labelled as derived; a chosen orbit is shown as its own published still.
- **The naming grid.** For each work, a 128 × 83 grid records the mean of the brightest channel over each block of its 1280 still; levels below 4 are written as none. The 72 grids are tiles of one lossless WebP, eight across (150 KB). A point names the works whose light there, or in the eight cells around it, reaches 24 of 255.
- **What a visit costs.**
  - All the light tells the browser how wide its sky is drawn (beside the index on a wide screen), so the browser fetches the sky at the rung it shows.
  - It fetches the grid when a pointer first approaches. It fetches a work's own still only when a resting pointer names it, a numeral names it, or it is chosen; a pointer swept across the sky fetches none.
  - A change of sky waits for the next sky to decode, so the frame never passes through black.
  - The Orrery's page carries its 72 windows: 57 KB compressed, 188 KB raw. It fetches a work's preview only when that work is pointed at or focused.

## How it is proved

- **Unit.**
  - The Orrery's engine, drawing on a recording surface:
    - the plane's fit;
    - the Light film's pace;
    - waiting out of view and resuming there;
    - the hold, and the restart;
    - drawing whole under a still preference;
    - a short budget (150,000 steps a frame) shared so that a cell slows rather than jumps;
    - a minute without frames taken as a pause, every cell resuming where it stood;
    - a performance ending on the very picture the whole drawing makes, at 24, 60 and 144 frames a second;
    - starting again when a canvas changes size or motion changes.
  - The Orrery's component: the cells by cycle, one worker given a canvas per orbit and the motion preference, the plates on pointer and focus (and not under a landing finger), the stills when the worker fails or cannot draw, every cell out of view while the page is hidden, the drawn-whole marks cleared when motion changes, and the head's night.
  - All the light:
    - naming the brightest orbits of the sky on view, at once, and lighting them once the pointer rests;
    - nothing named for a pointer that left before the grid came, and the grid asked for again after a failure;
    - the alone still, and Escape, unless a dialog over the page takes it;
    - the dimmed index, the index from the keyboard and under a finger, and the focus kept;
    - a sky shown only once decoded, and only the latest asked for;
    - the replay and its stop on Pause, and the head's night.
  - The binders, the Index sheet's group (marked where current, absent on a sale page), the sitemap, and the eight locales' key parity.
- **The builds.**
  - `build-orbit-windows.test.mjs` replays the committed windows and checks them against the published closest approaches.
  - `build-all-the-light.test.mjs` checks the linear-light sum, the shoulder, a grid that counts a ribbon and not a lone star, the filling order and the rungs, works waiting for their stills, the stable registry and its orphans, and that the committed sky holds every work the ladder can give it, from the ladder's own rungs, with every file intact.
  - `scripts/lib/orbit-verify.test.mjs` checks that the worker pool answers every item and fails on a worker that stops.
- **Every engine.** `tests/e2e/indexes.spec.ts` covers both pages and the Index sheet:
  - the sky's name, the derived-view statement, the card that is not the sky, and the first view;
  - naming under a pointer, choosing, Escape, the index from the keyboard and under a finger, the cycles, and the replay with its stop;
  - an axe scan of the first cycle's sky, with the index dimmed;
  - the Orrery performing (a cell in view changes), drawn whole and still under Pause, the plate on pointing, a tap that enters a work at once, and the fallback;
  - the Index sheet leading to both pages, and absent on a sale page.

  `accessibility.spec.ts` scans both pages with axe in all eight locales.

## What it settled

- **The collection is three cycles of 24, not eight.** The plan's "every new cycle adds eight orbits" was written before the third cycle. The replay fills the sky in three steps of 24.
- **The sky is built, not accumulated in the browser.** The plan proposed a half-float GPU target fed by about 1 MB of previews. Building offline gives every visitor the same image, needs no WebGL, and costs one image of 0.3–0.6 MB instead of 72.
- **Naming reads light, not stars.** A grid of each block's brightest pixel let a lone star name a work across the sky. The mean of the block's brightest channel, with a floor, names the works whose ribbons pass there.
- **The index stands beside the sky.** In the first version the numerals lay a screen below the sky, so pointing at one lit an orbit nobody could see, and the line naming the orbits fell below the fold. On a wide screen the index now stands beside the sky, and the sky is sized so that the sky, its naming line and the index share one view.
- **Node can run the physics as it is.** Node's type stripping takes no parameter properties and no extensionless imports, so the window's performance lives in `orbit.ts`, which still has no imports, and the build scripts import that file directly.
- **Light adds one film frame at a time.** The Light film adds each frame's marks as one exposure, and the Orrery and the work page's orbit section now stroke one path for each film frame, whether an orbit is drawn whole or performed. Before, an orbit drawn whole was one path and a performed one was a path per screen frame. Under additive light those are different pictures where an orbit crosses itself, and the performed one depended on the display's refresh rate.
- **A finger has no hover.** A numeral that lit its orbit as a finger landed on it changed the page under the tap, and WebKit on a phone held back the click, so choosing took two taps. The Orrery's cells had the same flaw with their plates. Touch now lights and shows nothing on landing, and a tap acts at once.
- **WebKit lets go of a smooth scroll when the page shifts under it.** Choosing from the phone's index scrolls the sky into view. The naming line changes its height as it names the choice, and WebKit's scroll anchoring corrects for that, which cancelled the scroll. The scroll now begins a frame after the choice is laid out, and the choice's own line is kept even when empty.
- **"Number" is the page only on the collection.** The Index sheet marked "Number" as the current page everywhere. An ordering is now the page only on the collection it orders. Elsewhere the session's expression is still marked, as the current item, since the sheet's wall and links follow it.

## The review

An independent review of the phase found two blockers, seven should-fix problems and eight nits. The orbit windows and the builds' safety held up; every finding is fixed, with a test that fails on the old code where one could be written.

- **Naming on a partial sky (blocker).** The five names were taken from all 72 works, and only then were the works outside the sky on view dropped. With Cycle 0 on view, a place where five Cycle 0 orbits pass could say "No orbit passes here." The works on view are now counted first.
- **The dimmed numerals' contrast (blocker).** At 40 % opacity they fell to 2.3:1. They now take a solid colour at about 6:1, and the end-to-end suite scans that state with axe.
- **Should-fix.**
  - A long gap in frames let one cell leap 150,000 steps while the rest froze; a gap is now a pause, and a hidden page sends every cell out of view.
  - Names stayed lit when a pointer left before the grid had come; a failed grid made the sky say "none" for the rest of the visit.
  - Keyboard focus fell to the page when the chosen orbit's words left.
  - The image sizes ignored the layout, so a wide screen fetched the 1920 sky and every still a sweep crossed (6.1 MB); the sizes now match the layout, and stills wait for a resting pointer.
  - A short landscape screen shrank the sky to 158 × 102 px; a short screen now gives the sky its own height.
  - A cell drawn whole was not the picture its performance ends on.
  - A replay showed black while the next sky loaded.
- **Nits.** A worker that fails now leaves the stills, not 72 black cells. A change of screen or zoom redraws at the new resolution. Escape belongs to an open dialog first. The sky's text alternative is one sentence from the translation, with no full stop added in code. All the light leaves the sitemap, as the plan's §9 asks. A worker that stops no longer hangs the orbit builds. A cycle without its stills no longer blocks the sky. And the drawn-whole marks clear when motion changes.

## Limits, and what is next

- The skies and the grid must be rebuilt when a cycle is added (`npm run art:light`), and the windows too (`npm run art:windows`). Both builds refuse to write a registry they cannot verify.
- The Orrery's plates are the publisher's 640 px Light previews, shown as they are.
- The Orrery performs at the Light film's pace. A visitor sees each window once every 33 seconds or so, including the hold.
- Phase D, the events, is next: the Overture, After the frame, the choice, and opening night physics-first.

## Run of record

Built on 30 October 2026 on `claude/third-physics-phase-c`, on top of the Phase B review's fixes.
- Type-check, lint, format, the script tests (58) and font coverage pass.
- The unit suite passes: 940 tests, 92.7 % of statements, with the coverage thresholds held.
- The full browser suite passes in the six local projects, against a production build: 1,275 passed, 45 skipped by design, none failed, in 14.5 minutes. Firefox runs on CI.
