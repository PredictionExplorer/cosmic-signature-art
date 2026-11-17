import type { Rgb } from '@/lib/crossing/material';

/*
  The grounds beyond the stage. The running head, and whatever of the page the screen shows
  beyond the first screen, stand on one of the two grounds too, and turn with the same front
  (src/lib/crossing/sheet.ts). Each has a small canvas of its own behind its words; a ground is
  one flat tone either side of a soft edge, so it is painted a few pixels to a cell and smoothed
  by the browser as it is laid over its box.
*/

/** The picture each canvas was last given, kept so that a frame allocates nothing. */
const pictures = new WeakMap<HTMLCanvasElement, ImageData>();

/**
 * Paint one ground. `box` is where the canvas lies in the viewport and `cell` about how many
 * pixels of it one cell of the picture covers: the picture has a whole number of cells each way,
 * and the browser lays it over the whole box, so a cell is exactly the box's share of it.
 * `ground(x, y)` says how much of the paper stands at a point of the viewport: 0 the night, 1 the
 * sheet's own tone. It is asked at the middle of each cell as the cell is shown, so the ground
 * lies where the field puts it, to a fraction of a pixel, whatever the box's size.
 */
export function paintGround(
  canvas: HTMLCanvasElement,
  box: { left: number; top: number; width: number; height: number },
  cell: number,
  paper: Rgb,
  ground: (x: number, y: number) => number,
) {
  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols;
    canvas.height = rows;
    pictures.delete(canvas);
  }
  const context = canvas.getContext('2d');
  if (!context) return false;
  let picture = pictures.get(canvas);
  if (!picture) {
    picture = context.createImageData(cols, rows);
    pictures.set(canvas, picture);
  }
  const { data } = picture;
  const [r, g, b] = [paper[0] * 255, paper[1] * 255, paper[2] * 255];
  // A box 390 wide in cells of 4 has 98 of them, each 3.98 wide: counted as 4, the last would
  // be asked for two pixels beyond where it is shown.
  const wide = box.width / cols;
  const tall = box.height / rows;
  for (let row = 0; row < rows; row++) {
    const y = box.top + (row + 0.5) * tall;
    for (let col = 0; col < cols; col++) {
      const share = ground(box.left + (col + 0.5) * wide, y);
      const p = (row * cols + col) * 4;
      data[p] = r * share;
      data[p + 1] = g * share;
      data[p + 2] = b * share;
      data[p + 3] = 255;
    }
  }
  context.putImageData(picture, 0, 0);
  return true;
}
