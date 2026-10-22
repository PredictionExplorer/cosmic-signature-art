**Passage + Atlas v2 — Ink in motion**

An isolated movement-first mockup, created October 22, 2026. Ink is now the primary presentation on the homepage, collection and supported artwork pages. Version 1 remains unchanged as a static baseline. No production frontend, wallet, contract integration or live financial data is included.

**Current local preview:** [Homepage](http://127.0.0.1:4317/index.html), [Moving Atlas](http://127.0.0.1:4317/collection.html), [Signature 31](http://127.0.0.1:4317/artwork.html?id=31).

**What changed**

- Homepage: the authentic Signature 23 Ink film plays immediately when motion is allowed, beginning at a deliberate nine-second excerpt point. The full composition is preserved. Typography enters as one block; the media surface travels slowly while the actual fluid imagery moves within it.
- Material passage: an approximately 1.2-second paper/dark curtain reveals the alternate interpretation. It is interface choreography between actual assets, not a simulated transformation of NFT pixels. The Light invitation sits outside the main artwork bounds.
- Atlas: three real Ink films form a moving exhibition. Selecting a work brings it into the central position; other surfaces move around it without restarting the selected film. Rehang changes the companions' arrangement while preserving the anchor. The associations are editorial, not invented similarity scores.
- Artwork pages: Ink film is the default where actual files exist. Pause, Restart and Still controls sit beneath the work. A complete-film viewer starts at zero. At the end, the focused work settles into its authentic final still.
- Motion control: Pause/Resume applies to automatic films and ambient movement, and the preference follows navigation in the same tab. Reduced-motion preference starts the experience still. Offscreen and background-tab playback is suspended.

The homepage and Atlas deliberately repeat forward-playing film excerpts after a final-frame hold and short poster fade. They do not reverse the fluid simulation or imply the finite source films are physically seamless loops. No verified local color films were available for these three selected tokens, so Light remains an honest still presentation.

**Actual media**

The twelve original still copies remain byte-for-byte unchanged. Their sources and hashes are in [assets.json](assets.json). The three Ink films were downscaled and encoded for local delivery at 1280 pixels wide and 30 fps, preserving duration, complete composition, display aspect ratio and color tags. No recoloring, reverse playback, artificial interpolation or new physical simulation was used. Detailed source/output provenance and hashes are in [media-previews.json](assets/media-previews.json).

The three self-contained film previews are about 8.06 MB, 15.74 MB and 8.35 MB. The additional Signature 23 frame at nine seconds is an inspection sample from the original film, not a replacement NFT still. The source renderer and original media were not changed.

**Try these interactions**

1. Watch the homepage's ink move, then choose Cross into Light and Cross into Ink.
2. Open the Atlas, select Signature 23 or 35, and watch the composition gather around it.
3. Rehang the constellation without changing the selected work.
4. Pause motion, navigate to a work, and resume there.
5. On an artwork page, compare both expressions, restart the film, or study the finished still.

**Saved composition studies**

- [Ink-first homepage](screenshots/01-home-ink.png)
- [Alternate Light homepage](screenshots/02-home-light.png)
- [Ink Atlas](screenshots/03-atlas-ink.png)
- [Ink artwork page](screenshots/04-artwork-ink.png)
- [Narrow-screen overview](screenshots/05-mobile-overview.png)

Screenshots use capture=1 to freeze animation on the real poster/still images. Use the interactive preview to judge movement, timing and continuity. The responsive-review page contains actual 390px-wide iframe views, not stretched desktop screenshots.

**Verification**

Browser checks confirmed decoded film playback, material switching, correct same-token media, recentering, pause state across navigation, and the artwork's film-to-still ending and restart. Mobile-size compositions were inspected visually. The Light invitation was moved outside the hero's full media bounds. JavaScript syntax checks passed; the twelve still-copy hashes match their source records; all three re-encoded films passed full decode verification. Reduced-motion behavior is implemented; no OS accessibility setting was changed for testing.

Run this mockup locally with:

    python3 -m http.server 4317 --bind 127.0.0.1 --directory /Users/tarasbobrovytsky/Dev/Cosmic-Signature-Art/concepts/passage-atlas-v2

All code is confined to this visual study. Typography, copy, choreography and delivery settings remain design exploration, not finalized production behavior.
