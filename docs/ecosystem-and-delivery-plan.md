**The ecosystem gains a direct relationship between collecting art and sustaining future cycles.**

The existing protocol creates art through its cycles. The gallery gives the full collection a permanent public home. Auctions allow people who appreciate the art to acquire a specific work directly. All final winning payments replenish the existing game reserve and follow its current distribution rules and carryover, as confirmed by the user on October 22, 2026. Subsequent cycles create more work and continue the protocol.

That relationship is useful without promising higher token prices, more participation, or perpetual growth. Auction demand, additional NFT supply, active anchoring, and operating costs can move in different directions. The launch should measure them separately.

**Eight additional works are a supply policy, not only a website feature.**

The repository's newer V3 facts describe a typical 26 NFTs per cycle. Eight additional auction works produce a typical total of 34, an increase of approximately 30.8% in issuance per cycle. Some existing allocation tracks may be absent, so this is a typical baseline, not a universal fixed total. Older frontend facts still describe V2's 24. Update relevant documentation consistently when the actual upgrade is approved, rather than spreading a mixture of 24, 26, 32, and 34.

Keep all eight in the same collection, with the same existing rights and ordinary anchoring eligibility. Distinguish auction origin in provenance. Do not silently reserve aesthetically preferred outputs for auctions, reroll disliked seeds, or turn existing recipients' art into a lesser collection. A deterministic aesthetic search inside a fixed renderer is different from a person replacing already assigned outputs after inspection; document that distinction accurately.

The approved change adds no CST issuance. Buying art does not count as a game gesture, extend a cycle, earn participation CST, or create an additional allocation chance. Existing utility remains available afterward through the app. These boundaries prevent auction bidding from accidentally becoming another protocol participation mechanism.

**More reserve ETH and more eligible NFTs have different effects.**

Extra token issuance does not mechanically reduce a distribution by 30.8%. The relevant denominator is the number actually anchored at the distribution point. Auction custody should never anchor inventory. Once delivered, buyers can use the collection's existing eligibility.

For intuition, hold all rules and other behavior fixed. If B is the reserve before an auction contribution, R is auction ETH received before the same finalization, S is the positive number already anchored, a is the number additionally anchored, and p is the applicable distribution share, the illustrative per-token amounts are pB/S before and p(B+R)/(S+a) after. Ignoring rounding, the latter is larger only when the proportional reserve increase exceeds the proportional increase in active anchors. This is an accounting illustration, not a forecast; timing, other contributions, and configuration may all differ.

The gallery should explain rights neutrally rather than leading with distributions. The ecosystem should nevertheless model them before setting the issuance and sale cadence.

**Proceeds should be visibly traceable without overstating outside demand.**

Each completed sale should expose its final winning prices, total settled proceeds, amount actually forwarded, pending forwarding amount, destination contract, and transaction receipts. Refunded/outbid deposits are never counted as revenue. The public amount “Sent to the protocol” includes only successful forwarding. A separate “Awaiting transfer” amount explains pending obligations.

An auction buyer may also be a protocol participant or an anchored holder. They can benefit from later distributions, so a high sale price is not proof of equally large new external demand. Multiple addresses are also not reliable evidence of distinct people. Do not introduce rewards for bid counts, leaderboards of bidding activity, or participation token grants that encourage artificial bidding.

Use sale results to learn, not to establish a token-price benchmark. Useful internal measures include sell-through, repeat collectors, aggregate winning payments, refunds completed, render availability, forwarding delay, number and age of works awaiting a first bid, and operating costs. Unique-address counts may be reported with that exact label rather than as verified people.

**Every cycle gets a new batch; the network must tolerate overlap.**

An extended auction or a work awaiting its first bid must never stop the next protocol cycle. Each cycle has independent inventory and auction state. Grouping eight into an exhibition helps discovery, but simultaneous demand across eight lots divides attention and capital. Under the approved model, each first funded bid starts that individual lot's full auction. Closing times are therefore independent, not a guaranteed stagger or shared ceremony.

If cycles arrive faster than rendering or collector demand can absorb, waiting inventory becomes a product reality. Preserve the eight-per-cycle issuance requirement and show upcoming batches accurately. Every batch becomes eligible under its fixed preview rule; waiting for a first bid has no expiry. No batch depends on every previous lot selling or every soft close ending, and no staff member chooses which otherwise-eligible batches get offered. A serial sale queue would be a separate future design choice, not an implicit restriction.

The approved model uses independent cycle-based exhibitions and allows overlaps, with the site clearly grouping them. Eight new works per cycle means eight opportunities to start an auction, not eight guaranteed completed sales within that cycle. If overlap becomes common, revisit cadence for future policy versions. Do not modify existing waiting or active lots to make the calendar look tidier. Very low winning prices remain valid and transfer the token with its existing rights; there is no automatic treasury purchase or giveaway fallback.

**The renderer and indexer need a shared, versioned artwork record.**

The current renderer README describes master and web stills, browser and archival films, spectral assets, generation parameters, NFT traits, and a media manifest containing hashes and dimensions. The current frontend's media helper instead derives older flat paths and guesses “Rendering” from token age. The new venue should not build auction readiness on that heuristic.

| Source | Owns these facts |
| --- | --- |
| NFT and game contracts | Token identity, seed, source-cycle event/record, transfers, protocol allocation records |
| Auction contract | Authentic lots, terms, bids, refund credits, deadlines, winners, delivery entitlement, forwarded proceeds |
| Renderer | Physics-derived traits, renderer/configuration identity, visual assets, declared hashes/dimensions/codecs |
| Indexer/API | Reorg-aware indexed views joining chain records to media, search, provenance and availability status |
| Art frontend | Presentation, navigation, transaction review, and independent contract reads for critical actions |

The chain remains authoritative for financial state. The indexer makes history and search practical, but cannot invent auction eligibility or winners. Verify transaction-critical state against contract reads, track the indexed block, and handle replacement/reorg/finality explicitly. An indexer outage should degrade discovery or history, not make refund rights disappear.

Confirm how augur-explorer currently consumes mint events before implementing its changes. The plan assumes it is the integration owner based on existing documentation, not a completed audit of its code. It will need auction-origin classification, the new batch event/registry, sales, bid events, refunds, pending forwarding, and ownership transitions. Event handlers must be idempotent and able to rebuild from a known deployment block.

Use media manifests that support both legacy work and new packages, including renderer version, configuration identity, content hashes, available renditions, dimensions, and publication status. Preserve original-sale snapshots when new renders are added. Content-addressed publication and independent mirrors are recommended for durability, but hashes alone neither store files nor establish rendering correctness. Validate real render throughput and retry capacity against the approved seven-day eligibility buffer, measured from successful finalization. The current sequential production loop and file-presence checks do not prove a seven-day readiness guarantee. Staged publication and independent public-asset validation are proposed in [Preview and artwork readiness](preview-and-artwork-readiness.md).

**The repositories should have clear boundaries.**

Cosmic-Signature-Art is the future standalone art frontend and the home of this plan. Contract source and tests should stay in Cosmic-Signature so the game upgrade and auction share the existing Solidity verification and deployment discipline. CS-Image-Generation owns renderer changes. The indexer/API owner integrates chain and art records. cosmicgame-frontend keeps the main project website and app, receiving narrowly scoped link, canonical, and protocol-fact changes.

Start with a separate art deployment so its release cycle and gallery presentation do not depend on the app's host router. Reuse proven concepts and selectively share data types, locale infrastructure, media handling, and contract ABIs. Avoid copying the entire application, its protocol dashboard, or a second independent set of protocol constants. If a shared package is later justified, introduce it deliberately; a new monorepo is not required for this planning phase.

The existing frontend's Next.js rules require reading the installed version's documentation before implementation. No framework version, dependency installation, route scaffolding, Sites project, or deployment is selected or created by this plan.

**A practical implementation sequence keeps funds out of early experiments.**

| Phase | Deliverable | Evidence needed before proceeding |
| --- | --- | --- |
| 1. Finish the specification and rollout plan | Preserve all approved auction mechanics; decide canonical artwork/manifest commitments, first eligible cycle and operational/review ownership | Artwork specification and rollout decisions recorded; source and actual deployed configuration compared |
| 2. Specify and prototype the contract model | State transitions, liability equations, events, ownership guarantees, upgrade layout | Review of invariants and failure cases; no unresolved authority that can take refunds or change live outcomes |
| 3. Build the read-only gallery | Collection and artwork pages, process story, manifests, localization | Existing works load correctly; native aspect ratios, accessibility, mobile and media performance verified |
| 4. Implement and review contracts | Narrow game upgrade plus immutable auction contract in the contract repository | Relevant tests, invariants, gas measurements, upgrade rehearsal, independent security review |
| 5. Integrate renderer and indexer | Authenticated batch ingestion, publication record, auction history and receipt tracking | Rebuild/reorg tests, complete media packages, multiple supported publication endpoints where planned |
| 6. Connect a test-network auction experience | All bidding, refunds, delivery and forwarding states | Full multi-wallet journey including hostile receivers, stale data, failed services and delayed settlement |
| 7. Prepare the first live exhibition | Real artwork, published terms, verified contracts, funded operations and support paths | Explicit deployment/upgrade authorization and launch decision after review |
| 8. Evaluate early cycles | Sell-through, net proceeds sent, render health, inventory and collector friction | Use results to propose future policy versions; preserve existing live obligations |

The gallery can launch read-only ahead of the auction if useful, with no suggestion that unimplemented auction controls work. Prototype contract and gallery work can run in parallel after their interfaces and key decisions are agreed. Financial implementation should not be rushed to fit a visual launch date.

**Meaningful verification should target failures that could change ownership or lose funds.**

- Exactly eight additional NFTs for each eligible successful cycle; no duplicate issuance or registration; no retroactive historical batches; normal recipients, existing event counts, seeds and CST remain correct. Under atomic registration, failure must revert minting and finalization together; successful creation must leave all eight irreversibly registered with fixed terms.
- The deployed-to-new-version storage transition preserves configured values, balances, ownership and historical data; initialization occurs atomically; added finalization work fits a measured worst-case gas budget.
- ETH backing always covers active/unfinalized bids, refundable credits, and pending game proceeds. Test arbitrary sequences of bids, self-raises, withdrawals, reentries, failures, settlement and forwarding.
- An unknown transferred token cannot be sold; a registered token cannot be substituted or sold twice; another caller cannot choose a winner's delivery destination.
- Refusing ETH and NFT receivers cannot block other users. Failed game forwarding remains retryable and cannot consume refunds. Valid entitlements have no organizer-controlled forfeiture.
- Verify opening minima, rounding, increments, exact eligibility/deadline boundaries, indefinite no-bid availability, first-funded-bid activation, atomic registration authentication, independent extensions, overlap, and expired-but-unsettled lots. A minimum-price opening bid must be sufficient to win without further approval; starting one lot must not expire the other seven. A later game upgrade must not alter already registered waiting or active lots.
- Funding uses the explicit contribution endpoint and produces no game-bidding side effects. Test active/inactive periods and both sides of a cycle-finalization boundary.
- Browser flows distinguish signing, pending, confirmed, replaced, reverted, outbid, refundable, settled, delivered, and forwarded. Simulate indexer lag, RPC failure, missing media, mobile controls, and every supported locale.
- Operators can go offline while independent callers still start registered lots, bid, settle, withdraw, deliver and forward as the selected policy permits. Test the actual fallback interface, not only contract methods.

These are future implementation acceptance criteria. No executable tests were added or run for the documentation-only planning work.

**Relevant local evidence:** [V3 facts](/Users/tarasbobrovytsky/Dev/cosmicgame-frontend/content/protocol-facts.ts:148), [anchoring distribution divisor](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/StakingWalletCosmicSignatureNft.sol:274), [renderer package description](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/README.md:88), [indexer integration boundary](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/docs/augur-explorer-integration.md:1), and [existing frontend media heuristic](/Users/tarasbobrovytsky/Dev/cosmicgame-frontend/components/nft/signatureMedia.ts:19).
