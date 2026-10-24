**Auction frontend review and verification — October 22, 2026**

This record covers the auction amount helpers, deployment configuration, RPC client, transaction flow, and their integration with the wallet panel. It is an engineering review of the current implementation, not an independent audit or production deployment approval.

**Material findings addressed in the client**

| Finding | Implemented correction | Verification |
| --- | --- | --- |
| Matching game/NFT getters alone do not authenticate auction code | Arbitrum activation requires a well-formed expected runtime code hash, deployed bytecode, correct chain, and the fixed game/collection identities | Configuration mismatch unit tests |
| A newly completed RPC request can still return an old block | Reject block timestamps older than 120 seconds or over 30 seconds ahead; verify before and after snapshot reads and again before sending | Stale/future and delayed-read tests |
| A wallet may change while RPC reads and simulation await | Check chain and the wallet's preferred first account initially and immediately before the wallet transaction request | Initial/late account/network changes, including an old account that remains authorized |
| Losing leadership changes a reviewed self-raise delta into a full payment | Bid actions carry the reviewed funding amount; reject a mismatch without changing the entered bid or sending a transaction | Self-raise and intervening-outbid tests |
| A successful replacement receipt may represent wallet cancellation or another transaction | Accept only an identical action with gas-only replacement, track the accepted hash, and verify the confirmed transaction's sender, destination, calldata and ETH value | Cancellation, replacement, repricing and mismatched receipt tests |
| Receipt polling failure does not mean no transaction occurred | Preserve the submitted hash and report an unconfirmed outcome; do not automatically resubmit | Unknown outcome tests |

The configured address controls whether the live status panel is shown. A configured production address without a valid code hash fails closed with a configuration error; it does not silently display fictional inactive auction state. With no auction deployment configured, the website remains honestly inactive.

The expected hash must come from the reviewed deployment's actual runtime, including constructor-bound immutable addresses. Fetching an arbitrary contract's code and automatically accepting its hash would not establish that trust. Local chain 31337 is an explicit rehearsal exception to the production hash requirement, but still checks the fixed game/NFT identities; the integration fixture also supplies the actual runtime hash.

**Transaction boundaries**

All amounts remain bigint wei. The next bid is the smallest integer at least 110% of the current high bid. A direct offer remains the entered total; a current leader funds only its increase. Previously displaced credit is never implicitly reused.

The client encodes one request, simulates that exact sender/destination/calldata/value with eth_call, and sends the same request through the wallet. The chain may change after simulation; the contract then decides whether the submitted request is still valid. The client never raises a stale offer to make it pass.

A withdrawal or NFT claim uses the user's exact chosen recipient and carries no ETH. Zero and escrow-self destinations are rejected before simulation. The contract still enforces credit ownership, winner identity, and all other custody rules.

Reads for a snapshot use one explicit block number. The UI additionally ages that fetched snapshot and disables actions while data is unavailable/stale. Freshness checks are a conservative client guard, not a proof that the sequencer is available or an RPC is honest. An inaccurate device clock can cause safe refusal. Browser countdowns and artwork media do not authorize bids.

The dedicated auction route can display the on-chain panel without artwork media. Publishing failures must not add the readiness veto excluded by the approved design.

**Test evidence**

- Amount and client unit suites: 68 tests passed, including 2,500 deterministic property cases for integer increment inequalities, self-raise conservation, and exact uint256 decimal round-trips.
- Tests cover all client action types, unsafe input, deployment identity/code mismatch, stale and future blocks, wallet changes, racing minimum/funding changes, refunds and delivery destinations, transaction simulation failure, receipt reverts, cancellations, repricing, mismatched actions, and indeterminate receipt outcomes.
- Wallet panel: 18 interaction tests cover direct bids, frozen self-raise funding, account/chain changes, stale/failed reads, unknown transaction outcomes with preserved hashes, and valid/invalid claim and refund destinations. These exposed a real address-field bug: clearing the recipient immediately restored the connected account, preventing normal replacement typing. The panel now initializes a recipient on wallet connection/change and preserves an intentionally empty input for editing.
- Focused V8 coverage after these 86 tests: wallet panel 91.22% lines and 84.61% branches; financial client 96.62% lines and 95.29% branches. These figures apply to those tested files, not the entire application, and are not a correctness proof.
- Batch discovery reads all eight real lot records and their prices at the same verified block, with bounded RPC batching. It does not infer financial state from artwork metadata.
- A real local-chain client rehearsal is provided in `src/lib/auction/client.integration.test.ts`, gated by `ART_AUCTION_REHEARSAL_RPC`. It only accepts a disposable loopback chain with ID 31337. Execution status is recorded below when completed.

The local rehearsal uses the actual compiled production auction and NFT implementations, a test game receiver that distinguishes `donateEth()` from empty-calldata receive behavior, and the expected production game/NFT addresses on that disposable chain. It does not impersonate or modify production. It tests the exported frontend client against real JSON-RPC, including exact bidding, a self-raise, an intervening outbid, withdrawal to a chosen recipient, settlement, failed forwarding, independent delivery, and successful retry to the correct game endpoint. This is separate from the game-upgrade/storage/fork tests in the contracts repository.

**Local rehearsal status**

Passed twice on October 22, 2026 against a dedicated Hardhat node at 127.0.0.1:8547, including a rerun after preferred-account checks, eight-lot snapshots and HTTP batching were added: one complete real-contract journey, seven successful frontend-submitted transactions, expected failures before eligibility and during rejected funding, and a stale self-raise review rejected before submission. Final auction ETH balance and liabilities were zero; the test game received only the final winning price through its explicit donation endpoint. The test is intentionally skipped by ordinary unit runs when `ART_AUCTION_REHEARSAL_RPC` is absent.

Reproduce by starting a dedicated local Hardhat node from the contracts repository with `HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat node --hostname 127.0.0.1 --port 8547`, then running `ART_AUCTION_REHEARSAL_RPC=http://127.0.0.1:8547 npm test -- src/lib/auction/client.integration.test.ts` from this repository. The fixture resets that disposable node and controls the test clock to follow explicitly advanced chain time.

**Scope and remaining release evidence**

A successful receipt here means inclusion at the configured confirmation depth, not Ethereum L1 finality. The UI must keep transaction hashes visible for uncertain outcomes and refresh canonical contract state after receipt. The client does not prevent chain-level ordering or later reorganizations.

Injected-provider wallet-panel interaction tests are included; real browser-extension wallet compatibility and complete visual/accessibility journeys remain separate integration checks. Independent security review, production bytecode/configuration verification, the first enabled cycle, and explicit deployment authorization remain release prerequisites. No production transaction was submitted for this review.

**Follow-up review — October 22, 2026**

The second review found and corrected additional UI lifecycle defects:

- A reused auction component could retain another token's financial snapshot and open payment review after navigation while submission used the new token ID. Each token now owns a separate keyed session. Old RPC completions and transaction callbacks cannot update a newly opened lot; navigating requires a new wallet connection and review.
- Provider `disconnect` events did not clear the connected account or payment review. They now clear both, along with chain and recipient state. Explicit disconnect and reconnection also discard the previous account's snapshot.
- A review could remain confirmable after polling discovered that the sale had ended. Its validity now requires an open phase as well as unchanged funding. Contract simulation remains the final preflight check.
- Auction discovery originally read bids and phases only once. It now polls every 12 seconds while visible and refreshes on focus/visibility, with one request in flight. Failed or older-than-25-second snapshots no longer display financial figures; authenticated lot links remain available.
- Pagination could retain the preceding page's cards while loading, allow repeated forward clicks against its count, and strand navigation after an RPC failure. Results are now associated with their requested page, forward navigation waits for that result, stale responses are ignored, and backward navigation survives failures.
- Artwork requests have a separate lifecycle from financial polling, retaining the existing four-request concurrency limit and abort behavior. Price updates therefore cannot continually restart video/image metadata requests or wait for a media outage.

Focused verification after these changes: 29 wallet/discovery interaction tests and 68 financial client/amount tests passed. Eight new regression cases exercise cross-lot review isolation, late transaction callbacks, provider disconnect, a closing sale during review, visible/hidden polling, stale financial figures, failed-page recovery, and out-of-order page responses. ESLint passed for all four changed component/test files. This follow-up did not modify auction rules, deployed configuration, Solidity, or the transaction encoding and verification path, and submitted no production transaction.

**Solidity 0.8.38 integration rehearsal — October 22, 2026**

After the approved compiler migration, the real-contract frontend client fixture passed again against a newly started disposable node at `127.0.0.1:8547` (chain ID 31337). The auction, NFT, and test game receiver artifacts were copied to a temporary directory after independently checking that each referenced build-info file reported Solidity 0.8.38. The fixture read those fixed copies, so concurrent regression builds could not change its inputs. Starting the node and running the fixture did not compile or modify the Solidity repository's artifacts or cache. The owned node was stopped after verification.

The same full journey passed: seven successful frontend-submitted transactions covering direct bidding, a delta-funded self-raise, an intervening outbid, withdrawal to the chosen recipient, permissionless settlement, NFT delivery, and successful reserve funding. Attempts before eligibility and during rejected funding failed as expected; a stale self-raise review was rejected before submission. Final escrow liabilities and ETH balance were zero, and only the final winning payment reached the test game's `donateEth()` endpoint.

Rehearsal auction evidence:

- Artifact SHA-256: `e8a7d93f02b8a0b86cc65c18a49f5fd309a3b676691973512c4cb1eb96144e52`.
- Local deployment: `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`.
- Deployed runtime: 4,748 bytes; keccak256 `0x280cdf3e2025a89719c791527e1dc217ececffe2ff29490707349883f8752d2b`.
- The exported frontend client verified that runtime hash and the expected game/NFT addresses before its financial reads and actions.

This is a local integration result using the production auction and NFT with a test game receiver. It does not replace the separate V3-to-V4 game upgrade/storage rehearsal, browser-extension wallet testing, independent security review, or production deployment verification. No public-network writes or user wallet requests occurred, and the website's production auction configuration remains inactive.

**Gallery presentation and bidding review — October 23, 2026**

The auction landing page, lot discovery, and individual lot pages now share the gallery's Ink-first paper setting, authentic compact motion, material transitions, and full viewing room. The introduction explicitly identifies its featured artwork as editorial collection art; it does not imply that the work is available for sale. Actual lot records continue to come exclusively from the contract. The unconfigured application shows the programme's preparation status and agreed rules, without fictional current prices or deadlines.

The bid panel separates current/opening price, minimum next bid, the UTC deadline, countdown, wallet connection, and the review action. Exact totals and funding appear in a native modal before submission. The panel now:

- Removes stale phase and price displays, suppresses a stale minimum placeholder, and retains the visitor's entered amount while disabling actions.
- Invalidates a review when the refreshed minimum exceeds the reviewed total, including when the funding amount would otherwise remain unchanged.
- Locks connection and submission synchronously to prevent duplicate activations before React commits a disabled button.
- Rejects an unrepresentable contract deadline without throwing during rendering.
- Opens the review with focus on Cancel, restores the opener reliably in Safari, and restores existing document scroll styles when the review closes.
- Disables the review entrance animation under the site's manual motion pause, preventing a paused animation from trapping focus inside an invisible modal. A browser regression checks actual opacity, animation, focus, and scroll restoration with the system's reduced-motion preference off.

The production transaction encoder, runtime verification, simulation, and receipt handling are unchanged. Discovery still refreshes financial state independently of bounded media loading. Only dedicated compact previews can animate automatically, and missing artwork never suppresses an authentic contract lot.

Evidence for this change includes 33 wallet-panel and 15 auction-discovery unit cases, 119 public-page browser cases (112 full axe scans), and 76 isolated live-interface browser cases (48 axe scans). The isolated fixture renders the actual components and CSS with a synthetic provider/snapshot, is explicitly labelled, binds only to loopback, and blocks external connections. It tests direct bids, leader funding, wrong-chain/stale/failing reads, confirmation focus and scroll restoration, settlement/recovery UI, all eight languages, and single-preview discovery. These are UI tests, not real wallet or contract transaction evidence. Invalid amounts are covered by the component tests. The real-contract rehearsal above was not repeated for this presentation-only change.

The fixture is run with `npm run test:auction-ui`; `npm run test:auction-ui:types` checks its independent TypeScript boundary. Production-page and existing gallery regressions remain in `npm run test:e2e`. No deployment, public-network write, or remote push was performed.

**Full real-contract rehearsal — October 24, 2026**

The new `npm run test:auction:local` command runs the expanded four-case client integration suite and a browser journey against the actual V4 game, production periphery, NFT and auction. It owns fresh loopback processes, verifies frozen artifacts against the full compiler input/output, and retains issuance and receipt evidence. The browser uses an EIP-1193 adapter for unlocked disposable local accounts, not the synthetic transaction client from `test:auction-ui`. Only game/NFT identities are substituted for the local network; production deployment verification and transaction submission code remain unchanged.

The four client cases pass with 29 successful actions and 15 attempts rejected before broadcast, including exact eligibility and closing boundaries, repeated extensions, 10% rounding at odd wei values, independent lots and liabilities, credit aggregation without automatic reuse, rejected/reentrant recipient calls and recovery. This layer uses a test receiver for deliberately failing proceeds; its auction and NFT implementations are real.

The browser layer separately uses the actual game. Four browser profiles each verify eight UI-submitted transactions plus an external competing bid, with exact receipt/calldata/value checks, stale-review invalidation, self-raise delta funding, refund recovery, two late extensions, permissionless settlement, chosen NFT recipient, and final reserve forwarding. All final liabilities are zero; the game emits the contribution event without a participation event. Four additional cases verify the local RPC gateway fails closed without mutating chain state. Complete receipts and final balances are retained locally before snapshots are restored and processes stopped.

The pinned deployed-V3-state upgrade and full auction lifecycle also passed independently, with both forwarding/delivery orders and an actual reverted NFT-delivery transaction followed by recovery. Details and source hashes are recorded in the Solidity verification JSON. No production defect was found or production code modified. Remaining release evidence still includes independent review, native network execution and real browser-extension/hardware-wallet compatibility; local adapters and precompile shims are explicitly test infrastructure.
