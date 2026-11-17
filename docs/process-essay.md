# The Process essay: the record

*Written 16 November 2026 (UTC), as built, and brought up to date on 17 November 2026, when the
essay became the venue's home (§10). Stage 1 (the English essay, read by the owner) and stage 2
(the page, in eight languages) are done; of stage 3 the first exhibit is built (§8.1) and three
are a plan.*

The review of 14 November 2026 found the venue's museum missing: `/process` held about 130 words,
no history, no reason why three bodies cannot be solved, and the ink's fluid in one clause
(content juror, finding content-1; creativity-12). This is the essay that answers it: about
4,900 words in eight chapters when it was written, with eight figures, the venue's terms defined,
and every statement about the world outside the venue set against a source that was opened and
read.

On 17 November 2026 the owner made it the home ("make the process page the main page of the
website"), asked for the orbit that can be turned to stand on it, plainly turnable, and asked
for everything to be explained "in a way that a museum would do it". It now stands beneath the
day's plate, in three parts in the order a work is made, with the orbit in depth as its first
exhibit and three new chapters: about 6,400 words in eleven chapters (§10).

---

## 1. What a reader gets

The home (`/`, and each language's own), in order:

| Part | Address | Ground | What it is |
| --- | --- | --- | --- |
| The day's plate | | its expression's | The day's work in the day's expression, one Turn from its twin; on a first visit First Light performs over it (the home's own, as before) |
| Cover | | night | What the place is and how large, the title, the standfirst, the contents in three numbered parts |
| I Orbit | `#orbit` | night | The orbit in depth: the day's work before it is a picture, turned by a hand (§8.1) |
| 01 Two | `#two` | night | Newton's two bodies; the day's work with one body taken away |
| 02 Three | `#three` | night | Euler's line and Lagrange's triangle; why they are rare |
| 03 No formula | `#no-formula` | night | The ten conserved quantities, King Oscar's prize, Bruns and Poincaré, Sundman's series |
| 04 A million steps | `#steps` | night | The units, the step, the warm-up, the window, the horizon, the three pushes, what the arithmetic keeps and where it fails |
| 05 A trillionth | `#trillionth` | night | The twin, the doubling time, the price of foresight |
| 06 The choice | `#choice` | night | The gate, the three measures, the Borda count; the live figure of the choice |
| II Light | `#light` | night | The day's work in Light, its film pinned for a screen of scroll |
| 07 The view | `#view` | night | Where the generator stands: four orientations drawn from the seed and scored, depth kept as brightness, the camera carried along its own ellipse, the frame, the works drawn in another space |
| 08 A stroke | `#stroke` | night | Light laid as a spectrum: sixty-four bands, the 1931 observer, the structure, speed as width and brightness, a detail of the Light still, the exposure metered once, the master |
| The spectrum | `#spectrum` | night | The spectral sweep, and what a viewer of it is seeing |
| III Ink | `#ink` | paper | The same work in Ink |
| 09 A current | `#current` | paper | What the water does: carries, rubs, cannot be squeezed; the Reynolds number; the bodies; the fading |
| 10 The plait | `#plait` | paper | Why three stirrers mix; the work's own plait; what the venue does not claim |
| 11 The paper | `#paper` | paper | The sheet computed from the seed, soot computed as light in thirty-six bands, a detail of the Ink still, Kubelka and Munk, what is the same to the last bit |
| Not known | `#unknown` | paper | What nobody can say of a work's three bodies |
| The cycle | `#cycle` | paper | The close: how a work comes to exist, the day's work's own date and cycle, and the way into the work |
| The cycle's works | | paper | The works of the day's cycle, two to a leaf (the home's own, as before) |
| Terms | `#terms` | paper | The venue's sixteen terms |
| Sources | `#sources` | paper | Forty-four sources, numbered as the text cites them |

The three parts are numbered I, II and III, in the margin of each part's plate and in the
contents, and each part's head is a statement at the size of a chapter's: *First, an orbit.
Next, an exposure. Then, a current.* The terms and the sources are back matter and come after
the close, as in a book, so a reader who reads to the end of the last chapter meets the close
and the way into the work, not a bibliography.

Night holds gravity and its light, and paper holds the water: one hard seam inside the essay. The
plate above it stands on its own expression's ground, so on an Ink day the page opens on paper
and turns to night at the cover. On a desk the plate stands 64 px short of the screen, so the
cover's first line (what the place is, and how large) rides at the foot of the first screen and
the page says that it goes on; a phone's plate is shorter than its screen already. The running
head takes the ground of whatever part lies under the middle of the screen (`room-seams.tsx`).

Beneath the plate the page's keys are the page's: once the plate has left the screen, Space
pages the essay and no letter acts on a plate out of sight (`artwork-viewer.tsx`).

The essay's words and figures are rendered on the server and are in the document a reader is
sent. Its one script of its own is the orbit in depth, which is fetched when its section nears
the screen; the home’s first load is 245.8 KiB as sent, against a budget of 255. Nothing below
the first screen is preloaded with it.

## 2. How it is built

| File | What it holds |
| --- | --- |
| `src/app/[locale]/page.tsx` | The home: the day's plate, then the essay's parts in the order above |
| `src/lib/i18n/*.ts` | The words: 173 keys beginning `essay`, in reading order, in all eight catalogs |
| `src/lib/essay/structure.ts` | The essay in reading order: which key stands where, the figures between, the terms |
| `src/lib/essay/facts.ts` | What every blank holds, for one work in one language |
| `src/lib/essay/rich.tsx` | The marks the words carry: `[^source]`, `**term**`, `*emphasis*`, `^{raised}` |
| `src/lib/essay/sources.ts`, `numerals.ts` | The sources, and the numeral each takes |
| `src/lib/essay/geometry.ts` | The figures' geometry, pure |
| `src/lib/art/essay-figures.json`, `.ts` | Every number the essay states of the venue (§3) |
| `src/app/[locale]/_essay/essay.tsx`, `essay-figures.tsx`, `essay.module.css` | The chapters, the figures and their type (a folder no address reaches) |
| `src/app/[locale]/_essay/chapter-plate.tsx`, `sweep-player.tsx`, `room-seams.tsx`, `process.module.css` | The Light and Ink plates, the sweep, the head's ground, and the page's own layout |
| `src/components/orbit-depth.tsx`, `src/lib/first-light/depth.ts` | The orbit in depth (§8.1) |
| `src/lib/art/orbit-frames.ts` (`workPicture`) | What the essay says of one work's picture: its four views' scores and the one kept, its camera's drift, its space, whether its strokes are repeated |
| `scripts/build-essay-figures.mjs`, `scripts/lib/essay-figures*.mjs` | The script that re-derives the numbers |

**The words are a template; the work fills it.** The essay takes its examples from the work of
the day, so every sentence about a work is true of whichever of the 72 it is. A sentence the work
decides has more than one form (`CASES` in `structure.ts`): each pair of bodies is bound or not;
the twin parts after the film, inside it, or never within the horizon; the work's plait forces
a stretch or forces none. `src/lib/essay/facts.test.ts` fills every sentence for all 72 works in
all eight languages and fails on a blank left open. Two examples are fixed and named: № 031,
whose energy holds, and № 004, whose energy is lost at a near miss.

**No word stands inside a figure.** A figure is an SVG drawn on the server; its caption, in the
reader's language, says everything it shows. The few marks a drawing carries (a body's number,
a scale's figures) are set by the page over it, so they stay at the 12 px floor at any width and
need no translation. The two charts stretch to the page's own shape with their lines kept
hair-thin. A work's own plait is drawn in lengths of twelve crossings that wrap like lines of
text, so a phone's width holds one. The three strands are told apart without colour: thick,
double, thin.

**A detail is the work itself.** Chapters 08 and 11 each show a detail of the day's work: the
densest of the three windows the venue measured on that still (`plate-records.json`, the loupe's
own), a third of the picture wide, cut from the published still by its frame and set across the
column. Nothing is resampled but by the browser; it is labelled *Detail* with the work's number
and its expression, and carries no label of an analysis. A phone is sent the middle rung of the
still for it, a desk the published still.

**Derived views are labelled.** The four figures drawn from a work's record (the two bodies
alone, the two energies, the twin's gap, the plait on the sheet) carry *Analysis, not the work*.
The other four are diagrams of ideas and carry no label.

**A source's numeral is the same in every language.** The sources are numbered in the order a
reader of the English first meets them; a translation that turns a sentence about may show two
numerals out of order, and never a different source.

## 3. The numbers, and how to derive them again

```bash
npm run art:essay -- --beyond --online
```

writes `src/lib/art/essay-figures.json` from the committed registries with the modules the pages
themselves run. Without flags it takes about a minute and carries the two slow parts over from
the file already there:

- `--beyond` follows each of the 36 works the record finds bound at its horizon on to step
  60,000,000, seven and a half times the record's own horizon (the slow part: minutes);
- `--online` reads all 72 Ink certificates from the publisher, each held to the hash in
  `ink-clocks.json`.

The page's loader refuses a file without either part. `npm run test:scripts` derives the
exemplar's twin, pairs and beginnings again, replays № 004's near miss, and holds the counts to
the registries.

What it holds: the clock every record shares; Yoshida's weights; the generator's ranges, found
again from № 031's seed; how the energy fared in each work, with the two lines the essay draws;
each work's twin (its gap every 100,000 steps, its doubling time, when it parted, its own fate);
each pair of each work's bodies taken alone (bound or not, its conic, where on it the pair
stands); each work's bodies on its Ink sheet (how often two overlap, the plait they make); each
work's fate looked for past the horizon; and what each Ink certificate says of its making.

### What the numbers found

These corrected what earlier notes and pages said, and the essay says only what they show.

- **Energy.** In 57 of the 72 works the computed energy stays within one part in a thousand from
  the window's first step to the record's dated step or its horizon. In 15 it does not: 9 of
  those are among the 36 "ejections", and in 3 (№ 022, 066, 068) the energy is lost inside the
  recorded window. A fixed step cannot follow a near miss; past such a pass the computation is
  not a motion gravity allows. The pictures are no less exact for it: each is the published
  computation, reproduced bit for bit.
- **The twin's fate.** In 20 of the 51 works where both computations keep their energy, the
  twin, begun a trillionth of a unit to one side, meets a different fate within the horizon; in
  14 of them one is still bound there and the other is not. So "which body, and when" is not a
  property of the orbit that survives the smallest change.
- **Past the horizon.** Of the 36 works bound at the horizon, 23 keep their energy to step
  60,000,000: in 18 a body is found no longer bound (the earliest at step 8,230,000) and in 5 the
  three are still bound. In the other 13 the computation loses its energy on the way and nothing
  can be said. The earlier note "29 of 36 end past the record" counted those 13 among the endings.
- **On the sheet.** In every one of the 72 works two bodies overlap on the Ink sheet at some
  moment (a sheet flattens a motion in depth), for 0.6 % to 64 % of the film. The theorem the
  tenth chapter tells is about stirrers the water must go round, so the essay gives no stretching
  figure for any work, and says so under "What the venue does not claim".
- **Chaos.** The published trait is the spread of each body's motion across frequencies within
  the window, not how fast a small difference grows. The essay says what the generator computes
  and sets the doubling time beside it as the other measure.

## 4. The rules the words keep

- Never "eternal" or "for ever" of an orbit. The published trait name appears once, in its own
  quotation marks, with what was actually shown: bound through 8,000,000 steps.
- "Bound", never "together", for bodies that have not the energy to part.
- A failure of the arithmetic is never told as gravity's doing (chapter 04, twice).
- "A working test, not a proof" of the record's test for a body that has got free, with what a
  proof asks for.
- Nothing is called an escape after the energy is lost.
- The words state facts and name no feelings. Never "AI".
- Modern sources are paraphrased; only Poincaré (1905, public domain) is quoted, in the essay's
  own translation.

Added on 17 November 2026, with the three chapters on how a picture is made, each from a fault
a reviewer found in a draft:

- Nothing is praised. Exact figures, dates, materials and method carry the weight (the owner:
  "in a cool way, not in a cheesy way").
- The view kept is the one "that scores highest; where two score alike, the first drawn", never
  "the best of four": in eight works two views score alike.
- A work's four scores are "derived again from the seed". The published record does not carry
  them; the venue's registry does (`orbit-frames.json`).
- The camera's arc is a share of the time one circuit of its ellipse would take, never a
  distance or a share of the ellipse's length.
- A stroke lays "a narrow band of light", never one wavelength; a colour exists only when a
  frame is made. 380 and 700 nanometres are the generator's range, never "what the eye sees".
- The dominant wavelength is "the wavelength nearest in hue to its most strongly coloured body",
  as the generator computes it, not the palette's.
- Only Ink's raw frames are said to be the same bit for bit, given the inputs the work's
  certificate records. Light is never said to be: its arithmetic is not held to that.
- The paper is "modelled on kozo paper". It is a model, and the files give no papermaker's
  source for its figures.
- Speed is one of the things that set a stroke's breadth, never the whole of it: "by speed
  alone" a stroke is broadest where the line moves slowest, and in most works a slow swell set
  by the seed widens and narrows it besides (the generator's width pulse).
- A view's score is cut to three places and never rounded up, and to more places where it
  takes them, so that no view is printed the equal of the one kept unless it scored exactly the
  same: the sentence before says that where two score alike the first drawn is kept
  (`viewScores` in `facts.ts`; № 029's first view scores 0.99979 beside two that score 1).
- The camera's share of a circuit is said to the whole per cent (1.076 is 108 %).
- "No work exists before its cycle closes", not that the collection never revises what it has
  published: the generator's own record says Inks of earlier looks were withdrawn or rendered
  again, and all 72 certificates now name `ember-v4`.

## 5. Typography

As `docs/typography.md` sets it: the chapter's statement at the chapter stop; the text at the
reading size on the 32 em measure with old-style figures; asides, captions, terms and sources at
the control size; marks, numerals and scales at the 12 px folio. A source's mark is the entry's
footnote mark: a lining figure at the floor, raised by hand, with a 24 px target. A raised power
never falls below the floor. A term being defined is italic in Latin and Cyrillic; Han, kana
and Hangul are never slanted here, so in those languages the translation sets the term off with
the language's own marks. A chapter's number and word stay in sight in its margin on a desk.

On a single column (a phone) two things give way so that nothing is cut at a side. A word in a
title is never broken, so the page reckons how wide each title's longest word is
(`src/lib/essay/titles.ts`) and sets the whole title as large as that word allows: at 320 px the
Ukrainian «розташуваннях.» sets its title at 34 px where the others stand at 44. And a Chinese
or Japanese opening mark, an em wide, is not hung outside its paragraph there (WebKit alone
hangs punctuation), because a 16 px gutter has no room for it.

## 6. The languages

The English was written first and read by the owner. Each of the seven other languages was
translated from the English with the venue's catalog as its binding vocabulary (Ukrainian by
two hands, one after the other; Traditional Chinese for Taiwan and for Hong Kong from the
reviewed Simplified text, in each region's own terms), and then read against the English by a
second reader who had not written it and who returned corrected text: 12 keys of the 127 in
Japanese, 28 in Simplified Chinese, 38 in Korean, 39 in Vietnamese, 32 in Ukrainian, 3 each in
the two Traditional versions. Their notes also sharpened five sentences of the English. The
terms were then brought to the catalog's one name for each (a fate, the recorded window, a
measurement, a published trait, gravity, a plate, the Borda count), as the catalogs' tests
hold every string. The briefs are kept with the session's notes
(`process-essay-15-nov/`). `src/lib/essay/structure.test.ts` holds every catalog to the English
key by key: the same blanks, the same sources on the same sentences, the same terms marked.
The catalogs' own tests (`src/lib/i18n/messages.test.ts`) hold the essay's keys, like every
other string, to the venue's vocabulary: one name for Ink in each language, one word for a
plate, 速度 for the film's pace in Chinese, and none of a language's words for eternity, in
mathematics either ("a sum that holds for all time" is said another way).

The words of 17 November 2026 (57 strings, about 1,700 words: 46 new essay keys, three
rewritten, and the eight words of the orbit in depth) went the same way. The English was first
read by six reviewers, each with one question (is every sentence true of the generator's
source; does every outside statement stand on a source that was opened; does it read as a
museum's label; as a maker's own account; can a visitor of fifteen follow it; can it be said
in the catalogs' vocabulary), and rewritten from what they found. Then one translator and one
second reader for each language, the two Traditional texts made from the reviewed Simplified
one: the second readers corrected 14 keys of the 57 in Ukrainian, 6 in Japanese, 8 in Korean,
15 in Simplified Chinese, 15 in Vietnamese, 7 for Taiwan and 11 for Hong Kong. Two things
were settled afterwards. Where a language writes a decimal comma (Ukrainian, Vietnamese), a
list of such figures is parted by semicolons («141,8; 37,4 і 96,2»). And the Vietnamese «ai»
("anyone") stands: only the English abbreviation is refused. The briefs, the drafts and the
readers' notes are kept with the session's notes.

A review of the whole change (six reviewers, one question each; §10) then corrected three
sentences, which one translator a language set again: `essayStroke5` (speed alone does not set a
stroke's breadth), `glossaryWavelength` on a work's page (the dominant wavelength is the most
strongly coloured body's, as chapter 08 says, not the palette's), and the home's own
description for a search engine, `homeDescription`, new. The two buttons that tip the orbit,
`depthTiltUp` and `depthTiltDown`, were worded in each catalog after its own *Turn left*.

### Catalog keys this added (all eight catalogs)

`essayStandfirst`, `essayOfWork`, `essayLightCopy`, `essayInkCopy`;
`essayTwoWord`, `essayTwoTitle`, `essayTwo1`–`3`, `essayTakeLead`, `essayTakeBound`,
`essayTakeOpen`, `essayTakeAll`, `essayTwoFigure`, `essayTwoFigureOpen`;
`essayThreeWord`, `essayThreeTitle`, `essayThree1`–`5`, `essayThreeFigure`;
`essayFormulaWord`, `essayFormulaTitle`, `essayFormula1`–`7`, `essayFormulaFigure`;
`essayStepsWord`, `essayStepsTitle`, `essayUnitsTitle`, `essayUnits`, `essaySteps1`–`7`,
`essayPushFigure`, `essayEnergyFigure`;
`essayTwinWord`, `essayTwinTitle`, `essayTwin1`–`6`, `essayTwinAfter`, `essayTwinInside`,
`essayTwinNever`, `essayTwinFigure`, `essayChaosTitle`, `essayChaos`;
`essayChoiceTitle`, `essayChoice1`–`4`;
`essayCurrentWord`, `essayCurrentTitle`, `essayCurrent1`–`7`, `essayCarriesLead`,
`essayCarries`, `essayRubsLead`, `essayRubs`, `essaySqueezeLead`, `essaySqueeze`, `essayInkMade`;
`essayPlaitWord`, `essayPlaitTitle`, `essayPlait1`–`5`, `essayPlaitFigure`, `essaySheetFigure`,
`essayClaimTitle`, `essayClaim`, `essayClaimForced`, `essayClaimFree`;
`essayUnknownWord`, `essayUnknownTitle`, `essayUnknown1`–`3`;
`essayTermsWord`, `essayTermsTitle`, `essayTermUnit`, `essayTermStep`, `essayTermWarmUp`,
`essayTermWindow`, `essayTermHorizon`, `essayTermBound`, `essayTermSyzygy`, `essayTermClosest`,
`essayTermBraid`, `essayTermBorda`, `essayTermTwin` (each with its `…Is`), `essayTermAnalysisIs`;
`essaySourcesWord`, `essaySourcesTitle`, `essaySourcesNote`.

No existing key was changed. Three are no longer read by any page and are left in place for
their owners to remove: `chapterChoiceCopy`, `gravityCopy` and `fluidCopy` (the last said the
ink "diffuses", which it does not: chapter 09).

Added on 17 November 2026: `essayOrbitWord`, `essayOrbitCopy`, `essayOrbitPlaces`,
`essayOrbitSpace`, `essayOrbitCopies`, `essayDepthLabel`; `essayLightTitle`, `essaySweepCopy`;
`essayViewWord`, `essayViewTitle`, `essayView1`–`6`, `essayViewScores`, `essayViewDrift`;
`essayStrokeWord`, `essayStrokeTitle`, `essayStroke1`–`7`, `essayStrokeRecord`;
`essayPaperWord`, `essayPaperTitle`, `essayPaper1`–`4`;
`essayTermSeed`, `essayTermGenerator`, `essayTermRecord`, `essayTermCycle` (each with its `…Is`);
`essayBornWord`, `essayBornTitle`, `essayBorn1`, `essayBorn2`;
and, outside the essay's block, `depthHint`, `depthHintTouch`, `depthTurnLeft`,
`depthTurnRight`, `depthOpen`, `depthWaiting`, `depthUnavailable`, `depthNote`.
Three were rewritten: `essayStandfirst`, `essayLightCopy`, `essayInkCopy`. After the review:
`depthTiltUp`, `depthTiltDown` and `homeDescription` were added, and `essayStroke5` and
`glossaryWavelength` corrected. Five more are now read by no page and are left in place:
`processIntro`, `expressionTitle`, `expressionCopy`, `sweepCopy` and `selectedWorks` (the name
of the home's retired spread).

## 7. The sources, and what each was read for

Each was opened and read for the sentence that cites it, never recalled. Where a source could
be read only in part, the note says so. One note the essay does not cite is kept here because it
decided a sentence: on 11 September 2026 the Clay Mathematics Institute announced a claimed
resolution of the Navier–Stokes problem that needs an external force; it was reported as checked
by its authors and not awarded, and the question without a force as still open. So chapter 09
says only that the question was set in 2000.

| № | Mark | Reference | What it was read for |
| --- | --- | --- | --- |
| 1 | `newton` | [Newton, I. Philosophiae Naturalis Principia Mathematica (London, 1687), I, Prop. XI–XIII, LVII–LVIII; trans. A. Motte (London, 1729)](https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Book_1/Section_3) | Propositions 11 to 13 find the inverse-square force from each conic; Corollary 1 of Proposition 13 gives the converse; Proposition 57 has two bodies describe similar figures about their common centre, and Corollary 2 of Proposition 58 makes them conics under the inverse-square law. |
| 2 | `kepler` | [Newton, I. Principia (1687), I, Lemma XXVIII, Prop. XXXI](https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Book_1/Section_6)<br>[Fitzpatrick, R. An Introduction to Celestial Mechanics (University of Texas at Austin)](https://farside.ph.utexas.edu/teaching/celestial/Celestial/node33.html) | Newton’s Proposition 31 finds a body’s place on its ellipse at a given time; the corollary of Lemma 28 says no finite equation gives it, and his Scholium prefers approximation. Fitzpatrick: Kepler’s equation is transcendental and is solved by iteration. |
| 3 | `newton3` | [Newton, I. Principia (1687), I, Prop. LXV–LXVI; III, Prop. XXII](https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Book_1/Section_11) | Proposition 66 compares, corollary by corollary, what a third body does to the motion of two; Book III applies it to the Moon and says other lunar inequalities could not yet be reduced to rule. |
| 4 | `euler` | [Euler, L. “De motu rectilineo trium corporum se mutuo attrahentium”, Novi Commentarii academiae scientiarum Petropolitanae 11 (1767), 144–151 (E327)](https://scholarlycommons.pacific.edu/euler-works/327/)<br>[Euler, L. “Considerationes de motu corporum coelestium”, Novi Commentarii academiae scientiarum Petropolitanae 10 (1766), 544–558 (E304)](https://scholarlycommons.pacific.edu/euler-works/304/) | E327 finds three bodies moving along one line with their spacing in constant proportion; E304 finds a small body staying in line with two others as they turn. |
| 5 | `lagrange` | [Lagrange, J.-L. “Essai sur le problème des trois corps” (1772), Œuvres de Lagrange 6 (Paris, 1873), 229–331](https://archive.org/details/oeuvresdelagrang06lagr) | Pages 230 and 272 to 277: the straight line and the equilateral triangle, each body then describing a circle or a conic “as if there were only two”; “of pure curiosity”; “these cases do not occur in the System of the world”. |
| 6 | `trojans` | [NASA Jet Propulsion Laboratory, Small-Body Database: 588 Achilles](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=588)<br>[IAU Minor Planet Center, List of Jupiter Trojans (2026)](https://www.minorplanetcenter.net/iau/lists/JupiterTrojans.html)<br>[Emery, J. P. et al. “The complex history of Trojan asteroids”, Asteroids IV (Tucson, 2015)](https://arxiv.org/abs/1506.01658) | Discovered 22 February 1906 by Max Wolf at Heidelberg; the first object found near the point 60° ahead of Jupiter. The Minor Planet Center lists 9,823 at that point and 5,942 at the one behind. |
| 7 | `webb` | [NASA, James Webb Space Telescope: Orbit](https://science.nasa.gov/mission/webb/orbit/) | Webb orbits the Sun 1.5 million kilometres from the Earth, in a loop about the second Lagrange point, and needs small thrusts to stay there. |
| 8 | `gascheau` | [Moeckel, R. “Central configurations”, Scholarpedia 9(4):10667 (2014)](http://www.scholarpedia.org/article/Central_configurations)<br>[Chenciner, A. “Three body problem”, Scholarpedia 2(10):2111 (2007)](http://www.scholarpedia.org/article/Three_body_problem)<br>Gascheau, G. Comptes rendus de l’Académie des sciences 16 (1843), 393–394<br>Routh, E. J. “On Laplace’s three particles”, Proceedings of the London Mathematical Society 6 (1875), 86–97 | For three bodies turning steadily, Lagrange’s triangle is linearly stable provided 27(m₁m₂ + m₂m₃ + m₃m₁) < (m₁ + m₂ + m₃)²: Gascheau’s result of 1843, which Routh derived again in 1875. It holds only when one mass dominates, as for the Sun, Jupiter and a small body. The solutions on a line are always linearly unstable. Gascheau’s and Routh’s own pages were read in scans. For three masses between 100 and 300 the right side is at most 3.6 times the bracket (this essay’s arithmetic), so a work’s triangle could never be stable. |
| 9 | `integrable` | [Chenciner, A. “Three body problem”, Scholarpedia 2(10):2111 (2007)](http://www.scholarpedia.org/article/Three_body_problem)<br>[Tong, D. Dynamics and Relativity (University of Cambridge), ch. 4–5](https://davidtong.org/teaching/dynamics-and-relativity/)<br>Diacu, F. “The solution of the n-body problem”, The Mathematical Intelligencer 18(3) (1996), 66–70 | The two-body problem is integrable and its solutions completely understood; conserved quantities are what solve it, and for three bodies no more of them are to be had. Diacu’s count: n bodies need 6n numbers, of which the ten integrals and two further reductions remove twelve, leaving none for two bodies. |
| 10 | `count` | [Whittaker, E. T. A Treatise on the Analytical Dynamics of Particles and Rigid Bodies, 2nd ed. (Cambridge, 1917), §§ 155–160](https://archive.org/details/treatisanalytdyn00whitrich) | Three bodies: a system of order 18, brought to 12 by the six integrals of the centre of mass, to 8 by the three of angular momentum with the elimination of the nodes, and to 6 by the energy with the elimination of the time: “the equations of motion may be reduced to a system of the 6th order.” |
| 11 | `prize` | Mittag-Leffler, G. “Communication sur un prix de mathématiques fondé par le roi Oscar II”, Acta Mathematica 7 (1885), I–VI<br>[Barrow-Green, J. Poincaré and the Three Body Problem (The Open University, 1993)](https://doi.org/10.21954/ou.ro.0000e03b)<br>[Walter, S. A. (ed.) Henri Poincaré Papers: Mittag-Leffler, 1889–1890](https://henripoincarepapers.univ-nantes.fr/chp/text/mittag-leffler100.html) | The announcement: a medal and 2,500 kronor, to be awarded on 21 January 1889; its first question asks for the coordinates of any number of bodies as series converging for all time. No entry answered it. Phragmén’s queries went to Poincaré in July 1889; Poincaré reported the error in a letter of 1 December, after the first printing; Mittag-Leffler’s bill for that printing was 3,585 kronor 63 öre, which Poincaré paid. Barrow-Green’s paper of 1994 on the competition, the usual reference, could not be opened; her thesis gives the same account. |
| 12 | `tangle` | [Poincaré, H. Les Méthodes nouvelles de la mécanique céleste 3 (Paris, 1899), n° 397](https://archive.org/details/lesmthodesnouv003poin) | Read in the page image: the two curves and their infinitely many intersections form “une sorte de treillis, de tissu, de réseau à mailles infiniment serrées”; “On sera frappé de la complexité de cette figure, que je ne cherche même pas à tracer.” The translation is this essay’s. |
| 13 | `chaos` | [Barrow-Green, J. Poincaré and the Three Body Problem (The Open University, 1993), 153](https://doi.org/10.21954/ou.ro.0000e03b)<br>Poincaré, H. “Sur le problème des trois corps et les équations de la dynamique”, Acta Mathematica 13 (1890), 226–227 | The first version held that the asymptotic surfaces closed; in correcting it Poincaré proved there are infinitely many doubly asymptotic trajectories, which Barrow-Green judges to be, arguably, the first mathematical account of chaotic motion in a dynamical system. |
| 14 | `bruns` | [Bruns, H. “Über die Integrale des Vielkörper-Problems”, Acta Mathematica 11 (1887), 25–96](https://doi.org/10.1007/BF02612319)<br>Julliard-Tosel, E. “Bruns’ theorem: the proof and some generalizations”, Celestial Mechanics and Dynamical Astronomy 76 (2000), 241–281 | Pages 59 and 68: every integral built algebraically from the coordinates, the velocities and the time is made of the known ten. Nothing is said against integrals of other kinds. Poincaré mended a gap in the proof in 1896, and Julliard-Tosel gives a complete one. |
| 15 | `poincare1890` | Poincaré, H. “Sur le problème des trois corps et les équations de la dynamique”, Acta Mathematica 13 (1890), 1–270, § 22<br>Whittaker, E. T. Analytical Dynamics, 2nd ed. (Cambridge, 1917), § 165 | For the restricted problem, with one mass nothing and the other two on circles, no further integral exists that is single-valued and analytic in the orbit’s elements and in the mass ratio, for small enough ratios. Wider than Bruns in the kind of integral it excludes; narrower in holding only for small masses. |
| 16 | `sundman` | [Sundman, K. F. “Mémoire sur le problème des trois corps”, Acta Mathematica 36 (1912), 105–179](https://doi.org/10.1007/BF02422379) | Page 107 and pages 178 to 179: if the constants of areas (the angular momentum) are not all zero, the coordinates and the time can be written as series in powers of a variable τ that converge for all time; a collision of all three is possible only when they are all zero. |
| 17 | `beloriszky` | Belorizky, D. “Application pratique des méthodes de M. Sundman à un cas particulier du problème des trois corps”, Bulletin Astronomique (2) 6 (1930), 417–434<br>[Barrow-Green, J. “The dramatic episode of Sundman”, Historia Mathematica 37 (2010), 164–203](https://doi.org/10.1016/j.hm.2009.12.004) | Belorizky’s lower bounds are for one correct decimal of a body’s place two months ahead in Lagrange’s equilateral case: more than 10⁸⁰⁰⁰⁰ terms for equal masses, more than 10⁸⁰⁰⁰⁰⁰⁰ when the whole mass is 200 times the smallest. Barrow-Green gives the larger figure as what astronomers’ observations would need; the essay follows the original. |
| 18 | `generator-sim` | [CS-Image-Generation, src/sim.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/sim.rs)<br>[CS-Image-Generation, src/app.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/app.rs) | G = 9.8; the gate (energy above 10 or angular momentum below 10 is discarded); the early exit during the warm-up; three measures ranked, weighted 1, the seed’s draw, and 0.15; a shortlist of 24 scored as pictures. The ranges of mass, place and velocity are re-derived by the essay’s script from № 031’s seed. |
| 19 | `standish` | [Standish, E. M. “Sufficient conditions for escape in the three-body problem”, Celestial Mechanics 4 (1971), 44–48](https://doi.org/10.1007/BF01230319)<br>Bozis, G. “Regions of escape on the velocity ellipsoid for the planar three body problem”, Dynamics of Planets and Satellites and Theories of Their Motion (Dordrecht, 1978), 357–369 | A proof of escape asks for the body’s distance from the other two, that it is moving outward, and a least outward speed, all together. The abstract was read on the publisher’s page; the conditions themselves at second hand, in Bozis. |
| 20 | `leapfrog` | [Hairer, E., Lubich, C., Wanner, G. “Geometric numerical integration illustrated by the Störmer–Verlet method”, Acta Numerica 12 (2003), 399–450, § 1.3](https://doi.org/10.1017/S0962492902000144)<br>Newton, I. Principia (1687), I, Prop. I | The article traces the method to the Principia, where Newton uses it to prove Kepler’s law of areas: straight motion for a short time, then a single impulse toward the centre, repeated. The proposition was read in the Latin of 1687. |
| 21 | `yoshida` | [Yoshida, H. “Construction of higher order symplectic integrators”, Physics Letters A 150 (1990), 262–268](https://doi.org/10.1016/0375-9601(90)90092-3)<br>[Forest, E., Ruth, R. D. “Fourth-order symplectic integration”, Physica D 43 (1990), 105–117](https://doi.org/10.1016/0167-2789(90)90019-L) | Yoshida’s equations 4.1 to 4.6: a fourth-order step is three second-order steps of lengths x₁, x₀, x₁, with x₁ = 1/(2 − ∛2) and x₀ = −∛2/(2 − ∛2); he notes that the scheme agrees with Forest and Ruth’s. The essay’s script holds the generator’s two constants to these formulas. |
| 22 | `symplectic` | [Hairer, E., Lubich, C., Wanner, G. Acta Numerica 12 (2003), 399–450, Theorem 5.1](https://doi.org/10.1017/S0962492902000144)<br>[Gauckler, L., Hairer, E., Lubich, C. “Dynamics, numerical analysis, and some geometry”, Proceedings of the International Congress of Mathematicians 2018, 453–485](https://arxiv.org/abs/1710.03946) | With a constant step small against the motion’s own rates, a symplectic method keeps the energy within a bound of the size of its own error for exponentially long times, where a method that is not symplectic lets the error add up step by step. |
| 23 | `chambers` | [Chambers, J. E. “A hybrid symplectic integrator that permits close encounters between massive bodies”, Monthly Notices of the Royal Astronomical Society 304 (1999), 793–799](https://doi.org/10.1046/j.1365-8711.1999.02379.x) | Symplectic integrators of fixed step lose their accuracy whenever two bodies come close to one another, and changing the step in mid-run costs an error at every change. |
| 24 | `ieee` | [Goldberg, D. “What every computer scientist should know about floating-point arithmetic”, ACM Computing Surveys 23 (1991), 5–48](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)<br>[Ecma International, ECMAScript Language Specification, §§ 6.1.6.1, 21.3.2.33](https://tc39.es/ecma262/) | IEEE 754 requires addition, subtraction, multiplication, division and the square root to be correctly rounded, and does not require it of sines, logarithms or powers. Goldberg warns that the standard alone does not make two machines agree; a language must also fix the format and forbid wider intermediate results, which ECMAScript does. ECMAScript has defined + − × ÷ exactly in every edition read; the square root exactly only since its 2025 edition. |
| 25 | `poincare1908` | [Poincaré, H. Science et méthode (Paris, 1908), I, ch. IV](https://fr.wikisource.org/wiki/Science_et_m%C3%A9thode/Livre_premier,_%C2%A7_IV) | “… il peut arriver que de petites différences dans les conditions initiales en engendrent de très grandes dans les phénomènes finaux … La prédiction devient impossible.” |
| 26 | `horizon` | [Boffetta, G., Cencini, M., Falcioni, M., Vulpiani, A. “Predictability: a way to characterize complexity”, Physics Reports 356 (2002), 367–474, § 2.1.1](https://arxiv.org/abs/nlin/0101029) | The time a prediction holds grows with the logarithm of the starting precision: T ~ (1/λ) ln(Δ/δ₀). That each further digit buys the same span, and the figures for № 031, are this essay’s own arithmetic from the twin’s measured doubling. |
| 27 | `laskar` | [Laskar, J. “Is the Solar System stable?”, Progress in Mathematical Physics 66 (2013), 239–270, § 2.1](https://arxiv.org/abs/1209.5996) | A Lyapunov time of about 5 million years for the inner planets; 15 metres becomes about 150 metres after 10 million years and 150 million kilometres after 100 million. |
| 28 | `generator-labels` | [CS-Image-Generation, src/traits_analysis.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/traits_analysis.rs) | Chaos is the mean spread (standard deviation over mean) of each body’s frequency spectrum over the window, mapped to 0–100. The braid is read along the principal axis of the raw x–y samples, the nearer body in z passing over. “Eternal Dance” is defined as no body past the escape threshold within the horizon. |
| 29 | `borda` | [Borda, J.-C. de “Mémoire sur les élections au scrutin”, Histoire de l’Académie royale des sciences, année 1781 (Paris, 1784), 657–665](https://archive.org/details/histoiredelacad81hist)<br>[Pacuit, E. “Voting methods”, Stanford Encyclopedia of Philosophy (2019)](https://plato.stanford.edu/entries/voting-methods/) | Pages 659 to 661: each elector ranks the candidates; the last place is worth one point, the next two, and so on up to the first; the points are added. A note on page 657 says Borda had put the idea to the Academy on 16 June 1770. The generator gives points on Borda’s own scale. |
| 30 | `generator-view` | [CS-Image-Generation, src/app.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/app.rs)<br>[CS-Image-Generation, src/render/aesthetic_score.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/render/aesthetic_score.rs)<br>[CS-Image-Generation, src/render/visual_profile.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/render/visual_profile.rs)<br>[CS-Image-Generation, src/render/batch_drawing.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/render/batch_drawing.rs) | `app.rs`: the motion is in three dimensions and the picture is drawn on one plane; four rotations, uniform over all orientations, are drawn from a stream forked from the seed; each is applied about the centre of mass to a thinned sample of the orbit and scored on what it would cover of the sheet and how evenly; the first with the highest score is kept. Before that, some seeds are mapped into another space: a place with its own velocity, or with the next body’s place. `visual_profile.rs` and `batch_drawing.rs`: a stroke may be repeated about the centre of the frame, mirrored or turned, each copy with its share of the light. The counts for the collection are the venue’s own tally of its registry. |
| 31 | `generator-light` | [CS-Image-Generation, docs/spectral-algorithm.md, §§ 1–3, 5.3, 6.2, 6.4, 7–8](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/docs/spectral-algorithm.md)<br>[CS-Image-Generation, src/spectrum.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/spectrum.rs)<br>[CS-Image-Generation, src/render/drawing.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/render/drawing.rs) | The document: the frame is the box about every step of all three bodies, padded by a twentieth of its span on each side and let out to the sheet’s shape; depth moves no point and feeds the fade; each point keeps 64 bands of 5 nm from 380 to 700; the hue chooses the wavelength, a purple being two bands; strokes add; breadth and brightness follow the body’s speed within the orbit’s own range, from 1.90 times as broad to 0.72, and up to 8 times as bright; the kinds of stroke; the spectrum goes to colour through the 1931 observer’s functions; the levels are set in a first pass of about 240 moments and then held; the film is every 555th step and the last, each frame all the light so far; the master is 16 bits in Display P3. `spectrum.rs`: the 64 bands and the observer’s table. `drawing.rs`: the fade with depth, never below 18 %. |
| 32 | `generator-camera` | [CS-Image-Generation, src/drift.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/drift.rs)<br>[CS-Image-Generation, src/drift_config.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/drift_config.rs) | `drift.rs`: one offset is added to all three bodies at each step; it lies on an ellipse in an orientation drawn from the seed, and its place is found by advancing evenly with time and solving Kepler’s equation. `drift_config.rs`: the arc is up to 1.35 of a period, the eccentricity 0.4 to 0.5; its comments say a long sweep smears the path across the whole sheet. |
| 33 | `observer` | [International Commission on Illumination (CIE), ILV: International Lighting Vocabulary, 2nd ed. (CIE S 017:2020), term 17-23-049](https://cie.co.at/eilvterm/17-23-049)<br>[Smith, T., Guild, J. “The C.I.E. colorimetric standards and their use”, Transactions of the Optical Society 33 (1931), 73–134](https://doi.org/10.1088/1475-4878/33/3/301) | The CIE’s own vocabulary defines the CIE 1931 standard colorimetric observer as an ideal observer whose colour matching is that of the functions the CIE adopted in 1931: so the essay says “adopted”. Of Smith and Guild only the abstract was read (the paper is behind a paywall): the standards of 1931 define a standard observer, three illuminants and a system of three primaries. |
| 34 | `navier-stokes` | Navier, C.-L. “Mémoire sur les lois du mouvement des fluides”, Mémoires de l’Académie royale des sciences de l’Institut de France 6 (1827), 389–440<br>Stokes, G. G. “On the theories of the internal friction of fluids in motion, and of the equilibrium and motion of elastic solids”, Transactions of the Cambridge Philosophical Society 8 (1849), 287–319 | Both read in scans of the original volumes for their titles, dates and pages. Stokes’s own footnote says Navier had already obtained the same equations for an incompressible fluid, on other principles. |
| 35 | `reynolds` | [Reynolds, O. “An experimental investigation of the circumstances which determine whether the motion of water shall be direct or sinuous, and of the law of resistance in parallel channels”, Philosophical Transactions of the Royal Society of London 174 (1883), 935–982](https://doi.org/10.1098/rstl.1883.0029) | §§ 1, 5 and 6: the character of a flow depends on the product of a length and a velocity set against the fluid’s viscosity over its density; “the birth of eddies” on a definite value of that ratio. He gives the ratio no name. |
| 36 | `ember` | [CS-Image-Generation, docs/ember-design.md, §§ 3–6](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/docs/ember-design.md)<br>[CS-Image-Generation, docs/ember-edition.md](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/docs/ember-edition.md) | A two-dimensional, incompressible, viscous flow in vorticity form at Reynolds number 300; bodies of fixed area drawn out by the tidal field of the other two, up to 3 to 1; ink followed back along the water’s path and laid only at a body; no ink inside a body; nothing inked before fluid time 0.5; black for 0.8 seconds of film, then fading to a floor wash. The certificate gives the grids, the steps and the time taken. |
| 37 | `wake` | [Taira, K. et al. “Modal analysis of fluid flows: applications and outlook”, AIAA Journal 58 (2020), 998–1022](https://arxiv.org/abs/1903.05750) | Water flowing past a round cylinder begins to shed a street of eddies at a Reynolds number of about 46 (experiments and analyses between 45 and 47). C. H. K. Williamson’s review of 1996, the usual reference, could not be opened. |
| 38 | `fefferman` | [Fefferman, C. L. “Existence and smoothness of the Navier–Stokes equation” (Clay Mathematics Institute)](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf)<br>[Clay Mathematics Institute, The Millennium Prize Problems](https://www.claymath.org/millennium-problems/) | In two dimensions the existence and smoothness of solutions, for a fluid with no force on it, are long established (he cites Ladyzhenskaya). The seven problems were announced in Paris on 24 May 2000. |
| 39 | `bas` | [Boyland, P. L., Aref, H., Stremler, M. A. “Topological fluid mechanics of stirring”, Journal of Fluid Mechanics 403 (2000), 277–304](https://doi.org/10.1017/S0022112099007107) | Three stirrers in a dish of glycerol, moved in two ways. Swapped always the same way round (σ₁σ₂), nothing is forced; swapped alternately (σ₁⁻¹σ₂), some lines must stretch by (3 + √5)/2 ≈ 2.62 with each repeat of the two swaps. The results depend only on the continuity of the fluid motion, for a motion that repeats, in two dimensions; they are a lower bound. Three is the critical number: one or two stirrers force nothing. |
| 40 | `mixing` | [Aref, H. et al. “Frontiers of chaotic advection”, Reviews of Modern Physics 89 (2017), 025007](https://arxiv.org/abs/1403.2953)<br>[Villermaux, E. “Mixing versus stirring”, Annual Review of Fluid Mechanics 51 (2019), 245–273](https://doi.org/10.1146/annurev-fluid-010518-040306) | Stirring draws a patch into filaments whose width shrinks exponentially until diffusion smooths them out; stirring is transport, and mixing is stirring with diffusion. Villermaux adds that the two act together throughout, not one after the other. |
| 41 | `ember-paper` | [CS-Image-Generation, src/ember/paper.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/ember/paper.rs)<br>[CS-Image-Generation, src/ember/config.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/ember/config.rs)<br>[CS-Image-Generation, docs/ember-design.md, § 7.5](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/docs/ember-design.md) | `paper.rs`: the sheet is one object measured in millimetres; its formation is 1,024 random waves of 1.5 to 8 mm, each 2.2 times as long along the forming flow; long fibres lie in the sheet’s plane, 35 % of them near the flow’s direction; fibres shed ink. `config.rs`: 1,490 mm wide; 1.5 visible fibres to the square centimetre; nine in ten of them 5 to 15 mm long. The design document § 7.5: the sheet’s seed is the work’s seed and a fixed label, so every work has its own sheet. The files give no source in papermaking for these figures, so the essay says “modelled on”. |
| 42 | `kubelka-munk` | [Kubelka, P., Munk, F. “Ein Beitrag zur Optik der Farbanstriche”, Zeitschrift für technische Physik 12 (1931), 593–601; trans. S. Westin (2004)](https://www.graphics.cornell.edu/~westin/pubs/kubelka.pdf) | Read in Westin’s English translation (pages 1 to 3 and the conclusion; the German of 1931 was not found in a scan): a layer of paint absorbs and scatters a constant share of the light passing through it each way, and the reflectance of a coat too thick to see through depends only on the ratio of the two. Its own example is lampblack in white paint. The journal, volume and pages were confirmed in a review of the theory’s use on paper (Džimbeg-Malčić and others, Tehnički vjesnik 18, 2011). |
| 43 | `ember-optics` | [CS-Image-Generation, src/ember/optics.rs](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/src/ember/optics.rs)<br>[CS-Image-Generation, docs/ember-design.md, §§ 7.1–7.3](https://github.com/PredictionExplorer/CS-Image-Generation/blob/main/docs/ember-design.md) | `optics.rs`: reflectance in 36 bands from 380 to 730 nm; the ink lies in the paper’s fibres, the absorption and scattering of soot and paper added, the reflectance from their ratio (Kubelka and Munk) with a correction for the surface; where ink is dense its glue dries to a smooth film; the sum is taken under a gallery lamp with the 1931 observer. The design document §§ 7.1–7.3: one pigment, pine soot. |
| 44 | `ejection` | [Stone, N. C., Leigh, N. W. C. “A statistical solution to the chaotic, non-hierarchical three-body problem”, Nature 576 (2019), 406–410](https://arxiv.org/abs/1909.05272)<br>Valtonen, M., Karttunen, H. The Three-Body Problem (Cambridge, 2006), ch. 7 | Bound triples of comparable masses and spacings nearly always break up into one escaping body and a bound pair, as numerical experiments show; the exceptions take up little of the space of beginnings. Specialists call a permanent departure an escape and keep ejection for a temporary one. |

## 8. Stage 3: the live exhibits

One is built, the orbit in depth (8.1, 17 November 2026). Three more are a plan (8.2 to 8.4).

Each is computed in the reader's browser from the work's own record, by the modules that already
verify it, and each is labelled *Analysis, not the work*. The three planned ones stand in the
chapter that teaches them, under the still figure they bring to life, and are still until they
are asked; with reduced motion each shows its end state and a table of what it found.

### 8.1 The orbit in depth (the head of the Orbit part): built

*What it shows.* The day's work before it is a picture: the three bodies' paths through the
recorded window, as the picture's camera followed them, drawn in depth over the work's own Light
still. The camera's drift is kept, so the figure that turns is the picture's own and a visitor
knows it for the still they have just seen. Eleven works are drawn in another space; of those
the page says that what turns is that drawing in depth, not the paths the bodies took, and of
the nine whose strokes are repeated, that the repeated lines turn with the rest
(`CASES.depth`).

*How it opens.* The Light still stands first. It is in the document a reader is sent, and it is
the generator's one view. Once half the stage is on the screen, where motion is welcome, the
still opens into depth by itself over 1.7 seconds, the recorded window is played again at the
film's own pace, and the camera travels slowly round until a hand takes it. This is the one
exhibit that moves unasked, on the owner's word that it must be obvious the orbit can be
turned. A swipe that begins on the stage is the page's and takes nothing from it. With reduced
motion, or under the venue's Pause, nothing opens and nothing plays: one word, *Turn it in
depth*, shows it turned and drawn whole.

*How it is turned.* By a drag (a mouse at once; a finger after a hold, so a swipe over the stage
still scrolls the page, and a second finger is the page's), by the arrow keys (with Shift, in
larger steps), and by four arrow buttons a finger's square each: left and right step it round,
up and down tip it, so that no turn needs a drag (WCAG 2.5.7). It rests where it is left, where
the orbit on a work's page springs back. *The generator's view* (and Home, and Escape) returns
it to the picture's view, where the still stands alone. Space plays and holds it.

*It never rests part-open.* Within twenty degrees of the picture's view the drawing lies half
over the still. An orbit left there goes on, the way it was being turned, to where the depth
stands open, and one being closed goes back to the picture's view (`restingTurn` in `hand.ts`).
So a step round that passes the front lands on the picture itself, and the next step opens it
on the other side: the picture is one of the views on the way round.

*It is held whole on the stage.* Turned, a figure reaches where the flat picture never did, and
a stage has edges. For each tilt the camera stands as near as leaves the figure whole on the
stage whichever way it is turned round, and no nearer (`holdOnStage` in `depth.ts`: the
figure's farthest points, in every symmetry copy, measured at every seven and a half degrees);
so its size is steady as it is turned round, and gives way only as it is tipped.

*That it turns is said in one screen.* On a desk the part's head, the stage, the line that says
how it is turned and the words that turn it stand in one screen, in every language: the stage
takes what the head leaves. On a phone, and on any screen too short for the three together (a
phone on its side), the stage comes first with its strip, then the part's head, then what the
drawing is; at 320 px the strip still stands in the first screen in every language. The line
is in the type's own colour, the pointer's words on a desk and the finger's on a phone.

*Its own words.* Its performance has a Pause of its own. Under the venue's Pause it is held
where it stands, the camera too, and says so: its word is Play, which lifts the pause, as a
plate's does. Played again, the camera goes on from where it has come to.

*How it is drawn.* By First Light's engine (WebGL 2, or WebGPU where it is there) and its worker,
fetched when the section is within three-quarters of a screen, so the home's first load does not
carry them. `src/lib/first-light/depth.ts` holds its beats and its camera, pure; the hand that
turns it is the work page's (`hand.ts`), which learned to be led by a key and to stay.

*What it says of itself.* Beneath it, and named by the figure as what describes it: *Analysis,
not the work*; what the drawing is a drawing of; that it opens from the generator's view and is
computed in this browser from the places and velocities of the three bodies at the first step
of the recorded window, which were derived again from the seed and checked against the record
before they were kept; and the way to First Light's own page, where the whole performance may
be watched (*Watch it form*).

*Where it cannot be drawn* (a browser without WebGL 2, or a drawing context lost) the still
stands with a sentence that says so, said aloud too, and no control is offered. With no script
the still stands with its number, and the line that says the orbit will be computed is taken
away.

*Proof.* Unit tests of the hand, the beats, the fit and the component (`hand.test.ts`,
`depth.test.ts`, `orbit-depth.test.tsx`); in the browser (`orbit-depth.spec.ts`): one screen in
all eight languages, at 320 px and on a phone on its side; that it opens by itself; that
nothing does where motion is unwelcome; the venue's Pause; a hand, from the still at rest; a
small turn that goes on into depth; the keys; a phone's swipe and hold; and its words whole in
every language.

### 8.2 Take one away (chapter 01)

*What it shows.* The day's work at the first frame of its film; the reader removes one body, and
the two that remain trace what two bodies alone do: one ellipse, lap after lap, or one open pass.
Put the third back, and the same two no longer repeat.

*How.* The window's first state is already derived in the worker for the orbit section
(`src/lib/physics/orbit.ts`). Two bodies alone need no integration: `pairAlone`
(`scripts/lib/essay-figures.mjs`, to move into `src/lib/physics/`) gives the conic, and Kepler's
equation gives the place on it at any time, exactly. The three together are the published
window, replayed. Both are drawn in the plane the two bodies share, at the film's pace.

*Controls.* Three buttons, one per body (`aria-pressed`), and Play.

*Proof.* A unit test that the drawn pair returns to its start after one period to the last
digit a double holds; a browser test that the figure's stated period is the registry's.

*Size.* One client component under 6 KB gzipped, loaded when the chapter nears the viewport. The
home's first-load budget (255 KiB) is not touched.

### 8.3 The step that was too long (chapter 04)

*What it shows.* № 004's near miss, where the published computation loses its energy, and the
same pass followed with a smaller step, where it does not. One control: the step. At the record's
step the energy leaps by 780 % and the three fly apart; at a tenth of it the two bodies swing
past each other and the energy holds.

*How.* Replay № 004's window to a little before step 1,534,960 (the state can be committed: 18
doubles), then integrate the next 10,000 steps of the record's time with the generator's own
integrator at dt, dt/2, dt/4 … dt/64, in a worker. Draw the two bodies' paths through the pass
and the energy line beneath.

*Honesty.* The label says what is the published computation (the first setting, bit for bit) and
what is the venue's own (every other). The words say again that the picture is the published
computation; the exhibit shows why the venue calls nothing after that step an orbit.

*Proof.* The first setting reproduces `essay-figures.json`'s `lostExample` exactly; a test holds
the energy at the finest setting within one part in a thousand through the pass.

*Risk.* Whether dt/64 is small enough for this pass must be measured first; if it is not, the
exhibit needs an adaptive step, and the words must say that it is a different method.

### 8.4 The plait (chapter 10)

*What it shows.* The day's work on its Ink sheet: the three bodies moving as the film moves
them, and beside them their three strands being drawn, a crossing added each time two bodies
change places. A reader can scrub the film's time.

*How.* `FramedWindow` (`src/lib/physics/framing.ts`) already places the bodies on the sheet;
`SheetWatch` (`scripts/lib/essay-figures.mjs`) reads the crossings. The still figure of stage 2
is this exhibit's last frame.

*What it must not claim.* The theorem is about stirrers the water must go round, and on every
sheet two bodies overlap at some moment. So the exhibit marks the stretches of the film in which
two bodies overlap, and its words say that no stretching figure follows for the work. Measuring
the ink's stretching from the published film is a research question of its own, outside this
plan.

### 8.5 Order and cost

8.2 first (the smallest, and the essay's first chapter), then 8.4 (its parts exist), then 8.3
(it needs the measurement above). Each is one pull request with its own unit and browser tests.
The words they need are few: a label, a control's name and a sentence of result each, in eight
languages.

## 9. Open decisions (the owner's)

1. **The first screen.** The home still opens on the day's work, a screen of it, and the essay
   begins beneath: the work is the first paint, and First Light performs over it on a first
   visit. If the essay's cover should be the very first thing instead, the plate can move
   beneath it.
2. **The cover's signature** still reads "October 2026" (`statementSigned`, as before); the
   essay was written in November 2026.
3. **The headline.** The home's one headline is the essay's, "Physics, upon physics.", kept as
   it was.
4. **The unread keys** (§6), eight now, can be removed once the words session's pull request
   is in.
5. **The three planned exhibits** (§8.2 to 8.4): whether to build them, and in which order.
6. **The twin beneath the home's plate.** The home no longer hangs the twin on a screen of its
   own under the plate (the wing): one Turn shows it there, and the essay hangs both
   expressions, each at the head of its part. A work's page keeps its wing.
7. **A sentence of the Statement that the generator's record does not bear out**, left for its
   owner: `statement5` says the collection "never revises what it has published". The
   generator's own record says Inks of earlier looks were withdrawn or rendered again (all 72
   certificates now name `ember-v4`). The home says instead that no work exists before its
   cycle closes.
8. **What the home does not explain, for want of a source that could be read:** what kozo is
   and how it is made, what Arbitrum is, and how a round of the Cosmic Signature game is won.
   Each is named and not explained.
9. **Chapter 07 has no picture of its own.** The orbit in depth is its figure, a part above
   it. The four views the generator scored could be drawn side by side, from the seed, in the
   reader's browser: a fourth exhibit, not planned here.

## 10. The essay as the home (17 November 2026)

The owner's words are in [north-star.md](north-star.md) ("The front door, and the voice"); the
decisions are in the [decision register](decision-register.md) (the home; the orbit in depth;
the venue's voice on the home). What was done:

- **The page.** `src/app/[locale]/page.tsx` is the day's plate (unchanged: the viewer, the
  Overture on a first visit), then the essay's parts in the order of §1, then the day's cycle.
  The essay's own files moved to `src/app/[locale]/_essay/`, a folder no address reaches.
- **Three parts, each opened by a plate.** Orbit (the orbit in depth), Light (the Light plate
  and its film), Ink (the Ink plate and its film). Every chapter belongs to one part
  (`EssayPart` in `structure.ts`), and the contents on the cover list them so.
- **Three new chapters**, each sentence set against the generator's own source
  (CS-Image-Generation, `main` at 59b324d) and, where it speaks of the world outside, against a
  source that was opened: 07 The view, 08 A stroke, 11 The paper. A record under two of them
  gives the day's work's own figures: its four views' scores and the one kept, its camera's
  share of a circuit and its drift eccentricity, its structure, palette and dominant wavelength.
- **A close on how a work comes to exist** (`#cycle`): nothing is made in advance; a work's seed
  is fixed in the transaction that ends its cycle; the day's work's own date and cycle.
- **Four terms added** at the head of the list: seed, generator, record, cycle.
- **The address.** `/process` leads to `/` for good (a 308 from the proxy, in every language),
  and a chapter's old address still leads to the chapter (`/process#choice` lands on
  `/#choice`). Process left the Index, the colophon and the sitemap.
- **Retired from the home:** the statement screen and the spread of two works
  (`home-spread-plates.tsx`); the wing beneath the home's plate.
- **The ground at first paint.** A visitor who arrives at a part's address (`/#current`) is
  given that part's ground before the page's script runs (`roomScript` in `src/lib/room.ts`).
- **Every control a finger's target.** The home's controls are 44 px each way, each reference
  in the sources among them (a row a reference); the essay's browser sweep holds them to it
  in every language at 320 px.
- **The way to First Light.** *Watch it form*, which stood on the retired statement screen,
  stands beneath the orbit in depth: the way to the whole performance for a visitor the
  Overture was not played to.
- **What a search engine is told.** The home's description says what the page is
  (`homeDescription`); its title is still the venue's line.
- **How often it is made again.** Every minute, as the live record its Light plate and its
  sweep ask for is; the page's own setting now says so.

**The review.** Before it was shown, six reviewers read the whole change, each with one
question: the exhibit as code; who is shut out; addresses, first paint and the page without
script; whether every new sentence is true of every work; the page as a visitor of a museum sees
it; and whether the tests and these records say what was built. They found some thirty faults,
each reproduced or traced. What was mended from them, beyond what is said above: a scrolling
thumb that landed on the stage cancelled the exhibit's opening; two fingers left the orbit held
by nobody; *Again* and the venue's Pause cut the camera to another angle; a small turn left the
drawing half over the still; the turned figure was cut by the stage's edge; the focus ring on
the orbit lay under it; the plate's keys ruled the essay thirty screens below it; a Turn made
in the film room left the head on the wrong ground; an address that named no part painted the
night over an Ink plate; a view's score was printed the equal of one it fell short of; a
camera's share past one circuit lost its last figure; the part heads were the smallest headings
on the page, and on a phone the Orbit part's came after its own caption; the three new chapters
showed nothing; the close stood behind the bibliography; the Japanese cover broke in three
lines by one pixel; and a change of language inside a chapter lost the reader's place, because
the chapter's number, which stays in sight in the margin, was taken for the mark being read
(`reading-place.tsx`; it was so on `/process` too). The reviewers' notes are kept with the
session's notes.
