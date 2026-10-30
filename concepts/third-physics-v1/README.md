**Third Physics v1 — a working study**

An isolated study, made 29 October 2026, for the direction proposed in [docs/third-physics.md](../../docs/third-physics.md). It touches no production code. Every pixel of art it shows comes from the published stills. Everything that moves is moved by the work's own physics.

**Run it.** From the repository root:

```sh
python3 -m http.server 4317 --bind 127.0.0.1
```

Then open [http://127.0.0.1:4317/concepts/third-physics-v1/](http://127.0.0.1:4317/concepts/third-physics-v1/). The page reads the fonts from `node_modules` and the stills from `public/art/stills`, so serve the repository root, not this folder. WebGL is needed for rooms II and III; WebGL2 with float render targets gives the best result in room III.

**The three rooms**

1. **The orbit, re-performed.** A worker re-derives № 031 from its published seed. [orbit.js](orbit.js) is a line-for-line port of the generator's `Sha3RandomByteStream`, `random_body`, `shift_bodies_to_com` and Yoshida-4 step, with a Keccak-f[1600] inside, because WebCrypto has no SHA3. It derives all 100,000 candidate beginnings, sets candidate 77,741 in motion for 1,000,000 warm-up steps and 1,000,000 recorded steps, then compares the result with the published `nft_traits.json`.
   - The masses, total energy, angular momentum and the closest approach (80.20379580764032 between bodies 1 and 3 at step 255,842) agree to the last bit.
   - The drawing shows the orbit in the plane of its greatest extent, paced like the 30-second film.
   - The strip at the bottom plots the three pairwise separations over the recorded window.
   - The field above the table holds the 100,000 beginnings: energy against angular momentum.
2. **The crossing, in the order it was made.** It crosses between the published Ink and Light stills of № 031.
   - Light arrives in the order the Light film drew each pixel. Ink returns in the order the Ink film's pixels came to rest.
   - The walls of the room continue the front.
   - The type inverts as the front passes it, because it uses `mix-blend-mode: difference`.
   - `When` is the analysis lens: each mark is coloured by the moment it arrived. It is labelled as an analysis, not the work.
   - Drag across the wall to hold the crossing anywhere. Past 40 % it completes.
3. **All the light.** The 72 Light stills (1280 rungs) are added in linear light on the GPU and compressed with a soft shoulder.
   - Point anywhere to name the orbits that pass through that place.
   - Choose to leave one orbit alone. The page then shows that work's own untouched still over the index.

**What the numbers are.** [tools-rederive-orbit.mjs](tools-rederive-orbit.mjs) is the Node version of room I. On 29 October 2026 it re-derived works 000, 023, 031, 035, 060 and 071. Every published mass, energy, angular momentum and closest approach matched exactly, including the ejection orbits. With Node's native SHA3, deriving the stream up to the chosen candidate took 0.1–0.65 s, and integrating the 2,000,000 steps took about 0.22 s. The study's pure-JavaScript Keccak takes about 1.6 s in Node to derive all 100,000 beginnings. A hidden or background tab throttles it heavily: the study's own readout reported 11 s there.

The visual profile and the Borda weights consume 23 stream draws before the candidates (24 for work 071). The study finds that offset by locating the published masses in the stream. It then verifies everything else independently: the energy, the angular momentum and a closest approach after 1.26 million chaotic steps. A production port derives the offset from the profile code instead, so the masses become an independent check too.

**Arrival maps.** [tools-arrival-map.mjs](tools-arrival-map.mjs) decodes a film at 576 px wide and 30 fps and records the following:
- **Light:** for each pixel, the first frame at which it reaches half its final brightness. For 031, 99.6 % of lit pixels stay lit, so marks stay where they were drawn.
- **Ink:** for each pixel, the frame after which it stays within 10 levels of the final still.
- **Ground pixels:** these take the time of the nearest mark, plus travel at 0.35 of the film per diagonal, through a two-pass weighted chamfer transform. The result is then softened.

Sources:
- `31-light-main.mp4`: the published `videos/web/main.mp4`, sha256 `5eacf3b9…ab94`, identical to the collection index.
- `public/art/31-ink-preview.mp4`: the verified 1280 complete Ink film.

[tools-sum-light.mjs](tools-sum-light.mjs) writes the static 1280 version of room III.

**Screenshots** are in [screenshots/](screenshots/). They were captured at 1440 × 900 in the in-app browser and saved at 800 × 500. Files 09–11 are the full-size analysis outputs.
