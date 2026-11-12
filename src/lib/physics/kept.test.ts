import { describe, expect, it } from 'vitest';
import { symmetryCopies } from './framing';
import { KEPT_MARGIN, keptAt, keptPlacement } from './kept';

/** A frame of the plate's proportions, small enough to read: 1,000 by 600, its margin 27. */
const WIDTH = 1_000;
const HEIGHT = 600;
const margin = KEPT_MARGIN * HEIGHT;
/** One copy's three bodies as a path's first sample holds them: x then y, body by body. */
const sample = (...bodies: [number, number][]) => Float32Array.from(bodies.flat());

describe('where a picture that stays with one body holds it', () => {
  it('at the middle, where the other two stay in the picture', () => {
    const pixels = sample([300, 200], [420, 260], [380, 150]);
    const kept = keptPlacement(pixels, 1, 0, WIDTH, HEIGHT);
    expect(kept.towards).toBe(1);
    expect([...kept.anchors]).toEqual([500, 300]);
    // The other two stand from it as they stood: the picture is moved, and nothing else.
    expect(keptAt(kept, pixels, 6, 0, 0)).toEqual([500, 300]);
    expect(keptAt(kept, pixels, 6, 0, 1)).toEqual([620, 360]);
    expect(keptAt(kept, pixels, 6, 0, 2)).toEqual([580, 250]);
  });

  it('only as far towards the middle as keeps every body a margin inside the picture', () => {
    // Body 3 stands 400 below body 1: with body 1 at the middle it would be 100 off the sheet.
    const pixels = sample([300, 100], [350, 140], [320, 500]);
    const kept = keptPlacement(pixels, 1, 0, WIDTH, HEIGHT);
    // Body 1 would come down 200; body 3 has 73 before the margin: 0.365 of the way.
    expect(kept.towards).toBeCloseTo(0.365, 12);
    expect(keptAt(kept, pixels, 6, 0, 0)[0]).toBeCloseTo(373, 9);
    expect(keptAt(kept, pixels, 6, 0, 0)[1]).toBeCloseTo(173, 9);
    expect(keptAt(kept, pixels, 6, 0, 2)[1]).toBeCloseTo(HEIGHT - margin, 9);
    // The other way it is the same: body 3 may rise only until body 1 reaches the margin above.
    const risen = keptPlacement(pixels, 1, 2, WIDTH, HEIGHT);
    expect(risen.towards).toBeCloseTo(0.365, 12);
    expect(keptAt(risen, pixels, 6, 0, 0)[1]).toBeCloseTo(margin, 9);
  });

  it('takes no body that already stands within the margin nearer the edge', () => {
    // Body 2 stands 10 from the right edge: nothing may move right, and body 1 stays put.
    const pixels = sample([200, 300], [990, 310], [600, 280]);
    const kept = keptPlacement(pixels, 1, 0, WIDTH, HEIGHT);
    expect(kept.towards).toBe(0);
    expect([...kept.anchors]).toEqual([200, 300]);
    // Body 2 itself may be brought to the middle: the others move away from that edge.
    const other = keptPlacement(pixels, 1, 1, WIDTH, HEIGHT);
    // Body 1 would go 490 left of 200; it has 173 before the margin.
    expect(other.towards).toBeCloseTo(173 / 490, 12);
    // The near edges are held the same way. Body 2 stands 10 from the left edge, and body 3
    // 10 from the top: body 1, right of the middle and below it, may come neither left nor up,
    // and is taken none of the way: never a step back from where the film left it.
    const near = sample([800, 500], [10, 310], [600, 10]);
    const held = keptPlacement(near, 1, 0, WIDTH, HEIGHT);
    expect(held.towards).toBe(0);
    expect([...held.anchors]).toEqual([800, 500]);
  });

  it('follows the body through a path, sample by sample', () => {
    const pixels = Float32Array.from([
      ...[300, 200, 420, 260, 380, 150],
      // A sample later body 1 has moved 40 right and 10 up, body 2 not at all.
      ...[340, 190, 420, 260, 400, 100],
    ]);
    const kept = keptPlacement(pixels, 1, 0, WIDTH, HEIGHT);
    expect(keptAt(kept, pixels, 6, 1, 0)).toEqual([500, 300]);
    expect(keptAt(kept, pixels, 6, 1, 1)).toEqual([580, 370]);
    expect(keptAt(kept, pixels, 6, 1, 2)).toEqual([560, 210]);
  });

  it('brings every copy of a kaleidoscopic work the same share of its own way', () => {
    // Six turns and their mirrors about the middle of the frame, shrunk as the renderer shrinks
    // them (framing.ts): the first sample placed copy by copy.
    const copies = symmetryCopies('dih6', WIDTH, HEIGHT);
    const bodies: [number, number][] = [
      [620, 380],
      [700, 300],
      [430, 240],
    ];
    const pixels = new Float32Array(copies.length * 6);
    copies.forEach((copy, c) =>
      bodies.forEach(([x, y], body) => {
        const dx = (copy.mirror ? -1 : 1) * (x - WIDTH / 2);
        const dy = y - HEIGHT / 2;
        pixels[(c * 3 + body) * 2] = WIDTH / 2 + (dx * copy.cos - dy * copy.sin) * copy.scale;
        pixels[(c * 3 + body) * 2 + 1] = HEIGHT / 2 + (dx * copy.sin + dy * copy.cos) * copy.scale;
      }),
    );
    const kept = keptPlacement(pixels, copies.length, 0, WIDTH, HEIGHT);
    expect(kept.towards).toBe(1);
    // At the middle every copy of the body stands on the others…
    for (let copy = 0; copy < copies.length; copy++) {
      const [x, y] = keptAt(kept, pixels, copies.length * 6, 0, copy * 3);
      expect(x).toBeCloseTo(WIDTH / 2, 3);
      expect(y).toBeCloseTo(HEIGHT / 2, 3);
    }
    // …and the other bodies' copies are the same kaleidoscope, about the body: each as far from
    // the middle as the first.
    const far = (drawn: number) => {
      const [x, y] = keptAt(kept, pixels, copies.length * 6, 0, drawn);
      return Math.hypot(x - WIDTH / 2, y - HEIGHT / 2);
    };
    for (let copy = 1; copy < copies.length; copy++) {
      expect(far(copy * 3 + 1)).toBeCloseTo(far(1), 3);
      expect(far(copy * 3 + 2)).toBeCloseTo(far(2), 3);
    }
    // Ink draws the first copy alone, and is placed by it alone.
    expect(keptPlacement(pixels, 1, 0, WIDTH, HEIGHT).anchors).toHaveLength(2);
  });

  it('holds a body the generator left at the frame’s own margin free to move', () => {
    // The generator fits the orbit's box with a twenty-second of the frame about it: a body
    // that ends the film at the bottom of the box stands 27.3 of 600 from the edge, and the
    // margin (27) lets it be brought down no further, yet lets the others be brought towards it.
    const pixels = sample([400, 600 - 600 / 22], [500, 200], [620, 260]);
    // (Single-precision pixels: to the sixth place.)
    expect(keptPlacement(pixels, 1, 1, WIDTH, HEIGHT).towards).toBeCloseTo(
      (600 / 22 - margin) / 100,
      6,
    );
    // The body at the margin is itself brought up towards the middle, until body 2 above it
    // reaches the margin at the top.
    expect(keptPlacement(pixels, 1, 0, WIDTH, HEIGHT).towards).toBeCloseTo(
      (200 - margin) / (600 - 600 / 22 - 300),
      6,
    );
  });

  it('brings a turned copy part of the way by the same share, each copy its own way', () => {
    // Four quarter turns about the middle, shrunk as the renderer shrinks them. Body 1 stands
    // far to the right in the first copy, so in the second it stands far down: bringing body 2
    // to the middle is stopped by a copy other than the first.
    const copies = symmetryCopies('rot4', WIDTH, HEIGHT);
    const bodies: [number, number][] = [
      [960, 310],
      [300, 330],
      [520, 280],
    ];
    const size = copies.length * 6;
    const pixels = new Float32Array(size);
    copies.forEach((copy, c) =>
      bodies.forEach(([x, y], body) => {
        const dx = x - WIDTH / 2;
        const dy = y - HEIGHT / 2;
        pixels[(c * 3 + body) * 2] = WIDTH / 2 + (dx * copy.cos - dy * copy.sin) * copy.scale;
        pixels[(c * 3 + body) * 2 + 1] = HEIGHT / 2 + (dx * copy.sin + dy * copy.cos) * copy.scale;
      }),
    );
    const kept = keptPlacement(pixels, copies.length, 1, WIDTH, HEIGHT);
    // The largest share that keeps every copy's bodies inside the margin, found here by halving.
    const fits = (share: number) =>
      copies.every((_, c) =>
        [0, 1, 2].every((body) => {
          const x = pixels[(c * 3 + body) * 2] + (WIDTH / 2 - pixels[(c * 3 + 1) * 2]) * share;
          const y =
            pixels[(c * 3 + body) * 2 + 1] + (HEIGHT / 2 - pixels[(c * 3 + 1) * 2 + 1]) * share;
          return x >= margin && x <= WIDTH - margin && y >= margin && y <= HEIGHT - margin;
        }),
      );
    let [low, high] = [0, 1];
    for (let step = 0; step < 40; step++) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    expect(kept.towards).toBeGreaterThan(0.05);
    expect(kept.towards).toBeLessThan(0.95);
    expect(kept.towards).toBeCloseTo(low, 6);
    // The first copy alone would let it go further: the share is found over every copy drawn.
    expect(keptPlacement(pixels, 1, 1, WIDTH, HEIGHT).towards).toBeGreaterThan(kept.towards + 0.05);
    // Each copy holds its own copy of the body that share of its own way to the middle…
    copies.forEach((_, c) => {
      const [x, y] = [pixels[(c * 3 + 1) * 2], pixels[(c * 3 + 1) * 2 + 1]];
      expect(kept.anchors[c * 2]).toBeCloseTo(x + (WIDTH / 2 - x) * kept.towards, 6);
      expect(kept.anchors[c * 2 + 1]).toBeCloseTo(y + (HEIGHT / 2 - y) * kept.towards, 6);
    });
    expect(kept.anchors[2]).not.toBeCloseTo(kept.anchors[0], 0);
    // …and the others of that copy stand from it as they stood.
    const [x, y] = keptAt(kept, pixels, size, 0, 3);
    expect(x - kept.anchors[2]).toBeCloseTo(pixels[3 * 2] - pixels[4 * 2], 4);
    expect(y - kept.anchors[3]).toBeCloseTo(pixels[3 * 2 + 1] - pixels[4 * 2 + 1], 4);
  });
});
