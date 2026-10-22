**Presentation research — October 22, 2026.**

This is source-grounded input to the creative exploration, not a ranking of the world's best galleries. Official pages were reviewed for their curatorial and media choices. Feral File's home, exhibition catalogue and Ex Nihilo page, Refik Anadol's Unsupervised page, and Ryoji Ikeda's X-verse page were also inspected visually in the browser. The other observations below are based on official page content rather than tested UI behavior. All proposed applications are design judgments.

**Useful reference principles**

| Reference | Observed presentation | Principle to adapt |
| --- | --- | --- |
| [Feral File: Ex Nihilo](https://feralfile.com/exhibitions/ex-nihilo-a3c) | Exhibition identity, substantial artwork, artist context, essay, interview and playlist/live-work links; the exhibition persists after collecting | Build lasting exhibitions with cultural context and optional depth |
| [Feral File: Digital Art System](https://feralfile.com/system) | A display system for images, video, software and curated viewing sequences | Let people live with work through a clean display/viewing mode, without requiring a virtual building |
| [Art Blocks](https://www.artblocks.io/) and [generator documentation](https://docs.artblocks.io/protocol/on-chain-generator/) | Aesthetic discovery, collection/artist/editorial routes, and access to generated work | Distinguish collection discovery from experiencing one work; do not imply the Rust renderer runs live in a browser |
| [Casey Reas: Process](https://reas.com/process) | Rules, resulting images, paired realizations, time-based work and installations | Keep a body of work legible across different media and scales |
| [Refik Anadol: Unsupervised](https://refikanadol.com/works/unsupervised/) | Large video, installation context, process imagery, credits and media specifications; a captured preview is identified for computationally intensive work | Give moving art physical presence and describe the medium honestly |
| [Ryoji Ikeda: X-verse](https://www.ryojiikeda.com/project/x_verse/) | Related installations presented with photographs, film, scale, materials and exhibition history | Use scale and negative space deliberately; keep art and documentation complementary |
| [Whitney: artport](https://whitney.org/artport) | Web-native commissions, museum context and named programming formats | Treat the web as an exhibition medium, with optional repeat-visit programming |

The transferable lessons are scale, curatorial sequence, time, authorship and a durable record. None requires copying another artist's signature aesthetic. Auction-house conventions remain relevant to collecting; they should not dictate the gallery's entire visual language.

**What was verified in Cosmic Signature's own work**

The main generator checkout is older than the current ink worktree. Current ink source and documentation were inspected at [ember-edition.md](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/.claude/worktrees/art-color-ink-effects-07ed9a/docs/ember-edition.md:3). This distinction matters when implementing media discovery; a capability in a worktree does not establish availability for every deployed token.

- Color presents accumulated three-body trajectories as luminous geometry, with several seed-driven stroke vocabularies.
- Current ember-v4 ink uses the orbit to drive solid bodies through a two-dimensional Navier–Stokes fluid carrying monochrome pine-soot sumi over warm kozo. The older vermilion accent has been retired.
- Normal color and current ink films share source framing/projection and corresponding source frames. The fluid transports the marks, so final visual geometry is not simply a monochrome tracing of the color image.
- Both normal films end at their corresponding stills. The [color source](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/src/app.rs:1098) saves the last raw video frame; ink documentation describes the equivalent relationship. Lossy encoded derivatives can differ slightly, so promise a visual continuation rather than byte identity.
- Longer ink films include extra simulated frames. Their timing can include trimmed blank pre-roll, so source-frame mapping is required for accurate synchronization. See the [timing design](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/.claude/worktrees/art-color-ink-effects-07ed9a/docs/ember-design.md:1162).
- The [spectral pipeline](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/docs/spectral-algorithm.md:746) provides wavelength-band views and a sweep of the completed luminous image. It is not a replay of orbit time.
- The [fluid3d lab](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/.claude/worktrees/3d-fluid-art-brainstorm-d7950c/tools/fluid3d/DESIGN.md:3) explores additional volumetric materials, but is not yet a standard third interpretation of every NFT. Its own scope excludes some production cost/determinism requirements.

**Actual paired references inspected**

These local published-reference captures are 3456 × 2234, approximately 1.547:1. The referenced study includes token/seed and ember-v4 certificates. This inspection does not assert that every current public endpoint serves the same version.

| Token | Color | Ink | Why useful for design |
| --- | --- | --- | --- |
| 23 | [Light](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-23-main_image_url.webp) | [Ink](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-23-ink_image_url.webp) | Airy red/blue/green ribbons and a denser ink cluster with pale eddies |
| 31 | [Light](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-31-main_image_url.webp) | [Ink](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-31-ink_image_url.webp) | Violet/olive/rose orbital form; ink spreads across the sheet; strong equal-scale diptych |
| 35 | [Light](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-35-main_image_url.webp) | [Ink](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-references/nft-35-ink_image_url.webp) | Diagonal lime/violet motion and an ink mass toward the upper right |

The root review visually inspected the 23 and 31 pairs, and the renderer research agent inspected all three. The image-generation concept study used the authentic token-23 pair as input; original files were not modified. Generated concept imagery must never replace the collection's published assets.

**Media useful for a later motion study**

- [Normal ink sample](/Users/tarasbobrovytsky/museum-lab/ember-v4-sample/0x70f70932_ember_30s.mp4).
- [Medium ink sample](/Users/tarasbobrovytsky/museum-lab/ember-v4-sample/0x70f70932_ember_medium_2min.mp4): inspected metadata reports 111.15 seconds at 3456 × 2234, 60 fps, roughly 187 MB. The nominal “two minute” label is not an exact universal duration.
- [Corresponding color sample](/Users/tarasbobrovytsky/museum-lab/round7/0x70f70932/main.mp4).
- [Published native ink control for token 31](/Users/tarasbobrovytsky/museum-lab/viscosity-study-2026-10-18/published-native-controls/nft-31/videos/web/ember.mp4).
- [Spectral smoke-test film](/Users/tarasbobrovytsky/Dev/CS-Image-Generation/output/viz-smoke8/videos/web/spectral_sweep.mp4), a generator example rather than asserted published NFT media.

The large source files establish an artistic opportunity, not a finished web-delivery solution. Intentional preview encodes, posters and adaptive delivery remain future implementation work. No new rendering job, frontend, or media-player code was run or created in this research.
