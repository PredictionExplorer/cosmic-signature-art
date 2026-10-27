# Plate derivatives

The venue authors four kinds of local derivative from the publisher's files, offline, so the
plates can rest, move and magnify without fetching a 100 MB film or a 36 MB master. Every
derivative is cut from a hash-verified published source, recorded with that source's hash,
published under a content-addressed name, and bound to an interpretation at read time only
when token, seed and hashes all agree. No pixel is tinted, cropped, filtered or re-timed;
the published files themselves are never written.

| Derivative                                                                  | Script                                          | Registry                               | Files                  |
| --------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------- | ---------------------- |
| Catalogue excerpt, 8 s at 640 px, 30 fps (seconds 6–14 of the Ink film)     | `scripts/build-collection-previews.mjs`         | `src/lib/art/collection-previews.json` | `public/art/previews/` |
| Settling clip, the final 480 frames at 1280 × 828, 60 fps, both expressions | `scripts/build-plate-clips.mjs`                 | `src/lib/art/plate-clips.json`         | `public/art/clips/`    |
| Opening clip, the first 600 frames at 1280 × 828, 60 fps, hero works only   | `scripts/build-plate-clips.mjs --opening <ids>` | `src/lib/art/plate-clips.json`         | `public/art/clips/`    |
| Still ladder, 1280 × 828 and 1920 × 1242 WebP from the 16-bit master        | `scripts/build-still-ladder.mjs`                | `src/lib/art/still-ladder.json`        | `public/art/stills/`   |
| Plate records: ground tone, edge flag, weighted centre, detail windows      | `scripts/build-plate-records.mjs`               | `src/lib/art/plate-records.json`       | —                      |

`scripts/lib/origin.mjs` is what they share: the one origin, bounded JSON reads with
Retry-After backoff, the token list, manifest validation, the byte-range relay FFmpeg reads
through (so it can never follow a redirect or pull a whole original), a verified asset cache
under `.cache/art/` (gitignored), content-addressed publication, atomic registry writes under
a lock. `scripts/lib/raster.mjs` decodes rasters without colour management and compares them.

```sh
npm run art:clips                      # settling clips for every indexed work, both expressions
npm run art:clips -- --opening 23 31 35 # opening clips for the works the home may open on
npm run art:ladder                      # 1280 and 1920 rungs for every work
npm run art:plates                      # plate records for every work
npm run test:scripts                    # the pipelines' unit tests
```

A full run removes orphaned files that no registry entry names. A run for named tokens merges
into the registry. Unchanged outputs are verified and kept, so reruns are byte-identical.

## What is proved before a file is published

**A settling clip ends on the still.** The cut is frame-exact: the first frame is
`sourceFrames − 480`, sought half a frame early so no float can drop it, and `-frames:v 480`
ends on the film's last frame. Then the clip's last frame is decoded and compared with the
published still at 320 × 207: it must depart by at most a mean of 6 (of 255) with at most
0.5 % of channel samples off by more than 48. On 031 the match is 2.96 / 0 % for Ink and
0.87 / 0 % for Light; a frame half a second earlier measures 16 / 9.7 %, so the test tells
the still from the film before it. The reader (`plate-clips.ts`) re-checks the recorded match
and the clip's end time, and attaches `settlingFilm` only when both hold.

**A rung is both faithful and consistent.** Each rung is cut from the master with a
Lanczos-3 kernel and encoded as WebP at quality 92 with `smartSubsample`. Before publication
it is decoded and compared with the master's own downsample at the rung's size (mean ≤ 3; 031
measures 1.58 and 0.58), and the master's 64 px downsample is compared with the published
still's (mean ≤ 4; 031 measures 1.9 and 1.0). The second check is the colour question made
operational: the Light masters carry Display P3 chromaticities (`cHRM 0.68 0.32 / 0.265 0.69
/ 0.15 0.06`) and no profile, while the Ink masters are tagged sRGB; the publisher's own WebP
derivatives pass the raw values through, and so does this ladder. A master that disagreed
with its published still would stop the ladder, not be reinterpreted.

**Plate records are keyed to the still.** Tone and edge as in Phase 0; the weighted centre is
the centroid of darkness against the sheet's own tone (Ink) or of luminance (Light); the
detail windows are the heaviest 1152 × 736 px windows on a 32 px grid, at most three, none
overlapping another by more than a tenth, each holding at least 4 % of the expression's
weight. `getPlateGround(id, expression, stillSha256)` returns nothing for any other still.

## Departures from the plan

- Lossy WebP cannot be 4:4:4. The vision asked for 4:4:4 WebP or 10-bit AVIF; AVIF at
  4:4:4 was measured (half the bytes, a little less faithful at the quality tried) and WebP
  q92 with `smartSubsample` was kept because it matches the publisher's own derivative format
  and decodes everywhere the plates are shown. The measured fidelity is in every registry entry.
- Settling clips are constant-quality encodes (CRF 26 for the sumi sheet, 22 for the ribbons
  on black) rather than a fixed bitrate, so a dense sheet keeps its grain and a sparse field
  costs almost nothing. The dense 031 Ink clip is 4.3 MB; the Light clips are under 400 KB.
- The home's pool is no longer a hand-written list. `DAY_WORK_POOL` is derived from the works
  whose complete 1280 px film is held locally and whose opening clip is published, so it
  widens by itself when those derivatives are cut for more works.
