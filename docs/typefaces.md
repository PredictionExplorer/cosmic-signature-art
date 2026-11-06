# Typefaces

The venue sets everything in one book face and one instrument face, both under the SIL Open
Font License, so the identity never waits on a licence. The audit behind these choices, and what
each one fixes, is [Typography](typography.md).

- **Literata** (TypeTogether; variable, weight 200–900, optical size 7–72, roman and italic)
  for display, reading, labels and the wordmark. It is cut by script (Latin, Latin Extended,
  Cyrillic for Ukrainian, Cyrillic Extended, Greek, Greek Extended, Vietnamese), published by
  `npm run fonts` under `public/fonts/literata` as `literata-<script>-<roman|italic>.woff2`, and
  declared once in `src/app/typefaces.css`, so each cut loads only when a page uses a glyph from
  it. Each locale preloads the cuts its first paint reads in (`LITERATA_PRELOADS` in
  `src/lib/fonts.ts`). The cuts are the complete OFL font's, with every OpenType feature (small
  capitals, old-style, lining, tabular and proportional figures, superiors), committed under
  `fonts/literata` with `OFL.txt` and remade by `scripts/subset-literata.py` from the approved
  files in the google/fonts repository (typography §5.1). Figures are lining by default and
  old-style in prose and beside small capitals.
- **IBM Plex Mono** (`@fontsource/ibm-plex-mono`, 400) for everything the instrument says:
  `№ 031`, clocks, nanometres in readouts, hashes, addresses, lot states, timelines. Its Cyrillic
  subset carries `№` (U+2116), so the work identifier is identical in every locale. A date or a
  measure inside a sentence is the cataloguer's and is set in Literata (`.figures`: lining,
  tabular).

Two tokens name them: `--font-book` (the locale's book face) and `--font-mono`. `--font-latin` is
Literata itself, for the wordmark and the standalone numerals, which are the same in every locale.
`--weight-hairline` is the display's lightest weight: 200, or 300 beside a CJK face that begins
at 400.

The scale is derived from the plate's own proportion (3456 / 2234 = 1.547), applied every
two steps, on a 9 px baseline, fluid between 375 and 1440 px:

| Token           | Stop   | Use                                                            |
| --------------- | ------ | -------------------------------------------------------------- |
| `--fs-folio`    | 12     | captions, small caps, mono readouts; the floor in every locale |
| `--fs-control`  | 15     | every control and link word; the counts line                   |
| `--fs-reading`  | 17–18  | entry, statement, conditions of sale; measure 32 em            |
| `--fs-subtitle` | 24–28  | italic subtitles                                               |
| `--fs-plate`    | 36–44  | the hanging numeral beside a plate                             |
| `--fs-chapter`  | 44–68  | cycle openers, the selection line                              |
| `--fs-entry`    | 64–106 | the numeral at the head of an entry, the wordmark              |
| `--fs-cover`    | 84–164 | one line on the one screen that has no work                    |

`src/app/stylesheet-floor.test.ts` fails on any font size below 12 px and on any duration
written outside the `--t-*` motion tokens.

## Stand-ins

While a face loads (`font-display: swap`), a system face stands in, scaled to the same average
width and set on the same ascent and descent, so the page does not move when the face arrives:
Georgia or Times New Roman for Literata, Menlo or Courier New for Plex Mono. The measurements are
in `src/app/typefaces.css` and [Typography](typography.md) §4.1.

## CJK display faces

Each CJK locale links one serif face chosen for it, published as a static stylesheet of
unicode-range slices under `public/fonts/cjk/` by `scripts/build-font-subsets.mjs`
(`npm run fonts`, also run by `predev` and `prebuild`; the directory is generated and
ignored by git):

| Locale | Face               | Weights  | Stylesheet          |
| ------ | ------------------ | -------- | ------------------- |
| zh     | Noto Serif SC      | 300, 400 | `/fonts/cjk/sc.css` |
| zh-TW  | Noto Serif TC      | 300, 400 | `/fonts/cjk/tc.css` |
| zh-HK  | Noto Serif HK      | 300, 400 | `/fonts/cjk/hk.css` |
| ja     | Shippori Mincho B1 | 400      | `/fonts/cjk/ja.css` |
| ko     | Gowun Batang       | 400      | `/fonts/cjk/ko.css` |

The slicing is the vendor's (Google Fonts' unicode-range chunks, about a hundred files of
15–60 KB per weight), so a page fetches only the slices its glyphs need and the English venue
loads none of them. The Chinese faces' Light (300) sets the display lines beside Literata's
hairline; Shippori Mincho B1 and Gowun Batang begin at 400, and the Latin display rises to 300
to meet them. `src/lib/fonts.ts` maps locales to stylesheets and the layout emits one
`<link rel="stylesheet">` per CJK page.

On a CJK page Latin words and figures are set in Literata at 92 % (`Literata Han` for Chinese
and Japanese, `Literata Hangul` for Korean, the same files), and Chinese and Japanese take the em
dash, the ellipsis and the double quotes from their own face. The per-`:lang()` rules in
`globals.css` turn off synthesized italics (CJK stays upright in an italic line), remove Latin
tracking, small caps and uppercase, raise the display line height to 1.25 and the reading line
height to 1.9, break Japanese display lines between phrases and Japanese text with strict
kinsoku, and keep Korean words whole. Each locale's mono stack falls to its own serif, never to a
system gothic. Latin figures, clocks and hashes stay in Plex Mono.

## The glyph and feature check

`scripts/check-font-coverage.mjs` (`npm run test:fonts`, run in CI) reads every string in
the eight catalogs and the components, and fails when a character is not drawn by a shipped face
for that locale: Literata's and Plex Mono's cuts are read glyph by glyph from their cmaps
(`scripts/lib/woff2.mjs`), the CJK faces by their slices' ranges. The arrows (`← → ↑ ↓ ↗`) are
the one allowed exception, listed in `SYSTEM_GLYPHS`: they are typographic devices and may come
from the system face. Add a glyph to a shipped face, or to that list with a reason, before
shipping a string that uses it.

The same check reads the stylesheets for the OpenType features they ask of Literata (small
capitals, old-style, tabular and superior figures, any `font-feature-settings` tag) and fails on
one the cuts do not carry, unless `PENDING_FEATURES` lists it with what the browser does instead.

A tighter subset cut with `pyftsubset` over the catalogs, the statement and the generated
entry strings is a later optimisation; the vendor slices already keep CJK pages to the few
slices they use.
