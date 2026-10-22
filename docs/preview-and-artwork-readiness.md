**Approved rule: eligibility seven days after successful cycle finalization.**

The user confirmed the first-funded-bid model, a 0.00001 ETH opening minimum, a 48-hour auction duration, a 10% minimum increase, and ten-minute late-bid extensions. By accepting the remaining defaults, the user also approved eligibility exactly seven days after the successful on-chain finalization transaction that creates the eight NFTs and records their seeds. Eligibility remains fixed even if media is unavailable. This is a contract timing rule, not a guarantee that rendering finishes in time.

The old cycle countdown reaching zero is not the same event. Finalization can occur later. Starting the week at the earlier countdown deadline could consume rendering time before these particular seeds even exist. The approved architecture records the finalization timestamp atomically with minting and auction registration.

**The intended timeline is simple.**

| Stage | Behavior |
| --- | --- |
| Successful cycle finalization | Eight tokens and their seeds are created; fixed lot terms and finalization time are recorded |
| Following seven days | Render, check and publish media; show available work as soon as it is ready; display the eligibility countdown |
| Finalization plus seven days | Every lot is eligible for anyone to start; no publisher approval is required |
| First funded bid on a lot | Starts that lot's 48-hour clock |
| Later bids | Must be at least 10% above the current highest bid, rounding the increase up to whole wei, with larger funded jumps allowed. Valid late bids leave ten minutes remaining; earlier bids do not move the deadline |
| Auction ends and settles | Highest valid funded bid is honored; normal refund, delivery and reserve-funding rules apply |

A work first bid on day 20 still receives 48 hours of bidding. The seven-day interval is a render/publication buffer, not a promise of seven complete days of viewable art: media first published on day six would have been visible for only one day when eligibility begins.

**Elapsed time cannot certify completed artwork.**

The inspected production runner processes missing seeds sequentially. It has a per-seed generator timeout rather than a guaranteed successful completion time. API, generation, encoding, storage and upload failures can recur, and backlog can exceed any fixed interval. The existing runner's file-presence checks and recursive upload do not establish that every public media URL is decodable, matches its declared hash, or corresponds to the intended renderer revision.

Therefore seven days is the accepted capacity allowance and fixed eligibility rule. Before launch, measure end-to-end completion times and backlog under the total expected NFT production, not just these eight lots. Include retry and recovery time, and ensure added auction work does not indefinitely delay existing recipients' art. There is currently no evidence in the inspected source establishing a hard seven-day rendering guarantee; meeting the fixed schedule may require more operating capacity.

**Define publication readiness as a concrete operational check.**

The initial readiness target should cover the promised collector-facing package: full-resolution still and browser derivatives, playable browser animation where part of the work, the preserved master, and metadata/manifest connecting those files to the token, seed, renderer revision and configuration. Agree which additional spectral or archival derivatives are essential to the sale; optional assets can be identified separately rather than making “ready” ambiguous.

Recommended publication steps:

1. Use the predetermined renderer revision/configuration for the batch; preserve the generation record.
2. Generate into a staging location rather than exposing partial new packages as complete.
3. Check required assets, decode stills/video, and compare actual files with manifest hashes and dimensions.
4. Publish the versioned package atomically where supported, with independent mirror access for durable retrieval.
5. Fetch the published assets through the actual collector-facing URLs and check their integrity and playability.
6. Record last-check time, package version and publication condition, then show the work immediately in the gallery.

These are proposed engineering tasks, not capabilities asserted to exist already. Matching file hashes proves integrity against the manifest, not that the renderer's calculation was correct or the chosen manifest authentic. Seed provenance, renderer identity and the historical-media commitment remain separate requirements. Do not silently rerender or replace the offered rendition after bidders have inspected it.

**Readiness is visible information, not auction authority.**

Display two independent facts: on-chain eligibility/auction phase and observed media publication status. Useful media statuses are preparing, published and checked, partial, and unavailable. Include an actual last-check time where appropriate. Do not infer readiness merely from token age.

Under the approved permissionless policy, the seven-day boundary still makes the lot eligible if hosting fails. Show a prominent explanation and independent media/provenance access where possible. Do not add an administrator's delay/cancel power or represent a website button as the authority over contract eligibility. A funded bidder may choose to proceed, and the first bid does not certify public media availability.

The alternative “bidding is impossible until correct art is available to everyone” is not selected. A fixed delay cannot enforce it; it would require an explicitly trusted publication attestation or a much larger verification/data-availability design. The user accepted eligibility without such a gate. Open media choices concern identifying, authenticating and preserving the artwork, not reopening this timing decision.

**The extension behavior and minimum-increase requirement are now confirmed.**

The user selected the soft-close rule: a valid bid accepted during the final ten minutes, before the auction ends, leaves ten minutes remaining. A bid with one hour remaining leaves the deadline unchanged; a bid with two minutes remaining moves the deadline to ten minutes after that bid. At exactly ten minutes remaining, the deadline does not change. Expired auctions cannot be revived by a late transaction. The auction does not add ten minutes after every early bid.

The user also confirmed a 10% minimum increase while allowing larger jumps. A collector can offer 100 ETH whenever that meets the current minimum and is fully funded. The minimum is a lower bound, not a required exact step or a maximum. Round the required increase up to whole wei. Sources and examples are in [Auction start and sale policy](auction-start-and-sale-policy.md).

The reason for requiring a minimum increase is to discourage repeated tiny extensions. Banning self-raises alone would not solve that behavior because multiple wallets can alternate and displaced funds remain refundable. The confirmed 10% increase reduces that opportunity while preserving arbitrary larger jumps, but it does not guarantee a finite auction or independently owned bidders.

**Source evidence:** [production seed loop](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/run.py:1126), [generator timeout option](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/run.py:1009), [package pipeline](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/run.py:791), [upload path](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/run.py:727), and [cycle finalization ordering](/Users/tarasbobrovytsky/Dev/Cosmic-Signature/contracts/production/MainPrizeV2Base.sol:84). This was a read-only review; no rendering run or throughput benchmark was performed.
