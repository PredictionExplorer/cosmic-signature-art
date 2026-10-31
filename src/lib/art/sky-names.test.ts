import { describe, expect, it } from 'vitest';
import { NAMES_AT_ONCE, NAMING_THRESHOLD, cellAt, namesAt, type SkyGrid } from './sky-names';

/** An atlas of `count` tiles, two across, each 4 × 3 cells, lit where `light` says. */
function atlas(count: number, light: (tile: number, column: number, row: number) => number) {
  const across = 2;
  const columns = 4;
  const rows = 3;
  const width = across * columns;
  const height = Math.ceil(count / across) * rows;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let tile = 0; tile < count; tile++)
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const x = (tile % across) * columns + column;
        const y = Math.floor(tile / across) * rows + row;
        pixels.fill(light(tile, column, row), (y * width + x) * 4, (y * width + x) * 4 + 3);
      }
  return { pixels, across, columns, rows } satisfies SkyGrid;
}

describe('naming the orbits in All the light', () => {
  it('finds the cell under a point, and nothing outside the sky', () => {
    expect(cellAt({ columns: 4, rows: 3 }, 0, 0)).toEqual({ column: 0, row: 0 });
    expect(cellAt({ columns: 4, rows: 3 }, 0.999, 0.999)).toEqual({ column: 3, row: 2 });
    expect(cellAt({ columns: 4, rows: 3 }, 0.5, 0.5)).toEqual({ column: 2, row: 1 });
    expect(cellAt({ columns: 4, rows: 3 }, 1, 0.5)).toBeNull();
    expect(cellAt({ columns: 4, rows: 3 }, -0.1, 0.5)).toBeNull();
    expect(cellAt({ columns: 4, rows: 3 }, Number.NaN, 0.5)).toBeNull();
  });

  it('names the works brightest at a point, brightest first, and a near miss too', () => {
    // Work 10 lights cell (1, 1) brightly; work 20 its neighbour (2, 1) more faintly; work 30
    // only the far corner; work 40 everywhere, just under the threshold.
    const grid = atlas(4, (tile, column, row) =>
      tile === 0 && column === 1 && row === 1
        ? 200
        : tile === 1 && column === 2 && row === 1
          ? 90
          : tile === 2 && column === 3 && row === 2
            ? 255
            : tile === 3
              ? NAMING_THRESHOLD - 1
              : 0,
    );
    expect(namesAt(grid, [10, 20, 30, 40], 1, 1)).toEqual([10, 20]);
    expect(namesAt(grid, [10, 20, 30, 40], 0, 0)).toEqual([10]);
    expect(namesAt(grid, [10, 20, 30, 40], 3, 2)).toEqual([30, 20]);
  });

  it('names no more than a handful at once', () => {
    const grid = atlas(9, (tile) => 100 + tile);
    const named = namesAt(grid, [1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 1);
    expect(named).toHaveLength(NAMES_AT_ONCE);
    expect(named).toEqual([9, 8, 7, 6, 5]);
  });

  it('names the brightest of the works counted, not the brightest of all and then fewer', () => {
    // Eight works pass the same cell; the four brightest belong to a sky not on view.
    const grid = atlas(8, (tile) => 200 - tile * 10);
    const ids = [10, 11, 12, 13, 20, 21, 22, 23];
    const onView = new Set([20, 21, 22, 23]);
    expect(namesAt(grid, ids, 1, 1)).toEqual([10, 11, 12, 13, 20]);
    expect(namesAt(grid, ids, 1, 1, (id) => onView.has(id))).toEqual([20, 21, 22, 23]);
  });
});
