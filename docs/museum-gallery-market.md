# The gallery, the museum and the market

Ideas and evidence for the next phase, weighed against the [north star](north-star.md). Written
9 November 2026 from three research briefs (exemplar sites and browser capabilities; the science;
the psychology of buying and sharing art) and the venue's own record. Every idea keeps the
north star's rules: the art is never altered, motion comes from the art, Light and Ink are equal,
and honesty sells.

## Where we stand

The venue is not finished, and it is not yet the best website on the internet. The first
independent review (8 November 2026) scored it 7.6 for design, 6.9 for usability, 8.7 for
creativity, 8.8 for content, 7.3 for mobile and 8.3 for its code. It found the concepts and the
type at the level of a Site of the Year, and the signature motions unfinished. Four of its fifteen
gaps are fixed: the vanishing hero, by the run back (PR #35, merged 9 November), and the blank
Index, the lost place across a change of language and the wrong 404 (PR #36, open).

Eight pull requests wait to be merged, among them the orbit in the hand, the chaos twin, First Light
on shared links and the material Turn. Nothing has yet been checked on real devices, with a real
screen reader, against field performance data, or with people who did not build it.

## The story only we can tell

What we say must be true, specific and checkable. Sophisticated collectors know that long-form
generative platforms (Art Blocks, fxhash) also make each work at its mint from the mint's own
hash: "generated just in time" alone will not set us apart. What is ours alone is narrower and
stronger:

| Claim                                     | Why it is true                                                                                                                                  | How a visitor can see it                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Each work is a physical event.**        | One orbit of three bodies under gravity, chosen from its seed among 100,000 candidates and integrated a million steps.                          | Verify an orbit: the browser derives it again and checks the record line by line.   |
| **Born when a cycle of the game closes.** | Each successful round ends by minting new works on Arbitrum; their seeds are fixed in that one transaction. Until then the works exist nowhere. | A cycle's chapter, dated by its transaction; a live birth when the next one closes. |
| **Irreproducible by nature.**             | The orbits are chaotic: a twin one part in a trillion apart parts after about forty doublings.                                                  | One part in a trillion, on every work.                                              |
| **Two kinds of physics, one work.**       | Light is a long exposure of the orbit; Ink drives the same bodies through a two-dimensional Navier–Stokes fluid that carries sumi over kozo.    | The Turn, in the order each work was made.                                          |
| **A collection that grows by chapters.**  | Every cycle adds works; each chapter stays as it was hung.                                                                                      | The cycles, All the light, the Orrery.                                              |

Lines the venue could carry, each one true:

- "Every work here is a real orbit of three bodies, computed again in your browser as you watch."
- "These works did not exist until the cycle closed. Nobody chose them; the seed did."
- "Start it one part in a trillion differently, and the future is another work."
- "Ink is the same orbit, stirring a fluid governed by the Navier–Stokes equations."

## The gallery: the first ten seconds and after

The first visit already opens on First Light. These ideas raise it, and the visits after it.
Each is the work's own physics.

| Idea                        | What the visitor sees                                                                                                                                                                                                           | Built on                                                                               | Why it works                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A birth, performed live** | When a cycle's mint lands, every open browser derives the new orbits from their seeds and performs their First Light together; before it, the game's own clock counts down. "Tell me when the next works are born" by Web Push. | Real chain events; Declarative Web Push (iOS 18.4 and later)                           | Bright Moments made being there the scarce thing; Art Blocks joins the reveal to the proof of origin. Ours is a real event, so the urgency is real. |
| **Seed dust**               | Tens of thousands of weightless grains released in the work's own gravitational field, drawn by the three bodies into the shapes of the work.                                                                                   | WebGPU compute; WebGL 2 fallback                                                       | A field made visible, rendered live rather than played back: Igloo Inc, 2024's Site of the Year, won with real-time shaders in place of video.      |
| **Hear the orbit**          | Each body a voice placed in space and pitched by its speed; close approaches rise into a chirp. The one-in-a-trillion twin starts in unison, and its beating reveals the divergence before the eye can see it.                  | AudioWorklet, HRTF panning; owner's sound commission                                   | Sound synced to motion was a winning detail of Igloo Inc; sonification teaches chaos.                                                               |
| **No cuts between rooms**   | A work's plate flies from the collection into its page, and the ground changes with the work, never half the screen at once (the review's gap 4).                                                                               | Cross-document View Transitions: Chromium 126, Safari 18.2; Firefox same-document only | Continuity is what designers notice first.                                                                                                          |
| **The ink draws the night** | The Turn between Ink and Light masked by the Ink still's own luminance, and a look-through lens onto the other expression.                                                                                                      | The arrival crossing (PR #32)                                                          | The review's signature ideas: one gesture, drawn one way everywhere.                                                                                |
| **Hold the orbit**          | The orbit as a 3D tube to turn in the hand on Apple devices, and on visionOS an orbit that fills the room.                                                                                                                      | `<model>` (visionOS 26, iOS, iPadOS and macOS 27); WebXR on visionOS                   | Ownership simulation: what you can hold, you start to want.                                                                                         |
| **True light**              | Light stills in high dynamic range where the screen can show it; the 16-bit masters behind a lossless loupe.                                                                                                                    | HDR images (Safari 26); JPEG XL (Safari, Chrome 155, Firefox 158)                      | The owner's open decision on HDR renditions.                                                                                                        |
| **Wall mode**               | A full-screen Orrery that keeps a screen on and performs each new work as it is born.                                                                                                                                           | Screen Wake Lock (Baseline)                                                            | Feral File's FF1 shows collectors want art computers at home.                                                                                       |

## The museum: teaching with the work itself

The science is the second place the venue must be, and the strongest way to astonish a visitor
who stays. The best science writing on the web teaches by putting live simulations inside the
text (Bartosz Ciechanowski's articles draw thousands of Hacker News points each), by journeys
through scale (neal.fun, Josh Worth's "If the Moon Were Only 1 Pixel"), and by asking readers to
predict before they see. Drawing a prediction improves recall (Distill's survey of interactive
articles). Our advantage is that every simulation can be the work itself.

### "Three is too many": an explorable essay

Chapters, each a live figure built on a work in the collection:

1. **Two bodies close their orbit.** Kepler's ellipse, solvable since Newton: drag a body, the
   orbit still closes.
2. **The third body.** Newton's Moon, pulled by Earth and Sun. Euler's collinear points and
   Lagrange's equilateral ones (the "Lagrange point" where the Webb telescope works was found
   first by Euler). Predict where a close encounter will throw the bodies, then watch.
3. **A king's prize.** Poincaré won King Oscar II's prize in 1889 with a flawed memoir. Paying for
   the scrapped printing cost him more than the prize, and fixing the error revealed chaos: the
   homoclinic tangle he declined to draw.
4. **Why no formula.** Eighteen dimensions and ten conserved quantities, and no further integrals
   of the kinds that would solve it: Bruns (1887) ruled out algebraic ones, Poincaré analytic
   ones. It does have an exact solution: Sundman's series (1912), which by Beloriszky's 1930
   estimate needs about 10^8,000,000 terms for astronomical accuracy in one case. "No solution" is
   a myth; "no formula you can use" is the truth.
5. **Chaos you can touch.** The twin, one part in a trillion apart, parting after about forty
   doublings. To see twice as far ahead, you must know the start to twice as many digits. Each
   work's own Lyapunov time, measured from its own twin.
6. **How we compute it anyway.** The fourth-order Yoshida integrator, whose middle step runs time
   backward, holding the energy steady where a naive method lets it drift away. "Your browser just
   took a million steps." _Corrected 10 November 2026:_ it holds the energy only while no two
   bodies pass closer than its fixed step can follow. In six works they do inside the recorded
   window, and the chapter must show each work's own energy line, flat or stepped
   ([after-the-frame.md](after-the-frame.md) §1.3).
7. **The zoo.** The figure-eight (Moore 1993; Chenciner and Montgomery 2000), the thousands of
   periodic families found since 2013, and where our works sit on the map of beginnings.

Each chapter keeps the venue's rules: derived figures say "Analysis, not the work", reduced motion
gets scrubbable figures, and every sentence carries its source. The fact-checked science brief
behind this outline is summarised under [Sources](#sources).

### A fluid bench for Ink

A live two-dimensional Navier–Stokes solver. Drag a body through still water, change the viscosity,
and watch vortices shed and merge. In a flat fluid small whirls feed larger ones (Kraichnan 1967),
which is why Ink's swirls merge rather than shatter. What it teaches:

- the equations in words: mass times acceleration equals pressure, plus friction, plus force;
  and the fluid cannot be compressed;
- why the two-dimensional equations never blow up (Ladyzhenskaya 1959), while the
  three-dimensional question is the Clay Institute's million-dollar problem;
- how the paper stays bare until the current brings the first ink;
- how ink marbling (suminagashi) is a flat flow too, though driven by surface tension, not by
  stirring.

### Smaller museum moments

- **The 99,999 that weren't.** Every candidate orbit the seed offered, raced for a few thousand
  steps until the chosen one locks in: how the generator chose this work.
- **A million steps, to scale.** One long scroll at a hundred steps per pixel, marking the film's
  checkpoints, the syzygies and the closest approach.
- **Collector's notes.** For each trait (Structure, Fate, Chaos, Syzygies, Mass Balance), how often
  it occurs and the physics that makes it, as Tyler Hobbs did for Fidenza.
- **Labels inside the event.** The wall label pinned to the 3D point of closest approach, readable
  by screen readers (HTML-in-Canvas, Chromium only; overlays elsewhere).

## The market: turning wonder into collecting and sharing

The research on why people value, buy and share art points one way: the most persuasive
things this venue can do are also the most honest. Scarcity persuades when people already expect
it and it is true, and backfires once it reads as a sales tactic. The bias against computer-made
art reverses when viewers watch the work being made. An "AI" label costs perceived creativity and
awe. Awe is among the emotions that make people share.

### What the evidence says

- **True scarcity works; claimed scarcity backfires.** Scarcity raises value and purchase intent
  (Lynn 1991; Barton et al. 2022, 131 studies). "Limited quantity" beats "limited time", and both
  fail once buyers sense a tactic (Aggarwal et al. 2011; Mukherjee and Lee 2016).
- **Originals carry the act of making.** People pay for originals over perfect copies because of
  the creative act behind them (Newman and Bloom 2012). Early serial numbers feel closer to the
  origin (Smith et al. 2016), and provenance moves price more than medium or size (Campos and
  Barbosa 2009).
- **Seeing the making removes the machine penalty.** Computer-made art is judged lower, until
  viewers watch it being made (Chamberlain et al. 2018). Labelled "AI", art loses perceived
  creativity and awe (Millet et al. 2023). Works believed to take more effort are rated higher
  (Kruger et al. 2004).
- **Stories and settings change what people see.** Absorption in a story shifts belief (Green and
  Brock 2000). The same images were rated higher labelled "gallery" than "computer generated"
  (Kirk et al. 2009). A museum setting beats a screen for liking and memory (Brieber et al. 2015).
- **Awe travels.** Awe comes from vastness that makes a viewer revise their understanding (Keltner
  and Haidt 2003). High-arousal emotions such as awe make content shared; sadness does not (Berger
  and Milkman 2012). (The claim that awe changes spending is not established: a follow-up found no
  effect on measured time perception.)
- **Holding comes before wanting.** People value what they help make, if they finish it (Norton et
  al. 2012). Digital goods suffer because ownership feels thin, and control builds it back (Atasoy
  and Morewedge 2018). AR previews went with more sales of pricier, niche items (Tan et al. 2022).
- **Popularity snowballs, so it must be real.** Visible popularity makes success unequal and
  unpredictable (Salganik et al. 2006), and a single fake early vote inflates later ratings
  (Muchnik et al. 2013). Bidders crowd into auctions with more bids (Simonsohn and Ariely 2008).
- **Auctions have known shapes.** Rivalry, time pressure and audiences fuel "auction fever" (Ku et
  al. 2005). Low openings draw bidders and raise final prices (Ku et al. 2006), as our 0.00001 ETH
  opening does. An end that extends after late bids prevents last-second sniping (Roth and
  Ockenfels 2002), as our ten-minute extension already does.
- **What NFT buyers pay for.** Sale history predicts price best, then visual features (Nadini et
  al. 2021). Rarer items sell for more (Mekacher et al. 2022). Successful artists are bought again
  and again by a small group of collectors (Vasan et al. 2022).
- **What online art buyers ask for.** Price transparency (91%), provenance (90% of new buyers) and
  condition reports. The top barrier is that a work "looks different in reality" (Hiscox 2023).
  Half of wealthy collectors have bought digital art (Art Basel and UBS 2025).

### What we will do

| Tactic                                           | How, here                                                                                                                                                             | Evidence                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **State scarcity as a fact.**                    | Each work: "one of N works imprinted at the close of cycle X; seed fixed in transaction …; never regenerated." No "only a few left".                                  | Scarcity                 |
| **Keep the clock honest.**                       | No timer before the first funded bid; after it, the exact end and the ten-minute extension stated before bidding opens.                                               | Auctions                 |
| **Make verification the certificate.**           | The in-browser re-derivation presented as the work's provenance and condition report: seed, mint, owners, a bit-for-bit match.                                        | Originals; online buyers |
| **Show the making, and credit it.**              | First Light, the films, the run back, the orbit computed as you watch; the people who designed the system named beside it.                                            | Machine penalty          |
| **Name the method truly.**                       | "A deterministic physics simulation, rendered by an authored system." Never "AI"; never overstate hand work.                                                          | Machine penalty          |
| **Tell each work's true story.**                 | The bodies as characters: their encounters, the closest approach, a fate of ejection or eternal dance, the cycle that minted them. Only what the record shows.        | Stories                  |
| **Hang it like a gallery.**                      | Exhibitions, wall text, full-bleed viewing, a stable layout.                                                                                                          | Settings                 |
| **Lead with awe, then make sharing effortless.** | One-tap share cards with the story and a "verify it yourself" link; a film of a visitor's own turn of the orbit, made in the browser. Sell the event, never an asset. | Awe                      |
| **Build a small canon.**                         | The work of the day, and a few strong works shown often, never so often they wear.                                                                                    | Exposure                 |
| **Let people hold a work before they bid.**      | Turn it, scrub it, see it at true size on their wall; owners get display controls and their name on the certificate.                                                  | Holding                  |
| **Show real demand, with receipts.**             | On-chain bid history and the number of distinct bidders; new works ordered neutrally, so early luck does not snowball.                                                | Popularity               |
| **Set openings and anchors honestly.**           | Past sale prices as plain facts, never trends; every fee shown before a bid.                                                                                          | Auctions; online buyers  |
| **Cultivate collectors, not crowds.**            | Opt-in alerts for each birth and collector pages; messages sent rarely.                                                                                               | NFT buyers               |

### What we will never do

- Show any countdown but the true end, reset a deadline, or say "ending soon" outside the real final
  window (FTC 2022; EU Unfair Commercial Practices Directive, Annex I).
- Make false stock, demand or activity claims, such as "only 2 left" while new cycles keep minting,
  or "12 watching" unless measured (FTC 2022).
- Place shill or house bids, wash trade, or seed engagement; any bid from someone connected to the
  venue is disclosed (FTC; EU).
- Use fake, bought, suppressed or undisclosed reviews or endorsements, or bought followers (FTC
  Consumer Reviews and Testimonials Rule, 2024; EU).
- Add fees late in the checkout (FTC 2022).
- Send loss-framed alerts ("you are about to lose it") or repeated unwanted messages (EU).
- Publish rarity scores or price trends that imply returns. Collector's notes give how often a trait
  occurs and the physics behind it, never a price.
- Inflate claims of human labour or process (FTC).

## Roadmap

| When                  | What                                                                                                                            | Serves                  | Waits on                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| **Now**               | Merge the open pull requests; fix the review's remaining gaps; check real devices and screen readers.                           | All three               | The owner's merges                                         |
| **Next**              | A birth, performed live; no cuts between rooms; "Three is too many", chapters 1 to 5; collector's notes; consented measurement. | Gallery, museum, market | Chain events for the birth; the owner's yes on measurement |
| **Then**              | Seed dust; the fluid bench; the rest of the essay; hold the orbit; wall mode.                                                   | Gallery, museum         | WebGPU budgets on phones                                   |
| **Owner's decisions** | The sound commission; HDR renditions; the statement's author and curator; any physical editions.                                | Gallery, market         | The owner                                                  |

## How we will know

- **An independent review after each phase**, scoring every category, against the gaps it found
  before.
- **Real devices and real readers**: iPhone, iPad and Android; VoiceOver and NVDA; field Core Web
  Vitals.
- **What visitors do**, with consent: first visits that reach a work page, read a chapter, share a
  work, ask to be told of the next birth, and bid. A change that raises these by pressure rather
  than by wonder is reverted.

## Sources

Each brief checked its sources on 8 November 2026; the briefs mark what could not be verified.

**Exemplars and browser capabilities**

- [Art Blocks generator](https://docs.artblocks.io/creator-docs/art-blocks-101/generator) ·
  [fx(params)](https://fxhash.notion.site/fx-params-3b65a4b800e34cd58c5cb31ac812a9ec) ·
  [Feral File FF1](https://feralfile.substack.com/p/ff1-preorders-are-live) ·
  [Bright Moments](https://www.brightmoments.io/quarterly/bright-moments-abridged) ·
  [QQL](https://www.tylerxhobbs.com/words/qql) · [Fidenza](https://tylerxhobbs.com/fidenza) ·
  [Ringers #879 at Sotheby's](https://www.sothebys.com/en/articles/dmitri-cherniak-ringers-879-goose-lays-6-2m-golden-egg-at-generative-art-auction)
- [Ciechanowski, Moon](https://ciechanow.ski/moon/) · [neal.fun](https://neal.fun/) ·
  [If the Moon Were Only 1 Pixel](https://joshworth.com/dev/pixelspace/pixelspace_solarsystem.html) ·
  [NASA's Eyes](https://science.nasa.gov/eyes/) ·
  [Communicating with interactive articles (Distill)](https://distill.pub/2020/communicating-with-interactive-articles/)
- [Awwwards Sites of the Year](https://www.awwwards.com/websites/sites_of_the_year/) ·
  [Igloo Inc case study](https://www.awwwards.com/igloo-inc-case-study.html) ·
  [Awwwards evaluation](https://www.awwwards.com/about-evaluation)
- [WebGPU](https://web.dev/blog/webgpu-supported-major-browsers) ·
  [cross-document View Transitions](https://web-platform-dx.github.io/web-features-explorer/features/cross-document-view-transitions/) ·
  [Safari 27: `<model>`, WebXR, linear canvases](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) ·
  [Web Push on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) ·
  [HTML-in-Canvas](https://developer.chrome.com/blog/html-in-canvas) ·
  [JPEG XL](https://web-platform-dx.github.io/web-features-explorer/features/jpegxl/)

**The science**

- Poincaré and King Oscar's prize: [Institut Mittag-Leffler](https://www.mittag-leffler.se/about-us/history/prize-competition/);
  [Barrow-Green 1994](https://doi.org/10.1007/BF00374436). Euler's collinear solutions:
  [E327](https://scholarlycommons.pacific.edu/euler-works/327/). Bruns:
  [Acta Math. 11](https://doi.org/10.1007/BF02612319). Sundman:
  [Acta Math. 36](https://doi.org/10.1007/BF02422379); the term count:
  [Barrow-Green 2010](https://doi.org/10.1016/j.hm.2009.12.004).
- The figure-eight: [Moore 1993](https://doi.org/10.1103/PhysRevLett.70.3675),
  [Chenciner and Montgomery 2000](https://doi.org/10.2307/2661357). Periodic families:
  [Šuvakov and Dmitrašinović 2013](https://doi.org/10.1103/PhysRevLett.110.114301),
  [Li and Liao 2017](https://doi.org/10.1007/s11433-017-9078-5),
  [Hristov et al. 2024](https://doi.org/10.1007/s10569-023-10177-w).
- Chaos and prediction: [Laskar](https://arxiv.org/abs/1209.5996). Integrators:
  [Yoshida 1990](<https://doi.org/10.1016/0375-9601(90)90092-3>); symplectic methods:
  [Hairer, Lubich and Wanner](https://doi.org/10.1007/3-540-30666-8).
- Navier–Stokes: [the Clay problem](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf);
  2D regularity, [Ladyzhenskaya 1959](https://doi.org/10.1002/cpa.3160120303); 2D turbulence,
  [Kraichnan 1967](https://doi.org/10.1063/1.1762301); [Stam's Stable Fluids](https://doi.org/10.1145/311535.311548);
  [Reynolds 1883](https://doi.org/10.1098/rstl.1883.0029).
- Status of the Clay problem, unconfirmed: a September 2026 claim of a blow-up with a specially
  built force ([Quanta](https://www.quantamagazine.org/ai-has-solved-one-of-maths-1-million-millennium-prize-problems-20260908/);
  [Scientific American](https://www.scientificamerican.com/article/did-openai-solve-the-wrong-navier-stokes-problem/)).
  Keep it out of the venue's copy until it is accepted.

**Buying and sharing**

- Scarcity: [Lynn 1991](https://doi.org/10.1002/mar.4220080105),
  [Barton et al. 2022](https://doi.org/10.1016/j.jretai.2022.06.003),
  [Aggarwal et al. 2011](https://doi.org/10.2753/JOA0091-3367400302),
  [Mukherjee and Lee 2016](https://doi.org/10.1080/00913367.2015.1130666).
- Originals and provenance: [Newman and Bloom 2012](https://doi.org/10.1037/a0026035),
  [Smith et al. 2016](https://doi.org/10.1093/jcr/ucv054),
  [Campos and Barbosa 2009](https://doi.org/10.1093/oep/gpn020).
- Machine-made art: [Chamberlain et al. 2018](https://doi.org/10.1037/aca0000136),
  [Bellaiche et al. 2023](https://doi.org/10.1186/s41235-023-00499-6),
  [Millet et al. 2023](https://doi.org/10.1016/j.chb.2023.107707),
  [Kirk et al. 2009](https://doi.org/10.1016/j.neuroimage.2008.10.009),
  [Brieber et al. 2015](https://doi.org/10.1016/j.actpsy.2014.11.004).
- Story, awe and sharing: [Green and Brock 2000](https://doi.org/10.1037/0022-3514.79.5.701),
  [Keltner and Haidt 2003](https://doi.org/10.1080/02699930302297),
  [Berger and Milkman 2012](https://doi.org/10.1509/jmr.10.0353),
  [Berger 2014](https://doi.org/10.1016/j.jcps.2014.05.002).
- Exposure and ownership: [Reber et al. 2004](https://doi.org/10.1207/s15327957pspr0804_3),
  [Cutting 2003](https://doi.org/10.3758/BF03196493),
  [Norton et al. 2012](https://doi.org/10.1016/j.jcps.2011.08.002),
  [Atasoy and Morewedge 2018](https://doi.org/10.1093/jcr/ucx102),
  [Tan et al. 2022](https://doi.org/10.1177/0022242921995449).
- Popularity and auctions: [Salganik et al. 2006](https://doi.org/10.1126/science.1121066),
  [Muchnik et al. 2013](https://doi.org/10.1126/science.1240466),
  [Simonsohn and Ariely 2008](https://doi.org/10.1287/mnsc.1080.0881),
  [Ku et al. 2005](https://doi.org/10.1016/j.obhdp.2004.10.001),
  [Ku et al. 2006](https://doi.org/10.1037/0022-3514.90.6.975),
  [Roth and Ockenfels 2002](https://doi.org/10.1257/00028280260344632).
- NFT markets: [Nadini et al. 2021](https://doi.org/10.1038/s41598-021-00053-8),
  [Mekacher et al. 2022](https://doi.org/10.1038/s41598-022-17922-5),
  [Vasan et al. 2022](https://doi.org/10.1038/s41598-022-05146-6).
- Online buyers: Hiscox Online Art Trade Report 2023; [Art Basel and UBS](https://theartmarket.artbasel.com).
- The limits: [FTC, Bringing Dark Patterns to Light (2022)](https://www.ftc.gov/reports/bringing-dark-patterns-light);
  FTC Consumer Reviews and Testimonials Rule (16 CFR Part 465, 2024); EU Unfair Commercial
  Practices Directive, Annex I (2005/29/EC as amended by 2019/2161); Digital Services Act, Art. 25.
