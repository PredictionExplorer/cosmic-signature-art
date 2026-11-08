# Third Physics, Phase D — two equal expressions, phones, and the events

*Plan of 4 November 2026, kept as the record as each part ships. Written against main at a2b733d (Phases A–C merged) and an audit of every route in WebKit at 390 × 844 and Chromium at 1440 × 1000.*

---

## 0. The owner's direction

On 4 November 2026 the owner asked:
- to continue to the next phase;
- for an amazing experience on phones;
- to show much more of the colourful version of the art, treating Light and Ink essentially equally;
- for a world-class codebase that follows best practice everywhere.

The third point reverses a standing rule. The decision register made Ink "the primary encounter", and the Two Grounds vision made Ink "the first encounter on every route". Section 2 replaces both.

## 1. What the audit found

Every route was photographed screen by screen. The share of each screen covered by each expression was read from the rendered image area.

**Ink leads almost everywhere.**
- **Home.** A phone sees Ink and then Light on its first screen. After that it sees only Ink: the spread of 031 and 035, and 24 Ink previews of the day's cycle.
- **Work and lot pages** open in Ink. Light is the wing below.
- **Collection.** It defaults to Ink, with Light behind one word in the bar. On a phone the Light hang is the most striking view of the collection, and the Ink hang is cream on cream.
- **Exhibitions** list Ink thumbnails only.
- **Auctions** show no art at all before a contract is configured: four screens of text on a phone, and two on a desk.
- **Sharing cards** are Ink.
- **Motion is Ink's.** Only Ink clips move in the collection and the spread. Yet a Light settling clip is under 400 KB, a tenth of an Ink one.

**Phones.**
- The Index sheet leaves a band of about 250 px empty and clips its search field's placeholder.
- The glossary's footnote markers in the entry are targets of 7 × 16 px.
- All the light hangs its sky 358 px wide. A single tap both names and chooses, so a finger cannot browse the names the way a pointer can.
- The Orrery's cells, three to a row, are faint on a phone. The Orrery's WebKit freeze was being fixed in its own session, so its phone pass waited for that fix. The fix has since landed in PR #13 (8063dc5).
- The auction landing has no work on it.

## 2. The rule: two equal expressions

1. **Neither expression is the venue's default.** Both are the work, of equal standing, as the statement already says.
2. **Where works are listed, both are shown at equal size across a seam.** Ink hangs on paper to the left, and Light on night to the right. The seam is the Turn's own seam, at rest at the middle of the wall. On a desk each leaf keeps the hang's rhythm (from 8 November 2026 the pairs' own, never three to a leaf: §8). On a phone each row is one work, its Ink beside its Light. This applies to the collection, the home's spread and cycle row, and the exhibition hangs.
3. **A single plate opens on the visitor's choice.** The choice is the half they pressed, the word, or a Turn, and it is remembered for the visit. Without a choice, the plate opens on **the day's expression**. That expression alternates every UTC day, so each opens the venue on half of all days. The rotation is offset by the pass through the day's-work pool, so every work of the pool opens the home in both expressions in turn.
4. **The twin always hangs beneath.** The night wing follows an Ink plate, as now. A paper wing follows a Light plate, its scroll drawing the paper back from the left, as Ink always returns.
5. **Light moves as Ink does.** Light settling clips play under the one projector in the collection and the spread.
6. **Sharing cards show the pair.**
7. **Single-ground views remain one word away:** `?expression=ink` and `?expression=light` on the collection.
8. **A work with one published expression opens on it and says so.** This is unchanged.

One policy module decides the opening expression, and every surface asks it. Tests hold the rule:
- the day's expression alternates;
- every work of the pool reaches the home in both expressions within two passes;
- no surface opens on an expression the policy did not give it.

**Considered and set aside.**
- **Following the device's dark mode.** It would make Light and Ink a theme of the visitor's settings, which the vision rules out. A server could not know it on Safari, so the first paint would flash.
- **Alternating by work number.** The ground would flip at every step through the collection.
- **A first-visit question.** It would be a gate in front of the art.

## 3. Phones

- **The Index sheet** is laid out for its content on a phone: no empty band, and a search field that fits.
- **Footnote markers** get a 24 × 24 px target (WCAG 2.5.8) without moving the text.
- **All the light on touch.** A finger held on the sky names the orbits beneath it as it moves, and lifting it chooses. A tap still chooses at once. The sky hangs edge to edge. Built (§6).
- **The auction landing** is left as it is, pending the owner. The vision made the sale's title spread the one screen without a work. Before a contract exists there are no lots, and works that are not for sale on a sale page could mislead. Section 6 asks the owner. *Answered by the owner on 8 November 2026: until a contract exists, the landing hangs the last imprinted cycle beneath the sale's status, labelled "Not offered" (§8).*
- **The collection's bar** keeps clear of the home indicator (`env(safe-area-inset-bottom)`).
- **The Orrery's phone pass**: two to a row, trails legible at the phone's pixel ratio. It waited for the freeze fix, which landed with PR #13 (8063dc5) on 6 November 2026. Built (§6).

## 4. The events

Unchanged from [third-physics.md](third-physics.md) §5, ordered by readiness:
1. **After the frame** (§5.6). When a film resolves, the re-performance continues past the recorded window, labelled as physics, not the work. An ejection leaves at the published `ejection_step`.
2. **The choice** (§5.10). The process essay re-derives all 100,000 beginnings of the day's work in a worker, in a field of energy against angular momentum with the chosen one ringed.
3. **The Overture** (§5.8). Approved by the owner on 4 November 2026 to replace the Dusk. Under rule 3 its last beat lands on the day's expression.
4. **Opening night** (§5.9). It waits for the pipeline to publish traits early.

## 5. Order of work

1. **Two equal expressions and phones**, one PR, since both touch the same surfaces.
2. **After the frame.**
3. **The choice.**
4. **The Overture.**

Parts 2 to 4 shipped together; §7 records them.

Each PR passes the seven-project Playwright matrix, axe, the 12 px floor, the motion tokens and eight locales with exact key parity.

## 6. Part 1 as built: two equal expressions and phones

**The policy.**
- `src/lib/art/work-of-the-day.ts` gives the day's expression next to the day's work. The turn counts the work's place in the pool plus the pass through it, and even turns are Light. Tests prove three things for pools of 1 to 7 and of 72:
  - each expression gets half the days;
  - every work of the pool opens in both within two passes;
  - an odd pool alternates day to day.
- `src/lib/art/opening.ts` decides a plate's opening: the request, else the day's expression, else its twin. The work page, the lot page and the home all ask it. With no opening given, the client's hook opens on the first published medium, so no expression is hard-coded anywhere.
- `COSMIC_VENUE_DATE` pins the venue's today on the server. The browser suite and CI's build pin 6 November 2026, an Ink day, so the suite meets one day's work and one day's expression whatever the calendar says.

**Plates.**
- **The wing hangs the twin.** It is the night wing under an Ink plate and the paper wing under a Light plate. The paper wing's scroll draws the paper back from the left on its own registered percentage, `--seam-return`.
- **The twin is fixed when the page opens.** A remembered choice re-opens the page and the wing follows it. A Turn afterwards never reverses the wing under the hand.
- **The crossing reads the wing.** Inside a partly drawn wing, every crossing follows the twin's order.
- **The head follows the paper wing.** Once the paper wing is drawn, the head takes the Ink sheet's tone.

**Listings: pairs across the seam.**
- **Collection.** The plate sequence's `both` hanging is the default (`/collection`). The wall is paper to the left and night to the right, and each leaf keeps the rhythm. On a phone every work is one line, its Ink beside its Light. The running head splits at the seam while the wall is under it (`<html data-split>`). The words Ink and Light each hang their expression alone, and hang both again once alone.
- **Home.** The spread hangs 031 and 035 across the seam, one in each expression, and they change places with the day. The cycle row hangs twice, in Ink on paper beside Light on night.
- **Exhibitions.** Trails and cycles hang in pairs. The hang's leaves take turns between the expressions, starting from the day's. The list shows each first work as a small pair.

**Motion.**
- Light's settling clip plays under the lease, as Ink's clips do, on a desk and on a phone.
- A pair is one unit of the lease: both halves settle together and rest once each has.
- Curated works now record each expression's published film from the index, so their Light clips bind.

**Cards.** The work, venue and collection cards show the pair across the seam.

**Phones.**
- The Index sheet's empty wall tells a finger how to hang a work there, and its search field takes its row.
- Footnote marks have a 24 px target.
- All the light's sky runs edge to edge.
- The exhibition list's pairs take the row's width.
- The collection's bottom bar had squeezed its words into one another on a middle page, in English and worse in Ukrainian. The words now keep their widths and scroll sideways in their own strip, with the two expressions first so they are always in view. The pager holds the right edge.

**Found while building.**
- The motion lease kept watching the old cards when the same works were hung again in the other expression, so a switch from Ink alone to Light alone never woke a film. Each hanging is now its own wall with its own lease.
- Naming the twin in the wing's scroll rules made them outrank the rule that hands the clip to the travelling seam, so inside the wing the straight seam stopped travelling and jumped at the commit. The browser suite caught it, and the Turn's rule now names the twin too.

**An independent review, and what it changed.**
- **The first paint knows the plate's ground.**
  - **Why:** the inline room script paints the home and a work in the ground of the plate's opening (the URL's request, else the remembered choice, else the day's). Without this, every Light day would open with a paper head over a black plate until hydration.
  - **How the day is computed:** by the arithmetic of `src/lib/art/day.ts`, which reads no registry, so the browser computes what the server computed. A test runs the script across two passes and compares it with the server's arithmetic.
  - **The handover:** the wing takes its first reading in a layout effect, so hydration never paints a wrong frame between the script and the wing.
- **The Index sheet computes the day in the browser.** It no longer takes it from a layout prerendered on another day. It reads nothing of the collection from a work page's own query: there, its links hang both again.
- **The visitor's request is their choice.** An expression requested in the URL (the half they pressed, a shared link) is remembered for the visit. A neighbour's link carries the expression on view, Ink as well as Light.
- **The toggles say what they are.** The words Ink and Light are named by themselves. The one hung alone is marked `aria-current="true"`, and each word's description says what it does: "Ink alone", or "Ink and Light together".
- **Pair endings are forgotten when the lease moves on**, so a half that ended under an earlier lease never rests a pair early.
- **The browser suite checks its server.** A global setup refuses a reused server that is not on the suite's venue day. The pin is read from the first-paint script a work page ships.

**Open for the owner.**
- Should the auction landing show work before a contract exists, clearly labelled as not offered? *Answered (owner, 8 November 2026): yes, the last imprinted cycle, labelled "Not offered", until a contract exists (§8).*
- The Overture was approved on 4 November 2026 and is built (§7).

**The last two on phones.** *Built 7 November 2026, after the freeze fix in PR #13 (8063dc5).*
- **All the light on touch.**
  - **A finger held on the sky names the orbits beneath it as it moves.** It is held once it has rested 300 ms within 10 px of where it came down. What lies beneath it is then named and lit at once, and it names as it moves, lit wherever it rests, as a pointer does.
  - **Lifting it chooses**: the brightest beneath it stands alone. Lifted off the sky, it chooses nothing.
  - **A tap still chooses at once.** Lifted before it has rested, its click chooses, as a pointer's does. A slow tap that has become a hold chooses the same orbit as it lifts.
  - **A finger that moves before it rests is scrolling the page**, and names and chooses nothing. It is the grammar the vision gives the Index of numbers on touch ([world-class-gallery-vision.md](world-class-gallery-vision.md)): hold, then move, to scrub; move at once to scroll.
  - **While a finger is held the sky keeps it.** The page does not scroll beneath it (the sky's own non-passive `touchmove`; React's are passive). The click its lift would bring is withheld (`touchend`), and the click handler ignores one that comes anyway. A long press opens no menu. A second finger is a pinch, the browser's to zoom by, and the hold lets go.
  - **The naming line stands above the sky where the screen is touched** (`pointer: coarse`), because the hand holding the sky covers what lies below the finger. Its room never shrinks: the finger's invitation, unseen, keeps its place while names stand in it (`data-room`, drawn by a hidden `::before`), and two lines are kept at least. So no naming moves the sky under the finger, in any language.
  - **The invitation is the finger's there**: "Hold a finger anywhere to name the orbits beneath it; lift it to show the brightest alone", in all eight languages (`allTheLightHold`). A pointer's screen keeps "Point anywhere…". The stylesheet chooses between the two, so the first paint says the right one.
  - **The sky still hangs edge to edge** (Part 1).
- **The Orrery's phone pass.**
  - **Two orbits to a row** on a phone, each about as wide as a desk's cell: 170 CSS px at 390, against 111 at three to a row.
  - **The canvases are drawn at the screen's own density, three at most.** The cap was two, so a 3× phone's trails were drawn on a coarser canvas and scaled up, soft. They are now drawn crisp. The trail keeps the venue's one weight, a CSS pixel at a fifth of its light, as on the work page and in the Overture.
  - **The page's pacing is untouched.** The worker still draws only when the page asks (PR #13).
- **Found while building.**
  - **The way back scrolled a phone away.** Chromium focuses a tapped button, so "Back to all the light" handed the focus to the work's numeral far below in the index. That scrolled the sky out of view and named the orbit again. Pressed by a hand (a click whose count is above nought), the focus still returns to the numeral, but without scrolling and without naming it. From the keyboard it is followed there as before. WebKit gives a tapped button no focus, so it never showed there.
  - **A line of names opened with its separator.** On a phone the five names wrap, and WebKit broke before a " · ". They are now joined with the venue's separator, a no-break space before the dot.
  - **The naming line had lost its gutter** inside the edge-to-edge figure, touching the screen's edge.
  - **The invitation is longer than any naming.** Measured in both engines at 390, 360 and 320 px, the finger's invitation takes two to four lines (three in Ukrainian, Japanese and Vietnamese at 390), and five names or a choice never more than two. A room of two lines alone would have let the sky rise a line under the finger as the hold began.
- **Tests.**
  - **Unit:** the hold, the scrub, the lift, the tap, the scroll, the lift off the sky, the cancelled and the pinched hold, a hold before the grid has come, and the way back by hand and by key. The Orrery's canvases are drawn at three on a 3× screen and at three on a 4× one, and at a desk's own density below.
  - **Browser** (chromium-mobile and webkit-mobile): the sky edge to edge, with its line above it and in the gutter. In all eight languages the sky stays where it is as a finger is held and lifted. The hold, the scrub and the lift, with a real touch in Chromium and a finger's pointer events in WebKit. The way back stays in place. In Chromium the page does not move beneath a held finger, and a swipe scrolls it and names nothing. The Orrery hangs two to a row, and a 3× phone's canvases are three pixels to the point.

## 7. Parts 2 to 4 as built: the events

**After the frame.**
- **The fate is re-derived and checked.** The port gains the generator's fate rule (`classify_fate`): from the window's first step, the escape check every 10,000 steps, and five positive answers in a row date an ejection by the first. The published threshold (−0.3) now travels in the orbit registry, and the registry's build re-derives every fate before it writes. All 72 are exact: 36 ejections and 36 eternal dances.
- **The proof table gains a row: Fate.** After the measurements the worker runs on past the window, to the escape or the 8,000,000-step horizon. It hands back the bodies at the window's end and just before an ejection. The summary speaks once every row, the fate included, has been checked.
- **The performance.** The section's word After the frame, or the plate's once its film resolves, runs the same physics on at the film's pace from the bodies the worker kept. It passes through the fate run's states bit for bit; a test proves it for №054. The window dims behind it and the score loses its playhead. The continued trails take the bodies' hues drained of colour, on a layer that forgets them over about a film's length. The section's line says what it is: not the work, but what the work's orbit does next.
- **An ejection** is performed to its confirmation. It rests as soon as the escaping body's light has left the drawing, and never more than two seconds of the film's pace later. The readout dates it: "Body 2 has escaped, at step 1,090,000". An escape further on is one word away: To the ejection starts four seconds before it. **An eternal dance** turns on to the horizon.
- **Reduced motion and Pause** draw it at once: an escape from its approach, or half a window of a dance. The steps are taken a hundred thousand to a frame, so the page stays responsive.
- **On a phone** the readout keeps its full width, and the words take a line of their own beneath it, reserved from the start.
- **The plate's word** links to `#orbit` and asks by `cosmic:after-the-frame`. It appears on a desk, where the film resolves; a phone's plate rests on its excerpt.

**The choice** was built in its own worktree and brought in whole; its commit message records the details.
- The day's 100,000 beginnings are re-derived in a worker, in the generator's order, each measured exactly at the quick gate.
- They arrive as a field of light: total energy across and angular momentum upward, on logarithmic scales, with the chosen one ringed and named.
- The caption states this browser's counts and the studio's search, which cannot run here: up to two million steps a beginning, 200,000,000,000 in all. It also says whether the chosen masses are the published ones, to the last bit.
- The derivation takes 0.4 s in WebKit and 0.6 s in Chromium.

*Both versions below were succeeded on the home by First Light on 8 November 2026 ([first-light.md](first-light.md) §13). Its gate, phases, crossing and input rules are kept; the black and the drawing are not.*

**The Overture**, version 1.
- **The gate is the first paint.** On a first visit to the home the inline room script marks `<html data-overture="pending">`. It requires that nothing is asked of the plate in the URL, that motion is welcome, and that this browser's local storage holds no earlier Overture. The page then paints black, with the head and the plate waiting beneath. Should the Overture never come, the black lifts itself after `--t-overture-wait`. The performance is its own chunk, so a returning visitor never downloads it.
- **One clock.** Over the black, the day's work's bodies replay its recorded window from the verified first step, with the Orrery's `WindowPerformance`. They follow the Light film's own map from step to time, compressed to `--t-overture` (6.5 s). Beside them the Light still condenses in its arrival order, from just before its first mark to just past its last. A minimal WebGL front with the crossing's own edge draws it; without WebGL the still comes up whole, on the same clock.
- **Where.** On a desk the plate condenses smaller, beside the score. It is laid out in its own place and only scaled down, so it lands sharp. On a phone it condenses in place, with the score beneath it.
- **Landing.** The score gives way as the plate grows into its place, and the black lifts over the home's own Light plate. On an Ink day the plate then crosses to Ink in the order the ink came to rest, by the Overture's own crossing (`--t-overture-cross`, the Dusk's old pace). The running head and the strip arrive with it, as walls the crossing turns. On a Light day the plate stays in Light.
- **Quiet.** Beneath the black the plate stands in Light. It lands on the opening it would have had: the remembered choice, else the day's expression. None of this is the visitor's choice, so nothing is remembered and the wing keeps the twin the page opened with. A shared store (`overture-store.ts`) carries the phase and the viewer follows it, so the order in which the two mount never matters.
- **Any input ends it at once**, on the page as it would have opened. The press that ends it presses nothing beneath. Pause, reduced motion, a new width and a hidden tab end it too.
- **The Dusk is retired**, with its controller, its flag, its tokens and the home's shorter rest.

**Found while building.**
- **Two clocks in development.** React mounts every effect twice in development. The Overture's first run let its images' promise outlive its cleanup, and built a second condensation on the same WebGL context; WebKit reported "location not for current program". A run that is taken down now builds nothing, and a test mounts it twice.
- **One home for storage keys.** The expression's key was defined three times. The venue's storage keys now live in one module (`storage-keys.ts`), which the components and the first-paint script read alike.
- **The suite's own day.** A local run without the pin computed today's work while the server showed the pinned day's. The config now pins the test process too.
- **The suite as a returning visitor.** Every spec but the Overture's starts with the Overture already seen.

**An independent review, and what it changed.** It found four defects and three likely ones, all in the Overture and the plate's handling of it; the fate, the continuation and the choice checked out. All are fixed and tested:
- **Once a visit.** Coming back to the home later in the visit played the Overture again. Its request now lives on `<html>` until it ends.
- **Nothing leaks onto the visitor's Turn.** A quiet move called off before it landed could leave its flags for the visitor's next Turn, which then neither travelled nor was remembered. One case was decoded and waiting in a transition, so no longer pending; the browser suite caught it once on a WebKit phone. A move called off is now always superseded and its flags cleared, and a Turn's mode is spent wherever it is read.
- **The ending input does nothing else.** While the black is up, the press and the key that end the Overture act on nothing beneath; Tab still moves on. Once the black has lifted, input acts on the page as usual.
- **No black twice.** On a slow phone the first paint's black could lift itself and then return when the Overture arrived. The Overture now stands aside once that wait has passed.
- **Never left hidden.** A performance taken down mid-play gives the page back. A failure inside the still's arrival ends it, and its listeners are attached only once nothing can throw.
- **Smaller things.** The plate's word now takes the keyboard and the screen reader to the orbit. The field's status is busy while it derives, so a screen reader speaks the outcome rather than every count. The word is offered on a desk only, where the strip has room. A browser test that could not fail now presses a link beneath the black.

**The Overture**, version 2: the bodies draw the plate. *Built 6 November 2026.*
- **The frame is the generator's own.** The plate's frame is the generator's path from the simulation to the film, ported beside the orbit (`src/lib/physics/`), in the generator's order:
  - **The projection** (`app.rs`). Eleven works draw phase space: six cross braids, three hodographs and two phase portraits.
  - **The view** (`app.rs`). The generator photographs each orbit from the best of four seeded angles: Shoemake rotations from the seed's `cosmic-view/v1` fork, each proxy-rendered in the work's layer stack and scored. The scorer is ported line for line (`view-score.ts`).
  - **The camera's drift** (`drift.rs` and `drift_config.rs`, in `drift.ts`). The main stream is read on past the Borda search, 2.1 million draws, to the drift's size, sweep and eccentricity. The trait file publishes these three, and all 72 works match to the last bit. The ellipse's orientation and starting phase are the next four draws.
  - **The fit** (`render/context.rs`). The box of every drifted step, padded by a twentieth and widened to 3,456 × 2,234.
  - **The symmetry** (`batch_drawing.rs`). Nine works draw every stroke again about the frame's centre: four mirrored, two turned three times, three dihedral. Turned copies shrink so the frame's diagonal stays inside.
  - **The profile's choices.** The layer stack's exact alphas, the symmetry and the projection come from the profile's `cosmic-structure/v2` fork. Each matches the trait file's label for every work.
  - **The files.** `framing.ts` draws with a frame and is all the Overture loads; `frame-derivation.ts` derives one.
- **Checked against the generator itself.** A scratch build of CS-Image-Generation at 4dc6d64 printed, for all 72 works, the four view scores, the box and the bodies' pixels from the generator's own code. That build was an example binary outside both repositories. The port agrees on all of it:
  - every work chooses the same view;
  - the scores are the same to the last bit, but for two that differ by one ulp (`Math.log` against the system's `ln`);
  - the boxes agree to 1e-15;
  - the pixels are the same single-precision values.

  Eight works tie at the score's ceiling of 1 and keep the first view, as the generator's strict comparison does.
- **Checked against the films.** `npm run art:frames` (`scripts/build-orbit-frames.mjs`) derives each frame, and frames the window from the three views the generator passed over too. It then decodes the published Light film once, through the verified cache, at 576 × 372. Frame by frame it takes the bodies placed at every 37th step the film's frame drew, and counts those standing on or beside a cell that gains light in that very frame:
  - the frame's own bodies: 41–99.9 %;
  - any view passed over: never more than 11.5 %;
  - the frame always leads the best of the others by 8.4 times or more.

  The registry is written only when every work's bodies meet the film's new light in at least a quarter of the samples, and lead every other view by three times on the film and by one and a half times on its trace.
- **The trace.** What the film gained, and when, is kept for each work as a lossless 576 × 372 WebP: sixteen bits a cell, one for each sixteenth of the film. The 72 traces (`public/art/traces/`) are 2.5–33 KB each, 849 KB together, and are never shown. Every indexed work is replayed in its frame against its trace:
  - in Node (`framing.test.ts`);
  - in each engine's desk project (`tests/e2e/frames.spec.ts`), with the very files Node runs, types stripped, on a blank page of its own origin.

  Each meets the build's agreement, at least 1.8 times any other view's. The page also re-derives № 023 and № 001 from their seeds.
- **The registry.** `src/lib/art/orbit-frames.json` (135 KB, read on the server) keeps every double as its exact decimal. A frame binds to its work only while the orbit record's seed and trait hash, and the Light film's hash, agree.
- **Re-derived on every run.** `npm run test:scripts` re-derives all 72 frames from their seeds. Every choice and every draw must match to the bit. The scores, the drift's ellipse and the box must match within a trillionth of the frame (`FIT_TOLERANCE`), because sines, cosines and logarithms feed them and machines round those apart.
- **A rebuild keeps the stored digits.** When a rebuild frames a work the same, it keeps the digits already stored, so another machine does not rewrite meaningless last bits.
- **The performance.** With a frame, the score is drawn on the plate itself, in its own place, on a desk and a phone alike:
  - the three bodies stand where the film drew them; a kaleidoscopic work draws them once in each copy;
  - their trails add their light to the still's;
  - beneath them the still condenses in its arrival order, on the same clock;
  - the plate does not grow into its place, because it is there already, and the page comes up around it as the trails give way.

  Without a frame (a stale registry, or a work not yet measured) version 1 plays as before. Reduced motion, returning visitors, Pause and any input are unchanged.

**Found while building version 2.**
- **The frame is more than the drift.** The view is chosen before the drift, by a proxy render, and the fit comes after it. Without the scorer the drift lands on nothing: each wrong view's bodies meet the film's new light in a few per cent of frames.
- **The arrival maps order regions, not strokes.** Their softening gives a late mark beside early ones an early time. The condensation keeps their order, and only the trails are registered.
- **The trace tells views apart by their lead.** How often the right frame meets its trace depends on the work: chords spread their light away from the bodies, and symmetry's copies share it out. One right view (№ 049, 54.8 %) met it no more often than another work's wrong one (№ 006). The build's first rule, a level of 60 %, refused four true frames, so it now asks for a lead.
- **Node's type stripping needs `.ts` in imports between physics files.** The tsconfig now allows them (`allowImportingTsExtensions`, with `noEmit`).
- **Worker threads inherit `process.argv`.** A worker that imported the build script would run its main. The film's measure therefore lives in `scripts/lib/film-measure.mjs`.
- **V8 rounds sines and cosines apart from machine to machine.** CI (x86-64) re-derived five of the 72 frames an arm64 Mac had written, and their boxes (and one drift's semi-axes) differed by one to six ulps. The likely cause is that arm64 builds of V8 fuse multiplies and adds inside `Math.sin` and `Math.cos`, and x86-64 builds do not. Every choice, draw and score matched. "To the last bit" therefore holds for what the stream draws and for the plain arithmetic, not for the fit, which is checked within a trillionth of the frame.

**The work page's orbit, on the plate.** *Built 6 November 2026, on the owner's yes to its design note.*
- **Where.** The section "The orbit, re-performed" draws on a plate. The plate is the still of the expression the page shows, untouched, in its own proportions and on its own ground. The bodies are drawn over it where the films put them, at the Light film's pace. The score, the proof table, Verify an orbit and After the frame are as they were.
  - The page's own plate stays the work alone. Physics happens around it; it carries the films, the Turn and the crossing; and the lot page shares it.
- **Light.** It is drawn as the Overture draws: the trails add their light to the still's and fall inside the ribbons. When the window ends, each body stands where its stroke ends. A kaleidoscope's bodies are drawn in every copy, since its film drew every stroke in each.
- **Ink.** The Ink edition stirs its sumi with the bodies where the Light film draws them (the generator's ember design, §3). It uses the same projection, view, drift and fit, and the primary copy of a kaleidoscope. Each body is an ellipse with the area of a disc 2.5 % of the sheet's height, and holds no ink. So the still keeps a hollow where each body stood when the window ended.
  - On the plate each body is outlined at that size in sumi, with its path in graphite and no colour. Each comes to rest in its hollow.
- **Checked against every Ink still.** `npm run art:hollows` (`scripts/build-orbit-hollows.mjs`) replays each window in its frame to the step the still shows. It places the primary copy's bodies there, and reads the Ink still's 1,920 px rung for the hollow around each (`scripts/lib/ink-hollows.mjs`). The rung is read only once its bytes are the ones the still ladder recorded.
  - Of the 216 bodies, 196 stand in a hollow of their own: closed, a body's size, and centred within a third of a radius.
  - The rest share a hollow with a close neighbour or meet open paper. None stands on ink.
  - Three places drawn at random do the same a few times in a thousand: 6 of 4,320 bodies, and 4 of 1,440 trios that would bear a still out.

  The registry (`src/lib/art/orbit-hollows.json`, 85 KB, read on the server) is written only when every still bears its bodies out. An entry binds to its work only while the orbit record, the film its frame was measured against and the Ink still's hash all agree. `npm run test:scripts` measures all 72 again.
- **What is drawn is what was derived.** Given the frame, the orbit worker replays the window it has just derived, from its own first state, on the plate (`framedSamples` in `framing.ts`). It places every hundredth step, and then the still's own step, in single precision as the renderer placed them.
- **After the frame** goes on over the same still, from where the still left the bodies. The camera holds where the film's frame ended (`HeldPlacement`), since the generator never drifted it further. An escaping body leaves the plate.
- **Reduced motion, Pause and the hush** draw it whole: the still, the window, and the bodies at rest where the work left them.
- **Phones.** The plate runs the full width in the still's proportions, and the bodies are sized to the plate. The still comes from its ladder, never the 3,456 px original.
- **Light and Ink.** The section's plate shows the expression the page's plate shows: the visitor's choice, remembered for the visit, else the page's opening. It turns with the page's Turn.
- **The fallback.** Without a frame that binds, or on an Ink still that does not bear the bodies out, the section draws as Phase A did, in the orbit's own plane on night. A window the worker cannot place falls back the same way. A still that fails to load leaves the drawing on the plate's ground.
- **Labelled.** The caption says where the bodies are drawn and ends "Analysis, not the work". The section is on the work page only, never on a lot.
- **Tested.** Unit tests cover the placement, the held camera, the worker, the registry and its binding, and the section in each material and its fallbacks. In every engine's projects, `tests/e2e/orbit-plate.spec.ts` checks three things:
  - № 031's bodies are drawn at rest where its Ink still shows paper ringed all round by ink; ninety pixels away, the paper opens out;
  - the Light plate's lights stand at the same places;
  - the plate keeps its proportions on a phone and turns with the page.

  Phase A's checks hold on the plate: № 031 and № 071 are re-derived with every measurement exact.

**Open.**
- **WebKit swaps a large streamed page in after load.** *Resolved by PR #16 (e15f8fd).* WebKit held the page behind the route's fallback and rendered the streamed `main` again after hydration: on the home, a work page and the Ukrainian process essay. This was reported while building The choice and predates this phase. It had two causes:
  - **The second render.** Once the shell hydrated, the motion provider's context took a new value, and React renders on the client any streamed boundary that has not yet been revealed. WebKit's reveals always came after hydration (below); held back that long, Chromium's did the same. `useMotion()` now reads the motion store itself, with no context, so the streamed `main` hydrates in place.
  - **The wait for load.** During a navigation WebKit grants no animation frame until the page has something to paint or has loaded, and React reveals a streamed boundary on a frame. `src/lib/reveal.ts`, inlined by `src/app/venue-document.tsx`, reveals the waiting boundaries itself while no frame has come.

  `tests/e2e/hydration.spec.ts` holds every reveal until the shell has hydrated, and requires each streamed node of the three pages to hydrate in place. The first-paint tests now run in webkit-reduced-motion too.
- **A prefetch of `/exhibitions` answers 404** on the English home. It also predates this phase. *Resolved on 6 November 2026.*
  - **The cause.** Next's router predicts the route of an address it has not yet fetched from the routes it has learned. Once it had learned the home's, `/[locale]`, from an address that carries its locale (the language menu's `/uk`, or `/en` itself), it took English addresses for the home in a locale of their name: `/exhibitions`, `/process`, `/statement` and `/privacy`, which the proxy rewrites to `/en/…`.
  - **The cost.** It asked each of them for the home's own segment and got a 404, then asked for the locale's layout again and again. On main's production build one page in Chromium made 18,312 such requests in 20 seconds and had not stopped; WebKit did the same.
  - **The fix.** The home closes its parameter (`dynamicParams = false` in `src/app/[locale]/page.tsx`), and the router predicts no route with a closed parameter, so it asks the server for each address's route. Each address is then asked twice, for its route and its page. `tests/e2e/not-found.spec.ts` fails without it.
  - An address the proxy never sees, such as `/foo.bar`, now gets the venue's own 404 page rather than Next's bare one.
- **Opening night** (§5.9) waits for the pipeline to publish traits early.

## 8. A polish pass: the gatefold, the Orrery, the grids, the sale's empty state

*Built 8 November 2026, from an audit of the venue's first impression on 7 November.*

**The gatefold on a desk.**
- The spread was a strip wider than the viewport that snapped plate to plate: 2,464 px at 1440. A desk saw the Ink plate and a black sliver of the Light, about 15 % of the width, and nothing said it scrolled.
- On any screen wider than a phone both plates now hang whole, side by side within the page's gutters, at equal scale (662 px each at 1440), capped by the room's height. The gatefold is a comparison, and a comparison wants both in view at once. The seam remains for the large overlaid view, and the page's own plate shows each expression at full height. A phone keeps its vertical diptych.
- Nothing scrolls, so the spread is no longer a tab stop and no longer quiets the venue's keys: a reader meets the view's name, then each plate by its alt. The plates ask for half-wall rungs.
- WebKit lays a grid item with an aspect ratio out at nothing unless it is given a width, its image being sized by percentages, so each panel takes its column's width.

**The Orrery.**
- Each body is drawn in its published hue, the generator's OKLCh base hue, at most of the chroma sRGB holds at the line's lightness (`src/lib/physics/body-light.ts`), so no browser bends a hue back into gamut. The line keeps the venue's one weight, a CSS pixel, but at half its light where the work page and the Overture keep a fifth: a cell is small, and at a fifth it read as grey. Beneath it is a glow of the same hue, 7 px wide. Both add their light, so crossings brighten.
- The base hues are the centres the generator's colour wanders from: over a film a ribbon's hue moves by up to about a hundred degrees around its body's (`src/render/color.rs`: waves, accents and a drift). A cell therefore shows each work's palette, not a copy of its plate. Drawing the plates' own colours would need the generator's colour stream ported, as its physics was.
- On a desk the cells are 260 px at least: four to a row at 1440 (311 px, where seven had been 174), three at 1024, six at 1920, eight at 2560. Each count divides a cycle of 24. A phone keeps two to a row.
- The page's pacing (PR #13) and the still preference are untouched. Each film frame is still one path, now stroked twice, and a performance still ends on the picture the whole drawing makes.

**The grids.**
- Across the seam each leaf is half the wall, so three to a leaf hung a plate at 172 px at 1440, where Light reads as a tangle and Ink as a smudge. The pairs now hang their own rhythm, a lead and then two rows of two: 1 · 2 · 2 · 1 · 2 · 2 · 1 · 2 · 2 · 1 · 2 for a page of eighteen. The least plate is 288 px. A single ground keeps the full rhythm, whose rows of three are 30 vw.
- Each chapter opens its cycle on the rhythm's lead, so every cycle leads with its largest plate.
- A row the cycle or the list runs out on hangs only the works it holds, at their size: a lone work is a lead, never one plate beside empty places. The trails gain most, since their neighbours are often of different cycles.
- The home's cycle row hangs two to a leaf on a desk (303 px at 1440, where six to a row had been 200) and three from 1920 px. On a phone it is one work a line, its Ink beside its Light, as §2 says; it had been two to a leaf, at 81 px.

**The sale before it is offered.** *Built on the owner's yes, 8 November 2026 (§6).*
- Cycle 3's eight works do not exist until the cycle finalizes, so the version hangs the last imprinted cycle, Cycle 2, beneath the sale's status. It is labelled "Not offered", with a note that these works are in the collection and not in this sale, and that the sale's eight are imprinted when Cycle 3 finalizes. Each work leads to its own page, never to a lot, and each link is described as not offered. It is gone once a contract is configured.
- It adds two strings in all eight languages. The landing grows by the cycle's row, so its conditions of sale stand about 3,800 px further down on a desk and 4,400 on a phone; the title spread's link still leads straight to them.

**Tested.**
- **Unit:** the gamut search, and every work's line and glow inside sRGB in its own hue; glow and line along one path; the pairs' rhythm, a lead at every chapter and no empty places; the gatefold's spread neither scrolls nor takes focus; the sale's row, with its label and note, every work of the cycle in both expressions leading to its own page and described as not offered, before the conditions, and gone once a sale is offered.
- **Browser, in the six local projects:** both plates of the gatefold wholly in view, side by side on a desk and stacked on a phone; the Orrery's light in № 002's three hues, never grey (main lit about 160 pixels of that cell, at a median chroma of 0.03; it now lights about 4,400 at 0.06), and four to a row at 1440; the pairs' rhythm and their least plate; every cycle on its lead; the home's cycle row on a desk and on a phone; the sale's row in all eight languages, under axe.
