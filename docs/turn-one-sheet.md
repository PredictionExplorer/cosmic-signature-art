# The Turn as one sheet

_Built 15–16 November 2026, after the second jury review of 14 November. Dates are UTC._

The Turn is the venue's signature act: a work passes between its two expressions, Light on the night and Ink on paper. The review found it the single thing most in the way of the design score, and all six jurors held one gap open: the seam was drawn several ways. This note records what the Turn is now, how it is drawn, what it replaced, how it is proved, and what is left.

## What the review saw

- The plate crossed by a soft blob while the head and the strip were cut by hard polygons in 48 columns: two seams in one picture.
- A Turn by the word or the keys faded every ground through one flat grey for most of a second, and the head's and the strip's words vanished into it.
- On a phone a second plate hung beneath the first, so a Turn showed one expression twice, and the page jumped when the Turn landed.
- First Light's landing showed its Light still for 0.09 s before crossing it.
- In the viewing room the work moved 22 px at 390 px when the Turn landed, and the Turn itself was a straight wipe of the browser's snapshot over a ground fading through grey.

## What a visitor meets now

**One front.** Every Turn is one sheet turned by one front. The front leaves the work's own first marks: where the Light film first drew for a Turn toward the night, and where the ink first came to rest for a Turn toward the paper. It crosses the work in the order the work was made, and goes on past the work's edge at one even pace until it has crossed the walls beside the plate, the strip beneath it, the running head above it, and whatever of the page the screen shows beyond.

**Two grounds, and nothing between.** Ahead of the front everything is the expression the Turn leaves; behind it, the one it brings. The two grounds are mixed nowhere but across the front's own edge, a few pixels wide. No frame is a grey that is neither.

**Whole words.** Each glyph of the head, the strip and the page wears the ink of the ground beneath it: a word the front is passing is light on its night side and dark on its paper side, glyph by glyph, and no glyph is ever two colours. Where the two expressions say different things in one place (`Light` and `Ink`, the two lines under the still), the words change hands as the front passes them.

**At once.** A press is answered by the front itself, which leaves the work's first marks in the same moment. The whole crossing takes the Turn's own two seconds (`--t-cross`), at an even pace from the press to the last corner.

**Every Turn.** The word and the keys, a held key let go, a finger across the plate, First Light's landing, a plate resting partly under its wing, and the Turn made in the viewing room are all drawn this way.

**Reduced motion** gets the same change as one frame, as before. Nothing is prepared for it.

## How it is drawn

**One field.** `src/lib/crossing/sheet.ts` lays, for a stage of any size, a field that says when the front reaches each point: on the work, the time the work's own arrival map gives; past the work's edge, that time carried on at the ground's own pace, by straight distance. `sheetTime(sheet, x, y)` reads it at a point, `frontAt(sheet, share)` says where the front stands when a Turn is a share of its way, and `passed(time, front, edge)` says how far the front has passed. Everything below reads the Turn's place from these three, and from nothing else.

- The field is laid in a worker (`sheet.worker.ts`, through `sheet-layer.ts`) in 26 to 49 ms on a desk, and inline where a browser has no workers.
- Each Turn by time carries its own clock, the inverse of its easing curve, so that the front keeps an even pace while the seam it follows keeps the venue's curve.

**The stage's canvas.** `src/components/sheet-painter.ts` paints one WebGL canvas over the whole stage: both grounds and both published stills (or the frame of the film the departing layer is playing). What a pixel is made of as the front passes is `matterOf` and `materialPixel` in `src/lib/crossing/material.ts`: light lit on its ground as light adds, ink as a transmittance on its paper. At either end of a Turn the canvas paints the published still itself. `arrival-crossing.ts` is where the page meets the sheet: it measures the stage, asks for the sheets that fit it, and gives each frame to the painter, the grounds and the words.

**The grounds beyond the stage.** The running head and the page beyond the stage each have a small 2D canvas behind their words (`sheet-grounds.ts`), painted from the same field in the same frame. The page's ground turns only where the room's ground changes with the Turn.

**The words.** `sheet-words.ts` measures every glyph once, as a Turn begins, and on each frame sets each word's ink from the field: whole where the word stands on one ground, and through a gradient with a hard stop between two glyphs where the front stands in it. An underline that waits unseen for the hand is set aside while a word is filled, since a fill is clipped to a word's underline as to its glyphs.

**The viewing room.** The room sets one expression at a time, so its canvas (`room-crossing.ts`) paints through: only what the Turn brings, wherever the front has passed, over the room as it stands. Ahead of the front the room shows what it was showing: its still at the room's own size, or its film, still playing, from whatever host it comes. The front crosses first; the change is then made by an ordinary update, and the canvas goes when the room has painted the work beneath it.

- Resting on a still, a Turn brings the other expression's still. Playing a film, it brings that expression's bare ground, and its film begins there from its first frame.
- A Turn taken back (the other word pressed mid-way, or the room closed) returns the way it came.
- A Turn asked for while the room is still opening waits for the opening to end, and then crosses as any other.
- In the loupe and under a lens the room shows something the sheet does not bring, and the change is made at once.
- Where the sheet cannot be painted, the room's Turn is the stage's own snapshot, as before, with its one-second deadline.

**The room's strip is one height.** A work's two expressions list different films and offer different views, so their strips wrapped to different heights: 44 px apart at 320 and 390 px in most languages, and up to 124 px at 768 px. The strip that grew as a Turn landed moved the work. The room now holds, unseen, the strip the other expression will set, in the same cell as the strip in use (`HeldStrip` in `artwork-room.tsx`), drawn from attributes as the notice's held lines are. The strip is as tall as the taller of the two, always, and the work stands in one place and at one size in both. During a Turn the held words are the ones arriving: they change hands with the strip's, a cluster at a time, and carry the chosen word's underline and the focused word's ring with them. A narrow room wraps its two strips differently, so that a cluster of one lies across another cluster of the other (at 390 px Light's strip sets the work's number where Ink's sets its films). Clusters that meet so change hands together, in one frame, and no word is ever set across another.

## The parts

| Part | Where |
| :-- | :-- |
| The field, the front and how far it has passed | `src/lib/crossing/sheet.ts` |
| The field's worker, and the layer that asks it | `src/lib/crossing/sheet.worker.ts`, `src/components/sheet-layer.ts` |
| What a pixel is made of at the front | `src/lib/crossing/material.ts` |
| Easing curves and their inverse | `src/lib/crossing/timing.ts` |
| The stage's painter | `src/components/sheet-painter.ts` |
| Stills and maps, read once | `src/components/sheet-pictures.ts` |
| The grounds behind the head and the page | `src/components/sheet-grounds.ts` |
| The words | `src/components/sheet-words.ts` |
| The page's crossing | `src/components/arrival-crossing.ts` |
| The room's crossing and its travel | `src/components/room-crossing.ts` |
| The room's held strip | `src/components/artwork-room.tsx` (`stripWords`, `HeldStrip`) |

## The rules it keeps

- **The order comes from the art.** The front follows the work's arrival maps, and the ground's pace is measured from each map. Nothing is an authored wipe.
- **The art is never altered.** At either end of a Turn the plate is the published still, and between Turns the canvas steps aside.
- **A Turn answers at once and waits on nothing.** The page's commit stays an ordinary update, as it has been since the starved commit was found. The room's commit is one too wherever the sheet draws its Turn; where it does not, the snapshot's transition keeps its one-second deadline.
- **Nothing moves.** What a Turn says of itself while its still is on the way ("Opening this expression…") is said to a screen reader and set nowhere: a line beneath the stage moved the page as every Turn began. The word pressed reads busy until it lands.
- **Each glyph is wholly one colour.**
- **Reduced motion, Pause and the auction's hush** make the Turn one frame.

## What it replaced

- The change of material (8 November, [first-light.md](first-light.md), "The Turn as a change of material, as built"): the three-stage Turn whose ground faded as one. Its model of what a pixel is made of is kept, at the front.
- The polygons that cut the head and the strip in 48 columns (`src/lib/crossing/front.ts`, removed), described in [third-physics-phase-b.md](third-physics-phase-b.md).
- The room's fade of its ground through grey. The room's snapshot wipe remains only where WebGL is absent.
- The second plate a phone hung beneath the first. Below 768 px the wing hangs one plate: the twin is a Turn away, by the word or by a thumb drawn across the plate.
- The tenth of a second First Light gave its landed Light still. It now holds for `--t-overture-hold`, 1.8 s, before it crosses; any input still ends the event at once.

## How it is proved

**In the page itself.** `tests/e2e/sheet-record.ts` reads a Turn back frame by frame as the page paints it: the stage's canvas, the canvases behind the head and the page, and the ink of every glyph. `tests/e2e/turn-sheet.spec.ts` holds, on a desk and a phone:

- the head's ground and the stage's put the front on one line, to the pixel, and so do the page's ground and the stage's;
- every glyph wears the ink of the ground the canvas shows beneath it, and none is two colours;
- no word is ever set across a word of the other expression's strip;
- on no frame of a pressed Turn is more than an eighth of the bare ground anything between the two grounds;
- nothing beneath the stage moves from the press to the landing;
- a phone hangs one plate;
- First Light's landing holds its Light still, then crosses with no layer of words cut;
- in the room the work stands in one place in both expressions, in three languages, and the room held for a strip is the room that strip takes, to a thirty-second of a pixel;
- the room's Turn is the same sheet, can be taken back, is made at once in the loupe, and still turns where WebGL is absent.

**By the pixels.** `tests/e2e/crossing.spec.ts` holds the order against each work's own arrival map for three works, both ways; that every frame is made of the two stills and nothing else; that a finger's Turn and a held key let go behave as before; and that the canvas ends on the published still.

**Unit tests** cover the field (`sheet.test.ts`), the worker and its layer, the material, the words (their fills, their groups, the held words of the room), the grounds, the page's crossing, the room's crossing and its travel, the room's held strip against the strip each expression sets, and the viewer's part in a Turn made in the room.

## What was measured

On a production build of an Ink day, in Playwright's Chromium and WebKit, 15–16 November.

- **Registration.** Over the 25 to 57 places a Turn's front was read on the line between the running head and the stage, the two canvases put it a median of 0.02 px apart. The test holds every reading within one pixel, and within a pixel and a half for the page's ground, which is painted four pixels to a cell. It found one flaw on the way: the page's ground was asked for its cells two pixels wide of where a 390 px screen shows them, and is now asked where they are shown.
- **Ink.** Over a slowed Turn each way, every glyph of the head and the strip that stood clear of the front's edge wore the ink of the ground beneath it, and no fill changed inside a glyph: none of several thousand readings a Turn failed.
- **The room's strip, before.** Measured in eight languages on two works: Ink's strip and Light's stood 44 px apart at 320 px in six languages and at 390 px in seven, 62 or 124 px apart at 768 px in all eight, and 51 px apart at 1440 px in Vietnamese, where the work also changed size. **After:** one height in every one of the 64 cases, the work in one place, and each held word within a sixty-fourth of a pixel of the word that takes its place.
- **The room's Turn.** The canvas is up 40 to 90 ms after the key, the change is made about 2.1 s after it, and the canvas has gone within 50 ms more. A Turn taken back at 0.7 s is back where it began at 1.4 s.
- **Words in one place.** The filmstrips taken on the finished build on 16 November showed, at 390 px in the room, a few frames with words of the two strips set across one another: the arriving strip's number over the leaving strip's films. Each named cluster changed hands at its own middle, and the two strips' clusters lay across one another. Clusters that meet are now one group. The recorder counts every pair of words of different strips set in one place on one frame; it found 34 on the build without the mend, in WebKit at phone width, and finds none now. Read in the same way over five widths from 320 to 1440 px, four languages and two works, in both engines and both ways (80 cases, 3 to 18 pairs of words that would meet in each), no pair was ever set together.
- **A context lost.** With the stage's WebGL context lost on purpose 1.2 s into a slowed Turn, in Chromium and in WebKit at phone width, the Turn landed, nothing on the page moved, and the console said nothing. (WebKit itself lost contexts in a few tests of one run on a machine at a load above 500, and says so on the console, which the suite counts as a fault of the page: those tests passed alone.)
- **Ready.** On a machine at a load of 450 the sheet is offered about 0.2 s after main's crossing was (medians of six loads: 0.27 and 0.48 s in Chromium on a desk, 0.19 and 0.36 s on a phone, 0.73 and 0.94 s in WebKit), with no long task on the main thread in either: the field is laid in a worker. Only a Turn pressed in that moment waits on it, for 0.4 s at most, and then crosses by the straight seam.
- **Weight.** A work's page sends 275.6 KiB of script on first load against a budget of 295; the home sends 238.8 against 255.
- **First paint.** The paint budgets pass on the finished build, run alone as they are meant to be (the home's first visit on a desk: a largest paint at 0.79 s against a budget of 2.5 s). One run on a machine at a load of 590 read 4.1 s. The cause is main's own and is not changed here: as First Light begins, the plate's stills are mounted again and fade in a second time, and when Chromium has not booked the first fade it books the largest paint on the second. Eight first visits each, side by side at 1280 × 720: main booked the second fade in four (median 2.8 s), this build in three (median 1.0 s). At 1440 × 1000 under a load of 420, six each: main in three (3.2 to 4.4 s), this build in two (3.2 and 4.2 s).

## What is left

- **The arrival maps.** The committed maps are near-distance cones from a few seeds, because the build spreads a mark's time to its neighbours. Marks therefore do not keep their own time, and a front on the work is rounder than the work's making was. Re-measuring them so that each mark keeps its own time is the second stage, in its own pull request; the sheet reads whatever maps are bound.
- **The hard-edge wing on a desk.** Where the wing cannot be drawn by the scroll (motion stilled, Pause, or a browser without scroll-driven animations) a desk still hangs the twin on a second screen beneath the plate, and that screen leaves when the plate turns to its twin: everything beneath it moves up by a screen. A phone no longer hangs it. Whether a desk should is the owner's to decide.
- **A key for the expression already on the plate** does not call off a Turn that is still being readied on the page (the room's word does). The older test of it passed by waiting out the eight seconds a still is given.
- **Hairlines beyond the stage.** The room's strip hairline turns with the front. A rule or a border of the page beyond the stage still changes when the Turn commits.
- **The home's film word.** On the home the strip's film word reads `Again` on the arriving layer during a crossing and `Film` once it has landed, because both layers read one film state. It was so before this build.
- **The plate's second fade as First Light begins.** On a first visit the plate's stills are mounted again when the event starts, and fade in a second time over their previews. It is so on main. It is what makes the first visit's largest paint read late on a busy machine (see First paint, above), and a still that has been shown should not arrive twice.
- **A Turn waits for its still.** Before any Turn the stage decodes the arriving still, and gives it eight seconds (`artwork-stage.tsx`, as on main). Once, on a machine at a load of 550, a filmstrip in WebKit showed a press answered by nothing for twenty seconds. It could not be made to happen again: seventeen second Turns under a load of 340 to 540, on main and on this build, five of them taken exactly as the filmstrips are, were each under way within 0.4 s. From the press to the Turn's first frame the code is main's own.
- **The loupe and the lenses** change at once in the room. A front that crossed a detail in the art's own order would need the loupe's view given to the sheet.
