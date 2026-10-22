**Agreed auction model: a public preview, then an English auction started by the first funded bid.**

Discussion recorded October 22, 2026. The user confirmed the first-funded-bid model, a 0.00001 ETH opening minimum, 48-hour auctions, late bids leaving ten minutes remaining, and a 10% minimum increase with larger jumps allowed. Christie’s is the default reference where compatible with these choices and the trustless design. The user also approved seven-day eligibility from successful cycle finalization, atomic registration, direct bids, no administrator overrides, uncapped extensions, and the recommended refund/settlement/recovery defaults. Artwork identity/publication details and launch planning remain open. See [Preview and artwork readiness](preview-and-artwork-readiness.md). No code is authorized.

**The contract can remove a failed-sale state, but it cannot create demand.**

No contract can force an external person to bid, pay transaction fees, or submit a settlement transaction. A genuinely unbid NFT remains unpurchased. The useful guarantee is that it never expires into an unavailable “unsold” state: it stays available for anyone to start its auction. Once a valid funded bid exists, a low final price cannot prevent the winning bidder from receiving the work under the contract's rules.

There is no hidden reserve, seller acceptance step, team veto, automatic cancellation for insufficient interest, or discretionary relisting. The tiny published opening minimum is the only price threshold for starting. It is technically a minimum acceptable price; the venue should not advertise a literal zero minimum while requiring positive ETH.

**Separate the exhibition opening from each lot's auction clock.**

All eight works are assigned to the same exhibition when the cycle finalizes. Their eligibility time is calculated from that recorded finalization timestamp plus a fixed preview interval. To make the terms irrevocable from creation, the approved design records the eight authentic lots in the immutable auction contract in the same transaction as minting them. This is a bounded game-to-auction registration call, not an operator approval or the start of bidding. It must not involve a renderer, a bidder callback, or settling earlier lots.

This changes the earlier recommendation of deferred permissionless registration through a game-side registry. Because the game is upgradeable, that registry can change before registration; the earlier approach guarantees immutable terms only after the auction has accepted the batch. Atomic registration closes that gap, at the cost of a new contract dependency and gas during finalization. If registration fails, the entire transaction must revert rather than leaving unregistered inventory. Both the additional cost and failure path need review and tests. The user accepted this architecture and tradeoff as part of the remaining defaults. No implementation code is authorized.

At eligibility, all eight become available to start. Each lot waits independently for its first fully funded bid. That bid starts the full bidding period for that lot. A bid on one work never starts seven empty auction clocks.

The agreed state sequence is: Preview -> Available to start -> Active bidding -> Ended awaiting settlement -> Winner entitlement, with NFT delivery and game funding tracked separately. There is no expiry for Available to start and no relisting transition. Eligibility and end times are determined by chain rules, not browser timers or staff actions.

**Confirmed parameters and remaining choices:**

| Parameter | Approved rule | Rationale |
| --- | --- | --- |
| Earliest eligibility | Seven days after successful cycle finalization | Confirmed; fixed even if rendering/hosting fails; a buffer, not a readiness guarantee |
| First bid minimum | 0.00001 ETH | Confirmed; equals 10,000,000,000,000 wei |
| Auction duration | 48 hours from the first funded bid | Confirmed; the clock starts even if the first bid arrives weeks later |
| Larger jumps | Any funded larger amount, including 100 ETH when valid | Allowed; there is no requirement to bid an exact percentage or exact step |
| Minimum raise | 10% of the current highest bid, rounding the required increase up to whole wei, with arbitrary larger jumps allowed | Confirmed; no additional fixed ETH increment |
| Extension | Valid bids in the final ten minutes leave ten minutes remaining | Confirmed; earlier bids do not move the deadline; bids must be accepted before closing |
| Extension cap | None | Confirmed; sustained valid bidding can postpone completion indefinitely |
| Sale threshold | Any valid winning bid | Even the opening minimum is a binding sale price if never outbid |
| Leading-bid cancellation | None | Every active lot remains backed by a real buyer's payment |

For example, if a collector starts a lot with 0.00001 ETH, they do not receive it immediately. They become the leading bidder in a 48-hour auction. If nobody bids higher, they obtain the winner entitlement at that price once the auction is settled. If another collector bids 0.000011 ETH, the first bidder's 0.00001 ETH becomes refundable. The final winning payment, not the sum of all bids, goes to the existing game reserve.

An auction bid may jump far above the current price. The confirmed percentage requirement only sets the smallest accepted increase; it does not prohibit larger jumps. This requirement discourages tiny repeated extensions, but multiple wallets can still alternate, so it does not establish distinct people or guarantee revenue or finite duration. At a tiny opening price, early percentage increases are also tiny, so a 10% rule is not a complete defense against deliberate extensions.

**Confirmed percentage: 10%, adapted from major auction-house practice.**

[Christie’s official guide](https://www.christies.com/help/buying-guide-important-information/financial-information) describes live bidding as generally advancing by up to 10%, with tiered increments and auctioneer discretion. Its $5,000–$10,000 band uses $500 steps: $5,000 to $5,500 is 10%, while $8,000 to $8,500 is 6.25%. [Sotheby’s global buyers’ guide](https://help.sothebys.com/en/support/solutions/articles/44002518078-guide-for-buyers-global) describes live-auction steps as approximately 10% of the previous bid. These sources do not establish a universal strict 10% rule for every sale.

The selected minimum increase is 10% of the current highest bid. Round the required increase upward to the next whole wei and add it to the current bid. The same rule applies to a current leader raising their own total, with only the additional ETH due under the approved top-up accounting. Any larger total is valid if fully funded; amounts need not be exact multiples of a step. The first bid uses the separate confirmed 0.00001 ETH opening minimum. There is no separate fixed ETH increase.

| Current highest bid | Minimum next bid at the confirmed 10% rate |
| --- | --- |
| 0.00001 ETH | 0.000011 ETH |
| 0.01 ETH | 0.011 ETH |
| 1 ETH | 1.1 ETH |
| 100 ETH | 110 ETH |

This is a predictable on-chain adaptation of the houses’ general practice. It deliberately has no auctioneer discretion or live percentage changes for a registered lot. Fixing 10% can require larger raises than some steps in a house’s tiered schedule, especially toward the top of a price band. The user has approved this rate.

**Financial and authority rules remain strict throughout the lot's lifetime.**

- Once recorded in the immutable auction, lot identity, opening minimum, timing rules and proceeds destination are fixed. No team member can make that waiting lot harder to start, remove it from sale, or substitute a token. Atomic registration makes this true when the eight tokens are created; deferred registration would leave the pre-registration trust boundary described above.
- Every accepted bid is funded on-chain. The current leader cannot withdraw the funds backing that bid. Only displaced bids become refundable.
- An increase by the current leader pays the difference and does not also create a refund for the amount still committed.
- Refund claims cannot block later bids. The NFT receiver and game funding receiver cannot block recording the auction result or another lot's progress.
- Anyone can settle after bidding ends. The winner controls the delivery destination. Proceeds remain payable only to the existing game reserve through its explicit contribution endpoint.
- A failed NFT transfer leaves the winner's entitlement intact; it does not make the token available to someone else. Failed game forwarding remains retryable and does not undo the sale.
- There is no owner-only approval, reserve waiver, auction restart, or arbitrary custody withdrawal. New contract versions can affect future batches only.
- Waiting lots and extended auctions never block future cycles or other lots.

This guarantees a defined, funded outcome after a first bid, subject to the auction ending and a settlement transaction being executed. It does not promise a finite closing time under endless competitive bidding or uninterrupted access during a chain outage. Independent automation can improve normal liveness, but no particular automation service holds authority.

**Media publication remains a separate trust boundary.**

The fixed preview interval and first-funded-bid trigger remove an operator's power to approve opening. They do not prove that the art is correctly rendered or publicly available. A bidder could choose to start before hosted media appears, or during an outage, and later would not receive a discretionary cancellation right.

Show publication status independently, preserve seed and renderer provenance, provide stable versioned media and independent access where feasible, and validate render capacity against the confirmed seven-day buffer. Count that buffer from successful finalization, when the NFTs/seeds are created, not the earlier cycle countdown expiry. Do not add a privileged “ready” switch while describing this model as permissionless. A first bid is evidence of funded interest, not a media-availability certificate. The [readiness plan](preview-and-artwork-readiness.md) documents publication checks and missing-media behavior.

**The exhibition stays coherent even though closing times differ.**

The website presents all eight lots together and shows their known eligibility time. Media is published as it becomes ready, rather than intentionally held until the eligibility boundary. After eligibility and before a first bid, each shows “Available to start — opening bid 0.00001 ETH.” After a bid, it shows its own live countdown. No fictitious countdown runs for a lot without a first bid. Use a separate publication label when artwork is still rendering or unavailable.

Different collectors determine different actual start times. The venue therefore gives up a guaranteed eight-lot closing ceremony and fixed staggered closes. A live-closing view can sort active lots by their current deadlines without changing the contract. One exhibition may contain waiting, active and completed works simultaneously. A low first bid is not an immediate purchase: everyone has a competition window measured from that first bid. Collectors arriving later have the remaining time and applicable soft-close extensions, not a fresh 48 hours for every new bid.

Every cycle creates eight auction opportunities; it does not guarantee eight completed sales before the next cycle. If the requirement changes to selling every token by a particular date even with no outside interest, it needs a funded backstop or a giveaway policy. A backstop funds real purchases with someone's capital; routing game money through its own auction does not create new external support. Neither is recommended as a hidden fallback.

**This replaces the earlier default recommendation.**

The initial plan favored fixed scheduled auction windows with a later reoffer for no-bid lots. The user has now chosen indefinite availability followed by first-funded-bid activation, a 0.00001 ETH opening minimum, 48-hour duration, late bids leaving ten minutes remaining, and a 10% minimum increase with larger jumps allowed. There is no reserve-failure state, missed closing window, repeated empty auction attempt, or relisting authority. Those defaults, including seven-day eligibility from successful finalization, atomic registration, direct bids, no administrator overrides, uncapped extensions and independent recovery, are now approved. Remaining artwork and launch choices are tracked in the [decision register](decision-register.md); no implementation is authorized.

For context, first-bid activation is an established art-auction pattern: [SuperRare's official description](https://help.superrare.com/en/articles/10629742-offers-auctions-and-pricing) describes a timed auction beginning when an opening reserve is met. The selected Cosmic Signature design has its own duration, refund accounting, no operator cancellation, and game-funding destination.
