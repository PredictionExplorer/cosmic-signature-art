/**
 * Naming the orbits under a point of All the light. The build keeps, for every work, a coarse
 * grid of how much of its light lies in each place (scripts/build-all-the-light.mjs), as tiles
 * of one atlas. A point names the works brightest there: each work's light over the cell and its
 * eight neighbours (a pointer a few pixels off a ribbon still finds it), above a threshold, at
 * most a handful, brightest first.
 */

export interface SkyGrid {
  /** The atlas's pixels as a canvas reads them: four bytes a pixel, the light in the first. */
  pixels: Uint8ClampedArray;
  /** Tiles across the atlas, and each tile's cells across and down. */
  across: number;
  columns: number;
  rows: number;
}

/** A work is named where this much of its light lies, of 255. */
export const NAMING_THRESHOLD = 24;
/** No more names than this at once. */
export const NAMES_AT_ONCE = 5;

/** The grid cell under a point given as fractions (0–1) of the sky's width and height. */
export function cellAt(grid: Pick<SkyGrid, 'columns' | 'rows'>, x: number, y: number) {
  if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
  return { column: Math.floor(x * grid.columns), row: Math.floor(y * grid.rows) };
}

/** How much of the light of the `tile`-th work lies in a cell. */
function lightAt(grid: SkyGrid, tile: number, column: number, row: number) {
  const width = grid.across * grid.columns;
  const x = (tile % grid.across) * grid.columns + column;
  const y = Math.floor(tile / grid.across) * grid.rows + row;
  return grid.pixels[(y * width + x) * 4];
}

/**
 * The works named at a cell, brightest first: `works[k]` is the work whose tile is k, in the
 * order the build filled the sky. Only works `included` are counted (the sky on view may hold
 * fewer than all), so the handful named is the brightest of those.
 */
export function namesAt(
  grid: SkyGrid,
  works: readonly number[],
  column: number,
  row: number,
  included: (id: number) => boolean = () => true,
) {
  const found: { id: number; light: number }[] = [];
  works.forEach((id, tile) => {
    if (!included(id)) return;
    let light = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = column + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
        light = Math.max(light, lightAt(grid, tile, c, r));
      }
    if (light >= NAMING_THRESHOLD) found.push({ id, light });
  });
  return found
    .sort((a, b) => b.light - a.light || a.id - b.id)
    .slice(0, NAMES_AT_ONCE)
    .map((entry) => entry.id);
}
