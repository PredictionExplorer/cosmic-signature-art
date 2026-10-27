import { describe, expect, it } from 'vitest';
import { collectionIndex } from '@/lib/art/collection-index';
import { en } from '@/lib/i18n/en';
import {
  CURATOR,
  HANG_IDS,
  HUNG_ON,
  TRAILS,
  TRAIL_SIZE,
  exhibition,
  exhibitionIds,
  exhibitionTitle,
  exhibitions,
  formatMeasure,
  meetsRule,
  trailMembers,
} from './exhibitions';

describe('the trails', () => {
  it('admit every indexed work the stated rule admits and no other, six to twelve of them', () => {
    for (const rule of TRAILS) {
      const members = trailMembers(rule);
      expect(members.length).toBeGreaterThanOrEqual(TRAIL_SIZE.min);
      expect(members.length).toBeLessThanOrEqual(TRAIL_SIZE.max);
      const expected = collectionIndex.works.filter((work) => {
        const value = work[rule.measure];
        return (
          typeof value === 'number' &&
          (rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold)
        );
      });
      expect(new Set(members.map((member) => member.work.id))).toEqual(
        new Set(expected.map((work) => work.id)),
      );
      for (const member of members) expect(member.value).toBe(member.work[rule.measure]);
    }
  });

  it('hang their works in the order of the measure, ties by number', () => {
    for (const rule of TRAILS) {
      const values = trailMembers(rule).map((member) => member.value);
      const sorted = [...values].sort((a, b) => (rule.order === 'descending' ? b - a : a - b));
      expect(values).toEqual(sorted);
    }
    const curve = trailMembers(TRAILS[0]);
    expect(curve[0].work.id).toBe(59);
    expect(curve[0].value).toBeCloseTo(0.499, 3);
    expect(trailMembers(TRAILS[1])[0].value).toBe(13);
    expect(trailMembers(TRAILS[2])[0].work.id).toBe(69);
    expect(trailMembers(TRAILS[3])[0].value).toBe(97);
  });

  it('never admit a work whose measure the publisher did not record', () => {
    const work = { ...collectionIndex.works[0], eccentricity: undefined };
    expect(meetsRule(TRAILS[0], work)).toBe(false);
    expect(meetsRule(TRAILS[0], { ...work, eccentricity: Number.NaN })).toBe(false);
    expect(meetsRule(TRAILS[0], { ...work, eccentricity: 0.48 })).toBe(true);
    expect(meetsRule(TRAILS[1], { ...work, chaos: 17 })).toBe(false);
    expect(meetsRule(TRAILS[1], { ...work, chaos: 16 })).toBe(true);
  });

  it('print the measure the way the entry does', () => {
    expect(formatMeasure('eccentricity', 0.4993, 'en')).toBe('0.499');
    expect(formatMeasure('eccentricity', 0.4, 'en')).toBe('0.400');
    expect(formatMeasure('chaos', 13, 'en')).toBe('13');
    expect(formatMeasure('braidCrossings', 97, 'en')).toBe('97');
  });
});

describe('the exhibitions', () => {
  it('open with the hang, walk the four trails, then keep every cycle as a chapter', () => {
    const all = exhibitions();
    expect(all.map((item) => item.kind)).toEqual([
      'hang',
      'trail',
      'trail',
      'trail',
      'trail',
      'cycle',
      'cycle',
      'cycle',
    ]);
    expect(all[0]).toMatchObject({ slug: 'a-hang', ids: [...HANG_IDS], hungOn: HUNG_ON });
    expect(new Set(all.map((item) => item.slug)).size).toBe(all.length);
    const cycleOne = exhibition('cycle-1');
    expect(cycleOne?.kind).toBe('cycle');
    expect(exhibitionIds(cycleOne!)).toHaveLength(24);
    expect(cycleOne?.hungOn).toBe('2026-08-11');
    expect(exhibition('nowhere')).toBeUndefined();
    expect(CURATOR).toBe('Cosmic Signature');
  });

  it('titles each exhibition in the visitor’s words with the numbering grammar', () => {
    const all = exhibitions();
    expect(exhibitionTitle(all[0], en)).toBe('A hang: 023, 031, 035');
    expect(exhibitionTitle(all[1], en)).toBe(en.trailLongCurve);
    expect(exhibitionTitle(all[5], en)).toBe('Cycle 0');
    expect(exhibitionIds(all[1])).toEqual(trailMembers(TRAILS[0]).map((member) => member.work.id));
  });
});
