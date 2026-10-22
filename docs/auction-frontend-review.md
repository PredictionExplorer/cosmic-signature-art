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
