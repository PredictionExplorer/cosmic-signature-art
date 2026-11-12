# The documents

Every plan and record behind cosmic.art, one line each. Start with the [README](../README.md) for what the venue is and the principles it keeps, and [ARCHITECTURE.md](../ARCHITECTURE.md) for how it is built. Then read the plans in order:

1. Two Grounds, 26 October 2026: the vision and its first phases.
2. Third Physics, 29 October: Phases A to E.
3. First Light, 7 November: F0 to F4, under way.
4. After the frame, 10 November: the true ending and the object behind the picture. Planned; its first step is built.

Each phase note records what shipped, how it was proved, and what it left open. Dates are UTC.

## Vision and plans

- [world-class-gallery-vision.md](world-class-gallery-vision.md): the Two Grounds plan. It begins with an audit of the live site and a benchmark of 31 reference sites, then sets out the vision and Phases 0 to 2.
- [third-physics.md](third-physics.md): the direction after Two Grounds, physics upon physics upon the page, with its working study in `concepts/third-physics-v1`.
- [first-light.md](first-light.md): the current programme. It covers First Light, the phases F0 to F4, the performance budgets (§9) and F0 and F1 as built (§12–13).
- [after-the-frame.md](after-the-frame.md): the phase after First Light. It holds an audit of every work's fate and computed energy, what the literature says about awe and being moved, what nine designers changed in a first draft, the steps in order, the owner's open decisions, and what is built so far: steps 0 and 2, and two slices of step 3 (§8.1 to §8.4).
- [art-direction-exploration.md](art-direction-exploration.md): the first creative exploration of 22 October: the Passage and the Atlas, Ink first, and movement as the organising theme.
- [art-presentation-research.md](art-presentation-research.md): research, from their own pages, into how leading digital art venues present work.
- [site-and-collector-experience.md](site-and-collector-experience.md): the brief for what the site should make a visitor and a collector feel and do.
- [decision-register.md](decision-register.md): the accepted rules, and the launch decisions still open.
- [implementation-and-validation.md](implementation-and-validation.md): the first build's record, of 22 October: what was delivered, the evidence, and the work left before release.

## Phases

In the order they shipped. Third Physics Phases A and E are listed under physics and verification below. First Light's F0 and F1 are recorded in [first-light.md](first-light.md) §12–13.

- [phase-1-signature-moments.md](phase-1-signature-moments.md): Two Grounds Phase 1. It brought the typefaces and tokens, the edgeless plate, the Turn and the night wing.
- [phase-2-the-plates-move.md](phase-2-the-plates-move.md): Two Grounds Phase 2. Every plate moves honestly, through settling and opening clips and the still ladder. The sale is bound as a catalogue, and the exhibitions open.
- [third-physics-phase-b.md](third-physics-phase-b.md): the crossing. The Turn follows the order in which each film made its marks, and the When lens shows that order.
- [third-physics-phase-c.md](third-physics-phase-c.md): the collection's two other indexes, All the light and the Orrery.
- [third-physics-phase-d.md](third-physics-phase-d.md): two equal expressions, phones, and the events. It includes each work's frame on its Light film.

## Physics and verification

- [third-physics-phase-a.md](third-physics-phase-a.md): the orbit, re-performed. Each work's orbit is re-derived from its seed in the browser, and proved equal to the published record to the last bit.
- [third-physics-phase-e.md](third-physics-phase-e.md): the film's score, the Wavelength lens, and Verify an orbit, where a visitor watches their own browser reach the published record.

## The code

- [codebase-review.md](codebase-review.md): the review of 9–10 November 2026. It lists 46 findings, each made by one reviewer and confirmed by a second who was told to refute it, in the order to take them, with what the codebase does well and must keep.

## Media pipeline

- [collection-index.md](collection-index.md): the collection index, one build-time read of every published record (`npm run art:index`).
- [collection-preview-delivery.md](collection-preview-delivery.md): the catalogue's eight-second Ink excerpts, how each is bound to its source, and the offline step that cuts them (`npm run art:previews`).
- [plate-derivatives.md](plate-derivatives.md): the venue's own cuts of the publisher's files: excerpts, settling and opening clips, the still ladder and plate records. Each is cut from a source whose hash was checked, and never tinted, cropped or re-timed.
- [plate-records.md](plate-records.md): each still's measured ground, weighted centre and detail windows, keyed to the still's hash (`npm run art:plates`).
- [media-and-indexer-integration.md](media-and-indexer-integration.md): the indexer and renderer APIs the venue reads, media integrity, custody and fallbacks, and changes suggested for the Go service.

## Auction

- [contract-architecture-and-auction-rules.md](contract-architecture-and-auction-rules.md): the approved contract design and its trust boundaries.
- [auction-start-and-sale-policy.md](auction-start-and-sale-policy.md): the agreed model, a public preview and then an English auction started by the first funded bid.
- [preview-and-artwork-readiness.md](preview-and-artwork-readiness.md): why a work becomes eligible seven days after its cycle's successful finalization.
- [remaining-auction-rules.md](remaining-auction-rules.md): the accepted defaults for the remaining rules, including direct bids, no administrator overrides and the 10% raise.
- [auction-frontend-review.md](auction-frontend-review.md): the engineering review of the auction client, its amounts and its transaction flow.
- [ecosystem-and-delivery-plan.md](ecosystem-and-delivery-plan.md): how the auctions sustain future cycles: issuance, reserve economics and operations.
- [local-auction-rehearsal.json](local-auction-rehearsal.json): the record of the local rehearsal against the real contracts: artifact and source hashes, four browsers' transactions, and the final accounting.

## Typography

- [typography.md](typography.md): the audit of 5 November 2026. It inventories every family, size and surface, and records its decisions.
- [typefaces.md](typefaces.md): the two faces, Literata and IBM Plex Mono, their matched stand-ins, the CJK display faces, and the check that every glyph is drawn.

## Images

[screenshots/](screenshots/) holds the contact sheets and the evidence the documents cite.
