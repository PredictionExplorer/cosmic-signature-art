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
- The Orrery's cells, three to a row, are faint on a phone. The Orrery's WebKit freeze is being fixed in its own session, so its phone pass waits for that fix.
- The auction landing has no work on it.

## 2. The rule: two equal expressions

1. **Neither expression is the venue's default.** Both are the work, of equal standing, as the statement already says.
2. **Where works are listed, both are shown at equal size across a seam.** Ink hangs on paper to the left, and Light on night to the right. The seam is the Turn's own seam, at rest at the middle of the wall. On a desk each leaf keeps the hang's rhythm. On a phone each row is one work, its Ink beside its Light. This applies to the collection, the home's spread and cycle row, and the exhibition hangs.
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
- **All the light on touch.** A finger held on the sky names the orbits beneath it as it moves, and lifting it chooses. A tap still chooses at once. The sky hangs edge to edge.
- **The auction landing** is left as it is, pending the owner. The vision made the sale's title spread the one screen without a work. Before a contract exists there are no lots, and works that are not for sale on a sale page could mislead. Section 6 asks the owner.
- **The collection's bar** keeps clear of the home indicator (`env(safe-area-inset-bottom)`).
- **The Orrery's phone pass** (two to a row, trails legible at the phone's pixel ratio) waits for the freeze fix's PR.

## 4. The events

Unchanged from [third-physics.md](third-physics.md) §5, ordered by readiness:
1. **After the frame** (§5.6). When a film resolves, the re-performance continues past the recorded window, labelled as physics, not the work. An ejection leaves at the published `ejection_step`.
2. **The choice** (§5.10). The process essay re-derives all 100,000 beginnings of the day's work in a worker, in a field of energy against angular momentum with the chosen one ringed.
3. **The Overture** (§5.8). It still needs the owner's decision (§11.2) to replace the Dusk. Under rule 3 its last beat lands on the day's expression.
4. **Opening night** (§5.9). It waits for the pipeline to publish traits early.

## 5. Order of work

1. **Two equal expressions and phones**, one PR, since both touch the same surfaces.
2. **After the frame.**
3. **The choice.**
4. **The Overture**, once the owner decides.

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
- Should the auction landing show work before a contract exists, clearly labelled as not offered?
- The Overture (§11.2 of the plan) is still unanswered.

**Still to do on phones.**
- A finger held on All the light to browse names before choosing.
- The Orrery's phone pass, after the freeze fix lands.

