# Media and indexer integration

This records the implemented frontend adapter and read-only inspection of the existing Go service on October 22, 2026. No generator, Go service, contract, or hosted media was changed for this work.

## Implemented frontend boundary

- `src/lib/art/server.ts` exposes server-only `getCollection({ offset, limit, query, includeMedia })` and `getArtwork(id)`. Collection callers can opt into `includeMedia: true` so genuine Ink media can lead the full catalogue, not only the local selection. The default remains a lightweight identity read for other callers.
- `getArtworkHistory(id, { transferCursor, nameCursor, limit })` reads the two deployed, token-scoped V2 history streams. Each stream exposes its own `items`, `cursor`, `nextCursor`, `status`, and source URL. The default is 12 events per stream, capped at 50 per read; follow each opaque continuation to explore its older events. These are separate newest-first streams, not a partially merged timeline pretending to show a complete chronology.
- `getArtworkDetails(id, expectedSeed)` reads published ERC-721 rendering metadata. Both token ID and seed must agree with the requested work. Supported text traits are bounded; numeric traits must be safe integers within their stated domain. Duplicate recognized traits are omitted as ambiguous. Available, valid-but-unenriched, and unavailable metadata remain distinct states. These optional reads stream separately from the viewing room and history.
- `src/lib/art/index.ts` exposes client-safe types, `curatedArtworks`, `getCuratedArtwork`, and `getInterpretation`.
- The configured source is `https://a1.cosmicsignature.com`. Requests have a five-second abort deadline, reject redirects, and accept at most 2 MiB of JSON. Public record reads revalidate after 60 seconds; media manifests after 300 seconds. These are indexed reads, never transaction-authoritative ownership or auction state.
- Collection pagination requests one additional record to establish `hasMore`. The upstream legacy list has no total, so `total` remains `null`; the frontend must not infer a total from the highest token ID or from the archive size. Offset pagination may move while new tokens arrive. A refreshed first page is the way to discover newly indexed works.
- Numeric search uses the individual token endpoint. Name search uses the indexer's global name-search endpoint, rather than filtering only the displayed page. Upstream failure is explicit; a limited local selection is never labelled the complete collection.
- An explicit record-not-found response is different from an outage. Invalid IDs do not cause a request. An unknown token during an outage is `unavailable`, not a false 404.

## Existing endpoints and observed behavior

| Endpoint                                                                        | Existing contract                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/api/cosmicgame/cst/list/all/{offset}/{limit}`                                 | `{status, CosmicSignatureTokenList, Offset, Limit}`; newest mint first; no total                         |
| `/api/cosmicgame/cst/info/{id}`                                                 | `{status, TokenInfo}`; transaction nested in `Tx`; indexed custody and, in detail, anchoring participant |
| `/api/cosmicgame/cst/names/search/{name}`                                       | Global token-name matches in `TokenNameSearchResults`                                                    |
| `/metadata/{id}`                                                                | ERC-721 metadata with token/seed information and manifest link; excludes changing ownership deliberately |
| `/images/new/cosmicsignature/0x{seed}/metadata/assets.json`                     | Version-2 package manifest, roles, paths, dimensions, durations and declared hashes                      |
| `/api/v2/cosmicgame/cosmic-signature-tokens?limit=…&cursor=…`                   | Deployed typed cursor endpoint; `data` and `meta.nextCursor`, with optional `name` or `named` filtering  |
| `/api/v2/cosmicgame/cosmic-signature-tokens/{id}/transfers?limit=…&cursor=…`    | Deployed ERC-721 transfer history, including the mint; token-scoped opaque continuation                  |
| `/api/v2/cosmicgame/cosmic-signature-tokens/{id}/name-history?limit=…&cursor=…` | Deployed naming history, including name-clearing events and the wallet that performed the rename         |

The legacy list was checked with a small page and returned tokens 71, 70 and 69. The typed v2 route also returned 71 and 70 with a continuation cursor. These observations do **not** establish a live total. Two larger list requests timed out. Individual detail reads succeeded for eleven of the fifteen archived works; the remaining four use the existing frontend's documented September 24 verification. Dates are preserved per record. The adapter does not make its build or normal render depend on a successful full-collection download.

A subsequent bounded traversal on October 22 verified four pages of 18 records: 71–54, 53–36, 35–18 and 17–0, followed by an empty page at offset 72. All 72 observed tokens were distinct and reachable. This is a point-in-time verification, not a hardcoded count or upper bound. The collection page now presents the complete catalogue before the optional Atlas view; it needs neither a Go change nor a frontend deployment to expose subsequently indexed works.

## Published composition details

Metadata for tokens 23, 31 and 71 was checked against each record's token and seed. The supported characteristics are Structure, Palette, Spectral Class, Mass Balance, Fate, Chaos and Syzygies, plus simulation steps, integrator and braid crossings. Authored classification names are preserved verbatim; interface labels are translated in all eight locales. These are publisher-supplied rendering characteristics, not on-chain immutable traits or independently recomputed physical measurements. Chaos is a generator index on a 0–100 scale. A Fate classification such as “Eternal Dance” describes a finite simulation, not a proof of infinite orbital stability. No physical units, market values or rarity rankings are invented.

The gallery's record links original media rather than relabelling local delivery previews as original files. Light, Ink and the longer film studies remain expressions of the same NFT. A future renderer mode needs a matching typed media-registry entry; unsupported files do not become arbitrary executable or remote URLs.

The Go implementation is in `augur-explorer/internal/api/cosmicgame/api_cosmicgame.go`, `internal/store/cosmicgame/tokens-erc721.go`, and `internal/api/v2/global_directories.go`. Its v2 pagination uses token-ID cursors and is a stronger long-term fit for a growing catalogue than legacy offsets. A coordinated frontend migration can expose its opaque cursor directly; do not reconstruct or invent cursor values.

## Media integrity and interpretation identity

List rows provide identity and a known seed-derived Light URL. That URL is labelled `unverified` until an actual manifest advertises media; the adapter does not infer Ink availability from token age or guessed filenames. Detail pages load the token's actual manifest. Collection reads with `includeMedia: true` use the same loader, with at most six concurrent manifest requests and the same five-minute revalidation; only visible-page records are enriched, not the lookahead row or the entire collection. This does not require a separate token-detail request per card. A failed manifest preserves the known Light fallback and unknown Ink state. Only supported, exact role/path/kind combinations become media choices. Absolute URLs, traversal paths, duplicate ambiguous roles, and unsupported manifest versions cannot introduce arbitrary media.

The initial interpretation registry supports Light and Ink. Each carries its own still, thumbnail, source master and available films. Ink normal, medium and slow films are separate variants with their actual manifest durations. A still, a normal film and a long film are presentations of one token, not new tokens. Unknown future roles are not silently presented as established interpretations; add a typed registry entry when an authentic published package supports them.

The local archive contains fifteen tokens: 23, 31, 35, 2, 3, 7, 9, 11, 13, 14, 22, 25, 33, 39 and 40. Only 23, 31 and 35 include local Ink stills and local film deliveries. No stale owner, bidder or price is bundled. The stills are authentic copies or existing size derivatives; SHA-256 values and source addresses are in `curated-media.json`. Token seeds and stable historical fields are in `curated-records.json`.

The three local Ink video deliveries were previously downscaled/re-encoded without cropping, recoloring, reversing, retiming or interpolating motion. The original durations and exact display aspect ratios were retained. `concepts/passage-atlas-v2/assets/media-previews.json` preserves the source and delivery hashes and processing record. The public files use `/art/{id}-ink-preview.mp4`; this is a delivery variant, not a new canonical artwork. Public components must preserve the media's display ratio rather than deriving it from its rounded encoded pixel dimensions.

When live media is available, a local film may replace its larger original-web delivery only when **both** the published still hash and that exact film variant's source hash match the archived pair. A changed still cannot silently accompany an older film; a medium variant cannot receive the normal preview. The original source URL remains attached. A hash match identifies bytes against a declared manifest; it does not prove the rendering algorithm correct or establish that files stay publicly available.

The current manifests for token 31 advertise the Light/Ink stills whose hashes match the local copies and the original Ink film underlying its local delivery. Film and still identities were not substituted between tokens. No arbitrary unpublished 3D or synchronised film capability is advertised.

## Compact catalogue films

The collection's motion path is separate from `films`, which continues to represent complete viewing-room films. Optional `previewFilm` is attached only when a local registry entry matches the NFT's ID, seed, current published normal Ink film URL/hash and paired still hash. It must also meet strict duration, dimensions, byte-size and content-addressed filename bounds. A changed or unrecognized source receives a still, never the large original as an automatic substitute. See [collection preview delivery](collection-preview-delivery.md) for the distinction between publisher-declared original hashes and independently verified derivative hashes.

As of October 23, 2026, 71 of the 72 observed works have published Ink films and corresponding eight-second catalogue excerpts. Token 0 has no published Ink film and retains its available expression. The excerpts total 37,652,880 bytes; each is below 1 MiB. These are observed counts, not a future collection limit. New NFTs still enter the catalogue automatically; their compact excerpts require the offline publishing step until the upstream renderer advertises a supported preview role. The full originals remain separate and available in the viewing room.

The browser selects one visible excerpt per catalogue, waits for scrolling/intent to settle, and releases the previous source. It does not fetch all visible videos. Autoplay denial stops probing other films; explicit Pause then Resume can retry. Global pause, hidden documents, Save-Data and known slow effective connections suppress preview sources. Normal browser caching is safe because output URLs include their content hashes. Native navigation pairs the same token and expression; Light selection carries through to the destination and history pagination.

## Custody, availability and fallback UI

`owner` is explicitly indexed ERC-721 custody. When anchored, this may be the anchoring contract. The participant is shown separately only when the detail endpoint supplies a valid `StakedOwnerAddr`. Never label that address as an independently verified live `ownerOf()` result. A fallback record omits ownership entirely.

`source: 'curated-fallback'` and `scope: 'curated-selection'` require a visible localized explanation. A later unavailable collection page must not restart at the first fifteen archived works. Empty successful pages, missing tokens, unknown metadata, source outages and absent Ink are distinct states. `advertised` means listed in a fetched manifest, not independently decoded during that request. Browser media errors should retain access to the record and available alternatives.

## Historical records and their evidence

The deployed V2 history endpoints were checked on October 22, 2026. Token 23 returned a mint at block 473669120 and a later transfer at block 477268350; a one-event request supplied a continuation cursor. Its name history was an available, empty list. This is a point-in-time service observation, not an independent replay of all chain logs.

History validation checks the exact requested token, safe numeric identifiers, UTC/offset timestamps, transaction hashes, addresses, strictly decreasing event IDs, non-increasing block heights, page cardinality, and non-looping bounded cursors. Mint and burn classifications must agree with the zero-address endpoints. An invalid row rejects the affected stream in full; silently dropping it would make an incomplete history appear complete. Failure of the transfer stream does not hide an available naming stream, and vice versa. An outage never invents archived transfers or names. Empty successful history is distinct from an unavailable read.

The API's `eventLogId` is an **indexer database identifier**, not the Ethereum transaction's `logIndex`; do not construct a log-index explorer link from it. Explorer transaction links use only the validated transaction hash. The response currently supplies no block hash, log index, indexed-head watermark, confirmation count, or finality status. Display these records as indexed and allow inspection of their chain transactions; do not claim reorg immunity, finality, or independently verified live ownership.

A transfer does not establish a sale, payment amount, or beneficial-ownership change. Self-transfers remain transfers. No price is inferred. The naming endpoint supplies the newly recorded name, not the previous name; the frontend preserves the exact recorded string and treats an empty name as a clearing event, without manufacturing an old name from a partially loaded page. A historical transfer into an anchoring contract is still displayed as the recorded ERC-721 transfer unless an authenticated, token-scoped anchoring event proves a more specific label. Current indexed custody and an available anchoring participant are displayed separately.

`src/lib/art/request.ts` now provides one shared transport for catalogue, detail, metadata, and history reads: fixed HTTPS origin, no redirect or URL credentials, bounded response bytes, valid UTF-8, and a deadline that includes the response body. It also bounds a stalled custom fetch implementation, rather than relying only on that implementation honoring its abort signal.

## Proposed Go integration work; not implemented here

1. Add bulk per-token media summaries to the cursor directory or a bounded batch endpoint. The collection could then show actual available interpretations without one manifest request per card. Include package/version identity and observed availability, without equating ingestion with permanent hosting.
2. Expose indexed block/observation context alongside collection and ownership reads so clients can show indexing lag. Continue using chain reads for financial actions.
3. Keep generator facts in the generator and chain facts in the indexer. Add future auction provenance from authenticated auction events, with idempotent/reorg-safe indexing; never infer sale status from transferred custody alone.
4. Preserve historical media versions and distinguish immutable commitments from mutable metadata URLs. Add an explicit official-package policy before selecting among regenerations.
5. Keep `total` optional unless the endpoint supplies an exact count with defined filter and snapshot semantics. Never send the maximum token ID as a count.
6. Enrich token history responses with chain log index, block hash, indexed-head/finality context and an explicitly documented reorg policy. A future combined token-history resource should paginate a stable total order across transfer, naming, authenticated anchoring, and auction events. Existing independent transfer/name cursor endpoints already work and do not need a Go change to support the current gallery. A token-scoped anchoring history would avoid fetching broad wallet/global event streams just to reconstruct one work's custody story.

## Visual material measurement

A decoded 20×20 upper-left patch of all three local Ink films at nine seconds measured RGB(241, 235, 223), `#f1ebdf`. The paired stills varied slightly: token 23 `#f1eadf`, tokens 31/35 `#f2ebdf`. `#f1ebdf` is a useful film-led page ground, not a reason to recolor source artwork. Sampling did not alter any asset.

## Verification

Adapter tests cover actual pagination semantics, token zero, partial rows, malformed envelopes, request bounds, aborts, explicit not-found versus outage, absent ownership in fallback, and indexed custody versus participant. Media tests cover role/path validation, unsupported/ambiguous manifests, exact rendition matching and cross-variant substitution prevention. They use mocked service responses; they do not claim that a hosted service is always available.

History tests additionally cover independent cursors, empty versus unavailable streams, malformed or mixed-token records, non-sale transfer classification, clear-name events, invalid dates and addresses, duplicate/out-of-order identities, continuation loops, strict size/deadline enforcement through streamed bodies, and property-based rejection of another token's events. No changes were made to the Go service.
