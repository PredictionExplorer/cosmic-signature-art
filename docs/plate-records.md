# Plate records

Every Cosmic Signature was authored with its own wall built in: the Ink sheet's kozo tone and
the Light field's black. A plate record is an offline measurement of that ground for one
exact still, so the gallery can letterbox a plate in the sheet's own tone without a visible
edge, and can hang a deliberate hairline when the mark reaches the border.

The records live in `src/lib/art/plate-records.json` and are read through
`src/lib/art/plate-records.ts`. Nothing here alters a still; the script hashes and reads the
published derivatives in `public/art/` and writes only the JSON.

## What is measured

For each curated work in `src/lib/art/curated-media.json`, and for each of its expressions:

- The still's sha256 is verified against the curated record first. A still whose hash does
  not match is refused, never measured.
- `tone` is the mean colour of the still's outer 8 px border, as `#rrggbb`.
- `edge` is true when some border pixel departs from that mean by at least 64 luminance
  units (of 255): ink reaching the sheet edge on paper, or light reaching the edge on black.
  Paper grain and WebP ringing stay within a few units, so they never flip the flag.
- A Light still must measure exactly `#000000`; the script fails loudly otherwise, because a
  non-black field is a renderer or delivery change that needs a human look, not a record.

Measured on 26 October 2026, the curated Ink sheets read `#f0eade` (023), `#efe9dd` (031) and
`#ece6db` (035), each with ink at the edge; every curated Light field reads `#000000`.

## Regenerating

```sh
npm run art:plates
```

To re-measure particular works, pass token ids; other records are retained:

```sh
npm run art:plates -- 31 35
```

Re-running on unchanged stills produces a byte-identical file, including `measuredOn`.
`npm run test:plates` exercises the pure measurement helpers; `npm test` validates the
committed records against the curated hashes and seeds.

## Using a record

A ground applies only to the exact still it was measured from. `getPlateGround(id,
expression, stillSha256)` returns nothing unless the hash matches, so a work served from a
newer manifest falls back to the shared paper or black until it is measured again.
