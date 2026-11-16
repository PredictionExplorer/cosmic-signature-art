import { describe, expect, it } from 'vitest';
import { collectionIndex } from '@/lib/art/collection-index';
import { workEnergy } from '@/lib/art/orbit-energy';
import { orbitElongation } from '@/lib/art/orbit-windows';
import { en } from '@/lib/i18n/en';
import { messages } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/lib/i18n/routing';
import { ENERGY_HELD_WITHIN } from '@/lib/physics/orbit';
import {
  CURATOR,
  HANG_IDS,
  HUNG_ON,
  TRAILS,
  TRAIL_SIZE,
  exhibition,
  exhibitionIds,
  exhibitionLine,
  exhibitionSummary,
  exhibitionTitle,
  exhibitions,
  formatMeasure,
  measureOf,
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
        const value = measureOf(rule.measure, work);
        return (
          value !== undefined &&
          (rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold)
        );
      });
      expect(new Set(members.map((member) => member.work.id))).toEqual(
        new Set(expected.map((work) => work.id)),
      );
      for (const member of members) expect(member.value).toBe(measureOf(rule.measure, member.work));
    }
  });

  it('hang their works in the order of the measure, ties by number', () => {
    for (const rule of TRAILS) {
      const values = trailMembers(rule).map((member) => member.value);
      const sorted = [...values].sort((a, b) => (rule.order === 'descending' ? b - a : a - b));
      expect(values).toEqual(sorted);
    }
    const curve = trailMembers(TRAILS[0]);
    expect(curve[0].work.id).toBe(51);
    expect(curve[0].value).toBeCloseTo(2.015, 3);
    expect(trailMembers(TRAILS[1])[0].value).toBe(13);
    expect(trailMembers(TRAILS[2])[0].work.id).toBe(69);
    expect(trailMembers(TRAILS[3])[0].value).toBe(97);
  });

  it('read the publisher’s number from the index, and the venue’s from the orbit', () => {
    const work = collectionIndex.works.find((candidate) => candidate.id === 51)!;
    expect(measureOf('chaos', work)).toBe(work.chaos);
    expect(measureOf('braidCrossings', work)).toBe(work.braidCrossings);
    expect(measureOf('elongation', work)).toBe(orbitElongation(51));
    // The published drift eccentricity is the camera's, and no trail reads it any more.
    expect(TRAILS.map((rule) => rule.measure)).toEqual([
      'elongation',
      'chaos',
      'chaos',
      'braidCrossings',
    ]);
  });

  it('never admit a work whose measure is not known', () => {
    const work = collectionIndex.works[0];
    // An orbit with no window bound to its record has no length to measure.
    expect(measureOf('elongation', { ...work, id: 9999 })).toBeUndefined();
    expect(meetsRule(TRAILS[0], { ...work, id: 9999 })).toBe(false);
    expect(meetsRule(TRAILS[1], { ...work, chaos: undefined })).toBe(false);
    expect(meetsRule(TRAILS[1], { ...work, chaos: Number.NaN })).toBe(false);
    expect(meetsRule(TRAILS[1], { ...work, chaos: 17 })).toBe(false);
    expect(meetsRule(TRAILS[1], { ...work, chaos: 16 })).toBe(true);
  });

  it('print the measure in one form: two decimals of a length, whole chaos and crossings', () => {
    expect(formatMeasure('elongation', 2.0148, 'en')).toBe('2.01');
    expect(formatMeasure('elongation', 1.8, 'en')).toBe('1.80');
    expect(formatMeasure('elongation', 2.0148, 'uk')).toBe('2,01');
    expect(formatMeasure('chaos', 13, 'en')).toBe('13');
    expect(formatMeasure('braidCrossings', 97, 'en')).toBe('97');
  });
});

/** A number as each language prints it in the trails' words: two decimals, its own decimal mark. */
const twoPlaces = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
const folio = (id: number) => String(id).padStart(3, '0');

// A correction line carries the month, as the Statement's does. The day a change is published
// is the owner's to choose, and a day written before it would be untrue from the first reader on.
const CORRECTED_IN: Record<Locale, string> = {
  en: 'November 2026',
  uk: 'в листопаді 2026 року',
  ja: '2026 年 11 月に',
  ko: '2026년 11월에',
  zh: '2026 年 11 月',
  'zh-TW': '2026 年 11 月',
  'zh-HK': '2026 年 11 月',
  vi: 'tháng 11 năm 2026',
};
const A_DAY_OF_NOVEMBER = /\d November|\d листопада|11 月 \d|11월 \d|ngày \d+ tháng 11/;

describe('the Long Curve, re-hung by the orbit’s own length against its width', () => {
  const rule = TRAILS[0];
  const members = trailMembers(rule);
  const all = collectionIndex.works.map((work) => orbitElongation(work.id)!).sort((a, b) => a - b);

  it('hangs the ten longest figures in the collection, longest first', () => {
    expect(rule).toMatchObject({ id: 'the-long-curve', measure: 'elongation', threshold: 1.55 });
    expect(members.map((member) => member.work.id)).toEqual([
      51, 20, 4, 69, 59, 65, 34, 61, 28, 70,
    ]);
    // The line is drawn in the widest gap near it: the last member, then the first work left out.
    expect(members.at(-1)!.value).toBeCloseTo(1.56, 2);
    expect(all.filter((value) => value < 1.55).at(-1)).toBeCloseTo(1.51, 2);
  });

  it('measures an orbit, not the arithmetic: every member kept its energy through its window', () => {
    for (const { work } of members) {
      const energy = workEnergy(work.id)!;
      expect(Math.abs(energy.windowChange), `№ ${work.id}`).toBeLessThanOrEqual(ENERGY_HELD_WITHIN);
    }
  });

  it('says in every language the numbers its works hold', () => {
    const middle = (all[35] + all[36]) / 2;
    expect(middle).toBeCloseTo(1.25, 2);
    for (const locale of locales) {
      const t = messages(locale);
      // The rule states its threshold, and the note the collection's middle and its longest.
      expect(t.trailLongCurveRule, locale).toContain(twoPlaces(rule.threshold, locale));
      expect(t.trailLongCurveNote, locale).toContain(twoPlaces(middle, locale));
      expect(t.trailLongCurveNote, locale).toContain(twoPlaces(members[0].value, locale));
      // The line beside a work reads rightly for every member's number.
      expect(t.measureElongation, locale).toContain('{value}');
    }
    expect(members[0].work.id).toBe(51);
    // 2.0148…: said to two places as it rounds, never as it was first guessed.
    expect(messages('en').trailLongCurveNote).toContain('fifty-one, at 2.01');
  });

  it('says when it was re-hung, and names the ten works of its first hanging', () => {
    // As first hung, on 27 October: the published drift eccentricity, 0.48 or above, highest
    // first. That number is the camera's (src/lib/physics/drift.ts), so the trail was re-hung.
    const first = collectionIndex.works
      .filter((work) => (work.eccentricity ?? 0) >= 0.48)
      .sort((a, b) => b.eccentricity! - a.eccentricity!)
      .map((work) => folio(work.id));
    expect(first).toEqual(['059', '053', '034', '030', '061', '002', '046', '068', '043', '003']);
    expect(HUNG_ON).toBe('2026-10-27');
    expect(rule.corrected).toBe('trailLongCurveCorrected');
    for (const locale of locales) {
      const line = messages(locale).trailLongCurveCorrected;
      expect(line.match(/\b\d{3}\b/g), locale).toEqual(first);
      for (const figure of ['27', '2026']) expect(line, locale).toContain(figure);
      expect(line, locale).toContain(CORRECTED_IN[locale]);
      expect(line, locale).not.toMatch(A_DAY_OF_NOVEMBER);
    }
    // Three of the ten stay; the other seven were never among the longest orbits.
    const stay = first.filter((id) => members.some((member) => folio(member.work.id) === id));
    expect(stay).toEqual(['059', '034', '061']);
  });

  it('has no relation to the number it first followed', () => {
    // Spearman's rank correlation between each orbit's length to width and its camera's drift
    // eccentricity, over all 72 works: what a uniform random draw gives.
    const works = collectionIndex.works;
    const rank = (values: number[]) => {
      const order = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
      const ranks = new Array<number>(values.length);
      order.forEach(([, index], place) => (ranks[index] = place));
      return ranks;
    };
    const a = rank(works.map((work) => orbitElongation(work.id)!));
    const b = rank(works.map((work) => work.eccentricity!));
    const n = works.length;
    const d2 = a.reduce((sum, place, index) => sum + (place - b[index]) ** 2, 0);
    const spearman = 1 - (6 * d2) / (n * (n * n - 1));
    expect(Math.abs(spearman)).toBeLessThan(0.25);
  });
});

describe('the two chaos trails, said as what the publisher’s number measures', () => {
  const chaos = collectionIndex.works.map((work) => work.chaos!).sort((a, b) => a - b);

  it('state their thresholds and the collection’s own extremes in every language', () => {
    expect(chaos[0]).toBe(13);
    expect(
      collectionIndex.works.filter((work) => work.chaos === 13).map((work) => work.id),
    ).toEqual([31, 33]);
    expect(chaos.at(-1)).toBe(28);
    expect(trailMembers(TRAILS[2])[0].work.id).toBe(69);
    for (const locale of locales) {
      const t = messages(locale);
      expect(t.trailAlmostStillRule, locale).toContain('16');
      expect(t.trailAlmostStillNote, locale).toContain('13');
      expect(t.trailTurbulenceRule, locale).toContain('24');
      expect(t.trailTurbulenceNote, locale).toContain('28');
      // Both send the reader to the twin for what the number does not measure.
      expect(t.trailAlmostStillNote, locale).toContain(t.oneInATrillion);
      expect(t.trailTurbulenceNote, locale).toContain(t.oneInATrillion);
      expect(t.trailChaosCorrected, locale).toContain(CORRECTED_IN[locale]);
      expect(t.trailChaosCorrected, locale).not.toMatch(A_DAY_OF_NOVEMBER);
    }
    expect(TRAILS[1].corrected).toBe('trailChaosCorrected');
    expect(TRAILS[2].corrected).toBe('trailChaosCorrected');
    expect(TRAILS[3].corrected).toBeUndefined();
  });

  it('never say again that the number measures sensitivity to the start', () => {
    // The generator defines it as how widely the motion is spread across frequencies
    // (CS-Image-Generation src/traits_analysis.rs: "0 = metronomic regularity, 100 = broadband
    // chaos"). The venue's own measure of sensitivity is the twin's.
    const en = messages('en');
    for (const key of [
      'glossaryChaos',
      'trailAlmostStillRule',
      'trailAlmostStillNote',
      'trailTurbulenceRule',
      'trailTurbulenceNote',
    ] as const) {
      expect(en[key], key).not.toMatch(/sensitiv|turbulent|disturbed|calmest/i);
    }
    expect(en.glossaryChaos).toMatch(/publisher’s measure .* spread across frequencies/);
    expect(en.trailChaosCorrected).toMatch(/^Corrected November 2026\./);
    expect(en.trailLongCurveCorrected).toMatch(/^Re-hung November 2026\./);
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

describe('the lines beneath a title', () => {
  it('state the kind and date, and a rule or a count, in the visitor’s words', () => {
    const all = exhibitions();
    const hang = all[0];
    const cycle = all[5];
    if (hang.kind !== 'hang' || cycle.kind !== 'cycle') throw new Error('the order changed');
    expect(exhibitionLine(hang, 'en', en)).toBe('Hang · October 27, 2026');
    expect(exhibitionLine(all[1], 'en', en)).toBe('Trail · October 27, 2026');
    expect(exhibitionLine(cycle, 'en', en)).toMatch(/^Cycle · /);
    expect(exhibitionLine({ ...cycle, hungOn: undefined }, 'en', en)).toBe('Cycle');
    expect(exhibitionSummary(all[1], 'en', en)).toBe(en.trailLongCurveRule);
    expect(exhibitionSummary(hang, 'en', en)).toBe('3 works');
    expect(exhibitionSummary({ ...hang, ids: [31] }, 'en', en)).toBe(en.oneWork);
  });
});
