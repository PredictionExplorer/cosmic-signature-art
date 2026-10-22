**Accepted auction defaults — October 22, 2026.**

The user has approved the recommended remaining auction defaults, explicitly including direct bids and no administrator overrides, and asked to follow Christie’s or comparable prestigious art auctions where unspecified. Use that as a reference for familiar collector behavior, terminology and sale presentation. Explicit choices already made by the user take precedence, especially trustless outcomes, first-funded-bid activation, the 0.00001 ETH opening minimum, 48-hour duration, ten-minute late-bid response window, and 100% of final winning payments going to the existing game reserve.

The percentage rule is now settled: the required next total is the current highest bid plus 10% of that bid, with the increase rounded upward to whole wei. Larger fully funded bids remain valid. There is no additional fixed ETH increment. The defaults below are now approved design decisions, including their stated trust and recovery tradeoffs. This is approval of the plan only; no code is authorized.

**Follow verified auction-house practice where it fits.**

[Christie’s bidding guide](https://www.christies.com/en/help/buying-guide/register-and-bid) distinguishes quick/direct bidding from automatic maximum bidding, says submitted bids cannot be cancelled, gives earlier identical maximum bids priority, and describes repeated late-bid extensions. These support familiar bidding, confirmation and closing behavior.

The [New York online conditions](https://www.christies.com/pdf/onlineonly/EcommerceConditionsOfSale-NewYork-01Sept26.pdf), however, also allow the house to withdraw lots and exercise other discretion. Those powers are not automatically imported into a permissionless protocol. Our rules must distinguish observed house practice from an on-chain adaptation. Do not assume that every venue, jurisdiction or sale follows one identical set of terms.

**Approved collector-facing rules:**

| Topic | Approved rule | Reason and tradeoff |
| --- | --- | --- |
| What a bid means | A direct public offer at the exact entered total | Entering 100 ETH means bidding 100 ETH and paying that amount if successful; automatic maximum bidding remains a separate deferred feature |
| Bid cancellation | No cancellation of a successfully accepted leading bid | Keeps every active lot backed by a committed payment; mistaken accepted bids do not get an operator reversal |
| Increasing one's own bid | Enter the new total, fund only the increase, and meet the same 10% minimum rule | Preserves accounting and makes the additional ETH due explicit; no refund credit for funds still committed |
| Equal or racing bids | Canonical chain execution order determines acceptance; each transaction must satisfy the then-current minimum | Two equal submissions do not create a lottery or an auctioneer decision; the later transaction fails if no longer valid |
| Extension count | No hard cap; apply the same rule to every accepted late bid, including a self-raise | Preserves a response opportunity, but continuing bids can postpone completion indefinitely |
| Multiple works | A wallet may bid on and win any number of lots | Eight works do not imply eight unique people; per-wallet caps would be easily bypassed |
| Simultaneous exhibitions | Lots and cycles operate independently | Old waiting or extended lots do not stop new inventory or auctions |
| Outbid refunds | Immediate withdrawable ETH credit, no expiry or platform refund fee | Withdrawal needs a transaction; a receiver that rejects ETH cannot block someone else from bidding |
| Winner delivery | Anyone may settle; the winner receives an irrevocable entitlement and can claim to a compatible address they choose | A failed NFT transfer does not reopen the auction or block another lot |
| Pending game funding | Preserve the exact proceeds owed to the fixed game address and permit anyone to retry forwarding | A sale can be settled while forwarding is pending; no redirection, confiscation, or discretionary reversal |
| Fees | No buyer premium or platform commission; network fees are separate | Keeps the promised funding destination simple; operations and automation need their own budget |
| Bid review | Show exact total, newly required ETH, minimum next bid, deadline, fees and refund effect before signing | The interface must not silently increase a stale bid to make it valid |

Binding bids and bid-review conventions follow familiar house practice. Pull refunds, claimable NFT delivery, gas fees and permissionless settlement are technical adaptations. They are not claims about Christie’s payment architecture.

**A direct bid is not an automatic spending limit.**

This is the most important interface distinction. If the high bid is 1 ETH and a collector submits 100 ETH, the first release records a 100 ETH bid. If it wins, 100 ETH goes to the game reserve. It does not automatically bid only 1.1 ETH and hold the rest as a private maximum.

Use “Bid amount” and “You will pay this amount if you win” in the review. For a current leader increasing a 1 ETH bid to 1.1 ETH, separately show the new total of 1.1 ETH and additional ETH due of 0.1 ETH. If another person currently leads, the new bid must be fully funded; previous outbid credit remains separately withdrawable in the first release.

Christie’s also offers maximum bidding, but reproducing private automated bidding would require a separate design for privacy, authorization, funding, execution and service failure. It is outside the existing first-release scope. The preference to use Christie’s as a reference does not silently turn a direct bid input into a maximum-spend input.

**Closing and settlement must have precise boundaries.**

A bid is valid only when accepted by the chain before the lot's deadline. Sending a transaction before the deadline does not reserve a position. A bid during the final ten minutes leaves ten minutes from its acceptance; a bid earlier than that changes no deadline. At the deadline, bidding is closed and settlement becomes available. An expired auction cannot be revived by a later bid.

With a no-cap policy, repeated valid late bids may continue extending. There is no guaranteed end time, and 10% increases at a very low price can initially be inexpensive. The rising funded amount discourages dust bidding but does not prove distinct bidders or eliminate strategic behavior. An arbitrary hard stop would allow an unanswerable last-moment bid at the final cap, so the approved policy has no such cap.

Public results should distinguish bidding ended, settled, NFT delivered, and proceeds forwarded. Settlement does not depend on the winner being online. Claiming the NFT does not depend on the game accepting a contribution. Refunds do not depend on either operation. A claim or refund has no expiry that allows the organizer to confiscate an entitlement. Independent keepers may perform normal work, but no particular service is required to authorize it.

**Authority is a deliberate departure from a traditional auction house.**

There is no team key capable of cancelling, pausing, changing terms, withdrawing allocated works, substituting a token, or redirecting bidder/proceeds balances for existing lots. This includes works still waiting for their first bid. Existing metadata and game upgrade powers remain inherited dependencies; do not describe them as removed by the new auction.

Freeze the core auction terms in an immutable deployment. Improvements can be deployed as a new version used by future batches. Existing lots, refunds, proceeds obligations and buyer entitlements remain governed by their original version. The cost is that a discovered defect or infrastructure failure does not have a discretionary administrator repair path for those assets. The user accepted this tradeoff with the no-administrator-overrides default. Implementation still requires a separate request.

To bind the terms at creation, the approved design mints and registers all eight atomically. That adds a fixed amount of work and a call to the immutable auction contract during game finalization. Registration failure must revert the entire transaction. Deferred registration would reduce that coupling but would leave a period when an upgrade to the game could change the source registration record. Atomic registration is the selected design; deferred registration is not selected. Neither production deployment nor code implementation has been authorized.

**The auction decisions above are closed; remaining work concerns artwork and launch.**

Eligibility is seven days after successful cycle finalization, even when media publication fails. Direct bids, immutable authority, atomic registration, uncapped extensions and independent recovery are approved. Do not ask for these choices again unless a newly discovered material problem requires a proposed change.

Still open are the renderer/configuration and canonical media commitment, manifest authentication and preservation, required media package/storage, the first enabled cycle, separate operating/security-review funding, and final frontend presentation. The [decision register](decision-register.md) separates contract-facing choices from launch decisions and ordinary engineering work. A media publisher may authenticate a record but cannot acquire an auction-readiness veto.

Routine presentation choices can follow the auction-house reference without repeated questions. Any material departure from the approved design must be surfaced. This plan approval does not authorize code or deployment.
