**The site should make people want to spend time with the art.**

The user's latest brief raises the ambition beyond the earlier quiet-museum presentation: the venue should astonish, feel artistically authored, and reveal multiple authentic expressions of each work. [Art direction exploration](art-direction-exploration.md) is now the leading creative document; [Art presentation research](art-presentation-research.md) grounds it in actual assets and external references. The current recommendation combines a dramatic Light/Ink passage, a composed visual atlas and artist's-book typography. These concepts remain proposals. This document retains the information architecture and collector requirements beneath that experience; approved auction rules do not change.

The user has since selected The Passage and The Atlas and made movement the organizing theme, with Ink as the primary encounter. The [v2 moving mockup](../concepts/passage-atlas-v2/README.md) uses real Ink films, a cinematic material curtain and a fluid, selectable Atlas. Navigation and financial controls remain stable while art and presentation move. This latest steering takes precedence over the earlier Light-first or primarily static examples below; detailed choreography remains subject to review.

Cosmic Signature remains the main identity. The domain is cosmicsignature.art; “The Cosmic Signature Gallery” is a descriptive phrase, not a second token collection. Auctions are a clear part of the gallery. A separate auction brand is unnecessary at launch. “New Works No. 01” is the simplest exhibition title; “Constellations” is an optional recurring title, not an approved name.

Every existing work remains part of the permanent collection. Auction origin is provenance, not a superior class of artwork. Eight new works are eight separate lots within one exhibition. A collector may buy one or several; eight lots do not imply eight different owners.

**The latest creative directions build on the earlier museum foundation.**

| Direction | Character | Tradeoff |
| --- | --- | --- |
| The Passage | A work changes from luminous color into its actual ink interpretation; the surrounding material atmosphere changes with it | Recommended defining encounter; must remain meaningful after the first reveal |
| The Atlas | A composed field of substantial works reorganizes around visual relationships | Recommended collection direction; preserve orientation and a clear index |
| The Unfolding Book | Monumental plates, diptychs, films and precise editorial typography | Recommended compositional language; must scale across content and locales |
| The Screening Room | Actual films unfold and resolve into their corresponding stills | A deliberate artwork mode; avoid compulsory pacing or heavy media before intent |

Use the artwork's native aspect ratio. Avoid cropping it into uniform cards, tinting it, placing buttons over it, or using it as a decorative background. Clearly identified detail studies may crop intentionally while keeping the full composition recoverable. One deliberately chosen moving work can introduce the site; a page of autoplaying videos would compete with the art. Future genuine spatial interpretations should be supported without requiring a simulated 3D museum.

**Keep the primary navigation to Collection, Auctions, Process, and About.**

| Route | Main job | Essential content |
| --- | --- | --- |
| / | Introduce the art | One substantial work, a short artistic statement, current exhibition, a path into the collection |
| /collection | Browse every work | Native-ratio grid, search, visual filters, creation date/cycle, availability, pagination or accessible progressive loading |
| /artworks/{tokenId} | Permanent artwork record | Image and film, wall label, ownership, provenance, rights, optional auction panel |
| /auctions | Find sales | Current, upcoming, and completed exhibitions with actual on-chain status |
| /auctions/{saleId} | Inspect an eight-work sale | Exhibition introduction, all lots, rules, deadlines, live state, results, funding receipts |
| /process | Explain why the work looks this way | Three-body physics, deterministic orbit selection, visual vocabulary, seed and renderer relationship |
| /about | Establish authorship and context | Artistic authorship, project history, the existing collection, connection to the broader protocol |
| /collecting | Explain the transaction | ETH on Arbitrum, auction rules, refundable funds, settlement, token ownership, anchoring, fees |
| /activity | Show a collector's actions | Leading bids, total committed ETH, refundable credits, acquired works, pending delivery and transaction history |
| /terms, /privacy, /accessibility | Document site policies | Policies specific to this venue and its actual services |

Artwork URLs use stable token IDs, not owner-assigned names. A work's page remains after its auction and ownership changes. A sale is a separate record from the source cycle. Under the approved first-funded-bid model, an unbid work waits indefinitely in its original listing rather than needing another sale attempt or artwork page.

**The permanent collection needs both discovery and continuity.**

Preserve filter and scroll context when someone opens a work and returns. Let visitors search by token ID, current name, owner address, and cycle. Visual discovery may use color, composition, motion, and verified renderer traits. Separate subjective editorial groupings from computed traits. Treat rarity ranks as optional technical information rather than the organizing principle of the museum.

On ordinary collection cards, a small “In auction” label is enough. Prices belong in the auction experience. A privately owned work must not appear available merely because it is visible in the gallery. No wallet is needed to browse, watch films, read provenance, or download published media.

Later editorial exhibitions can combine old and new works by visual relationship without changing tokens or ownership. This is a better early extension than building a general secondary marketplace.

**An artwork has a quiet wall label and a deeper record.**

The first view gives the work and its identity exceptional prominence, with restrained viewing controls. Deeper labels carry date and process. Interpretations such as Light and Ink are separate from presentations such as Still, Film and available long studies; spectral exploration is a study lens within the luminous work. Future spatial media must fit this expandable model. All remain presentations of the same token unless the collection's actual rules say otherwise. Do not describe each rendition as another NFT or edition, or confuse Light/Ink with a cosmetic site-theme toggle.

The expanded record contains the collection and network, token ID, original cycle, creation transaction, seed, renderer revision/configuration, manifest and media hashes when available, distribution route, first recipient, auction history, and current custody/ownership. If a token is held in an anchoring contract, do not present that contract address as an ordinary collector; show the participant relationship only when verified by the relevant contract records.

Explain existing once-ever anchoring eligibility and whether it has been used. Auction escrow should never use that eligibility before delivery. Link to the app for utility actions with the exact token and locale context. Artwork presentation stays primary, but token utility must not be concealed.

The existing project describes its artwork as CC0. Explain that purchasing a token establishes token ownership and provenance; it does not grant exclusive copyright to an otherwise public-domain image. Preserve owner naming history and distinguish mutable display names from stable identity.

For a future sale-specific media commitment, show the exact inspected media and its version. Existing collection URI controls remain separate. A new render should not silently replace the visual record of what a previous collector bought.

**The auction room should be clear and lively without taking over the gallery.**

The operational target is to present all eight finished works together before bidding. Fixed eligibility cannot guarantee that media is ready; missing-media behavior must follow the chosen opening policy described in the contract plan, without inventing an operator veto. Each work has a tiny public opening minimum and, once started, its own high bid, minimum next bid, deadline, and eventual result. A desktop view can place the selected artwork beside a calm bidding panel; on mobile, place the panel below the work or in a clearly invoked sheet. Let collectors move among lots without losing the exhibition context.

All lots become eligible together after a fixed preview interval, but the approved auction clock starts independently with each work's first funded bid. A lot without bids shows “Available to start” with its opening minimum and no closing countdown. Active lots show their own deadlines and extend independently. There is no guaranteed exhibition closing time or stagger. Show the current contractual deadline, never an obsolete original timer. Display local time with an explicit UTC equivalent and readable dates.

The user has confirmed the first-funded-bid model, a 0.00001 ETH opening minimum, and a 48-hour auction measured from the first funded bid. Valid bids accepted in the final ten minutes leave ten minutes remaining; earlier bids do not move the deadline. The confirmed minimum increase is 10%, with arbitrary larger funded jumps allowed. Show both the percentage and exact minimum next total, rounding the required increase up to whole wei. The approved eligibility interval is seven days from successful cycle finalization, regardless of media readiness. See [Auction start and sale policy](auction-start-and-sale-policy.md) and [Preview and artwork readiness](preview-and-artwork-readiness.md). A low first bid starts competition; it is not an immediate purchase.

Every review screen must show the work, exact bid in ETH, minimum increment, network, fees, destination of final proceeds, refund rule, and closing rule. The confirmed funding policy sends 100% of final winning payments to the existing game reserve, following its current distribution rules and carryover. Outbid deposits remain refundable. There is no buyer premium or platform commission. Network fees are additional and do not go to the game.

**Bidding is a sequence of distinct states, not a single button response.**

| Stage | Collector experience |
| --- | --- |
| Inspect | Understand the work and terms before connecting a wallet |
| Connect | Confirm wallet and Arbitrum; offer an explicit network switch when needed |
| Review | Show bid amount, ETH currently committed, withdrawable credit, amount newly required, and estimated transaction fee |
| Confirm in wallet | No bid exists until the user submits and the chain accepts it |
| Submitted | Show transaction status and explain that inclusion after the deadline will fail |
| Confirmed | Refresh chain state before saying “You are leading”; another bid may already have arrived |
| Outbid | Show the refund entitlement immediately after confirmation, with a clear action to return it to the wallet |
| Bidding ended | Say whether settlement is still pending |
| Settled | Show the winner and fixed result; distinguish entitlement from NFT delivery |
| Delivered | Show the confirmed NFT transfer and permanent artwork page |

Handle rejected wallet requests, replaced/cancelled transactions, reverts, changed minimums, extensions, chain reorganization, and stale RPC/indexer data. Never infer “won” just from a local timer reaching zero. An unavailable RPC should not prevent art browsing, but transactional controls must not pretend stale auction data is current.

The agreed first-release contract supports paying only the increment when raising one's own leading bid. Refund credits remain separately withdrawable; automatic reuse of credits for other bids is deferred unless explicitly designed and tested. The interface must match the chosen accounting exactly.

Show leading exposure across all lots separately from refundable credits. Funds in a refundable contract balance are not already back in the wallet. A collector must be able to direct a refund or NFT delivery to an address they control when their bidding wallet cannot accept it.

Permissionless settlement and delivery controls should be available as fallbacks even if normal automation usually handles them. Reminders may improve convenience, but email delivery must never determine bid validity. Watches can initially be browser-local; cross-device notifications introduce an optional account service.

**Media readiness and auction phase are different facts.**

The UI should show chain phase (preview, available to start, active, ended, settled), publication state (awaiting render, partial, ready, unavailable), and schedule certainty separately. A file hash does not establish that the file is available or that its rendering is correct. An eligibility countdown can run during preview; no auction closing countdown exists until the first funded bid.

The existing frontend uses legacy media paths and a one-hour heuristic for “Rendering.” The renderer now describes complete asset packages and hashes. The new frontend should consume a versioned manifest with explicit availability checks, including compatibility for old works. A seven-day delay is not proof of completed rendering or continued hosting. Publication failures need visible explanations and durable fallback access. Show ready media as soon as it is published, with a separate eligibility countdown; do not withhold previews until day seven. See the integration work in the ecosystem and readiness plans.

**The site should remain usable without premium hardware or perfect vision.**

Load responsive stills before films. Request video only on intent; do not preload eight high-resolution films in the auction catalogue. Preserve a static view for reduced-motion preferences. Support keyboard navigation, visible focus, accessible dialog behavior, descriptive artwork text, and touch-friendly controls. Updates to bids and deadlines should be accessible without announcing every countdown tick.

Browser display depends on color management and screen gamut. Label downloadable archival masters and browser derivatives accurately. Long zoom sessions, spectral exploration, and display mode are useful later features, not prerequisites for a trustworthy auction.

**Keep the art venue connected to the ecosystem without importing its dashboard.**

cosmicsignature.art owns discovery, collecting, and art records. cosmicsignature.com introduces the broader project. app.cosmicsignature.com owns cycle participation, anchoring, and protocol operations. Links should preserve token/cycle context and the full locale code. The .art and .com domains do not naturally share first-party cookies; do not assume locale preferences or application login state transfer automatically.

Plan for the existing eight locales: en, zh, zh-TW, zh-HK, uk, ko, ja, and vi; whether all launch together remains a frontend scope choice. Translate auction rules, refunds, pending states, rights, and contribution explanations as carefully as headings. Ordinary art-auction wording is the working default for this dedicated venue, consistent with the selected product and auction-house reference. Prepare its own scoped glossary without weakening the existing app's vocabulary rules or bypassing its scanner with escapes or exceptions.

Make the art venue the eventual canonical destination for public artwork records. Preserve existing app links initially. Later, redirect art-only pages or give retained app utility pages distinct purposes and metadata. Canonicals, sitemaps, social previews, and language alternates must agree.

**Reference points inspected for this plan:** [existing media handling](/Users/tarasbobrovytsky/Dev/cosmicgame-frontend/components/nft/signatureMedia.ts:19), [host routing](/Users/tarasbobrovytsky/Dev/cosmicgame-frontend/lib/hostRouting.ts:72), [renderer assets](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/README.md:88), [renderer/indexer contract](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/docs/augur-explorer-integration.md:1), and [Christie's explanation of online bidding and extensions](https://www.christies.com/en/help/buying-guide/register-and-bid). The planned venue uses the ascending auction concept, not Christie's custody, fee, identity-verification, or automatic maximum-bidding system.
