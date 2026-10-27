# Typefaces

The venue sets everything in one book face and one instrument face, both under the SIL Open
Font License, so the identity never waits on a licence:

- **Literata** (TypeTogether; variable, weight 200–900, optical size 7–72, roman and italic)
  for display, reading, labels and the wordmark. Shipped from `@fontsource-variable/literata`
  (`opsz.css` and `opsz-italic.css`, imported by the locale layout), subset by script:
  Latin, Latin Extended, Cyrillic (for Ukrainian), Greek and Vietnamese, each loaded only
  when a page uses a glyph from it.
- **IBM Plex Mono** (`@fontsource/ibm-plex-mono`, 400 and 500) for everything the instrument
  says: `№ 031`, clocks, nanometres, hashes, addresses, lot states. Its Cyrillic subset
  carries `№` (U+2116), so the work identifier is identical in every locale.

The scale is derived from the plate's own proportion (3456 / 2234 = 1.547), applied every
two steps, on a 9 px baseline, fluid between 375 and 1440 px:

| Token           | Stop   | Use                                                            |
| --------------- | ------ | -------------------------------------------------------------- |
| `--fs-folio`    | 12     | captions, small caps, mono readouts; the floor in every locale |
| `--fs-control`  | 15     | every control and link word                                    |
| `--fs-reading`  | 17–18  | entry, statement, conditions of sale; measure 34–38 em         |
| `--fs-subtitle` | 24–28  | italic subtitles                                               |
| `--fs-plate`    | 36–44  | the hanging numeral beside a plate                             |
| `--fs-chapter`  | 44–68  | cycle openers, the selection line                              |
| `--fs-entry`    | 64–106 | the numeral at the head of an entry, the statement's title     |
| `--fs-cover`    | 84–164 | one line on the one screen that has no work                    |

`src/app/stylesheet-floor.test.ts` fails on any font size below 12 px and on any duration
written outside the `--t-*` motion tokens.

## CJK display faces

Each CJK locale links one serif face chosen for it, published as a static stylesheet of
unicode-range slices under `public/fonts/cjk/` by `scripts/build-font-subsets.mjs`
(`npm run fonts`, also run by `predev` and `prebuild`; the directory is generated and
ignored by git):

| Locale | Face               | Stylesheet          |
| ------ | ------------------ | ------------------- |
| zh     | Noto Serif SC      | `/fonts/cjk/sc.css` |
| zh-TW  | Noto Serif TC      | `/fonts/cjk/tc.css` |
| zh-HK  | Noto Serif HK      | `/fonts/cjk/hk.css` |
| ja     | Shippori Mincho B1 | `/fonts/cjk/ja.css` |
| ko     | Gowun Batang       | `/fonts/cjk/ko.css` |

The slicing is the vendor's (Google Fonts' unicode-range chunks of the 400 weight, about a
hundred files of 15–60 KB per face), so a page fetches only the slices its glyphs need and
the English venue loads none of them. `src/lib/fonts.ts` maps locales to stylesheets and
the layout emits one `<link rel="stylesheet">` per CJK page. Per-`:lang()` rules in
`globals.css` remove Latin tracking, small caps and uppercase for these locales and raise
the display line height to 1.25. Latin figures, clocks and hashes stay in Plex Mono.

## The glyph check

`scripts/check-font-coverage.mjs` (`npm run test:fonts`, run in CI) reads every string in
the eight catalogs and fails when a character falls outside the unicode ranges the shipped
faces declare for that locale. The arrows (`← → ↑ ↓ ↗`) are the one allowed exception,
listed in `SYSTEM_GLYPHS`: they are typographic devices and may come from the system face.
Add a glyph to a shipped face, or to that list with a reason, before shipping a string that
uses it.

A tighter subset cut with `pyftsubset` over the catalogs, the statement and the generated
entry strings is a later optimisation; the vendor slices already keep CJK pages to the few
slices they use.
