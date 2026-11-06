# Typography — the audit and its decisions

*Audit of 5 November 2026, written against main at b053b18. Every family, weight, style and size on
the venue was inventoried from the stylesheets and the shipped font files, and every surface was
photographed at 2× in Chromium, on a desk (1440 × 900) and a phone (390 × 844), on paper and on night,
in English, Japanese and Chinese, with Vietnamese, Ukrainian and Korean on the desk.*

---

## 0. The owner's direction

> Verify that all the fonts that we're using on this site are absolutely amazing. We want the most
> appropriate fonts everywhere. We want to dazzle our viewers… with very beautiful fonts, and very
> appropriate fonts for the project. We want to use the absolute best practices in calligraphy.

The standard is a high-end museum's catalogue: a book face and an instrument face, each set the way
a typesetter would set it, in eight languages.

## 1. The verdict on the families

**Keep all of them.** None needs replacing; most of the venue's faults were in how they were shipped
and set.

- **Literata** (TypeTogether, SIL Open Font License) is right for the book face. It is one of very few
  free families with every quality the venue needs at once: a variable optical size from 7 to 72, so a
  12 px caption and a 164 px cover are each drawn for their size; weights from 200 to 900, which give
  the hairline display its elegance; a true italic; small capitals, old-style, lining, tabular and
  proportional figures, and superiors in the complete font; and Latin, Cyrillic, Greek and Vietnamese
  drawn by the same hand. Its display sizes have the contrast of a gallery catalogue, and its text sizes
  were built for long reading on screens. The alternatives considered fall short: Newsreader and
  Fraunces lack Cyrillic, Source Serif lacks small capitals, Spectral and EB Garamond lack optical
  sizes, and Cormorant is the quiet-luxury template the vision retired.
- **IBM Plex Mono** is right for the instrument: hashes, addresses, clocks and readouts. It has open,
  unambiguous figures, and its Cyrillic carries `№`, which few monospaced faces do. Its documented
  Latin, Cyrillic and Vietnamese coverage is why it was chosen. Geist Mono, JetBrains Mono and DM Mono
  each fail on coverage or tone.
- **The CJK faces** are each the right register. Noto Serif SC, TC and HK are Song/Ming serifs, the
  register of museum labels in Chinese. Shippori Mincho B1 is a Mincho with a classical, calligraphic
  kana. Gowun Batang is a Batang drawn from the brush. Two of them begin at weight 400, and §3.5 says how
  the Latin meets them.

No family is swapped. Swapping one is a brand decision; none is recommended.

## 2. The inventory

### 2.1 Families, weights and styles

| Face | Source | Weights in use | Styles | Where |
| --- | --- | --- | --- | --- |
| Literata | the complete OFL font, cut by script into `fonts/literata` with its licence and published to `public/fonts/literata` (was the Fontsource web cut, bundled) | 200 hairline display, 300 display and subtitles, 400 text, 500 entry title and rule heads, 700 `<strong>` | roman, italic | everything the venue says in words |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` 400 | 400 (500 was imported and never used; removed) | roman | hashes, addresses, clocks, readouts, the Index's numerals, the language trigger |
| Noto Serif SC / TC / HK | `public/fonts/cjk`, Google's slices | 400 text; 300 display (added) | upright | zh, zh-TW, zh-HK |
| Shippori Mincho B1 | `public/fonts/cjk` | 400 | upright | ja |
| Gowun Batang | `public/fonts/cjk` | 400 | upright | ko |
| The system's | — | — | — | the arrows `← → ↗ ↻` (`SYSTEM_GLYPHS`, by design) |
| Literata (static), Plex Mono | `@fontsource/literata` 300 and 400 `.woff`, Plex 400 | 300 label, 400 words | roman | the sharing cards (the card renderer reads static faces only) |

### 2.2 The scale and where each stop is used

The scale is the plate's own ratio (3456 / 2234 = 1.547, every two steps) on a 9 px baseline, fluid
between 375 and 1440 px. It is sound and is kept.

| Token | px | Where |
| --- | --- | --- |
| `--fs-folio` | 12 | captions, eyebrows and small capitals, every mono readout and folio, the strip's state and clock, the Borda line, the entry's measures, the language trigger, the wordmark in the running head |
| `--fs-control` | 15 | every control and link word: the running head's words, the strip's words, the Index's numerals (mono), the glossary notes, the colophon, the counts line |
| `--fs-reading` | 17–18 | the entry's lines, the statement's paragraphs, the conditions of sale, the room's notes |
| `--fs-subtitle` | 24–28 | italic subtitles, section titles (`The life of a work.`), the process's selection line |
| `--fs-plate` | 36–44 | the hanging numeral beside a plate, lot numerals |
| `--fs-chapter` | 44–68 | page titles, the entry's selection line, the orbit's title |
| `--fs-entry` | 64–106 | the entry's numeral, the wordmark on the statement page and the home's type screen |
| `--fs-cover` | 84–164 | the process cover, the sale title |

Off the scale: 16 px on inputs (the iOS zoom floor, by design); the live bid panel's 12, 14, 15, 18 and
`clamp()` sizes and the sale summary's 36 px mono price (§6).

### 2.3 What the shipped files actually carried

The Fontsource Literata and Plex Mono files are Google Fonts' web cuts. Read with fontTools (and now
with the venue's own reader, §4.3), before this audit:

| File | OpenType features |
| --- | --- |
| Literata Latin, roman and italic | `ccmp dnom frac kern liga locl mark numr pnum rvrn tnum` |
| Literata Cyrillic, Vietnamese | `ccmp kern mark rvrn` |
| Plex Mono Latin | `ccmp dnom frac mark numr` |
| Shippori Mincho B1 (kana slice) | `ccmp vert vpal vrt2` (no `palt`) |
| Noto Serif SC (common slice) | `chws halt kern liga locl palt vchw vert vpal …` |

There was no `smcp`, `c2sc`, `onum`, `lnum`, `sups` or `case` in any Literata cut. Literata's default
figures are proportional lining.

The venue now cuts the complete font (§5.1), whose every cut carries
`aalt c2sc case ccmp cpsp dlig dnom frac kern liga lnum locl mark numr onum ordn pnum rvrn sinf smcp
ss01 ss02 subs sups tnum zero`, with 371 small capitals across Latin, Cyrillic and Vietnamese.

## 3. What the audit found, and what changed

### 3.1 Critical

1. **Every small capital on the venue was faked.** The wordmark in the running head, the 106 px
   wordmark on the statement page, every eyebrow, label and state word asks for `all-small-caps`, and
   the shipped Literata has none, so the browser shrinks the capitals to 70 %. A faked small capital
   is lighter than its neighbours and narrower than drawn; at the 12 px floor its glyphs are drawn at
   8.4 px, so the floor test passed while the type fell below it. *Fixed:* the venue ships the complete
   Literata (§5.1), so every small capital is drawn. The strip's state word, which was Plex Mono in
   small capitals (Plex has none), is now Literata's. Tracking: 0.12 em for the wordmark at 12 px,
   0.05 em at 106 px, 0.06–0.08 em for labels.
2. **Old-style figures were asked for and never shown.** The root sets `oldstyle-nums` for prose; the
   cuts have no `onum`. *Fixed:* with the complete font they draw. Figures are now lining by default (a
   work's number, a date in a label, a control, the entry's data lines), and old-style where the text is
   prose (the statement, the reading paragraphs, the glossary, the counts line) or small capitals
   (`HANG · OCTOBER 27, 2026`). Making old-style the default would have set catalogue numbers such as
   `023, 031, 035` in old-style.
3. **Chinese, Japanese and Korean were set in a fake italic.** Subtitles, epigraphs and italic lines
   slanted Han, kana and Hangul, a distortion no CJK typesetter accepts (`運動のかたち。`).
   *Fixed:* CJK pages set `font-synthesis-style: none`; Latin keeps Literata's true italic, CJK stays
   upright.
4. **CJK inside instrument strings fell to the system's gothic.** The mono stack named no CJK face, so
   the Borda line, the counts line, `コピー` and `复制` were drawn in Hiragino Sans, PingFang or Apple SD
   Gothic Neo beside the serif. *Fixed:* each locale's mono stack falls to its own serif; the fallback
   stacks name serifs only (PingFang and Apple SD Gothic Neo removed).
5. **Chinese display set regular Han beside hairline figures.** At 68 px, Noto Serif SC 400 stood
   twice as dark as Literata 200 (`100,000 条候选轨道之一`). *Fixed:* the Chinese faces add their Light
   (300); the display reads in it.
6. **Vietnamese tone marks collided.** At the cover's 0.98 leading the dot under `ậ` touched the grave
   over `ề` on the next line. *Fixed:* Vietnamese display lines lead at 1.2.

### 3.2 Major

7. **The instrument face spoke in the cataloguer's sentences.** In the entry, `Cycle 1 · August 11,
   2026`, `3,456 × 2,234 px · films 30 s, 116 s, 290 s`, `632 nm` and `Chaos 13 / 100` were set in
   Plex Mono at 18 px, wide and gappy, and every `<time>` on the site was mono. *Fixed:* figures in a
   sentence are Literata, lining and tabular (`.figures`); dates in a sentence are Literata; mono keeps
   the machine's strings (addresses, the seed, hashes, clocks, readouts, timelines). The addresses and
   the seed in the entry's lines are one size, a step below the line (0.9 em), so their wide letters
   keep its colour.
8. **Tabular figures opened gaps in standalone numerals.** The entry's 106 px `031` read `03 1`.
   *Fixed:* the entry numeral and the hanging numeral are proportional lining figures; columns stay
   tabular.
9. **Lines broke where a typesetter never would.** Units parted from numbers (`116 / s`), the clock
   from its period (`11:15 / PM`), a separator opened a line (`· 72 works`), the custody line put
   spaces inside its parentheses (`( 0x7406…Bc6c Copy )`), `px.` stood alone in the colophon, and
   Ukrainian `3 456` could break inside the number. *Fixed:* `src/lib/typography.ts` binds a quantity
   to its unit, keeps a clock whole wherever the locale puts it, holds the separator to the item before
   it, and binds the numbers in catalog sentences (digit groups, dimensions, units); each fact in the
   files list (`3,456 × 2,234 px`, `8.1 MB`, `sha256 4179…66e4`) stays whole and its `↗` stays with
   it, as do the readouts' `nm`; the parentheses close on the address; running text is
   `text-wrap: pretty` and `hanging-punctuation: first last`.
10. **The page moved when the faces arrived, and nothing asked for them early.** `font-display: swap`
    with no matched fallback meant a visible reflow from Georgia to Literata on a first visit.
    *Fixed:* §4.1 and §4.2.
11. **Japanese display broke inside words** (`うちの一 / 本`, `サ / イクル`) **and Korean broke inside
    words everywhere.** *Fixed:* Japanese headings break between phrases (`word-break: auto-phrase`,
    Chromium) and Japanese text uses strict kinsoku (`line-break: strict`); Korean uses
    `word-break: keep-all`, as it is written.
12. **Latin stood a size above the CJK around it.** Literata's large x-height made `Signature` and
    `Arbitrum` shout inside Mincho and Song lines. *Fixed:* CJK pages set Literata at 92 % into the line
    (`Literata Han`, `Literata Hangul`, the same files); Chinese and Japanese also take the em dash, the
    ellipsis and the double quotes from their own face, centred on the em square. Standalone numerals
    and the wordmark use Literata itself, the same size in every locale.

### 3.3 Minor

13. The wordmark had two settings (tracking 0.04 em on the home, 0.06 em on the statement page) and the
    counts line two faces (Literata 18 px on the home, mono 12 px on the statement page). *Fixed:* one
    `.wordmark` and one `.counts`, the counts a catalogue line in Literata at 15 px with old-style
    figures and a balanced wrap.
14. `h3` carried display tracking (−0.015 em) at the reading size. *Fixed:* 0.
15. The measure was 36 em, about 75 characters. *Fixed:* 32 em, about 68, inside the 66–70 a book
    page aims for; the CJK measure was already 32 characters.
16. The CJK heading rule stripped the Latin wordmark's tracking and gave the hanging numeral CJK
    leading. *Fixed:* the wordmark keeps its setting in every locale; the numeral is out of the rule.
17. Plex Mono 500 was imported and never used. *Removed.*
18. The glyph check trusted the ranges a face declares, not the glyphs it draws (Literata's Latin
    range claims U+2000–206F but draws no U+202F). *Fixed:* §4.3.
19. The home's sharing card ran its statement past the frame in English, Japanese and Korean (the third
    line was cut). *Fixed:* both leaves reserve the label and three lines, so the plates still hang at
    one height, and the sentence is clamped at three.
20. The orbit table's derived value (shown when a check differs) was Plex Mono in italic, a style the
    venue does not ship, so the browser slanted the upright. *Fixed:* it is set in Literata's true
    italic.

### 3.4 What was already right, and stays

The scale and its 12 px floor; one book face and one instrument face; optical sizing on
(`font-optical-sizing: auto`); balanced display lines and hanging punctuation; old-style figures asked
for in prose and lining in display; tabular mono for everything that aligns; 44 px targets; `swap` rather
than `optional` (Phase 1: `optional` would set every first visit in the fallback); per-locale CJK
stylesheets that cost the English venue nothing; the curly quotes, apostrophes and guillemets in all
eight catalogs (no straight quote anywhere).

### 3.5 CJK, Ukrainian and Vietnamese

- **Weight harmony.** Specimens of the entry's selection line set each pairing at 68 px. Chinese reads
  best with Literata 200 beside Noto Serif 300. Shippori Mincho B1 and Gowun Batang begin at 400 (no
  lighter weight exists), so Japanese and Korean raise the Latin display to 300
  (`--weight-hairline`), which meets them. A lighter Japanese or Korean face would mean a different
  family (Noto Serif JP or KR); that is not recommended, because Shippori's kana and Gowun's brush are
  why they were chosen.
- **Size harmony.** Literata at 100, 96, 92 and 88 % inside Chinese, Japanese and Korean paragraphs:
  92 % matches the characters' colour in all three.
- **Punctuation.** Chinese and Japanese take `—`, `…`, `“` and `”` from their own face; single quotes
  stay Literata's, so a Latin apostrophe stays Latin. Korean punctuates as Latin does and keeps
  Literata's.
- **Spacing.** CJK display has no tracking and leads at 1.25; CJK reading leads at 1.9; small capitals
  and uppercase are off in CJK. `palt` was considered for Japanese display and rejected: Shippori Mincho
  B1 carries no `palt`.
- **Ukrainian.** Literata's Cyrillic has the Ukrainian forms (`і ї є ґ`); the catalog uses «» and ’
  correctly; digit groups are bound (§3.2.9).
- **Vietnamese.** Literata draws the stacked marks well; the leading was the fault (§3.1.6).

## 4. Loading

### 4.1 Matched stand-ins

`src/app/typefaces.css` declares stand-ins measured from the faces (Literata at opsz 18, weight 400;
Plex Mono 400), weighted by English letter frequencies, so a line set in the stand-in has the same
width, ascent and descent as the face that replaces it:

| Stand-in | `size-adjust` | `ascent-override` | `descent-override` |
| --- | --- | --- | --- |
| Literata ← Georgia | 107.88 % | 109.11 % | 28.55 % |
| Literata italic ← Georgia Italic | 99.66 % | 118.11 % | 30.91 % |
| Literata ← Times New Roman, Liberation Serif | 118.15 % | 99.62 % | 26.07 % |
| Literata italic ← Times New Roman Italic | 111.03 % | 106 % | 27.74 % |
| Plex Mono ← Menlo | 99.66 % | 102.85 % | 27.59 % |
| Plex Mono ← Courier New, Liberation Mono | 99.98 % | 102.52 % | 27.5 % |

The CJK pages' stand-ins (`Literata Han Georgia`, `Literata Hangul Georgia`) carry the same 92 % as
their faces. Line gaps are 0 throughout.

### 4.2 Cuts, preloads and caching

- Literata is published by `npm run fonts` under `/fonts/literata` as fourteen cuts (seven scripts,
  roman and italic), with stable names, and declared once in `src/app/typefaces.css`. A page fetches
  only the scripts its text uses.
- Each locale preloads the cuts its first paint reads in (`LITERATA_PRELOADS`, `src/lib/fonts.ts`):
  the Latin roman everywhere (161 KB; the web cut was 110 KB, and the difference is the small capitals
  and figure sets), plus the Cyrillic roman for uk and the Vietnamese roman for vi.
  Italics and other scripts arrive on use, behind matched stand-ins.
- The CJK pages declare the same files again at 92 %, so a visitor who changes language downloads
  nothing twice.
- `/fonts/literata` and `/fonts/cjk` are cached a day and served stale for thirty while revalidating.
- `font-display: swap` stays.
- `№` is in the Latin cut. In the web cuts it was in the Cyrillic one, so an English page that set
  `№ 070` in Literata (the neighbours' `Next by wavelength`) fetched that cut (62 KB) for one glyph.
- The fourteen cuts total 1.0 MB in the repository (`fonts/literata`), with `OFL.txt` beside them;
  `npm run fonts` publishes both. `scripts/subset-literata.py` remakes them from the approved files,
  checked by their SHA-256, over the ranges `typefaces.css` declares, so stylesheet and files cannot
  drift.

### 4.3 The checks

`npm run test:fonts` (`scripts/check-font-coverage.mjs`) now:
- reads Literata's and Plex Mono's real cmaps through `scripts/lib/woff2.mjs`, a small WOFF2 reader,
  and fails on any character in the eight catalogs or the components that no shipped face draws; the
  CJK faces are read by their slices' ranges, as before;
- reads every stylesheet for the OpenType features it asks of the book face (small capitals, old-style,
  tabular, superior figures, any `font-feature-settings` tag) and fails on any that Literata's cuts
  do not carry, unless `PENDING_FEATURES` lists it with what the browser does instead. It listed
  `smcp`, `c2sc` and `onum` until the complete Literata shipped; it is empty now, and it fails if
  Literata starts carrying a listed feature, so the list cannot go stale.

### 4.4 Licensing

Literata, IBM Plex Mono, the Noto Serif CJK faces, Shippori Mincho B1 and Gowun Batang are all under
the SIL Open Font License 1.1. Serving and subsetting them is allowed; the files keep their copyright
and licence names, and none uses a Reserved Font Name that a subset would have to drop. The colophon
credits Literata and IBM Plex Mono.

## 5. Decisions and what is open

1. **The complete Literata (done).** The web cuts lacked the small capitals, the old-style figures and
   the superiors that made Literata the right choice. On 5 November 2026 the owner approved downloading
   the complete OFL font from the official google/fonts repository ("Yes, download them"):
   `ofl/literata/Literata[opsz,wght].ttf` (955,132 bytes), `Literata-Italic[opsz,wght].ttf` (902,728)
   and `OFL.txt`. They are cut with fontTools over the seven ranges, keeping both axes and every
   OpenType feature, with `№` moved into the Latin cut. The wordmark, eyebrows and labels are true
   small capitals; prose has old-style figures; `PENDING_FEATURES` is empty. The entry's footnote marks
   and the glossary's numbers moved from mono to Literata's lining figures at 12 px. Literata's own
   superiors were considered and not used: at the reading size they are drawn smaller than the 12 px
   floor.
2. **No family swap is recommended** (§1). If a commercial book face is ever wanted, the vision's
   open question 4 stands.
3. **`№ 031` as one unbreakable unit.** `workNumber()` joins `№` and the folio with a plain space,
   so in running text the sign can end a line without its number. It should be a no-break space; the
   change is one line, but about 160 test expectations spell the name with a plain space, so it is a
   change of its own. The wavelength link already binds it.
4. **The live bid panel** keeps its own px sizes (12, 14, 15, 18 and `clamp()`), which predate the
   scale. Its substance is frozen by policy, so this audit did not touch it beyond its clock (mono, as
   the instrument's). Aligning 14 → 15 and 18 → the reading stop would be a one-line change each.

## 6. Before and after

The captures are in `docs/screenshots/typography/`, named `<view>-<device>-<locale>-<before|after>.webp`:
Chromium at 2×, desk 1440 × 900 and phone 390 × 844, reduced motion so every frame is a still,
before on main at b053b18 and after on this branch, both built and served with
`COSMIC_VENUE_DATE=2026-11-06`.

| View | Ground | Desk | Phone | What to look at |
| --- | --- | --- | --- | --- |
| `entry` | paper | en, ja, zh | en, ja | the numeral's spacing (§3.2.8); figures, dates and units in the book face (§3.2.7, §3.2.9); Chinese display weight (§3.1.5); Japanese phrase breaks (§3.2.11) |
| `orbit` | night | en, ja | en, ja | upright Japanese italics (§3.1.3); the readout table's Japanese in the Mincho (§3.1.4); Latin at 92 % (§3.2.12) |
| `statement` | paper | en, ja | ja | the wordmark on one line and one setting (§3.3.13); the counts line; upright Japanese |
| `home-statement` | paper | en | | the counts line kept phrase by phrase |
| `process` | night | vi | | the tone marks clear of each other (§3.1.6) |
| `entry-lines` | paper | | en | `116 s`, `11:58 PM UTC` and the parentheses kept whole (§3.2.9) |
| `colophon` | paper | | en | `3,456 × 2,234 px` kept on one line |

The after captures were taken with the complete Literata: the wordmark, the eyebrows and the strip's
state are true small capitals, and the statement's prose has old-style figures.
