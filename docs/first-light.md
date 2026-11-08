# First Light — the universe that made the work, computed in front of you

_A plan to take the venue from admirable to unforgettable. Written 7 November 2026, after a first visit to cosmic.art at 1440 × 900 and 375 × 812, and a review of the published stills._

## 0. In one minute

The venue is rigorous, fast, accessible and true to the art. It is not yet astonishing.

A first-time visitor sees thin lines gather on black for six seconds, then a quiet still in a quiet frame, then a scholarly catalogue in small type. Nothing in the first ten seconds makes them gasp. The one fact that should is told in tables and footnotes: each work is a real gravitational event, computed exactly from its seed.

**The art is good enough.** The Ink series is genuinely distinctive. The Light series is handsome, but it works in a familiar genre and needs help to glow. The art is not what holds the venue back. The presentation is.

The plan is one idea, executed to the standard of the best sites in the world: **let the visitor witness the universe that made the work.**

- On arrival the work is there at once, full-bleed. It is the first thing anyone sees.
- Then it comes alive. The flat picture opens into the three-dimensional event that made it, and the light runs back into three stars.
- The bodies dance again under real gravity, computed live in the browser and drawn with the generator's own light, while the camera travels around an event that no still has shown.
- The camera returns to the generator's chosen view, and the light folds back into the published work.

_It was not drawn. It was computed, and you just watched it happen._

Five more moments follow from that idea:

- light that actually glows on HDR screens;
- a Turn that changes the material around bodies that stay where they are;
- the orbit held in the hand;
- one part in a trillion made visible;
- a collection that is alive.

## 1. What a visitor sees today

- **The first ten seconds.**
  - Black, then the day's orbit (№ 031) drawn as thin trails over about six seconds, landing on the Light still with small chrome around it.
  - It is elegant. It is also flat, slow to reach anything bright, and the same scale as the still that follows.
  - On a phone the drawing fills a small patch in the top third of a black screen.
- **The scroll.**
  - The Ink still, then a slab of statement text on paper and a diptych.
  - Then a two-column grid of 24 thumbnails per cycle. At grid size the Light works read as tangles and the Ink works as grey smudges.
- **A work page.**
  - A strong plate, then a long, beautifully set catalogue: the re-performed orbit, a proof table marked EXACT, the selection line, footnotes and measurements.
  - It rewards a scholar, but a newcomer meets numbers before wonder.
- **The Orrery.** 72 faint white line drawings on black. It is true, and it looks close to a debugging view.
- **All the light.** The strongest image on the site: every orbit summed into one luminous field.
- **Auctions.** A title and a line of text, with no art.

What is missing is not polish. It is a **moment**: one experience so specific to this art that it could not exist anywhere else, executed so well that people show it to each other.

## 2. Is the art the problem?

No. But it has to be shown at its strongest, and two upgrades on the generator's side would raise the ceiling.

- **Ink is the stronger half.**
  - The vortices, the filaments and the metallic density where the ink gathers read like suminagashi made by physics.
  - They hold up at full size and stand apart from the rest of generative art (№ 023, 057 and 066 at 1920 px).
- **Light is handsome and uneven.**
  - Luminous ribbons on black are a familiar genre: attractors and light painting.
  - The best works are vivid and dimensional (№ 049 and 066).
  - Others are muted, with a haze at the centre and much empty black (№ 012 and 031).
  - In SDR the light never quite glows.
- **The rare thing is the truth.**
  - Each work is a solution of Newton's three-body problem, chosen from 100,000 candidates and rendered twice from one orbit.
  - The venue re-derives each one here, to the last bit. We know of no other art venue that can show that.
  - Today the site proves it, but it does not make anyone _feel_ it.
- **What would raise the ceiling.**
  1. HDR renditions of the Light works, made from the 16-bit masters, so light is shown as light on the screens most collectors own.
  2. Films at higher fidelity: the HLS ladder at full resolution and 60 fps.

  Both need the generator team and the artist.

Re-rendering or "improving" the published works is not on the table: they are the tokens.

## 3. The bar

The sites that designers cite as references share a handful of traits. Sources are at the end, gathered on 7 November 2026.

- **One idea, with the art first.**
  - Readymag's 2025 jury praised its winner for working "without distracting from the work".
  - Each Awwwards Site of the Year since 2023 is remembered for one mechanic: Lusion's 3D scenes explored by scrolling (2023), Igloo Inc's procedural ice (2024) and the Lando Norris portrait that turns in depth (2025).
- **Performance is part of the design.**
  - Awwwards' developer jury scores web performance beside animation.
  - Igloo Inc renders its intro live with shaders rather than video, compiles them in the background, and tunes for low-end devices.
  - Bruno Simon's WebGPU portfolio keeps lighter presets for phones, and an escape hatch for anyone stuck.
- **Accessibility is the open lane.** The celebrated showpieces score their worst on accessibility, 6.4 to 7.6 out of 10. A venue as moving as they are, and exemplary in access, would stand alone.
- **Sound behind a threshold.**
  - The National Gallery's Imaginarium (Webby, 2026) opens with one "Launch the experience" click, then a commissioned soundscape.
  - Browsers block sound until that first gesture anyway.
- **The grammar of generative art.**
  - Art Blocks made "the same hash gives the same image" a public promise. QQL let visitors steer the algorithm, and Tyler Hobbs's Fidenza page explains its own.
  - The venue's re-derivation is the strictest form of that promise, and One part in a trillion (§5E) is its answer to QQL.
- **Explaining is a craft.** The Pudding's judges reward work that explains something more clearly, and the NYT's Upshot builds intuition with carefully timed motion. That is the register for each work page's record (§6).
- **Where spectacle becomes a gimmick.** In Nielsen Norman Group's tests, taking over the scroll disoriented people, worst of all on phones. Spectacle holds up only when it is short, purposeful and interruptible.
- **First impressions are fast.**
  - People judge a page's look within 50 ms, and those judgements hold.
  - Visitors leave most often in the first ten seconds.
  - People remember an experience by its peak and its end, so First Light designs both (§4).

**What browsers can do now:**

| Feature                         | Where it works                                                                                                                                          | What it is for here                                                                       |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------- |
| WebGPU                          | Chrome 113 (Android 121), Safari 26, and Firefox 141 on Windows and 147 on Apple-silicon Macs. Not yet Baseline: Firefox lacks it on Linux and Android. | The light engine, with WebGL 2 as the fallback                                            |
| HDR stills (gain maps)          | Safari 26, and Chrome (reported from 116). Not Firefox.                                                                                                 | True light (§5B), falling back to SDR by design                                           |
| `dynamic-range-limit`           | Chrome 136, Safari 26                                                                                                                                   | Grids at standard range; full brightness only for the work in focus                       |
| HDR canvas                      | Chrome's WebGPU from 129. Safari unconfirmed.                                                                                                           | The live render's highlights                                                              |
| HDR video                       | Safari and Chrome                                                                                                                                       | The Light films in the HLS ladder (F4)                                                    |
| Cross-document view transitions | Chrome 126, Safari 18.2. Firefox: same-document only.                                                                                                   | The Orrery opening into a work (§5F)                                                      |
| Scroll-driven animations        | Baseline since Firefox 159 (27 October 2026)                                                                                                            | Section reveals, never the art itself                                                     |
| Display P3                      | All three                                                                                                                                               | Ready for the day the pipeline confirms the masters' colour space (vision §8, question 6) |

## 4. First Light

**What the visitor sees, second by second.**

| Time      | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 s       | The work is there at once: the day's Light still, full-bleed, painted from the preview the page already carries. It is the largest thing on the screen, so the page's Largest Contentful Paint is the art itself.                                                                                                                                                                                                                                                          |
| 0.8–2.5 s | The picture opens. The generator's view is flat (it turns the three-dimensional event and draws it without perspective), so the camera leaves it with a reverse dolly zoom, moving in as its lens widens. The light that lay flat turns out to be a sculpture of trails in three dimensions, slowly turning. The live light takes over exactly where the still's light lies, because the frame is the generator's own: its rotation, drift and fit, re-derived in Phase D. |
| 2.5–4 s   | Time runs back. The light draws itself back along its paths into three stars: the bodies, at the first step of the recorded window.                                                                                                                                                                                                                                                                                                                                        |
| 4–9 s     | The dance, forward, under real gravity computed in the browser, at the Light film's own pace (Phase E). The trails gather in linear light with the generator's hues while the camera arcs around the event. The closest approach flares: the peak. On an HDR screen the bodies and the brightest crossings are brighter than the page's white.                                                                                                                             |
| 9–10.5 s  | The camera returns to the generator's view, and its lens narrows until the depth flattens into the picture. The still takes over again, unaltered: the end. The number and title stand beside it, with one line: _Computed from its seed, in this browser, just now._                                                                                                                                                                                                      |

- **A visible Skip**, or any other input, ends it at once on the still. WCAG 2.2.2 asks for a way to stop motion that runs past five seconds. Reduced motion, Save-Data and returning visitors keep the still, with _Watch it form_ beside it.
- **Why it opens on the still.**
  - People judge a page's look within 50 ms, and leave most often in the first ten seconds (§3). The art should be what they judge.
  - A canvas cannot be a Largest Contentful Paint. An entry that opened on black would make the still's late arrival, about ten seconds in, the page's LCP.
  - The Two Grounds vision forbids blank stages for art.
  - F0 still tests a black-first opening against it with first-time viewers, because a reveal out of darkness has its own power.
- **Why it is true.**
  - The bodies are the re-derived orbit (Phase A).
  - The pace is the Light film's own clock (Phase E).
  - The final view is the generator's own frame (Phase D). The generator turns the three-dimensional event and draws it flat (`framing.ts`), so the depth the camera shows between the opening and the landing is the event's own.
  - Eleven works draw phase space rather than positions. For those, the camera travels through the three axes the generator projected, and the page says so.
  - The live render is called a performance. The published still remains the work and is never altered.
- **On a phone** the still opens from across the width. The event then fills the portrait screen, on a camera path framed for it, and folds back into the still across the width.

This replaces the Overture's version 2, which already draws the bodies on the plate in two dimensions. First Light adds depth, scale, light and a camera.

## 5. The signature moments

Each moment is the art's own truth, made visible. None is decoration.

**A. First Light** (§4). The entry, on the home and on a shared link to any work.

**B. True light (HDR).**

- **What it is.** On screens that can show it, the Light expression is shown in high dynamic range. That means Apple's XDR displays, current iPhones, many Android phones and HDR monitors:
  - Bodies and crossings are brighter than the interface's white, as light is.
  - The live render draws to an extended-range canvas.
  - The stills and films get HDR renditions cut from the 16-bit masters.
  - All the light, a sum of 72 exposures, is naturally high dynamic range. Its full range can be shown at last, with an exposure control labelled as analysis.
- **Why.** On the devices most collectors own, this is the single most physical upgrade available: the trails stop looking like a picture of light and start emitting it.
- **Where it works** (§3):
  - Gain-map stills show in HDR in Safari 26, and in Chrome (reported from version 116; F0 confirms it). Elsewhere they fall back to the SDR still by design.
  - HDR video plays in Safari and Chrome.
  - The live render's extended range is confirmed in Chrome's WebGPU, from 129. Safari's is unconfirmed, and F0 tests it.
  - Firefox shows SDR throughout, for now.
  - `dynamic-range-limit` (Chrome 136, Safari 26) keeps every grid at standard range, and lets only the work in focus reach full brightness. A wall of 24 glowing thumbnails would be glare, not a gallery.
- **Who decides.** The SDR still remains the token. Any HDR rendition is a new derivative and needs the artist's blessing, like the settling clips before it.

**C. The Turn, as a change of material.**

- **Today.** The Turn crosses from Light to Ink as a travelling seam, or in the order the ink came to rest.
- **The change.** The bodies are registered to the same frame in both expressions. Every Ink still has been checked, and 196 of the collection's 216 bodies stand in a hollow of their own (Phase D §7, PR #20). So the Turn can keep the three bodies exactly where they are while the material changes around them:
  1. The black ground warms to paper.
  2. The light's colour drains.
  3. The ink blooms from where the trails ran, in the order it came to rest.

  One orbit, two materials, and you watch one become the other. The crossing's arrival maps already supply the order.

**D. The orbit in the hand.**

- **What it is.** On a work page the re-performed orbit becomes a live light sculpture:
  - Drag to turn the camera around the three-dimensional event; it springs back to the generator's view when you let go.
  - Scrub time with the score.
  - Slow the closest approach down, with its real numbers beside it.
- **Why it is true.** It is the same physics as the proof table, and it is labelled as analysis, not the work. It turns the table's EXACT into something a hand can feel.

**E. One part in a trillion.**

- **The experiment.** Beside the orbit, the visitor asks: _what if the twelfth decimal were different?_
  1. A twin starts from the recorded state with one body moved by 10⁻¹² of a unit.
  2. For a while the two are one line.
  3. Then they part, and the separation is read out as it grows: exponentially, as chaos does.
  4. By the end of the window the twin is a different dance, and a different work that was never chosen.
- **Why.** It shows in fifteen seconds why each work is singular, why its seed is its identity, and why the venue verifies to the last bit. It is labelled as analysis and offered once on each work page, never near a sale.

**F. The collection, alive.**

- **All the light** becomes the collection's front door, drawn in HDR where it can be. Its naming and pull-out stay as built.
- **The Orrery** gets the generator's hues, the venue's light model and room to breathe:
  - fewer, larger cells, with glow;
  - a chosen orbit opens into its work page through a shared transition, and its camera settles into the work's own view.
- **No thumbnail cloud.** The grid stays editorial, as §7 of the Two Grounds vision requires.

**G. Sound, by commission** (the owner's decision; §11).

- A credited composer's score, behind a threshold that offers _Enter with sound_. It is never automatic.
- Closest approaches can carry a chirp computed from the re-derived accelerations: the one truthful sonification Third Physics allowed (§10).
- Sound is the largest single multiplier of awe the venue has not used. It is also the one most easily done badly, so it is a commission or nothing.

## 6. What stays, and what is revisited

**What stays:**

- Exactness.
- Equal Light and Ink.
- The 12 px floor.
- Eight locales.
- Reduced-motion parity.
- No altered NFT pixels.
- Derived views labelled, and never on sale surfaces.
- No scroll-jacking or smooth-scroll libraries.
- No virtual 3D gallery.
- No decorative motion that is not the art.

First Light is the work's own three-dimensional event, not a room around it.

**What is revisited, for the owner to confirm** (§11):

- **The Two Grounds vision's first rule against live simulation.** It says "recorded renderings, not live simulations". Third Physics already made the live orbit a labelled performance. First Light makes that performance the entry, and the recorded still remains its destination.
- **One timed event.** The Overture's version 2 gives way to First Light, which is still once per visit, ended by any input.
- **The catalogue's register.**
  - Each work page keeps all its scholarship, but in two acts.
  - **The show:** full-bleed, cinematic, almost no text.
  - **The record:** the catalogue, set as it is.
  - Display type grows where it leads a show, as the process page's "Physics, upon physics." already does.

## 7. The engine

- **A light engine of the venue's own.**
  - A small WebGPU renderer, with a WebGL 2 fallback, for trails accumulated in linear light, the bodies' glare, the generator's hues, a tone map, and an extended-range canvas where the screen allows.
  - WebGPU is on by default in Chrome, Safari 26 and Firefox on Windows and Apple-silicon Macs. It is not yet Baseline, because Firefox lacks it on Linux and Android, so WebGL 2 stays as the fallback (§3).
  - No general 3D library: the venue draws one kind of thing and should draw it perfectly.
  - The engine is new.
    - Today every trail is drawn with Canvas 2D: the Overture (`overture-performance.tsx`), the orbit section (`orbit-score.tsx`) and the Orrery's worker.
    - WebGL only reveals stills (`overture-condensation.ts`, `arrival-crossing.ts`).
  - Its model of how each work's strokes look starts from the generator's own eye, already ported in `view-score.ts`. That model knows each work's stroke vocabulary: orbit ribbons, harmonic weave, spokes, time chords and the rest.
- **Physics in workers, as now.** The integrator, the frame and the film clocks are built and verified (Phases A, D and E). The engine reads them and computes nothing new about the orbit.
- **The art first, the engine behind it.**
  - The still is the first paint, from the preview the page already carries.
  - The engine needs only the seed and a few dozen numbers. It compiles its shaders in the background while the still is on screen, as Igloo Inc's intro does, and takes over only when it is ready.
  - If it is never ready, the still simply stays. It is never a loading screen.
- **Adaptive quality.**
  - A device tier sets the trail count, sample count and resolution, from a first-frame benchmark and `deviceMemory`.
  - Frame pacing follows the page, as in PR #13. Hidden tabs stop.
- **The 16-bit masters as the HDR source.**
  - Gain-map stills (Ultra HDR or ISO 21496-1 gain maps), cut and hash-recorded like every derivative.
  - HDR films in the HLS ladder, once the generator confirms the colour pipeline (the vision's pipeline questions).
- **Tested like everything else.**
  - Unit tests for the engine's maths.
  - Pixel checks that the landing frame meets the still.
  - A frame-time budget measured on real devices (CI has no GPU).
  - Axe, the 12 px floor and reduced-motion parity in all seven projects.

## 8. Phases

| Phase                        | What ships                                                                                                                                                                                                            | Size            |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **F0. Proof**                | First Light for one work (№ 031) on a branch: the engine, the camera, the landing on the still, on a desk and a phone. The owner judges the gasp before anything else is built. _Built 7 November 2026 (§12)._        | 1–2 weeks       |
| **F1. First Light**          | The entry for every work with a frame; HDR canvas where available; the phone's full-bleed path; _Watch it form_; reduced-motion and returning-visitor states; performance budgets. Replaces the Overture's version 2. | 3–4 weeks       |
| **F2. The work as a stage**  | The show-then-record work page; the orbit in the hand; the Turn as a change of material.                                                                                                                              | 3–4 weeks       |
| **F3. Wonder**               | One part in a trillion; the collection alive (All the light in HDR, the new Orrery, shared transitions).                                                                                                              | 3 weeks         |
| **F4. True light and sound** | HDR stills and films from the masters; the full-resolution 60 fps HLS ladder; the commissioned score with its threshold. All of these wait on the owner, the artist and the generator team.                           | depends on them |

Quick wins that need no new engine, in the meantime:

- **The phone's Overture** draws full-bleed rather than in a corner.
- **The Orrery** gets its hues and glow.
- **The auction page** shows the coming works, labelled as not offered, if the owner agrees (Phase D §6).

## 9. How we will know

- **Five-second tests** with people who have never seen the site:
  - What is this?
  - What did you feel?
  - What would you show a friend?

  Run them before F0 and after each phase, recorded with consent.

- **The gasp, timed.** The first moment of wonder must come within two seconds of arrival, on a mid-range phone, on a slow connection.
- **Budgets.**
  - The still painted within a second, and the picture opening within two.
  - 60 fps on an iPhone 13-class phone and a 2020 laptop.
  - Core Web Vitals at the 75th percentile: LCP within 2.5 s, INP within 200 ms, CLS within 0.1. Safari 26.2 now reports LCP and INP too, so field data covers Apple's devices.
- **Outside eyes.**
  - An independent design critique before F1 ships.
  - Submissions to Awwwards and the FWA after F2, as an outside bar rather than a goal in itself.

## 10. Risks

- **Spectacle that turns into a demo.** The test is §6: every moment must be the art's own physics, ending on the work. Anything that would survive with the art removed is cut.
- **GPUs vary.** The tiers and the fallback to the existing Overture and films keep every visitor on a good path. Old phones see less, never a broken page.
- **The landing must meet the still exactly.** The frame is re-derived to a trillionth (Phase D), but the light model is a proxy. F0 exists to prove the hand-off is seamless before anything depends on it.
- **HDR needs the artist.** Until HDR renditions exist, true light is limited to the live render, where it is honest: that light is computed here.
- **Battery and heat.** The entry runs about ten seconds; the sculpture runs only while it is touched or watched, and then rests.
- **The Largest Contentful Paint.** A canvas is not a candidate, so an entry that opened on black would score the still's late paint, about ten seconds in. Opening on the still keeps it within a second (§4).
- **Access.** The celebrated showpieces score lowest on accessibility (§3). The venue's rules stay in force:
  - a visible Skip and a pause;
  - reduced-motion parity;
  - keyboard and screen-reader paths;
  - the 12 px floor.

## 11. Decisions for the owner

1. **The direction.** Adopt First Light as the venue's next programme, with F0 first, as the proof.
2. **The entry.** First Light replaces the Overture's version 2 as the one timed event, once per visit.
3. **HDR.** Ask the artist for HDR renditions of the Light works from the 16-bit masters, as new derivatives beside the tokens.
4. **Sound.** Commission a composer, or record the artist, for an opt-in threshold; or keep the venue silent.
5. **The work page in two acts**: the show, then the record.
6. **The auction page.** Show the coming works, labelled as not offered, before a contract exists (still open from Phase D §6).

## 12. F0, as built

_7 November 2026, on the branch `claude/first-light-plan`._

- **Where.**
  - At `/first-light/31`, in every locale, and kept out of search engines.
  - It serves the works whose Light still, verified window and bound frame the venue holds itself: № 023, 031 and 035.
- **What it does.**
  1. **It opens on the still.** The `<img>` is the page's Largest Contentful Paint.
  2. **It samples the orbit.** A worker samples the window in the generator's own view space, before the generator drew it flat (`src/lib/first-light/samples.ts`).
  3. **It draws the light.** A WebGL 2 light engine (`src/components/first-light-engine.ts`) draws the trails as ribbons in linear light, with a glow. Each point takes its hue from the still, where that point's light came to rest.
  4. **It moves the camera** (`src/lib/first-light/camera.ts`):
     - it opens the picture with a reverse dolly zoom;
     - it finds the event's own middle, which the generator's drift had moved;
     - it travels while time runs back, then while the dance plays on the Light film's clock (`src/lib/first-light/timeline.ts`);
     - it lands on the generator's flat view, where the still fades back in.
  5. **It gives the still back** at Skip, any key or touch, or a hidden tab.
  6. **It waits to be asked** where motion is unwelcome: a reduced-motion preference or the session's paused choice gets _Watch it form_.
- **What was checked.**
  - Every sample lands on the plate's own pixels, within a hundredth of a pixel, for five works: positions, phase space, a cross braid, a hodograph and six-fold symmetry (`samples.test.ts`).
  - The flat view maps the plate exactly onto the contained still, on a desk and on a phone. The dolly zoom holds the centre plane still (`camera.test.ts`).
  - It runs at 120 frames a second on the Mac it was built on, at 1440 × 900: the median frame took 8.3 ms and the worst 9.4 ms, over 1,118 frames.
  - The browser spec passes in Chromium and WebKit, on desks, phones and with reduced motion: 16 passed, 2 skipped by design.
  - The unit suite passes: 1,564 tests.
- **What it looks like.** Contact sheets: [on a desk](screenshots/first-light-f0-desk.jpg) and [on a phone](screenshots/first-light-f0-phone.jpg).
- **Not yet.**
  - **HDR.** The engine draws in SDR; WebGPU's extended range is the next step (§5B).
  - **Colour.** The live light takes the still's hue, normalised. In depth, the crossings read greener than the still's blues and reds.
  - **The closest approach.** It flares, but time does not yet slow around it.
  - **Testing.** Firefox runs on CI only, and nothing has been tried on a real iPhone.
  - **The home** still opens with the Overture. First Light replaces it only on the owner's word (§11, decision 2).

## Sources

Gathered on 7 November 2026 by a research pass. Awwwards' own pages refuse automated reading, so its jury quotes come from search-indexed copies. F0 re-checks every platform claim on real devices.

- **Awards and juries.**
  - [Awwwards Sites of the Year](https://www.awwwards.com/websites/sites_of_the_year/).
  - [How Awwwards scores](https://www.awwwards.com/about-evaluation/).
  - Lusion v3 [scores](https://www.awwwards.com/sites/lusion-v3).
  - Lando Norris [scores](https://www.awwwards.com/sites/lando-norris).
  - [Readymag's websites of 2025](https://blog.readymag.com/websites-of-the-year-2025/).
  - [Webby judging criteria](https://www.webbyawards.com/judging-criteria/).
- **Case studies.**
  - [Igloo Inc](https://awwwards.com/igloo-inc-case-study.html).
  - [Bruno Simon's portfolio](https://www.awwwards.com/brunos-portfolio-case-study.html).
  - [The National Gallery Imaginarium](https://www.nationalgallery.org.uk/visiting/virtual-gallery/national-gallery-imaginarium), its [Webby](https://winners.webbyawards.com/2026/websites-and-mobile-sites/general-desktop-mobile-sites/cultural-institutions/380455/national-gallery-imaginarium) and [Q42's build notes](https://q42.nl/en/work/imaginarium-national-gallery).
- **Generative art online.**
  - [Art Blocks' on-chain generator](https://docs.artblocks.io/protocol/on-chain-generator/).
  - [QQL](https://www.tylerxhobbs.com/words/qql).
  - [Fidenza](https://tylerxhobbs.com/fidenza).
- **Explaining.** [The Pudding Cup](https://pudding.cool/pudding-cup/).
- **People.**
  - [Scrolljacking](https://www.nngroup.com/articles/scrolljacking-101/).
  - [How long visitors stay](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/).
  - [The peak-end rule](https://www.nngroup.com/articles/peak-end-rule/).
  - [The 50 ms first impression](https://www.nature.com/news/2006/060109/full/news060109-13.html).
- **Platform.**
  - [WebGPU implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status).
  - [Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) and [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/).
  - [Firefox 147](https://www.firefox.com/firefox/147.0/releasenotes/) and [Firefox 159](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/159).
  - [WebGPU HDR canvas in Chrome 129](https://developer.chrome.com/blog/new-in-webgpu-129).
  - [`dynamic-range-limit`](https://caniuse.com/mdn-css_properties_dynamic-range-limit).
  - [Gain maps in Firefox, still open](https://bugzilla.mozilla.org/show_bug.cgi?id=1832622).
  - [Cross-document view transitions](https://caniuse.com/cross-document-view-transitions).
  - [Core Web Vitals](https://web.dev/articles/vitals).
  - [Autoplay and audio](https://developer.chrome.com/blog/autoplay).
  - [WCAG 2.2.2, pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
