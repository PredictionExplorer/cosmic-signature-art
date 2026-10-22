# Media and indexer integration

This records the implemented frontend adapter and read-only inspection of the existing Go service on October 22, 2026. No generator, Go service, contract, or hosted media was changed for this work.

## Implemented frontend boundary

- `src/lib/art/server.ts` exposes server-only `getCollection({ offset, limit, query, includeMedia })` and `getArtwork(id)`. Collection callers can opt into `includeMedia: true` so genuine Ink media can lead the full catalogue, not only the local selection. The default remains a lightweight identity read for other callers.
- `src/lib/art/index.ts` exposes client-safe types, `curatedArtworks`, `getCuratedArtwork`, and `getInterpretation`.
- The configured source is `https://a1.cosmicsignature.com`. Requests have a five-second abort deadline, reject redirects, and accept at most 2 MiB of JSON. Public record reads revalidate after 60 seconds; media manifests after 300 seconds. These are indexed reads, never transaction-authoritative ownership or auction state.
- Collection pagination requests one additional record to establish `hasMore`. The upstream legacy list has no total, so `total` remains `null`; the frontend must not infer a total from the highest token ID or from the archive size. Offset pagination may move while new tokens arrive. A refreshed first page is the way to discover newly indexed works.
- Numeric search uses the individual token endpoint. Name search uses the indexer's global name-search endpoint, rather than filtering only the displayed page. Upstream failure is explicit; a limited local selection is never labelled the complete collection.
- An explicit record-not-found response is different from an outage. Invalid IDs do not cause a request. An unknown token during an outage is `unavailable`, not a false 404.

## Existing endpoints and observed behavior

| Endpoint                                                      | Existing contract                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/api/cosmicgame/cst/list/all/{offset}/{limit}`               | `{status, CosmicSignatureTokenList, Offset, Limit}`; newest mint first; no total                         |
| `/api/cosmicgame/cst/info/{id}`                               | `{status, TokenInfo}`; transaction nested in `Tx`; indexed custody and, in detail, anchoring participant |
| `/api/cosmicgame/cst/names/search/{name}`                     | Global token-name matches in `TokenNameSearchResults`                                                    |
| `/metadata/{id}`                                              | ERC-721 metadata with token/seed information and manifest link; excludes changing ownership deliberately |
| `/images/new/cosmicsignature/0x{seed}/metadata/assets.json`   | Version-2 package manifest, roles, paths, dimensions, durations and declared hashes                      |
| `/api/v2/cosmicgame/cosmic-signature-tokens?limit=…&cursor=…` | Deployed typed cursor endpoint; `data` and `meta.nextCursor`, with optional `name` or `named` filtering  |

The legacy list was checked with a small page and returned tokens 71, 70 and 69. The typed v2 route also returned 71 and 70 with a continuation cursor. These observations do **not** establish a live total. Two larger list requests timed out. Individual detail reads succeeded for eleven of the fifteen archived works; the remaining four use the existing frontend's documented September 24 verification. Dates are preserved per record. The adapter does not make its build or normal render depend on a successful full-collection download.

The Go implementation is in `augur-explorer/internal/api/cosmicgame/api_cosmicgame.go`, `internal/store/cosmicgame/tokens-erc721.go`, and `internal/api/v2/global_directories.go`. Its v2 pagination uses token-ID cursors and is a stronger long-term fit for a growing catalogue than legacy offsets. A coordinated frontend migration can expose its opaque cursor directly; do not reconstruct or invent cursor values.

## Media integrity and interpretation identity

List rows provide identity and a known seed-derived Light URL. That URL is labelled `unverified` until an actual manifest advertises media; the adapter does not infer Ink availability from token age or guessed filenames. Detail pages load the token's actual manifest. Collection reads with `includeMedia: true` use the same loader, with at most six concurrent manifest requests and the same five-minute revalidation; only visible-page records are enriched, not the lookahead row or the entire collection. This does not require a separate token-detail request per card. A failed manifest preserves the known Light fallback and unknown Ink state. Only supported, exact role/path/kind combinations become media choices. Absolute URLs, traversal paths, duplicate ambiguous roles, and unsupported manifest versions cannot introduce arbitrary media.

The initial interpretation registry supports Light and Ink. Each carries its own still, thumbnail, source master and available films. Ink normal, medium and slow films are separate variants with their actual manifest durations. A still, a normal film and a long film are presentations of one token, not new tokens. Unknown future roles are not silently presented as established interpretations; add a typed registry entry when an authentic published package supports them.

The local archive contains fifteen tokens: 23, 31, 35, 2, 3, 7, 9, 11, 13, 14, 22, 25, 33, 39 and 40. Only 23, 31 and 35 include local Ink stills and local film deliveries. No stale owner, bidder or price is bundled. The stills are authentic copies or existing size derivatives; SHA-256 values and source addresses are in `curated-media.json`. Token seeds and stable historical fields are in `curated-records.json`.

The three local Ink video deliveries were previously downscaled/re-encoded without cropping, recoloring, reversing, retiming or interpolating motion. The original durations and exact display aspect ratios were retained. `concepts/passage-atlas-v2/assets/media-previews.json` preserves the source and delivery hashes and processing record. The public files use `/art/{id}-ink-preview.mp4`; this is a delivery variant, not a new canonical artwork. Public components must preserve the media's display ratio rather than deriving it from its rounded encoded pixel dimensions.

When live media is available, a local film may replace its larger original-web delivery only when **both** the published still hash and that exact film variant's source hash match the archived pair. A changed still cannot silently accompany an older film; a medium variant cannot receive the normal preview. The original source URL remains attached. A hash match identifies bytes against a declared manifest; it does not prove the rendering algorithm correct or establish that files stay publicly available.

The current manifests for token 31 advertise the Light/Ink stills whose hashes match the local copies and the original Ink film underlying its local delivery. Film and still identities were not substituted between tokens. No arbitrary unpublished 3D or synchronised film capability is advertised.

## Custody, availability and fallback UI

`owner` is explicitly indexed ERC-721 custody. When anchored, this may be the anchoring contract. The participant is shown separately only when the detail endpoint supplies a valid `StakedOwnerAddr`. Never label that address as an independently verified live `ownerOf()` result. A fallback record omits ownership entirely.

`source: 'curated-fallback'` and `scope: 'curated-selection'` require a visible localized explanation. A later unavailable collection page must not restart at the first fifteen archived works. Empty successful pages, missing tokens, unknown metadata, source outages and absent Ink are distinct states. `advertised` means listed in a fetched manifest, not independently decoded during that request. Browser media errors should retain access to the record and available alternatives.

## Proposed Go integration work; not implemented here

1. Add bulk per-token media summaries to the cursor directory or a bounded batch endpoint. The collection could then show actual available interpretations without one manifest request per card. Include package/version identity and observed availability, without equating ingestion with permanent hosting.
2. Expose indexed block/observation context alongside collection and ownership reads so clients can show indexing lag. Continue using chain reads for financial actions.
3. Keep generator facts in the generator and chain facts in the indexer. Add future auction provenance from authenticated auction events, with idempotent/reorg-safe indexing; never infer sale status from transferred custody alone.
4. Preserve historical media versions and distinguish immutable commitments from mutable metadata URLs. Add an explicit official-package policy before selecting among regenerations.
5. Keep `total` optional unless the endpoint supplies an exact count with defined filter and snapshot semantics. Never send the maximum token ID as a count.

## Visual material measurement

A decoded 20×20 upper-left patch of all three local Ink films at nine seconds measured RGB(241, 235, 223), `#f1ebdf`. The paired stills varied slightly: token 23 `#f1eadf`, tokens 31/35 `#f2ebdf`. `#f1ebdf` is a useful film-led page ground, not a reason to recolor source artwork. Sampling did not alter any asset.

## Verification

Adapter tests cover actual pagination semantics, token zero, partial rows, malformed envelopes, request bounds, aborts, explicit not-found versus outage, absent ownership in fallback, and indexed custody versus participant. Media tests cover role/path validation, unsupported/ambiguous manifests, exact rendition matching and cross-variant substitution prevention. They use mocked service responses; they do not claim that a hosted service is always available.
