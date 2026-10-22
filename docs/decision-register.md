**Decision register — October 22, 2026**

On October 22, 2026, the user accepted the recommended remaining auction defaults, explicitly including direct bids and no administrator overrides. The auction mechanics are settled. The user later selected The Passage and The Atlas, then explicitly authorized production implementation of the Next.js art gallery, immutable auctions and the V4 game upgrade on its own branch. The latest instruction reiterates completing implementation and rigorous testing. Deployment, production upgrades and remote pushes have not been requested.

**Confirmed design**

| Item | Decision |
| --- | --- |
| Workspace and domain | /Users/tarasbobrovytsky/Dev/Cosmic-Signature-Art; cosmicsignature.art |
| Collection and inventory | Existing Cosmic Signature NFT collection on Arbitrum; eight additional NFTs per cycle |
| Art experience | Museum/gallery presentation and browsing of all existing and future art |
| Creative priority | Movement is the organizing theme; Ink should be the primary encounter. The Passage and The Atlas are selected for exploration with authentic moving ink, cinematic material changes and fluid collection interactions; detailed mockups remain subject to review |
| Reference practice | Follow Christie’s or comparable prestigious art auctions where unspecified, preserving explicit choices and trustless guarantees |
| Eligibility | Seven days after successful on-chain cycle finalization creates the NFTs; the earlier countdown expiry is not the reference |
| Media failures | Eligibility stays fixed even if rendering/hosting fails; publication status grants no operator delay or cancellation power |
| Auction start | Each lot's first funded bid starts its auction; unbid works stay available indefinitely |
| Bid meaning | Direct public offer at the entered total; winning with 100 ETH means paying 100 ETH; no automatic maximum bidding in the first release |
| Opening minimum | 0.00001 ETH; a valid winning bid at this price is honored |
| Auction duration | 48 hours from that lot's first funded bid |
| Extension rule | Valid bids accepted before closing in the final ten minutes leave ten minutes remaining; earlier bids do not move the deadline |
| Extension cap | None; all accepted late bids, including self-raises, follow the same rule |
| Bid increases | At least 10% above the current highest bid, rounding the required increase up to whole wei; arbitrary larger funded bids allowed |
| Accepted bids | Binding; no cancellation of an accepted leading bid or discretionary reversal |
| Self-raises | Enter the new total, meet the same 10% rule, and fund only the additional ETH; no refund credit for the amount still committed |
| Transaction races | Canonical chain execution order decides acceptance against the then-current minimum; the UI never silently increases a stale bid |
| Purchases and overlap | A wallet may win any number of works; independent lots/exhibitions never block a subsequent cycle |
| Refunds | Outbid funds immediately become withdrawable credit, with no expiry or platform refund fee; the credit owner controls its destination |
| Credit reuse | Refund credit stays separately withdrawable in the first release; no implicit use of it to fund a new bid |
| Settlement and delivery | Anyone can settle; the winner gets an irrevocable NFT entitlement claimable to a compatible address they choose; no forfeiture deadline |
| Failed transfers | Settlement, delivery, refunds and forwarding are independently recoverable; a failed receiver cannot undo the sale or block unrelated lots |
| Proceeds destination | 100% of final winning payments enters the existing game reserve under its distribution and carryover rules |
| Pending game proceeds | Owed only to the fixed game destination, retryable by anyone even if failure persists indefinitely; no redirection or discretionary reversal |
| Funding attribution | Proceeds affect the reserve when received; no promise that a sale funds a particular numbered cycle |
| Fees | No seller commission, platform commission or buyer premium; network fees are separate; operations require separate funding |
| Architecture | Narrow game upgrade plus one immutable auction/escrow contract |
| Issuance and registration | Separate batch of eight NFTs, no additional CST, minted and registered atomically during successful finalization; registration failure reverts the transaction |
| Custody utility | Escrow never anchors inventory or consumes its once-ever eligibility before delivery |
| Administrator authority | No key can cancel, pause, change terms, withdraw/substitute allocated works, redirect funds or override winners; includes waiting lots before the first bid |
| Future versions | New immutable deployments apply only to future batches; existing lots and obligations retain their original rules |
| Current scope | Production Next.js gallery and V4 implementation with comprehensive testing. Local work only; no production deployment, upgrade or push |

The accepted tradeoffs remain explicit: atomic registration adds gas and a contract dependency to game finalization; uncapped extensions may continue indefinitely; media can be unavailable when eligibility begins; pending proceeds cannot be redirected if the game receiver fails; an immutable auction has no discretionary repair key. Existing game upgrade and NFT metadata powers are inherited dependencies, not removed by this plan.

**What is still open**

| Stage | Decision | Recommended direction | What it affects |
| --- | --- | --- | --- |
| Before final contract specification | Canonical artwork identity and on-chain commitment | Fix renderer revision/build/settings before seed inspection; decide whether its specification hash belongs in immutable batch state | Exact rendition/process represented by the sale; final output hashes do not exist until rendering finishes |
| Before media integration | Required sale files, manifest authentication, preservation and storage | Define primary still/film/masters, publish versioned manifests, preserve historical packages and use durable mirrored access | Publisher identity authenticates media but must never control auction eligibility or outcomes |
| Before production activation | First enabled cycle and deployment transition | Announce a future boundary after deployed-state checks and completed review | Start of extra issuance; no retroactive batches; audited versions and addresses |
| Before launch | Operating budget and responsible operators | Separately fund rendering, storage, indexing, RPC, settlement automation and support | No deduction from winning proceeds; capacity must serve all cycle NFTs, not only the auction eight |
| Before launch | Security review and release schedule | Fund independent review, upgrade rehearsal and worst-case gas/flow verification before production authorization | Evidence needed to release the approved design; not a new auction rule |
| Frontend design, parallel with specification | Refine the selected Passage/Atlas direction; decide exhibition title and launch locales | Review the new homepage, collection and artwork mockups; preserve Cosmic Signature identity and consider all eight existing locales | Concept direction selected; exact layouts, editorial details and language rollout remain design choices |
| Frontend integration | Canonical artwork URLs, legacy-link migration and optional notifications | Stable token URLs on .art; preserve app utility links; notifications never determine bid validity | Search/discovery and collector convenience |

The production implementation develops the selected Passage and Atlas direction and includes all eight existing ecosystem locales. Editorial titles can evolve without changing auction mechanics.

Ordinary art-auction terminology is the working default for this dedicated venue, consistent with the user's selected model and reference. Prepare its own multilingual glossary without weakening the existing app's vocabulary rules. No separate approval of every familiar auction label is needed.

Detailed engineering must still specify bounded operations, unsolicited ETH surplus and accidental-token handling, storage/event schemas and tests. These must preserve the approved invariants: no spending of bidder/proceeds liabilities, no treating unsolicited NFTs as authenticated auction inventory, and no administrator override. A material deviation discovered during design must be surfaced explicitly.

**Work needed, rather than undecided auction rules**

Verify the actual deployed implementation and configuration; measure rendering throughput for all newly created NFTs; complete the state-machine specification; rehearse the upgrade and measure finalization gas; implement and test under the October 22 authorization; arrange independent review; validate the complete browser-to-contract flow. Do not relabel these execution tasks as missing user decisions.

The approved rules are described in [Auction start and sale policy](auction-start-and-sale-policy.md), [Preview and artwork readiness](preview-and-artwork-readiness.md), and [Accepted auction defaults](remaining-auction-rules.md). The latter keeps its original filename so existing links continue to work.

**Scope held for later**

Automatic private maximum bidding, cross-chain bids, CST payments, credit reuse across bids, secondary-market listings, collector social profiles, token-gated access, bidding rewards, simulated 3D galleries, renderer proofs, and deterministic sweeping of every matured auction into a target cycle are outside the first release. Add them only when a concrete need justifies the additional design and the user authorizes the change.
