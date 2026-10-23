# Implementation and validation — October 22, 2026

The gallery and V4 auction implementation are built locally. They are not deployed, and no production transaction or remote push was performed. This document separates implemented behavior, verification evidence, and release work.

## Delivered application

The standalone Next.js 16 / React 19 / Tailwind CSS 4 application includes the Ink-first Passage, cinematic material switching, a responsive moving Atlas, complete paginated collection discovery, individual viewing rooms, recorded films and stills, comparison, full viewing, process pages, auction discovery and transaction panels, terms, privacy, metadata and crawler links. All eight ecosystem languages are included with independent catalogs.

The paper color was sampled from the actual films: `#f1ebdf`. The artwork itself is not recolored or cropped. Fifteen preserved artwork records carry source hashes; three have authentic local Ink-film derivatives. Live manifests enrich collection pages with bounded concurrency, and the grid streams separately so discovery does not delay the Atlas. Published roles and variant identity determine available media.

Motion respects reduced-motion preferences and an explicit pause control. Hidden/offscreen films pause; static cards do not load film assets. Self-hosted fonts avoid third-party font requests. The gallery has no wallet provider stack; the financial client is loaded only in the auction area.

Auction lots come directly from bounded, same-block contract reads. Media is loaded independently and cannot remove a lot or prevent its dedicated auction route from opening. Exact wei math, frozen bid review, code-hash/destination checks, fresh-block checks, simulation, preferred-account/network rechecks and confirmed-transaction verification protect the client boundary. Receipts that cannot be established are not reported as success.

## Delivered V4 contracts

The Solidity checkout is on `codex/v4-art-auctions`, derived from the verified V3 deployment branch at `37fdc5e01fee9b4a1ef59fff35726d96775b3680`.

V4 preserves existing allocations and CST issuance, adds a separate eight-NFT batch, and registers it atomically with one immutable auction. The new pointer consumes storage slot 314 and shrinks the final gap. `initializeV4(address)` preserves configured economics and requires the owner, initialized V3 state, an inactive cycle, and matching game/NFT identities. The supported upgrade is atomic `upgradeToAndCall`; the legacy task rejects short and fully qualified V4 names before using credentials.

Auction rules match the decision register: seven-day eligibility, first-bid 48-hour duration, 0.00001 ETH opening minimum, 10% raises rounded upward, direct funded offers, delta-only self-raises, and uncapped ten-minute extensions. Refunds, settlement, NFT receipt and forwarding are independent actions. The fixed game receives only finalized winning payments through `donateEth()`. No operator can cancel lots, change terms, redirect liabilities, override winners, or anchor escrowed inventory.

## Initial implementation verification evidence

| Boundary | Result |
| --- | --- |
| Production application build | Passed; all locales and dynamic routes compiled |
| TypeScript, ESLint, formatting | Passed |
| Dependency audit | Zero known vulnerabilities in the installed frontend dependency graph |
| Frontend unit/component/property suites | 167 tests passed; the separately enabled real-chain test is skipped by ordinary unit runs |
| Amount properties | 2,500 deterministic cases covering integer increments, funding conservation and decimal/wei round-trips |
| Browser matrix | 318 cases passed in Chromium and WebKit: desktop, mobile and reduced-motion profiles |
| Automated accessibility | 240 axe scans within that matrix: eight locales, five routes, six profiles |
| Visual evidence | Preserved screenshots in `docs/screenshots/`; actual Ink assets loaded for all 18 first-page collection cards |
| Financial client integration | Real local-chain journey passed twice, including seven successful frontend-submitted transactions and expected failure paths |
| Solidity regression suite | 199 tests passed in each of four preprocessing/assertion configurations: 796 executions |
| Auction stateful model | Four seeded campaigns, 720 randomized actions, checking per-lot state and accounting after each action |
| Foundry fuzzing | Three properties with 1,024 cases each: 3,072 cases passed |
| Foundry invariants | 128 sequences of depth 128: 16,384 handler calls, zero handler reverts, custody/liability/cash invariants preserved |
| Credential and deployment-tool guards | 29 tests passed, including RPC credential-redaction failures and both V4 artifact-name forms |
| Deployed V3 upgrade rehearsal | Passed against pinned real state and verified implementation runtime, through issuance, sale, forwarding and delivery |
| Cross-review | Auction and V4 code reviewed by different implementers; the legacy fully qualified-name bypass was found, fixed and regression-tested |

Counts describe separate suites and repeated configurations; they must not be summed into a claimed count of unique bugs or unique scenarios. Invariant handler calls can deliberately be no-ops when workflow preconditions do not hold. Passing tests and automated accessibility scans are not proofs of complete correctness or accessibility.

Frontend V8 line coverage is 78.69% across instrumented application files. Exact amount rules are fully covered; the financial client is 96.62%, and the wallet panel is 91.22%. CI enforces explicit coverage floors for the critical financial and media boundaries. Presentation interactions are additionally exercised in the browser matrix.

Foundry coverage ran but emitted source-map anchor warnings with both IR and non-IR compilation; its percentages are not accepted as reliable coverage evidence. The targeted Solidity lint run reported zero errors and four nonblocking declaration-order warnings. The required Hardhat quick script's macOS shebang was unavailable, so its identical four-mode body was run through Bash; the JSON contract report records the exact command.

The actual-state fork uses Ethereum EDR with the repository's local ArbSys/ArbGasInfo substitutes at Arbitrum precompile addresses. State and V3 runtime are real; entropy and native-precompile gas are not reproduced exactly. Measured V4 finalization used 5,954,260 local execution gas, excluding Arbitrum L1 data fees. This is not a worst-case bound for arbitrary owner-configured counts.

See the contracts repository's `docs/v4-art-auction-verification.json` and `docs/v4-art-auction-upgrade.md`, plus [the financial client review](auction-frontend-review.md), for detailed evidence and reproduction steps.

## Release work

- Obtain independent security review of the exact V4 and immutable auction release. Internal cross-review is not an external audit.
- Select the first enabled cycle and perform the separately authorized atomic upgrade during an inactive interval. Rehearse against the then-current deployed state and actual configuration.
- Verify and publish the deployed addresses, exact runtime hash, source revision, and initial settings before configuring the gallery's live transaction UI.
- Complete real browser-extension/hardware-wallet compatibility testing against the chosen release environment. Current wallet-panel tests use an injected provider; the contract/client rehearsal uses a disposable local chain.
- Fund and operate rendering, preservation, indexing, RPC and permissionless settlement/forwarding separately. Final winning payments are not reduced by an operating fee.
- Confirm renderer revision/manifest authentication and durable media preservation. Existing NFT metadata and game upgrade powers remain disclosed dependencies.
- Apply the [Go integration notes](media-and-indexer-integration.md) in its own reviewed branch when authorized. No Go or renderer source was changed here.

The Next.js project includes a pinned-action CI workflow. The Solidity branch includes its own quick-regression and pinned-Foundry workflow. Neither workflow has run remotely because nothing was pushed.

## Follow-up review and fixes

The subsequent review rebuilt the Process page as two coherent gallery spaces: a black Light room, including matching navigation chrome and authentic Light playback, followed by an Ink room on the media's warm paper ground. Original artwork pixels are preserved. The interface returns to its normal theme when leaving the page. The page has dedicated responsive, media-identity, color-matching and navigation regressions.

Concrete issues fixed:

- A payment review, snapshot or pending UI callback could survive navigation to another NFT. Lot sessions are now isolated; wallet disconnect/reconnection and newly closed auctions invalidate stale reviews.
- Auction listing prices and phases could remain stale indefinitely. Financial reads now refresh independently of media, hide stale/failed quotes, and ignore obsolete pagination responses while preserving recovery navigation.
- Offscreen video remounts lost playback position; interrupted replay transitions could stall; ended, blocked or failed films could expose ineffective controls. Media sessions now preserve position, resume their replay phase and support explicit retry. Enlarged films suspend in hidden tabs.
- Collection cards ignored manifest thumbnails and downloaded full-resolution Ink images. Matching thumbnails now load first, with canonical fallback. Previously timing-out card checks completed in approximately 1.6–1.7 seconds after the fix; this observation is not a universal performance guarantee.
- Token-specific social previews incorrectly reused Signature 23. Both artwork and auction pages now use the requested token's own media, or omit the preview during an outage.
- Auction-page rendering unnecessarily waited for artwork data. The media child now streams independently of the financial panel, including when the media lookup never resolves.
- Oversized upstream response bodies were rejected without canceling the remaining stream. They are now canceled immediately.
- Clean Solidity CI runners lacked the required native compiler. CI now installs the checksum-pinned native binary.

Final frontend checks: **201 unit/component/property tests passed**, **378 browser cases passed** (324 Chromium/WebKit plus 54 Firefox), TypeScript, ESLint, formatting, production build and full npm audit passed. The browser total includes **280 automated axe scans** across eight languages, five routes and seven profiles. Global frontend V8 line coverage is **88.63%**; it is supplementary evidence, not proof of correctness. The separately enabled real-chain fixture also passed after the compiler migration, with seven actual local transactions and expected failure paths. No real browser wallet or production funds were used.

The user approved migrating the undeployed V4 build to **Solidity 0.8.38**, conditional on leaving deployed contracts untouched. The older optimizer reproduced upstream **SOL-2026-7** under the project's build settings; no Cosmic Signature exploit was demonstrated. The new compiler fixes that reproducer. Exact local compiler pins/pragmas were migrated, historical deployed V3 source/runtime evidence was preserved, and the new compiler passed **801 Hardhat test executions**, **3,072 fuzz cases**, **16,384 invariant handler calls**, a compiler regression, **29 credential tests**, and a new pinned-state fork upgrade/auction rehearsal. The frontend ABI is unchanged. The candidate V4/auction runtimes are **21,951 / 4,748 bytes**. Fork precompile/gas limitations described above still apply.

Compatible Solidity-tool dependency updates removed the critical Handlebars advisory and reduced the audit from **80 affected package entries (1 critical, 32 high)** to **57 (0 critical, 17 high)**. Two exact consumer pins receive documented same-major overrides. Remaining findings and their actual paths are listed in the contracts README; some require separately reviewed framework/dependency migrations and one dependency has no published fix. None of the vulnerable nested OpenZeppelin 4.x copies enters the generated production compiler input. This distinction does not make the tooling audit clean or prove developer tooling safe.

Current Solidity evidence is in `docs/v4-art-auction-verification.json.approvedCompilerMigration` in the contracts repository. Historical 0.8.34 results are retained separately. No deployed contracts, proxy implementation, ownership or configuration were changed. No remote push or deployment was performed.
