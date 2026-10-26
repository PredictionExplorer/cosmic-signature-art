# The collection index

`src/lib/art/collection-index.json` is one build-time read of every published record:
identity (token, seed, cycle, mint date and transaction), the publisher's measurements
(dominant wavelength, chaos, syzygies, masses, eccentricity, body hues, the Borda selection,
the text traits) and the manifest facts for each expression (still, preview and film paths
with their published sizes and hashes). It lets the venue order the collection by real
measurements, hang the Index of numbers, open chapters by cycle with true counts and dates,
and render a first row of cards without 18 request-time manifest reads.

Everything in it is the publisher's own data, copied verbatim after validation. Nothing is
inferred or scored here; a work whose metadata lacks a field simply lacks it in the index,
and the Spectrum ordering shelves such works as "unmeasured".

## Rebuilding

```sh
npm run art:index
```

`scripts/build-collection-index.mjs` pages the public token list, then reads each token's
`/metadata/{id}` and its `assets.json` manifest with two concurrent readers and an
exponential backoff, because the origin answers bursts with 429. Every record must read
successfully or the file is not written; the registry is published by an atomic rename
under a lock, and an unchanged result keeps its `checkedOn` date so reruns are
byte-identical.

## Reading it

`src/lib/art/collection-index.ts` validates the file with zod (a malformed file is an
empty collection, never a partial one) and exposes:

- `collectionIndex`, `indexedWork(id)`, `indexedAssetUrl(work, path)`;
- `cycles()` — each cycle with its count, earliest mint and token ids;
- `spectrum()` — works ordered by published dominant wavelength, plus the unmeasured shelf;
- `spectralNeighbour(id, 'redder' | 'bluer')` — the next work along the spectrum;
- `compactWorks()` — the small per-work view (id, cycle, mint date, wavelength, preview
  URLs) a client sheet needs.

The full index is for server components. The compact view is what the layout hands the
Index sheet. The live indexer remains the source for ownership and custody; the index
carries no owner.
