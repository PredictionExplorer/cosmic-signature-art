import {
  collectionIndex,
  cycles,
  type CollectionIndex,
  type CycleSummary,
  type IndexedWork,
} from '@/lib/art/collection-index';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';

/**
 * The exhibitions: named, dated, signed hangs that persist. A hang is editorial, a list of
 * works chosen by eye. A trail is a rule over one published measurement, stated on its page
 * and applied to the whole index, so its members are the publisher's own numbers and never an
 * affinity score of ours. A cycle is the collection's chapter, hung as it was imprinted.
 * Everything here runs on the server; a page hands its client components the works' media.
 */

/** The day the hangs and trails were hung; a cycle is dated by its imprint. */
export const HUNG_ON = '2026-10-27';
/** No curator has been named by the owner; the venue signs its own hangs for now. */
export const CURATOR = 'Cosmic Signature';
/** A trail is a short walk: fewer than six works is a pairing, more than twelve a catalogue. */
export const TRAIL_SIZE = { min: 6, max: 12 };

export type Measure = 'eccentricity' | 'chaos' | 'braidCrossings';
export type TrailId = 'the-long-curve' | 'almost-still' | 'turbulence' | 'light-becoming-trace';
export interface TrailRule {
  id: TrailId;
  /** The published field the rule reads. */
  measure: Measure;
  comparison: 'atLeast' | 'atMost';
  threshold: number;
  /** Members hang in this order of the measure. */
  order: 'descending' | 'ascending';
  title: keyof Messages;
  rule: keyof Messages;
  note: keyof Messages;
  /** The measured value beside each work: "eccentricity {value}", "chaos {value} / 100"… */
  measureLine: keyof Messages;
}

export const TRAILS: readonly TrailRule[] = [
  {
    id: 'the-long-curve',
    measure: 'eccentricity',
    comparison: 'atLeast',
    threshold: 0.48,
    order: 'descending',
    title: 'trailLongCurve',
    rule: 'trailLongCurveRule',
    note: 'trailLongCurveNote',
    measureLine: 'measureEccentricity',
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

/** A work meets a rule when the publisher recorded the measure and it clears the threshold. */
export function meetsRule(rule: TrailRule, work: IndexedWork): boolean {
  const value = work[rule.measure];
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold;
}

/** Every indexed work the rule admits, in the trail's order; ties hang by number. */
export function trailMembers(rule: TrailRule, index: CollectionIndex = collectionIndex) {
  return index.works
    .filter((work) => meetsRule(rule, work))
    .map((work): TrailMember => ({ work, value: work[rule.measure] as number }))
    .sort((a, b) =>
      rule.order === 'descending'
        ? b.value - a.value || a.work.id - b.work.id
        : a.value - b.value || a.work.id - b.work.id,
    );
}

/** The measure as the entry prints it: three decimals of eccentricity, whole chaos and crossings. */
export function formatMeasure(measure: Measure, value: number, locale: Locale): string {
  return measure === 'eccentricity'
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
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
