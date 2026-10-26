# Phase 1 — the signature moments

Phase 1 of the Two Grounds plan ([vision §6](world-class-gallery-vision.md)) builds the
venue's signature moments on the Phase 0 foundation. This note records what shipped, where
it departs from the plan, and what the owner still has to decide.

## What shipped

**Typography and tokens.** Literata (variable, optical sizes) and IBM Plex Mono replace
Cormorant, Inter and Clash. Each CJK locale links its own sliced display face (Noto Serif
SC / TC / HK, Shippori Mincho B1, Gowun Batang) and a CI glyph check keeps every string
inside the shipped faces; see [typefaces](typefaces.md). The scale is the plate's own
ratio on a 9 px baseline; the two grounds are tokens on `<html data-room>`.

**The plate, the Turn, the night wing.** Every art screen opens on an edgeless plate fitted
to the viewport under a 48 px running head and above a 56 px label strip, letterboxed in the
work's measured tone (the running head borrows the tone while the plate dominates). Light
is one Turn away: one vertical seam carries ground and work together, Light arriving from
the right and Ink returning from the left, the running head inverting as the seam crosses
it; hold `L` or `I` to peek, tap to toggle, drag on a phone. The night wing beneath the
plate is scroll-driven where the browser supports scroll timelines and a hard edge
elsewhere, and the running head follows whichever ground holds the centre of the screen.
The chosen expression travels in the URL and is remembered for the session; a new visit
opens on Ink.

**The artwork page.** The plate, the night wing, the neighbours (`← 030 · 032 →`, next by
wavelength, `Collect` when a sale is configured), then the entry: the numeral hanging in the
margin, the selection sentence ("One of 100,000 candidate orbits. Number 77,741 was
chosen.") with the Borda weights beneath, the entry lines, the traits with footnote marks,
the custody line with compact addresses and "record as of", the seed, the glossary as
numbered marginalia, a `Verify on chain` drawer with the hashes and the two honesty notes,
the custody timeline and the files by medium. The live metadata read is the source; the
build-time index stands in for the identical seed only when the live read is unavailable.

**The collection.** The first screen is a plate; the orderings are `Number`, `Cycle` and
`Spectrum` (every Light preview hung on black along a 380–700 nm rule by its published
dominant wavelength); chapter strips open every cycle with counts and dates read from the
index; filter chips by cycle and the six published traits; a night section for Light;
a 44 px bottom bar on phones. The Index of numbers is a full-viewport sheet, opened by the
`Index` word or `/`, with every numeral by cycle and the work under the hand standing
behind the type. Typing digits then Enter goes to that work from anywhere; `?` lists the
keys.

**The home**, five screens: the day's work (a deterministic pool of 023, 031 and 035 until
the settling clips widen it) as the plate with the one line, the same orbit in Light, the
statement screen, a spread of 031 and 035 in their own tones, and the day's cycle as a row
of real previews, then the colophon. The Dusk, the home's one automatic event, is built and
waits behind `NEXT_PUBLIC_HOME_DUSK=1`.

**The statement** at `/statement`, six paragraphs with the epigraph, and the colophon on
every page. **The process** is re-chaptered around the day's work: the choice (with its
real Borda line), Light pinned, a hard edge into Ink, the spectral sweep on intent, the
thesis. **The sale** opens as a bound catalogue's title spread over the coming cycle's
chapter strip while no contract is configured.

**The collection index** ([collection-index.md](collection-index.md)) is the one build-time
read of all 72 published records behind the orderings, the Index and the entries' fallback.

## Departures from the plan, and why

- The process seam is a hard material edge, not the scroll-driven Turn: the night wing's
  scroll timeline exists and the essay can adopt it once its chapters settle.
- On phones the motion control stays in the masthead beside `Index` rather than inside the
  sheet, so the one control that stops ambient motion is never a tap away.
- Literata loads with `font-display: swap`, not `optional`: `optional` would render every
  first visit in the fallback face. The faces are small and cached after the first page.
- Token 000 publishes an Ink expression after all (every indexed work does), so the
  "opens in Light" path exists in code and unit tests only.
- The 8 s excerpts remain hover, focus and phone previews, labelled as such; the settling
  clips that let every plate play to its still are Phase 2.

## Open for the owner (vision §8)

1. The statement's author and byline: the six paragraphs are a draft signed
   "Cosmic Signature · October 2026" in all eight locales.
2. The Dusk: built, flagged off; naive-viewer testing decides whether it ships on.
3. "A hang: 023, 031, 035" and the editorial trails wait for a named curator (Phase 2).

## Phase 2 starts here

Settling clips and the still ladder, the eye-line hang, the gatefold, the chrome-less room
rebuilt around keys and the Slow room, the zero-pixel loupe, the sale as a full catalogue
with hush, per-work OG images.
