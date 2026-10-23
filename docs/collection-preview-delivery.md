# Collection film delivery

The catalogue uses small, silent excerpts of the published Ink films. They are delivery
derivatives of the actual artwork, not regenerated simulations. A preview shows seconds
6–14 at the original playback speed. The longer original films remain available in each
artwork's viewing room.

## Rebuilding

Run from the art repository with Node.js and `ffmpeg` / `ffprobe` on `PATH`:

```sh
node scripts/build-collection-previews.mjs
```

To retry or inspect individual indexed works:

```sh
node scripts/build-collection-previews.mjs 71 70
```

The script reads the current public collection index, then each token's published
`metadata/assets.json`. It accepts only the expected schema-2 `ember_web` MP4 and
`ember_web_full` still paths under that token's seed package. An artwork without an
advertised Ink film receives no invented preview. Rerunning discovers newly indexed
tokens and skips existing outputs only after checking their file size and SHA-256.

There are at most two encoders. Each has a 120-second wall limit. Manifest responses are
limited to 2 MiB and time out after 15 seconds. The encoder reads through a temporary,
loopback-only byte-range relay whose upstream is fixed to `a1.cosmicsignature.com`.
The relay rejects redirects, non-206 responses, a changed object size or validator, and
requests outside its single known source path. Strong ETags use `If-Match`; otherwise
`Last-Modified` is sent as `If-Unmodified-Since` when available. It caps the aggregate
source bytes per work at the smaller of 96 MiB or 90% of the declared original size.
Originals are not downloaded in full or saved to disk. Failed encodes leave no published
preview or partial media file.

The current profile is 640 pixels wide, 30 frames per second, H.264/YUV420P, CRF 29 with
an 850 kbit/s maximum rate and MP4 fast start. The encoder explicitly preserves the
original display aspect ratio, including the sample aspect needed after rounding to
even pixel dimensions. It does not crop, stretch, recolor, reverse, or speed up the film.
Only sources declaring sRGB and YUV420P are accepted for this color-preserving profile.
Each output is checked with `ffprobe` for codec, duration, frame rate, and display aspect,
then rejected if it exceeds 2 MiB. The intended size is below 1 MiB per eight-second film.

## Manifest and integrity

Outputs live at `/art/previews/{tokenId}-{outputSha256Prefix}.mp4`. Their URLs change with
their bytes. Completed files and the JSON registry are published by atomic filesystem
renames; a lock prevents concurrent builders from overwriting registry updates.

`src/lib/art/collection-previews.json` records the token, seed, original film URL,
publisher-declared original film hash, publisher-declared still hash, verified derivative
hash, byte size, dimensions, duration, source duration, and excerpt start time.

**The original film's `sourceSha256` is the publisher's declaration.** Reading an excerpt
cannot independently verify a hash of the complete original. The derivative's `sha256`
is independently computed over its complete output file. The range relay's size and
HTTP validators reduce accidental source changes during ingestion but do not turn the
publisher's assertion into independently verified source provenance.

The frontend attaches a preview only while its token, seed, source URL, source hash, and
still hash match the current validated published manifest. A changed source therefore
falls back to a still until its delivery derivative is rebuilt. These records do not
claim immutable hosting or verify the underlying simulation algorithm.

## Production follow-up

This is an offline publishing step, never a request-time encoder or a browser download
of the large original. For continuous ingestion, the existing media publisher should
produce and advertise a dedicated small-film preview asset with its own dimensions,
duration, byte size, content hash, and original-source relationship. The art repository
can then consume that validated role directly. No Go code or deployed service was
modified for this delivery pass.
