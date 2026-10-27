# Phase 2 — the plates move

Phase 2 of the Two Grounds plan ([vision §6](world-class-gallery-vision.md)) gives every
plate its own motion and depth, binds the sale as a catalogue, and opens the exhibitions.
This note records what shipped, where it departs from the plan, and what the owner still has
to decide. The derivatives it rests on are documented in [plate-derivatives.md](plate-derivatives.md).

## What shipped

**The derivatives.** Settling clips for all 72 works in both expressions (the film's final 480
frames at 1280 × 828 and 60 fps, each proved to end on the published still), opening clips for
023, 031 and 035, a still ladder of 1280 and 1920 px rungs cut from the 16-bit masters and
proved against both parents, and plate records measured for every work: tone, edge, the
luminance-weighted centre and up to three detail windows. The pipelines share one origin
module (bounded reads, the byte-range relay, a verified asset cache, content-addressed
publication under a lock), and the registries are read on the server and handed to the
client as a work's own media; a test fails the suite if a client component imports one.

**Every plate moves honestly.** A work without a local complete film wakes after the hold into
its settling clip and resolves into the still beneath it, a true match; the clock is the
film's own (00:22 to 00:30), `Again` replays the ending, and `Film` opens the complete film in
the room. Light plates wake into their own settling clips. The home opens on the opening clip
so motion arrives in about two megabytes, prefetches the complete 1280 film behind it and
hands over at the clip's own time on a presented frame; a clip that ends first holds its last
frame and the strip reads `arriving`. The collection hangs every sheet on one eye line by its
measured centre, clamped inside the wall, and plays one settling clip under the lease; phones
keep the eight-second excerpt, labelled as before. Every still is served as a srcset of its
rungs and the published file, so a phone rests on the 1280 rung.

**The sale as a bound catalogue.** When a contract is configured, eight plates in lot order
alternate Ink on paper and Light on black, each with its lot numeral, `Sit`, the work's line
and one chain-state line read from `auctionPhase()` with dates in UTC and the visitor's zone;
`Order of sale` is a 48 px strip of the eight numerals that pages. `Collect this work` opens
the bid sheet (a side sheet on a desk, a bottom sheet behind a handle on a phone) carrying the
bid panel unchanged, and hushes the theatre while it is open. Results persist after close.
Bid history reads `AuctionBidPlaced` and `AuctionNftDelivered` logs over bounded block
windows, validates every log, and says when earlier bids may be unavailable. `Your activity`
is a read-only sheet: leading bids, committed and refundable ETH, works held, deliveries
pending. The rules, the client and the review flow are untouched.

**Exhibitions and trails** at `/exhibitions`: "A hang: 023, 031, 035", where the chosen work
grows in place and the other two re-form around it; four trails whose membership is a stated
rule over the publisher's own measurements, printed on the page with each work's value (The
Long Curve by eccentricity, Almost Still and Turbulence by the chaos score, Light Becoming
Trace by braid crossings); and the three cycles as chapters with counts and dates, with
settled results read from the contract when one is configured. Every hang is dated and signed
"Hung by Cosmic Signature" until the owner names a curator.

**Sharing images.** Each work, the home and the collection draw their own card: the real 1280
rung on its measured ground, the one label line, the wordmark and the seed as a monogram, set
in static Literata and Plex Mono. No tint touches the art.

**Verify a download.** Beneath the files by medium, a visitor picks a file they downloaded and
the browser hashes it with SHA-256 against every published hash of the work; nothing is
uploaded, files above 256 MB get the `shasum` command instead, and every hash is printed with
Copy. The files list now carries each film's dimensions, duration, size and hash.

**The viewing room, the loupe and the gatefold.** The room fills the viewport in the work's
material (the sheet's measured tone for Ink, black for Light) with one strip of words on a
hairline (`№ 031 · Ink · Light | Still · Film · Long study · 116 s · 224 MB · Extended study ·
290 s · 406 MB | Detail · Fullscreen · Close`), status on its own line beneath, a 1 px transport
at the bottom edge instead of native controls, and the plate's own time carried into the room.
The strip fades after `--t-idle` and returns on any input; the controls never leave the DOM.
Keys: Space, ← → (a second; ten with Shift), I/L, F, Z, W, `?`, Escape, all silent in fields.
The Slow room is a named state for the two long studies: chrome faded, an elapsed clock in
minutes and seconds driven by the film's own time events, the study playing to its still; on
a slow connection the study waits behind `Play it anyway · 116 s` with the still standing in.
The Expansion grows the page plate into the room and back over `--t-expand`, instant under
reduced motion, Pause or the hush. The loupe draws the real still at one artwork pixel per
device pixel, never above native, with the plate record's detail windows as `Whole plate · 1 ·
2 · 3`, pan with inertia, wheel and pinch about the pointer, a double-tap ladder on phones and
a scale readout; it opens on the 1280 rung below 1024 px and swaps to the full still. The
gatefold is a snapped spread of the Ink plate on paper beside the Light plate on black at
equal scale, both at once from 1700 px, a vertical diptych on phones, with a draggable seam as
its second view and the caption "Plate 031, in ink and in light. One orbit."

## Departures from the plan, and why

- Lossy WebP cannot be 4:4:4; the ladder is WebP q92 with `smartSubsample`, which matches
  the publisher's own derivative format, and every rung's measured fidelity is in the registry.
- The settling clips run a quarter over the plan's ~220 MB because the sumi sheets are encoded
  at constant quality rather than a fixed bitrate; the six densest exceed 6 MB.
- The eye line is hung on desks only; on phones each sheet keeps its own height, because a
  screen of wall per row of 50 vw sheets would be mostly paper.
- Light stays still in the collection sequence (the Phase 1 rule that Light releases the Ink
  previews is kept); Light plates on the artwork and lot pages do wake into their clips.
- The masters are not in the verifiable list: neither the index nor the live manifest parser
  carries a master hash, so Verify a download covers the stills, the films and the sweep.
- Sixty-frame catalogue excerpts were not cut: the 640 px excerpts are hover, focus and phone
  previews, and doubling their bytes for a hover is not worth it while the settling clips carry
  every plate's motion at 60 fps.
- The running head speaks five words instead of four: `Exhibitions` joins Collection, Auctions,
  Process and Statement, because the hangs and trails are rooms of the venue, not an index at
  the back; the pocket order puts Auctions first as before.
- The lot strip's chain line is not a live region, so it never competes with the panel's own
  transaction status in a screen reader.
- The loupe fills the room's canvas rather than a 320 px window; it is still zero new pixels,
  and the scale readout and the native clamp are as the vision asked.
- `?` inside the room shows an in-room key note rather than opening the site's key sheet over
  the dialog.
- The muted strip words in the room use #5a5a51, which keeps 5.1:1 on the darkest measured
  sheet; the lighter Phase 1 grey fell short on 031's tone.

## The review

An adversarial review ran over the whole Phase 2 diff: eight reviewers (correctness, honesty,
design, accessibility, internationalisation, performance, tests, coherence) raised 114
findings and three independent skeptics tried to refute each; 70 were upheld by at least
two. The upheld findings were fixed in the commits that follow the integration, with these
exceptions, recorded here rather than left silent:

- Verify a download hashes on the main thread with the whole file in memory and refuses files
  above 256 MB (it prints the `shasum` command instead). A streaming hash in a worker needs a
  SHA-256 implementation the browser's WebCrypto does not offer for streams; the venue adds no
  dependency for it in this phase.
- No Lighthouse step was added to CI for the lot page with the sheet open; the budgets remain
  the Phase 0 measurements, checked by hand.
- The sale's lots keep their own Sit (a per-lot state with window listeners, mirrored to the
  running head) rather than the `useSit` hook the viewer and the process chapter now share;
  its shape differs enough that folding it in is a change of its own.

## Open for the owner (vision §8)

1. A named curator for the hangs and trails; `CURATOR` and the `hungBy` strings change together.
2. The statement's byline and the Dusk flag, as after Phase 1.
3. The home's pool of works is derived from the opening clips; cutting opening clips for more
   works (`npm run art:clips -- --opening <ids>`) widens it without a code change.
