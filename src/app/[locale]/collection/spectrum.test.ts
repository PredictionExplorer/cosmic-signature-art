import { describe, expect, it } from 'vitest';
import { collectionIndex, spectrum, type IndexedWork } from '@/lib/art/collection-index';
import {
  groupByWavelength,
  HANG_GAP,
  HANG_WIDTH,
  layoutSpectrum,
  spectrumPosition,
  spectrumTicks,
} from './spectrum';

describe('the spectrum wall layout', () => {
  it('places a wavelength along the rule as a fraction of its width', () => {
    expect(spectrumPosition(380)).toBe(0);
    expect(spectrumPosition(700)).toBe(1);
    expect(spectrumPosition(540)).toBeCloseTo(0.5);
    expect(spectrumPosition(100)).toBe(0);
    expect(spectrumPosition(900)).toBe(1);
  });

  it('groups works at the same nanometre into one column, ordered along the rule', () => {
    const groups = groupByWavelength(spectrum().measured);
    expect(groups[0].nm).toBe(380);
    expect(groups.at(-1)!.nm).toBe(700);
    expect(groups.reduce((sum, group) => sum + group.works.length, 0)).toBe(collectionIndex.total);
    expect(groups[0].works.map((work) => work.id).slice(0, 3)).toEqual([6, 13, 15]);
    expect(groupByWavelength([{ id: 1 } as IndexedWork])).toEqual([]);
  });

  it('hangs every column at its nanometre and lets no two columns cross', () => {
    const { groups, height } = layoutSpectrum(spectrum().measured);
    expect(groups.length).toBe(groupByWavelength(spectrum().measured).length);
    for (const group of groups) {
      expect(group.x).toBeCloseTo(spectrumPosition(group.nm) * (100 - HANG_WIDTH));
      expect(group.y).toBeGreaterThanOrEqual(0);
    }
    for (const a of groups)
      for (const b of groups) {
        if (a === b) continue;
        const apart =
          a.x + HANG_WIDTH + HANG_GAP <= b.x ||
          b.x + HANG_WIDTH + HANG_GAP <= a.x ||
          a.y + a.height + HANG_GAP <= b.y ||
          b.y + b.height + HANG_GAP <= a.y;
        expect(apart, `${a.nm} nm and ${b.nm} nm cross`).toBe(true);
      }
    expect(height).toBeGreaterThan(0);
    expect(height).toBe(Math.max(...groups.map((group) => group.y + group.height)));
    // Works at one nanometre stack; the violet cliff is the tallest column.
    const violet = groups.find((group) => group.nm === 380)!;
    expect(violet.works.length).toBeGreaterThan(10);
    expect(violet.y).toBe(0);
  });

  it('ticks the rule every twenty nanometres and labels the ends', () => {
    const ticks = spectrumTicks();
    expect(ticks[0]).toEqual({ nm: 380, labelled: true });
    expect(ticks.at(-1)).toEqual({ nm: 700, labelled: true });
    expect(
      ticks
        .filter((tick) => !tick.labelled)
        .map((tick) => tick.nm)
        .slice(0, 2),
    ).toEqual([400, 440]);
    expect(ticks).toHaveLength(17);
  });
});
