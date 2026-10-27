import type { IndexedWork } from '@/lib/art/collection-index';

/** The visible rule the wall is hung along, in nanometres. */
export const SPECTRUM_MIN_NM = 380;
export const SPECTRUM_MAX_NM = 700;
/** Preview width, the gap between stacked previews and the plate proportion, in container-width units (cqw). */
export const HANG_WIDTH = 10;
export const HANG_GAP = 0.8;
export const HANG_HEIGHT = HANG_WIDTH * (2234 / 3456);

export interface SpectrumGroup {
  nm: number;
  works: IndexedWork[];
  /** Left edge from the wall's left, in cqw. */
  x: number;
  /** Top edge below the rule, in cqw. */
  y: number;
  /** The column's height, in cqw. */
  height: number;
}

/** Works at the same nanometre form one column; columns are ordered along the rule. */
export function groupByWavelength(works: IndexedWork[]): { nm: number; works: IndexedWork[] }[] {
  const groups = new Map<number, IndexedWork[]>();
  for (const work of works) {
    if (work.wavelengthNm === undefined) continue;
    const column = groups.get(work.wavelengthNm) ?? [];
    column.push(work);
    groups.set(work.wavelengthNm, column);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([nm, column]) => ({ nm, works: column.sort((a, b) => a.id - b.id) }));
}

/** Horizontal position of a wavelength along the rule, as a fraction 0–1. */
export function spectrumPosition(nm: number): number {
  return Math.min(1, Math.max(0, (nm - SPECTRUM_MIN_NM) / (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM)));
}

/**
 * Hang every column at its exact nanometre and let near neighbours drop below one another
 * instead of overlapping: a column takes the first height at which nothing already hung
 * crosses it. Deterministic, measured in container-width units, so the wall needs no script.
 */
export function layoutSpectrum(works: IndexedWork[]): { groups: SpectrumGroup[]; height: number } {
  const placed: SpectrumGroup[] = [];
  for (const { nm, works: column } of groupByWavelength(works)) {
    const x = spectrumPosition(nm) * (100 - HANG_WIDTH);
    const height = column.length * HANG_HEIGHT + (column.length - 1) * HANG_GAP;
    let y = 0;
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        const crossesHorizontally =
          x < other.x + HANG_WIDTH + HANG_GAP && other.x < x + HANG_WIDTH + HANG_GAP;
        const crossesVertically =
          y < other.y + other.height + HANG_GAP && other.y < y + height + HANG_GAP;
        if (crossesHorizontally && crossesVertically) {
          y = other.y + other.height + HANG_GAP;
          moved = true;
        }
      }
    }
    placed.push({ nm, works: column, x, y, height });
  }
  const total = placed.reduce((max, group) => Math.max(max, group.y + group.height), 0);
  return { groups: placed, height: total };
}

/** Tick marks along the rule every 20 nm, labelled every 40. */
export function spectrumTicks(): { nm: number; labelled: boolean }[] {
  const ticks: { nm: number; labelled: boolean }[] = [];
  for (let nm = SPECTRUM_MIN_NM; nm <= SPECTRUM_MAX_NM; nm += 20) {
    ticks.push({ nm, labelled: (nm - SPECTRUM_MIN_NM) % 40 === 0 || nm === SPECTRUM_MAX_NM });
  }
  return ticks;
}
