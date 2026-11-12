/*
  The picture kept on one body (docs/after-the-frame.md §8.4). Past the recorded window a
  visitor may stay with one of the three instead of with the frame: that body then holds still
  in the picture, and the other two are drawn where they stand from it. It is a change of
  origin and nothing else: the same path (beyond.ts), in the work's own frame, at its own
  scale and the way up it was, moved along with one body.

  Where the body holds still. As far towards the picture's middle as keeps every body the
  picture draws a margin inside it as the film ends: the visitor chose among three lights they
  could see, and none of them is to be lost to the choosing itself, nor left at the very edge.
  No body that already stands within the margin is taken nearer the edge. Over the 58 works a
  visitor is asked about (those drawn in positions, with something past the window to perform)
  the body reaches the middle in 142 of the 174 pictures on Light, and is brought part of the
  way in 32: in 26 of those the middle would put another body off the picture, and in six only
  inside the margin.

  Kaleidoscopic works draw every stroke again, turned or mirrored about the frame's centre
  (framing.ts), and those copies are linear about that centre. So a body brought a share of the
  way to the middle is brought the same share in every copy, each copy's own way; and at the
  middle every copy of it coincides. The placement is therefore worked copy by copy from the
  placed pixels alone, with no need of the symmetry's own numbers.
*/

/**
 * Bodies keep this far inside the picture as the choosing ends, in heights of the frame. The
 * generator's own fit leaves a twenty-second of the frame about the orbit, so a body that ends
 * the film at the top or the bottom of the orbit's box stands 0.0455 of the height from the
 * edge. A margin wider than that would hold seven pictures exactly where the film left them;
 * at 0.045 none is, though four of the seven are brought less than a hundredth of the way: a
 * body at the edge of the orbit's box has a pixel of the frame to give.
 */
export const KEPT_MARGIN = 0.045;

/** Where a picture that stays with one body holds it. */
export interface KeptPlacement {
  /** The body the picture stays with. */
  body: number;
  /** How far it was brought from where the film left it (0) to the picture's middle (1). */
  towards: number;
  /** Where each copy drawn of it stands for as long as the picture stays: x then y, in the frame's pixels. */
  anchors: Float64Array;
}

/**
 * Places the picture on one `body`, from the first sample of a path past the window: `pixels`
 * holds x then y for the three bodies of every copy the frame makes, and the picture draws the
 * first `copies` of them (every copy on Light, one on Ink).
 */
export function keptPlacement(
  pixels: ArrayLike<number>,
  copies: number,
  body: number,
  width: number,
  height: number,
): KeptPlacement {
  const margin = KEPT_MARGIN * height;
  const cx = width / 2;
  const cy = height / 2;
  /**
   * The share of a move by `by` that keeps `at` inside 0…`size` by the margin. One that stands
   * nearer the edge than the margin already is taken no nearer: none of a move towards it.
   */
  const share = (at: number, by: number, size: number) =>
    by > 0
      ? (Math.max(at, size - margin) - at) / by
      : by < 0
        ? (at - Math.min(at, margin)) / -by
        : Infinity;
  let towards = 1;
  for (let copy = 0; copy < copies; copy++) {
    const from = (copy * 3 + body) * 2;
    const dx = cx - pixels[from];
    const dy = cy - pixels[from + 1];
    for (let other = 0; other < 3; other++) {
      const at = (copy * 3 + other) * 2;
      towards = Math.min(towards, share(pixels[at], dx, width), share(pixels[at + 1], dy, height));
    }
  }
  const anchors = new Float64Array(copies * 2);
  for (let copy = 0; copy < copies; copy++) {
    const from = (copy * 3 + body) * 2;
    anchors[copy * 2] = pixels[from] + towards * (cx - pixels[from]);
    anchors[copy * 2 + 1] = pixels[from + 1] + towards * (cy - pixels[from + 1]);
  }
  return { body, towards, anchors };
}

/**
 * Where a drawn body stands in the kept picture at a sample of the path, in the frame's pixels:
 * where it stands from its own copy of the body the picture stays with, laid off from where
 * that copy holds it. `size` is the numbers a sample takes in `pixels`; `drawn` counts every
 * body drawn, copy by copy, body by body.
 */
export function keptAt(
  kept: KeptPlacement,
  pixels: ArrayLike<number>,
  size: number,
  sample: number,
  drawn: number,
): [number, number] {
  const copy = Math.floor(drawn / 3);
  const at = sample * size + drawn * 2;
  const from = sample * size + (copy * 3 + kept.body) * 2;
  return [
    pixels[at] - pixels[from] + kept.anchors[copy * 2],
    pixels[at + 1] - pixels[from + 1] + kept.anchors[copy * 2 + 1],
  ];
}
