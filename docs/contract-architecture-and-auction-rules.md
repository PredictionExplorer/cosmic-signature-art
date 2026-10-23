**Approved contract design — implemented and under review.**

The confirmed requirements are eight additional existing-collection NFTs per cycle, English auctions in native ETH on Arbitrum, trustless financial outcomes, and 100% of final winning payments directed to the existing game reserve under its current distribution rules. The user also confirmed first-funded-bid activation, a 0.00001 ETH opening minimum, 48-hour auctions, late bids leaving ten minutes remaining, and a 10% minimum increase with larger jumps allowed. The user also approved seven-day eligibility from successful finalization even if media is unavailable, uncapped extensions, direct bids, immutable singleton escrow with atomic registration, independently recoverable refunds/delivery/funding, and no administrator overrides. Artwork identity/manifest details and deployment planning remain open. Use Christie’s as the reference for unspecified rules where compatible with the agreed trustless design. Production implementation and review were subsequently authorized; deployment remains unauthorized. See the decision register and implementation report for current status.

**Only winning payments can become game funding.**

A normal English auction requires refundable losing bids. If A bids 1 ETH and B bids 1.2 ETH, the auction holds 2.2 ETH: 1 ETH owed back to A and 1.2 ETH backing B's leading bid. Before closing, neither amount is game revenue. After closing and settlement, B's 1.2 ETH becomes payable to the game and A's 1 ETH remains refundable.

The confirmed funding policy is 100% of final winning prices to the existing game reserve. The approved fee model has no seller commission or buyer premium, with network fees paid separately. Hosting, rendering, indexing, security review, and transaction automation therefore need an operating budget outside these sale proceeds.

**Selected architecture: one immutable auction and escrow contract, with a narrow game upgrade.**

The game keeps its existing NFT contract and mint authority. It creates the normal recipients' NFTs and CST, then a separate batch of exactly eight NFTs directly into auction custody. The approved design registers the exact batch and fixed terms in the immutable auction in the same transaction. Bids, refunds, settlement, delivery, and forwarding happen independently afterward. Atomic registration supersedes the earlier default of later permissionless registration, closing the interval in which the upgradeable game's registry could still change waiting-lot terms.

The auction implementation and game/NFT addresses are fixed for that deployment. Existing lots have immutable terms. A future improved auction version would be a new deployment selected only for future eligible cycles; already allocated inventory and existing liabilities remain in the original contract. This avoids an administrator being able to rewrite the code holding active bids.

This design has one shared ETH balance, so rigorous accounting of liabilities is essential. It minimizes deployments and repetitive setup. It avoids adding auction-completion or renderer dependencies to game finalization, but atomic registration does add a bounded call to the immutable auction contract. Extra minting, registration and storage writes must fit the finalization gas budget; any failure reverts the entire transaction. This is an explicitly accepted architecture tradeoff, not a claim that finalization has no new dependency.

**Alternatives considered, not selected:**

| Architecture | Advantage | Tradeoff | Assessment |
| --- | --- | --- | --- |
| A. Immutable singleton auction and escrow | One implementation and event surface; inexpensive repeated exhibitions | Shared balance needs strong liability invariants | Selected for eight uniform lots each cycle |
| B. Immutable per-cycle instances created by a factory | Isolates balances and policy instances by exhibition | Deployment, factory authentication, registration, monitoring, and address discovery add complexity | Reasonable if per-exhibition isolation is a priority |
| C. Auctions inside the game proxy | One external protocol address | Refundable auction ETH would enter a contract whose payouts depend on its balance; broader storage, upgrade and liveness coupling | Avoid |
| D. Record an allocation at finalization, mint its eight later | Reduces finalization work | Needs fixed seeds, exactly-once issuance and further game entry points; changes when NFTs exist | Consider only if measured finalization gas requires it |

In Plan B, creating the per-cycle instance after game finalization also needs a custody arrangement for the tokens until deployment. Moving factory deployment into finalization reintroduces a dependency. It is not simply Plan A with separate balances for free.

**The game integration must preserve existing recipient arithmetic.**

The existing NFT contract permanently restricts minting to its game address. A new auction contract cannot become another minter. The game proxy must call the existing NFT batch-mint function.

Create the auction batch after existing recipient processing but before the game advances its cycle number. Do not simply append eight addresses to the current recipient array: its tail and event-count calculations currently represent the main recipient's allocation. A separate eight-token batch preserves that relationship and leaves the existing CST mint batch unchanged.

Record at least the source cycle, first token ID, count of eight, intended auction custody address, finalization timestamp, and policy/version reference in the immutable auction through an authenticated game call, and emit an event for indexers. A historical event alone cannot be read directly by another Solidity contract. Derive auction seed inputs separately from existing allocation seed inputs, with an explicit fixed derivation and no discretionary selection after looking at the art. Do not claim that this proves visual uniqueness or improves the existing randomness assumptions.

Do not call any off-chain registration or rendering service during finalization. The existing NFT mint path uses a non-callback mint operation, so it can mint to the fixed escrow without executing an ERC-721 receiver callback. The approved subsequent on-chain registration call is bounded to the known immutable contract and exactly eight lots. It authenticates the game, validates inventory and terms, and records them without invoking bidders or settling any previous auctions.

Before accepting a batch, the auction verifies the approved collection, authenticated game caller, intended escrow/version, exact token range and count, custody, and absence of prior registration. Owning a token in escrow is not sufficient: someone can transfer an unrelated existing token there. Such a transfer must not make that token auction inventory. The deployed auction's game address is fixed; accepting new allocations never authorizes that caller to change previously registered lots.

Copy accepted lot terms into immutable lot state. Later game configuration changes must not alter its reserve, increment, deadline policy, token identity, refund rights, winner, or proceeds recipient. Atomic registration fixes these terms at creation. Deferred permissionless registration was considered but not selected: it reduces finalization coupling, but those records can be changed by a game upgrade before registration and only guarantee fixed terms after acceptance. The game continues to control future issuance under either approach.

**Financial accounting should be specified before any Solidity is written.**

At every reachable state, held ETH must be at least the sum of:

1. The highest bids for all unfinalized lots, including expired lots that have not been settled.
2. All refundable bidder credits.
3. All finalized winning proceeds that have not yet been forwarded.

An accepted higher bid replaces the previous high bid and creates a refund entitlement for the displaced bidder. An increase by the current high bidder requires only the difference, without also crediting the old bid as a refund. A returning bidder can withdraw old credit and place a new fully funded bid. Credit reuse across lots is a possible later feature, not an implicit assumption.

No bidder, keeper, or administrator may spend money from another liability category. Do not treat the raw contract balance as available game proceeds. Unexpected ETH is surplus, not an excuse to sweep bidder liabilities; its handling must be specified separately.

Refunds use a withdrawal pattern. Only the credit owner can authorize its destination. A rejected ETH payment cannot block the next person's bid; it leaves the withdrawal entitlement intact. Settling a lot must not require iterating over all past bidders. The same applies to batch operations: bounded convenience operations can exist, but an individual lot must always be operable without processing the entire collection.

**Settlement, NFT delivery, and funding are independently recoverable.**

After the deadline, anyone can finalize a lot. Finalization records its winner, creates the winner's NFT entitlement, and changes the winning amount from bid escrow into proceeds owed to the game. It happens once. It need not call an arbitrary bidder or the game receiver to establish the result.

The winner can claim the NFT to an address they choose. A convenience delivery attempt may transfer to the winner's recorded receiving address, but a receiver that rejects the transfer must not prevent the lot's financial settlement, other auctions, or proceeds forwarding. No arbitrary caller can choose a different recipient. Unclaimed NFTs are never confiscated after a team-chosen timeout.

Anyone can forward finalized proceeds to the fixed game proxy using the approved funding entry point. If that call fails, the precise liability remains payable only to that destination and can be retried. A convenience action can finalize and attempt forwarding, but failure must not erase the already valid result or trap refunds. Events and the UI distinguish settled, delivered, and forwarded.

This is stronger operational resilience than making the NFT transfer and game payment one inseparable transaction. The tradeoff is an explicit pending-proceeds state. A contract does not execute itself: independent keepers and permissionless user actions provide normal liveness. No percentage keeper fee is permitted because all winning payments belong to game funding.

**The funding endpoint is a critical integration detail.**

The game's receive function calls its ETH bidding logic. Sending ETH with empty calldata can place a game bid, change timing/participation state, or revert. The auction must call the explicit donateEth function, which accepts a contribution without creating a bid. The auction should emit its own sale/source-cycle attribution rather than pretending its bidders made individual game contributions.

The user selected the existing reserve on October 22, 2026. The comparison below records that decision:

| Policy | Implementation consequence | Collector-facing explanation |
| --- | --- | --- |
| Existing reserve — selected | Call donateEth; money joins the shared game balance and follows existing allocation rules | All winning payments fund the Cosmic Signature reserve |
| Prize-only funding — not selected | Would require a restricted funding ledger and explicit allocation rules in the game | Would restrict winning payments to specifically identified prize allocations |

The repository's V3 initialization defaults allocate 20% to the main recipient, 15% to Chrono-Warrior, 5% to participant ETH selections, 5% to anchoring, and 5% to public goods, leaving about 50% as carryover plus applicable rounding/failure effects. These are source defaults, not a fresh live configuration check. Ordinary contributions participate in this entire system. “Sent to the game” does not mean “paid exclusively as prizes.”

No prize-only ledger or changes to the existing distribution split are planned. The selected route uses the existing explicit contribution endpoint. Attribution events identify where the contribution came from without earmarking its later distribution.

**The source cycle and the funded cycle are different.**

The eight NFTs are created when their source cycle finalizes. Their later auction cannot fund the distribution that already occurred. Under the selected reserve policy, ETH affects balances when forwarding succeeds. Forwarding before or after another cycle's finalization can change which distribution first includes that contribution.

Record the originating artwork cycle, sale/lot, payment amount, forwarding transaction, and receiving game cycle separately. Do not promise that sale N necessarily funds cycle N or N+1. Permissionless forwarding reduces operator discretion but does not eliminate strategic transaction timing or guarantee immediate execution.

A deterministic cycle-funding design is possible, but materially larger. Collecting only settled proceeds omits ended-but-unsettled lots; a supplied list can omit selected lots; sweeping all historical lots introduces unbounded work. The game's current reentrancy guard also prevents simply inserting game -> auction -> donateEth callbacks inside finalization. Any stronger design needs bounded accounting, authenticated funding hooks, and an explicit target-cycle policy. It is not part of the minimal recommended plan.

**Opening the exhibition has an unavoidable media dependency.**

A simple contract cannot simultaneously guarantee a deterministic opening date, correct and publicly available rendered media, and no trusted media-readiness decision. A URL or content hash proves neither rendering correctness nor public availability. A public renderer makes independent inspection possible, but performance, software versions, and hosting still matter.

| Opening model | Rule | What it gives up |
| --- | --- | --- |
| Deterministic delay | Opening time derives from the recorded cycle-finalization time plus a fixed preview/render delay; any caller can register | Media failure cannot automatically stop bidding; requires demonstrated render capacity and independent access |
| Publication approval before bidding | A designated publisher commits the fixed batch's media manifest and starts a public preview clock | Publisher can delay or withhold launch; financial rules remain trustless but opening is not fully permissionless |
| First funded bid starts a timer — selected model | After the eligibility interval, an eligible bid starts that individual lot's 48-hour bidding duration; until then it waits indefinitely | Different start times produce separate closing times; first bid still does not prove media was available to everyone |

The user selected first-funded-bid activation for each lot and approved eligibility seven days after successful cycle finalization, when the NFT seeds exist. This fixed eligibility applies even when media is unavailable. This replaces fixed auction windows and later reoffers. Every running auction has a funded buyer, while an unbid work remains available indefinitely. It cannot force someone to bid or guarantee completed media. See [Auction start and sale policy](auction-start-and-sale-policy.md) for the confirmed parameters and [Preview and artwork readiness](preview-and-artwork-readiness.md) for the remaining choices.

Under the approved model, atomic registration fixes eligibility at creation and there is no closing clock before the first funded bid. A collector starting a long-waiting lot still triggers its entire bidding period without an operator prerequisite. If deferred registration were selected instead, it must not reset eligibility. If fixed scheduled windows were selected, late registration would require a missed-window policy. If publication approval were selected, the publisher must not replace tokens, reroll seeds, alter terms, or modify a committed manifest after opening preview; its ability to withhold launch would remain an explicit trust tradeoff. “Anyone can post a hash” is not a verified readiness fallback.

The existing NFT base URI and generation-script URI are owner-changeable. A sale-specific manifest is a supplemental historical commitment, not a way to make the entire collection immutable. Agree how the renderer revision/configuration is fixed before seeds are examined, how a canonical sale rendition is identified, and what authority authenticates that commitment. Proof-of-render verification would be a separate, much larger project and is not proposed for the first release.

**Approved auction rules:**

| Rule | Approved policy |
| --- | --- |
| Lots | Eight independently priced tokens, grouped into one exhibition |
| Currency | Native ETH on Arbitrum; no CST or cross-chain bidding |
| Opening minimum | Confirmed 0.00001 ETH; no additional reserve or seller acceptance |
| Bid amounts | Confirmed: at least 10% above the highest bid, rounding the required increase up to whole wei, with arbitrary larger funded jumps allowed; no additional fixed ETH increment |
| Self-raise | Pay only the increase; no simultaneous refund for the amount still committed |
| Bid validity | Chain inclusion and contractual time determine acceptance; a local countdown or submitted transaction does not |
| Start and close | Confirmed: first funded bid starts that lot's 48-hour duration; valid bids accepted in the final ten minutes leave ten minutes remaining; earlier bids do not move the deadline; no guaranteed stagger |
| Extension cap | No hard cap: each valid late increase preserves a response window; duration is consequently not bounded |
| Multiple purchases | Allowed; wallet caps do not reliably establish unique people |
| Refunds | Immediately withdrawable credits when displaced; no team approval and no forfeiture deadline |
| Fixed terms | No administrative cancellation, opening-minimum change, token substitution, shortening, or redirection for an allocated lot, including while awaiting its first bid |
| Custody utility | Escrow never anchors its tokens or consumes their one-time utility |
| No bids | Keep the NFT visible, in escrow, and available to start indefinitely; no expiry or relisting |

The first-funded-bid model needs no reoffer policy. A valid opening bid is irrevocable while it leads, starts the full competition window, and wins even at the minimum if never outbid. This makes very cheap acquisition a real possible outcome, including the token's ordinary unused anchoring eligibility. A waiting lot is not labeled as a live countdown. There is no treasury backstop, free-transfer fallback, organizer withdrawal, or guarantee that outside demand appears.

Several-minute extensions reduce last-second races; they do not remove transaction ordering, sequencer availability, or network-outage risks. Unlimited extensions also mean one lot can remain active after the next exhibition starts. Future cycles must not wait for it. No emergency pause or cancellation authority exists for allocated lots. The user accepted that tradeoff; it must not be reintroduced as an implementation convenience.

**The trustless promise should be precise.**

For registered/open lots, neither the team nor its website can change the token, economic rules, winner, refund entitlement, or proceeds destination. Anyone can execute the defined closing and forwarding operations. The interface and indexer are conveniences, not authorities. There is no team withdrawal or arbitrary rescue path for valid inventory, bidder funds, or pending proceeds.

This does not make the existing upgradeable game, metadata publishing, chain infrastructure, or rendering service immutable. Game upgrades may affect future issuance and the behavior of the funding recipient. An immutable auction must isolate its obligations from those changes, preserve pending forwarding liabilities if the recipient fails, and describe the remaining dependencies honestly.

**Future game upgrades need compatibility work, not just new functions.**

Follow the repository's versioned storage and composition pattern. Inspect the actual deployed implementation and storage before selecting the next version. Current V3's final storage gap is not an invitation to append state after an enormous concrete leaf gap. Preserve all existing slots, shrink the appropriate reserved gap, and initialize only new auction state atomically with the upgrade. Do not reset configured percentages, clocks, or token addresses.

The source's upgrade authorization requires the owner and an inactive interval. Plan the activation boundary and first eligible cycle explicitly. Historical cycles must not unexpectedly receive retroactive auction batches. Existing NFTs, recipients, seeds, events, CST, and live auction obligations must survive. Rehearse from the actual deployed baseline on a fork before any production authorization.

**Source evidence for the planned integration:**

- [NFT authority and minting](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/CosmicSignatureNft.sol:29), [batch implementation](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/CosmicSignatureNft.sol:110), and [mutable URI controls](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/CosmicSignatureNft.sol:79).
- [Finalization order](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/MainPrizeV2Base.sol:84), [current batch calls](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/MainPrizeV3.sol:341), and [recipient event arithmetic](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/MainPrizeV3.sol:384).
- [ETH receive places a bid](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/BiddingV2Base.sol:36), [explicit contribution function](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/EthDonationsV2.sol:14), and [balance-based main allocation](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/MainPrizeV2Base.sol:139).
- [V3 configuration and storage notes](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/docs/v3-vs-v2-changes.md:28), [upgrade authorization](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/CosmicSignatureGameV2Base.sol:86), and [V3 storage gap](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/CosmicSignatureGameStorageV3.sol:20).
- [Solidity security guidance on withdrawal patterns and external calls](https://docs.soliditylang.org/en/latest/security-considerations.html) and [Arbitrum block/time semantics](https://developer.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/block-numbers-and-time).

Local contract review baseline reported by the review agent: commit 37fdc5e01fee9b4a1ef59fff35726d96775b3680. No deployed-state equivalence is asserted by this planning review.
