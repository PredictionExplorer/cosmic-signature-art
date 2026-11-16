import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintGround } from './sheet-grounds';

afterEach(() => vi.restoreAllMocks());

/** A 2D context that keeps what it was given to paint. */
function fake2d() {
  const painted: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  const made = vi.fn((width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: made,
    putImageData: (picture: (typeof painted)[number]) => painted.push(picture),
  } as unknown as CanvasRenderingContext2D);
  return { painted, made };
}

const PAPER = [240 / 255, 230 / 255, 220 / 255] as const;

describe('a ground beyond the stage', () => {
  it('is painted a few pixels to a cell: night where the ground is 0, the sheet’s tone where it is 1', () => {
    const { painted } = fake2d();
    const canvas = document.createElement('canvas');
    // A head 400 × 48 at the top of the viewport, the night to the right of x = 200.
    const done = paintGround(canvas, { left: 0, top: 0, width: 400, height: 48 }, 2, PAPER, (x) =>
      x < 200 ? 1 : 0,
    );
    expect(done).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([200, 24]);
    const [{ data }] = painted;
    // The first cell is paper, the last night, and both are whole.
    expect([...data.slice(0, 4)]).toEqual([240, 230, 220, 255]);
    expect([...data.slice(-4)]).toEqual([0, 0, 0, 255]);
  });

  it('asks the ground at the middle of each cell, in the viewport’s own pixels', () => {
    fake2d();
    const asked: [number, number][] = [];
    paintGround(
      document.createElement('canvas'),
      { left: 10, top: 100, width: 8, height: 4 },
      4,
      PAPER,
      (x, y) => {
        asked.push([x, y]);
        return 0.5;
      },
    );
    expect(asked).toEqual([
      [12, 102],
      [16, 102],
    ]);
  });

  it('asks each cell where it is shown when the box is no whole number of cells', () => {
    fake2d();
    const asked: number[] = [];
    const canvas = document.createElement('canvas');
    // 390 wide in cells of 4: 98 cells, laid over the box, each 390 / 98 wide.
    paintGround(canvas, { left: 0, top: 0, width: 390, height: 4 }, 4, PAPER, (x) => {
      asked.push(x);
      return 1;
    });
    expect(canvas.width).toBe(98);
    expect(asked[0]).toBeCloseTo(390 / 98 / 2, 10);
    // The last cell's middle lies inside the box, half a cell from its edge.
    expect(asked[97]).toBeCloseTo(390 - 390 / 98 / 2, 10);
    expect(asked[97]).toBeLessThan(390);
  });

  it('paints a share of the tone across the front’s edge', () => {
    const { painted } = fake2d();
    paintGround(
      document.createElement('canvas'),
      { left: 0, top: 0, width: 2, height: 2 },
      2,
      PAPER,
      () => 0.5,
    );
    expect([...painted[0].data.slice(0, 3)]).toEqual([120, 115, 110]);
  });

  it('keeps one picture for a canvas from frame to frame, and makes a new one when its box changes', () => {
    const { made } = fake2d();
    const canvas = document.createElement('canvas');
    const box = { left: 0, top: 0, width: 40, height: 20 };
    paintGround(canvas, box, 2, PAPER, () => 1);
    paintGround(canvas, box, 2, PAPER, () => 0);
    expect(made).toHaveBeenCalledTimes(1);
    paintGround(canvas, { ...box, width: 60 }, 2, PAPER, () => 0);
    expect(made).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(30);
  });

  it('paints nothing where this browser gives the canvas no context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(
      paintGround(
        document.createElement('canvas'),
        { left: 0, top: 0, width: 4, height: 4 },
        2,
        PAPER,
        () => 1,
      ),
    ).toBe(false);
  });
});
