import {
  collectionIndex,
  cycles,
  type CollectionIndex,
  type CycleSummary,
  type IndexedWork,
} from '@/lib/art/collection-index';
import { orbitElongation } from '@/lib/art/orbit-windows';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';

/**
 * The exhibitions: named, dated, signed hangs that persist. A hang is editorial, a list of
 * works chosen by eye. A trail is a rule over one measurement, stated on its page and applied
 * to the whole index, so its members are numbers anyone can check and never an affinity score
 * of ours. Three trails follow a measurement the publisher records. One, the Long Curve,
 * follows a measurement the venue takes of the orbit itself, and says so on its page. A cycle
 * is the collection's chapter, hung as it was imprinted. Everything here runs on the server; a
 * page hands its client components the works' media.
 *
 * A trail's words are true of what its number measures, in the terms of whoever measured it.
 * Two were not, and were corrected in November 2026, each with a dated line on its page:
 * the Long Curve followed the published "orbit_eccentricity", which is the eccentricity of the
 * ellipse the camera drifts along (one uniform draw from the seed, 0.40 to 0.50) and says
 * nothing of the three bodies' paths; and the two chaos trails said the published chaos index
 * measures sensitivity to the start, where the generator defines it as how widely the motion
 * is spread across frequencies.
 */

/** The day the hangs and trails were hung; a cycle is dated by its imprint. */
export const HUNG_ON = '2026-10-27';
/** No curator has been named by the owner; the venue signs its own hangs for now. */
export const CURATOR = 'Cosmic Signature';
/** A trail is a short walk: fewer than six works is a pairing, more than twelve a catalogue. */
export const TRAIL_SIZE = { min: 6, max: 12 };

/**
 * What a trail may follow. `chaos` and `braidCrossings` are the publisher's, read from the index.
 * `elongation` is the venue's: the orbit's length against its width (orbitElongation).
 */
export type Measure = 'elongation' | 'chaos' | 'braidCrossings';
export type TrailId = 'the-long-curve' | 'almost-still' | 'turbulence' | 'light-becoming-trace';
export interface TrailRule {
  id: TrailId;
  /** The measurement the rule reads. */
  measure: Measure;
  comparison: 'atLeast' | 'atMost';
  threshold: number;
  /** Members hang in this order of the measure. */
  order: 'descending' | 'ascending';
  title: keyof Messages;
  rule: keyof Messages;
  note: keyof Messages;
  /** The value beside each work: "{value} times as long as wide", "chaos {value} / 100"… */
  measureLine: keyof Messages;
  /** A dated line under the note, where the trail's words or its works have been corrected. */
  corrected?: keyof Messages;
}

export const TRAILS: readonly TrailRule[] = [
  {
    // Re-hung in November 2026 by the orbit's own length against its width. As first hung it
    // followed the published drift eccentricity (0.48 or above), the camera's and not the
    // orbit's. 1.55 falls in the widest gap near it: № 070 at 1.56, then № 068 at 1.51.
    id: 'the-long-curve',
    measure: 'elongation',
    comparison: 'atLeast',
    threshold: 1.55,
    order: 'descending',
    title: 'trailLongCurve',
    rule: 'trailLongCurveRule',
    note: 'trailLongCurveNote',
    measureLine: 'measureElongation',
    corrected: 'trailLongCurveCorrected',
  },
  {
    id: 'almost-still',
    measure: 'chaos',
    comparison: 'atMost',
    threshold: 16,
    order: 'ascending',
    title: 'trailAlmostStill',
    rule: 'trailAlmostStillRule',
    note: 'trailAlmostStillNote',
    measureLine: 'measureChaos',
    corrected: 'trailChaosCorrected',
  },
  {
    id: 'turbulence',
    measure: 'chaos',
    comparison: 'atLeast',
    threshold: 24,
    order: 'descending',
    title: 'trailTurbulence',
    rule: 'trailTurbulenceRule',
    note: 'trailTurbulenceNote',
    measureLine: 'measureChaos',
    corrected: 'trailChaosCorrected',
  },
  {
    id: 'light-becoming-trace',
    measure: 'braidCrossings',
    comparison: 'atLeast',
    threshold: 50,
    order: 'descending',
    title: 'trailLightBecomingTrace',
    rule: 'trailLightBecomingTraceRule',
    note: 'trailLightBecomingTraceNote',
    measureLine: 'measureCrossings',
  },
];

export interface TrailMember {
  work: IndexedWork;
  value: number;
}

/**
 * The number a trail reads of one work: the publisher's own from the index, or the venue's
 * measure of the orbit. Nothing where it was not recorded, or where the orbit's window no
 * longer binds to its record.
 */
export function measureOf(measure: Measure, work: IndexedWork): number | undefined {
  const value = measure === 'elongation' ? orbitElongation(work.id) : work[measure];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A work meets a rule when its measure is known and clears the threshold. */
export function meetsRule(rule: TrailRule, work: IndexedWork): boolean {
  const value = measureOf(rule.measure, work);
  if (value === undefined) return false;
  return rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold;
}

/** Every indexed work the rule admits, in the trail's order; ties hang by number. */
export function trailMembers(rule: TrailRule, index: CollectionIndex = collectionIndex) {
  return index.works
    .filter((work) => meetsRule(rule, work))
    .map((work): TrailMember => ({ work, value: measureOf(rule.measure, work)! }))
    .sort((a, b) =>
      rule.order === 'descending'
        ? b.value - a.value || a.work.id - b.work.id
        : a.value - b.value || a.work.id - b.work.id,
    );
}

/**
 * The measure as it is printed: an orbit's length against its width to two decimals, always
 * two, so that the words beside it keep one form in every language; whole chaos and crossings.
 */
export function formatMeasure(measure: Measure, value: number, locale: Locale): string {
  return measure === 'elongation'
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value,
      )
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** The three-work room the venue has hung since the Atlas: 023, 031 and 035, as published. */
export const HANG_IDS: readonly number[] = [23, 31, 35];

export type Exhibition =
  | { kind: 'hang'; slug: 'a-hang'; ids: number[]; hungOn: string }
  | { kind: 'trail'; slug: TrailId; rule: TrailRule; members: TrailMember[]; hungOn: string }
  | {
      kind: 'cycle';
      slug: `cycle-${number}`;
      cycle: CycleSummary;
      ids: number[];
      hungOn?: string;
    };

/** The hang first, the four trails, then the cycles in order of imprint. */
export function exhibitions(index: CollectionIndex = collectionIndex): Exhibition[] {
  const hang: Exhibition = {
    kind: 'hang',
    slug: 'a-hang',
    ids: HANG_IDS.filter((id) => index.works.some((work) => work.id === id)),
    hungOn: HUNG_ON,
  };
  const trails: Exhibition[] = TRAILS.map((rule) => ({
    kind: 'trail',
    slug: rule.id,
    rule,
    members: trailMembers(rule, index),
    hungOn: HUNG_ON,
  }));
  const chapters: Exhibition[] = cycles(index).map((cycle) => ({
    kind: 'cycle',
    slug: `cycle-${cycle.cycle}`,
    cycle,
    ids: cycle.ids,
    hungOn: cycle.mintedAt?.slice(0, 10),
  }));
  return [hang, ...trails, ...chapters];
}

export function exhibition(
  slug: string,
  index: CollectionIndex = collectionIndex,
): Exhibition | undefined {
  return exhibitions(index).find((candidate) => candidate.slug === slug);
}

/** The ids an exhibition hangs, in hanging order. */
export function exhibitionIds(item: Exhibition): number[] {
  return item.kind === 'trail' ? item.members.map((member) => member.work.id) : item.ids;
}

/** The exhibition's title in the visitor's words; a cycle is "Cycle 1". */
export function exhibitionTitle(item: Exhibition, t: Messages): string {
  if (item.kind === 'hang') return t.hangTitle;
  if (item.kind === 'trail') return t[item.rule.title];
  return `${t.cycle} ${item.cycle.cycle}`;
}

/** The exhibition's kind and date, as one quiet line: "Trail · 27 October 2026". */
export function exhibitionLine(item: Exhibition, locale: Locale, t: Messages): string {
  const kind = item.kind === 'hang' ? t.hang : item.kind === 'trail' ? t.trail : t.cycle;
  const date = item.hungOn
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(`${item.hungOn}T00:00:00Z`),
      )
    : undefined;
  return [kind, date].filter(Boolean).join(' · ');
}

/** The one line beneath a title: a trail's rule, the hang's or cycle's count of works. */
export function exhibitionSummary(item: Exhibition, locale: Locale, t: Messages): string {
  if (item.kind === 'trail') return t[item.rule.rule];
  const count = exhibitionIds(item).length;
  return count === 1
    ? t.oneWork
    : fill(t.worksCount, { count: new Intl.NumberFormat(locale).format(count) });
}
