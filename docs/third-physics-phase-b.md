# Third Physics, Phase B — the crossing, in the order it was made

Phase B of [Third Physics](third-physics.md) changes how a work turns between its two expressions. This note records what was built, how the maps are made, how it is proved, what it settled, and what it leaves for later.

## What shipped

**The crossing.** Pressing `Light` no longer wipes night across the plate from the right. Night spreads in the order the work's Light film drew it: for № 031 it opens in the orbit's core, the ribbons arrive along their own paths, and the walls darken last. Pressing `Ink` brings the paper back in the order the Ink film's sumi came to rest.
- Every pixel on the plate is a pixel of one of the two published stills, untouched, except across the soft edge of the front, where the two are mixed as it passes. The edge is 0.035 of the work's order either side, about a tenth of a second at any one pixel. The order is the films'; nothing else is new.
- Beyond the plate each wall turns at the time of the nearest edge of the work, plus a short travel, so the room follows the work.
- The running head above the plate and the label strip below it are walls too. Each of their columns turns when the same front reaches it: a clip-path polygon is recomputed from the same map in the frame the plate is painted.
- The crossing runs on the Turn's own clock and curve. The whole order takes two seconds (`--t-cross`) instead of the seam's 0.9. A spring-back, or the rest of a drag, takes its share of those two seconds.
- It answers every driver of the Turn:
  - the word `Light` or `Ink` and the keys;
  - holding `L` to peek;
  - a finger drawn across the plate;
  - the Dusk;
  - the scroll into the night wing.
- When the plate's own film is playing, the crossing starts from the frame on view rather than the still, so nothing jumps.
- The straight seam remains:
  - where WebGL is unavailable;
  - where a map or a readable still is missing;
  - before the crossing is prepared (a Turn waits at most 0.4 s for it);
  - in the gatefold, whose seam is a comparison rather than a Turn.
- Under reduced motion, Pause or the auction hush the Turn is one frame, and nothing is prepared.

**The When lens**, in the viewing room beside `Detail`, and on `T`.
- It shows the still with each mark coloured by when its film reached it: blue first, then rose, then pale gold last, on a near-black ground. The ramp runs from the first mark to the last.
- The room's strip labels it "When each mark was drawn" (Light) or "When each mark came to rest" (Ink), then "Analysis, not the work", beside the ramp's legend. Its accessible name says the same.
- It is never a sharing card and never part of a URL.
- It is painted once per still on a 2D canvas, from the work's 1920 or 1280 rung and its map, in about 130 ms. A browser that cannot paint it says so, and the still stands in.

**The parts**, all in the repository:

| Part | Where |
|---|---|
| The maps' build | `scripts/build-arrival-maps.mjs` (`npm run art:arrival`), tested by `build-arrival-maps.test.mjs` |
| The maps | `public/art/arrival/<id>-<expression>-<sha16>.webp`: 144 files, 2.5 MB in all |
| The registry | `src/lib/art/arrival-maps.json`, bound to each expression by `arrival-maps.ts` (server only) through `withLocalDerivatives` |
| The clock: CSS curves, the seam-to-order mapping, the end past the farthest wall | `src/lib/crossing/timing.ts` |
| The front beyond the plate, for the head and the strip | `src/lib/crossing/front.ts` |
| The lens's arithmetic and stated ramp | `src/lib/crossing/when.ts` |
| The crossing: the WebGL pass and the viewer's hook | `src/components/arrival-crossing.ts` |
| The seam on any frame | `SeamController.current()` in `turn.tsx`; the `--t-cross` token in `globals.css` |
| The lens | `src/components/when-lens.tsx`, in `artwork-room.tsx` |
| The words | 9 keys in each of the eight locales |

## How the maps are made

- **Read whole, once.** Each published film is read in full through the verified cache (`.cache/art`, 6.6 GB, never committed; approved 30 October 2026). It is decoded at 576 × 372, 30 frames a second, in grey: 901 frames per film.
- **When each mark arrived.**
  - Light is a long exposure. A pixel's mark arrives the first time it reaches half its final brightness, and stays. Pixels that end dimmer than 14 levels are ground.
  - Ink is carried by a current. A pixel's mark has arrived once it stays within 10 levels of its final value.
- **The ground and the shape.**
  - The bare ground takes the time of its nearest mark, plus 0.35 of the film per frame diagonal. The distance is a 5 × 5 Euclidean chamfer, so a knight's step costs √5 and the fronts stay round.
  - The field is then softened, half the mark's own time and half its neighbourhood's, with three box passes of radius 4. It is normalised to 0–255.
- **Kept small.** Each map is a lossless WebP, content-addressed. The median is 16 KB for Light and 18 KB for Ink; the largest is 60 KB (№ 032 Light). № 031's two maps are about 15 KB each.
- **Bound or dropped.** A map binds to an expression only if the seed, the still's hash and the hash of the film it was measured from all agree. The local archive keeps some stills without their films; there the still's hash alone vouches for the map.
- **Rebuilt in minutes.** On 30 October 2026 all 144 maps were measured from the cache in about 3.5 minutes, two films at a time.
  - Unchanged sources are reused by hash.
  - Changed parameters re-measure every map; a partial run refuses them.
  - A full run removes the files the registry no longer names.

## How it is proved

- **Unit.**
  - The map builder, in nine Node tests: the Light and Ink rules, the round chamfer, the softening, the 0–255 span, the registry merge, the removal of orphans, and a decoder that is missing, stalls or is abandoned.
  - The binder, the clock, the front beyond the plate, the lens's arithmetic, and the seam's position on any frame, including across a reversal, a breath and a finger taking it mid-way.
  - The hook, against a WebGL context that records what it is asked: the fallback without WebGL, a return after Pause, a lost and restored context, the decision each Turn makes when it begins, the wing's order, a Turn that asks after its viewer has left, and the idle start's cancellation, called as a browser demands.
  - The room's lens: its place, its label, its key, its failure, and its focus.
  - The whole suite passes: 894 tests, with the coverage thresholds held.
- **Every frame is the two stills.** `tests/e2e/crossing.spec.ts` captures the plate many times during a crossing on № 031, № 023 and № 035, in both directions.
  - Every captured pixel lies between the Ink still and the Light still, channel by channel. Fewer than 4 % may fall outside, and those are resampling.
  - Some frame shows both stills, untouched, side by side, each on more than 5 % of the pixels where they differ.
  - That frame follows the arriving expression's map. Among the pixels showing one still untouched, those already showing the arriving still lie earlier in its order than those still showing the departing one: the 90th percentile of the first within 16 levels of the 10th percentile of the second. A straight wipe, the other expression's map or a reversed reveal all fail this.
  - The head's and the strip's clips were driven by the front.
  - Afterwards the canvas rests and the seam's own rules return.
- **Fidelity.** On its first frame the canvas differs from the page's own still by 0.4–1.0 levels on average, in Chromium and WebKit.
- **The other paths.**
  - Reduced motion turns in one frame and prepares nothing.
  - Without WebGL the straight seam is the Turn. The immersion spec's seam tests now hide WebGL, so they test the fallback on purpose.
  - A peek held for a third of a slowed crossing and let go returns from where it is: the first frame after the release is near the night already drawn, and from there the night only recedes, until the Ink still is whole again.
  - Pause, then Play, brings the crossing back, and the next Turn is painted by it.
  - The lens lies within 1.5 px of the still it replaces, labelled, on a dark ground.
- **Every local engine.** The full browser suite passes in Chromium and WebKit, on desktop, phone and reduced motion; the run of record is below. Firefox runs on CI. Where a browser offers no WebGL, the crossing tests skip with that reason and the fallback test stands.

## What it settled

- **The edge stays soft.** A front one device pixel wide was tried, so that no pixel would be a mix. With eight-bit maps it shows the quantisation as stair-steps along slow fronts. A crisp front would need sixteen-bit maps, carried in two channels. The plan's `smoothstep(p ± ε)` hides the steps, so the mix across the front is stated rather than avoided.
- **The canvas is faithful enough to take over the plate.** It samples the sharpest readable still the page already shows, or the work's own rung, with no visible change when it appears. Each still is snapshotted and uploaded once, when the crossing is prepared; a film frame has its own texture, so nothing is re-read from the page afterwards.
- **The canvas keeps its drawing buffer.** On CI's Linux WebKit, screenshots taken mid-crossing disagreed with both stills in 7–15 % of pixels, while the run's screen recording showed the crossing correctly. The likely cause is a snapshot that paints the WebGL canvas from a buffer already cleared after compositing. The crossing now keeps its buffer, so any repaint shows the last frame painted.
- **The head and the strip follow the front.** Their edges are hard, as the straight seam's always were. The plate's front is soft.

## Found on the way

- **The room cropped its still.** At 1440 × 1000 the still was 14 px taller than its space and was cut under the strip: a percentage `max-height` in an `auto` grid row never resolves. The still and the film now sit in one definite cell, as the page's plate already did, and the work is whole.
- **The room's status line moved the work.** It grew 3 px whenever it carried text. It now holds its line when empty.
- **A long status widened the room on a phone.** It pushed the room past the viewport. The room's single column is now `minmax(0, 1fr)`.
- **The phone strip had no room for another word.** Once the room kept to the viewport, `When` made the actions overlap `Ink` and `Light`; the Ukrainian and Vietnamese lot tests caught it. On a phone the actions now wrap within their part of the first row, beside an identity that keeps its natural width. Every strip word is reachable in all eight locales.
- **The curated archive keeps № 031's Light still without its film.** The binder now lets the still vouch where no film is advertised. Where a film is advertised, its hash must still agree.

## What the review found

An independent review of the branch, before merge, found one blocker and seven smaller problems, all in the runtime around the canvas. Each is fixed, and each fix has a test that fails on the old code.

- **A reversal jumped to the far side.** A new travel started from the old travel's target, which `--seam` already named, not from where the transition had carried the seam. The straight seam hid this, because CSS picks up from where it is; the canvas paints the controller's position, and did not. Letting go of a held `L` mid-way showed the whole night for a frame, then took two full seconds to come back; the browser test sees 99.8 % of the plate jump. Every new travel, finger or end now starts from the position on view, and its share of the order is measured from there.
- **Pause switched the crossing off for the rest of the visit.** Disposing lost the WebGL context on purpose, and the canvas outlives the hook, so every later preparation found a lost context. Disposing now deletes what the crossing made and keeps the context.
- **A real context loss was ignored.** The plate then snapped at the commit. The crossing now stands down at once, asks for the context back, and prepares again when it returns.
- **A Turn waiting for the crossing could outlive its page.** The 0.4 s wait now carries the request and the seam's generation, and is dropped if anything took the seam meanwhile (another request, the room, a key, the page left). The Turn reads as turning from the press. A crossing prepared for a viewer that has gone marks nothing.
- **The wing's return ended on a different picture.** A return to an Ink that rests partly under the wing's night now retraces Light's order, the order the wing is drawn in. Each Turn's order and the layer it leaves are read once, when it begins, and held to its end, so neither a reversal nor the commit switches pictures. A Turn that began before the crossing was ready stays the straight seam's.
- **The stills were re-uploaded from the page after every Turn.** That cost two full uploads, and a page image that had since switched to the remote original would have thrown. Film frames now have their own texture, so the stills are never re-read.
- **The map builder ran ffmpeg without safeguards.** A missing ffmpeg crashed the build with the registry locked, and a stalled decode would hang it. It now listens for errors, kills a decode that runs past its time, and reads only a local MP4 (`-nostdin`, the `file` protocol, a forced container).
- **Smaller.** The idle start is cancelled by the scheduler that set it. The first version of that fix called the cancel through an object, which every browser refuses with "Illegal invocation" when a viewer unmounts; jsdom does not check, so the unit test now does, and the browser tests caught it first. The `When` word keeps its focus when the lens cannot be painted, and `T` then does nothing and ignores key repeats. Uniform locations are looked up once.

## What CI found after the review

The follow-up pull request's first runs on CI's Ubuntu runner found three more problems that the local runs had not shown.
- **The decoder tests leaned on macOS's `yes`.** They ran `yes` in ffmpeg's place, with ffmpeg's arguments. macOS's `yes` ignores them; GNU's takes `-nostdin` for an option and quits. The tests now run a small script that ignores the arguments, and the reader test checks that the decoder has gone.
- **A film that began to fade in during a Turn came in all at once on the canvas.** Once a Turn has landed, the page plays the new layer's settling clip, fading it in over the still. A Turn back that began before that fade took the clip's frame whole as soon as its opacity left zero. The orbits the clip had yet to draw then vanished in a single frame, while the page beneath had only begun to fade. The canvas now lays the clip over the still at the clip's own opacity, as the page does.
- **Two crossing specs depended on the runner.**
  - The crossing spec compared the Turn back with the Light still. In WebKit the clip was already on view when that Turn began, so the Turn correctly left from the clip's frame. The spec now holds the films back, so both Turns leave a still at rest. The unit tests check the clip's weight.
  - The peek spec's bound on the first frame after release depended on how slow the runner's screenshots were. It now checks that the night stopped short of the marks Light brings last, which a night that jumped to the far side would cover.

## Limits, and what is next

- The plate's front is soft and the head's and strip's are hard. A soft head would need a mask that tracks text, which clip-path cannot do.
- The page's wall between the plate and the night wing is not part of the Turn. It takes the room's ground when the Turn commits, as before.
- Wavelength, the second lens, is not built. The published spectral sweep and bins are its material.
- Phase C, the indexes (All the light and the Orrery), is next.

## Run of record

Built 29–30 October 2026 on `claude/third-physics-phase-b` and merged on 30 October (PR #3). The review's fixes followed on `claude/third-physics-phase-b-review`.
- Type-check, lint, format, the script tests (47) and font coverage pass.
- The unit suite passes: 894 tests, 92.9 % of statements, with the coverage thresholds held.
- The full browser suite passes in the six local projects, against a production build: 1,121 passed, 37 skipped by design, none failed, in 13.3 minutes.
- After CI's findings: type-check, lint and format pass, and so do the script tests (47) and the unit suite (895 tests). The crossing spec passes in the six local projects against a production build: 38 passed, 10 skipped by design.
