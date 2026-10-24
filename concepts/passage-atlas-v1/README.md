**Passage + Atlas — visual mockups, version 1**

Created October 22, 2026. The user selected The Passage and The Atlas for exploration and authorized code only for mockups. This folder is an isolated HTML/CSS/JavaScript study, not the production frontend. There is no wallet connection, contract call, live auction, ownership feed, framework scaffold or external service.

This is the preserved v1 study. The current [local preview](http://127.0.0.1:4317/index.html) now serves [v2 — Ink in motion](../passage-atlas-v2/README.md). Use the captures below to review v1, or start its separate preview with the command at the end of this file.

| View | Saved capture |
| --- | --- |
| Passage homepage, Light | [01-home-light.png](screenshots/01-home-light.png) |
| Atlas collection, Light | [02-collection-atlas.png](screenshots/02-collection-atlas.png) |
| Artwork room, Light | [03-artwork-light.png](screenshots/03-artwork-light.png) |
| Artwork room, Ink | [04-artwork-ink.png](screenshots/04-artwork-ink.png) |
| Atlas collection, Ink | [05-collection-ink.png](screenshots/05-collection-ink.png) |
| Passage homepage, Ink | [06-home-ink.png](screenshots/06-home-ink.png) |
| Narrow-screen studies | [07-mobile-overview.png](screenshots/07-mobile-overview.png) |

All desktop captures are full-page browser screenshots at 1280px viewport width. The responsive review uses three actual 390px-wide iframe viewports. The layouts include below-the-fold editorial content, so the captures have different heights.

**What can be tried**

- Navigation among home, collection and individual works.
- The homepage Passage switches the same Signature 23 between real Light and Ink files.
- The Atlas changes between a six-work Light selection and three real paired Ink works. “Follow the form” rearranges an editorial hang while retaining the selected Signature 31's position; it is not a computed similarity engine.
- Artwork pages switch interpretations where source files exist, show a paired view, and open a larger view.
- Signature 31 can play its actual local ink film. No other token's film is substituted for a missing file.
- The record panel identifies the study and its source manifest. No sale prices or current owners are invented.

**Artwork fidelity**

The twelve WebP files in assets are byte-for-byte copies of the local source images. They were not regenerated, cropped, recolored, stretched or retouched. Their full compositions are fitted at the source aspect ratio. The inventory, original locations and SHA-256 hashes are in [assets.json](assets.json).

The token-23/31/35 pairs are published-reference captures from the October 18 ink study. Additional Light images are the verified reading-page assets from cosmicgame-frontend. This is a fixed visual sample, not a statement that these images are all current live collection media.

The ink film now uses a repository-relative symlink to the bundled Signature 31 web preview in `public/art/31-ink-preview.mp4`. This keeps the study portable within a complete repository checkout without duplicating the original large movie. The saved historical screenshots remain unchanged. The still-image mockups are self-contained. Baskerville uses the local system font with Times/Georgia fallbacks; the PNG captures preserve the reviewed typography. A local Clash Display font is included for the wordmark.

**Verification completed**

The three main screens and the Ink variants were visually inspected. Light/Ink switching, paired viewing, editorial rearrangement and opening the authentic ink-film player were exercised. All twelve image-copy hashes match their source files. The primary preview had no browser error/warning logs during the checks. Narrow-screen compositions were inspected visually. No production application test suite was run because no production application code changed.

Add capture=1 to a mockup URL to disable transitions during screenshots. That is a capture convenience, not a separate layout. Mockup copy and detailed typography remain design proposals; this study does not ship untranslated production UI.

To restart the preview locally, run from the repository root:

    python3 -m http.server 4318 --bind 127.0.0.1 --directory concepts/passage-atlas-v1

The visual direction can evolve without modifying any approved auction economics or custody rules.
