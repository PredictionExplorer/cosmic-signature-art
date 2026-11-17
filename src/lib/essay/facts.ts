import type { Messages } from '@/lib/i18n/en';
import { fill, filmSpan } from '@/lib/i18n/format';
import { essayFigures, essayWork, essayWorkCount, type EssayWork } from '@/lib/art/essay-figures';
import { collectionIndex, indexedWork } from '@/lib/art/collection-index';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import { workNumber } from '@/lib/art/number';
import { QUICK_GATE } from '@/lib/physics/beginnings';
import { shareText } from '@/components/orbit-proof';
import type { EssayCase, EssayKey, Part } from './structure';

/*
  What the essay's blanks hold, for one work in one language. Every figure the essay states of
  the venue comes through here from a committed registry: the essay's own
  (src/lib/art/essay-figures.json, by scripts/build-essay-figures.mjs), the orbit records and
  the collection index. Nothing is typed in by hand but two numbers the essay cites from a
  source (BELORIZKY). Numbers are written as the reader's language writes them, and a stretch
  of film as the venue words one everywhere ("5.4 seconds", "2.9 minutes").
*/

/** What a sentence's blanks hold, by name. */
export type Blanks = Readonly<Record<string, string>>;

/** One of the catalog's sentences, with its blanks. */
export interface Sentence {
  readonly key: EssayKey;
  readonly blanks: Blanks;
}

export interface EssayFacts {
  /** The work the essay takes its examples from. */
  readonly id: number;
  readonly orbit: WorkOrbit;
  readonly work: EssayWork;
  /** What each key's blanks hold; a key without blanks is absent. */
  readonly blanks: Readonly<Partial<Record<EssayKey, Blanks>>>;
  /** The sentences the work decides (CASES in structure.ts), each with its blanks. */
  readonly cases: Readonly<Record<EssayCase, readonly Sentence[]>>;
  /** The pair of bodies the first figure draws: a bound pair wherever the work has one. */
  readonly pair: EssayWork['pairs'][number];
}

/** The words the facts are worded with. */
export type FactWords = Pick<Messages, 'fateSeconds' | 'fateMinutes' | 'oneInATrillion'>;

/**
 * Belorizky's two counts (the source marked `beloriszky`): the powers of ten of the number of
 * terms Sundman's series needs, for three equal masses and for one holding a two-hundredth.
 */
const BELORIZKY = { equal: 80_000, unequal: 8_000_000 } as const;

/** The published name of the trait a work carries when its three are bound at the horizon. */
const DANCE =
  collectionIndex.works.find((work) => work.fateOutcome === 'eternal_dance')?.traits?.fate ??
  'Eternal Dance';

/** The work the registry itself was ranged on: the essay's stand-in if the day's has no entry. */
export const ESSAY_EXEMPLAR = essayFigures.beginnings.of;

/** A true minus sign, whatever the language's own formatter writes. */
const signed = (text: string) => text.replace(/^[-\u2212]/, '\u2212');

/** How one language writes the essay's numbers; made once, for a formatter is slow to make. */
function formats(locale: string) {
  const whole = new Intl.NumberFormat(locale);
  const made = new Map<string, Intl.NumberFormat>();
  const number = (name: string, options: Intl.NumberFormatOptions) => {
    let format = made.get(name);
    if (!format) made.set(name, (format = new Intl.NumberFormat(locale, options)));
    return format;
  };
  return {
    /** A count, or a number of few decimals, grouped as the language groups. */
    n: (value: number) => whole.format(value),
    /** To so many decimal places, exactly. */
    places: (digits: number) => (value: number) =>
      number(`places ${digits}`, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value),
    /** To so many figures. */
    significant: (digits: number) => (value: number) =>
      number(`significant ${digits}`, { maximumSignificantDigits: digits }).format(value),
    /** An energy, to three figures, with its sign. */
    energyOf: number('energy', { maximumSignificantDigits: 3, signDisplay: 'exceptZero' }),
    /** A weight of the choice, as the line beneath the chapter writes it (bordaNote). */
    weightOf: number('weight', { maximumFractionDigits: 3 }),
    /** A list in the language's own words; in English without a comma before "and". */
    list: new Intl.ListFormat(locale === 'en' ? 'en-GB' : locale, { type: 'conjunction' }),
  };
}
const made = new Map<string, ReturnType<typeof formats>>();
function formatsFor(locale: string) {
  let found = made.get(locale);
  if (!found) made.set(locale, (found = formats(locale)));
  return found;
}

/** The roundest ellipse among the work's bound pairs; with none bound, the most bent open curve. */
function drawnPair(work: EssayWork): EssayWork['pairs'][number] {
  const byShape = [...work.pairs].sort((a, b) => a.eccentricity - b.eccentricity);
  return byShape.find((pair) => pair.bound) ?? byShape[0];
}

/** The body a pair leaves out. */
const third = ([a, b]: readonly [number, number]) => 3 - a - b;

export function essayFacts(id: number, locale: string, t: FactWords): EssayFacts | undefined {
  const work = essayWork(id);
  const orbit = workOrbit(id);
  const weight = indexedWork(id)?.borda?.equilibriumWeight;
  if (!work || !orbit || weight === undefined) return undefined;

  const { clock, energy, twins, past, sheets, ink, traits, integrator, beginnings, plait } =
    essayFigures;
  const { n, places, significant, energyOf, weightOf, list } = formatsFor(locale);
  const span = (seconds: number) => filmSpan(seconds, t, locale);
  /** A count of steps as a stretch of the film: its length at the film's pace. */
  const film = (steps: number) => span(steps / clock.film.stepsPerSecond);
  const body = (index: number) => n(index + 1);
  const name = workNumber(id);
  const works = n(essayWorkCount);
  const stepsEach = clock.warmupSteps + clock.steps;
  const { lostExample, heldExample } = energy;

  const blanks: Partial<Record<EssayKey, Blanks>> = {
    essayOfWork: { work: name },
    essayLightCopy: { work: name },
    essayTakeLead: { work: name },
    essayThree5: {
      work: name,
      count: n(orbit.published.syzygyCount),
      most: n(traits.syzygies.most),
    },
    essayFormula6: { small: n(BELORIZKY.equal), large: n(BELORIZKY.unequal) },
    essayUnits: {
      gravity: n(clock.gravitationalConstant),
      massLow: n(Math.round(beginnings.mass.least)),
      massHigh: n(Math.round(beginnings.mass.most)),
      reach: n(Math.round(beginnings.place.most)),
      speed: n(Math.round(beginnings.velocity.most)),
    },
    essaySteps1: {
      dt: n(clock.dt),
      warmup: n(clock.warmupSteps),
      steps: n(clock.steps),
      film: span(clock.film.seconds),
      rate: n(clock.film.stepsPerSecond),
    },
    essaySteps2: {
      horizon: n(clock.horizonSteps),
      span: film(clock.horizonSteps),
      interval: n(clock.checkInterval),
      answers: n(clock.hysteresis),
      dance: DANCE,
    },
    essaySteps3: {
      forward: places(3)(integrator.w1),
      back: signed(places(3)(integrator.w0)),
    },
    essaySteps5: {
      lost: workNumber(lostExample.id),
      step: n(lostExample.step),
      a: body(lostExample.pass.pair[0]),
      b: body(lostExample.pass.pair[1]),
      closest: places(2)(lostExample.closest),
      travel: places(1)(lostExample.pass.travelInGaps),
      change: shareText(lostExample.change, locale),
      within: n(lostExample.pass.until - lostExample.step),
      before: signed(energyOf.format(lostExample.pass.energyBefore)),
      after: signed(energyOf.format(lostExample.pass.energyAfter)),
      ejected: body(lostExample.ejected.body),
      ejection: n(lostExample.ejected.step),
    },
    essayEnergyFigure: {
      held: workNumber(heldExample.id),
      lost: workNumber(lostExample.id),
    },
    essaySteps6: {
      kept: n(energy.kept.length),
      works,
      failed: n(energy.lost.length),
      inside: n(energy.lostInsideWindow.length),
      insideWorks: list.format(energy.lostInsideWindow.map(workNumber)),
    },
    essayTwin2: {
      control: t.oneInATrillion,
      work: name,
      steps: significant(3)(work.twin.doubling),
      time: film(work.twin.doubling),
    },
    essayTwinFigure: { work: name },
    essayTwin3: {
      time: film(work.twin.doubling),
      digit: film(work.twin.doubling * Math.log2(10)),
      least: span(twins.doublingSeconds.least),
      most: span(twins.doublingSeconds.most),
      median: span(twins.doublingSeconds.median),
    },
    essayTwin6: {
      differ: n(twins.clean.differ),
      clean: n(twins.clean.works),
      outcome: n(twins.clean.outcome),
    },
    essayChoice1: { candidates: n(clock.candidates) },
    essayChoice2: {
      energy: n(QUICK_GATE.maxEnergy),
      momentum: n(QUICK_GATE.minAngularMomentum),
      each: n(stepsEach),
    },
    essayChoice3: {
      weight: weightOf.format(weight),
      work: name,
    },
    essayChoice4: {
      work: name,
      index: n(orbit.generation.selectedIndex),
      search: n(clock.candidates * stepsEach),
      candidates: n(clock.candidates),
    },
    essayCurrent3: { reynolds: n(ink.shared.reynolds) },
    essayCurrent5: {
      least: span(ink.opens.seconds.least),
      most: span(ink.opens.seconds.most),
      hold: span(ink.shared.holdFraction * clock.film.seconds),
    },
    essayInkMade: {
      work: name,
      gridX: n(work.ink.fluidGrid[0]),
      gridY: n(work.ink.fluidGrid[1]),
      fluidSteps: n(work.ink.fluidSteps),
      inkX: n(work.ink.inkGrid[0]),
      inkY: n(work.ink.inkGrid[1]),
      threads: n(work.ink.threads),
      hours: places(1)(work.ink.seconds / 3600),
    },
    essayPlaitFigure: { pigtail: places(3)(plait.pigtail) },
    essayPlait3: {
      pigtail: places(3)(plait.pigtail),
      ten: significant(2)(plait.pigtail ** 10),
    },
    essayPlait5: {
      work: name,
      // The record's own letters, the first five; its mark for "in front" set as a prime.
      word: orbit.published.braid.word.split(' ').slice(0, 5).join(' ').replaceAll("'", '′'),
      count: n(orbit.published.braid.crossings),
    },
    essaySheetFigure: { work: name, crossings: n(work.sheet.crossings) },
    essayClaim: {
      works,
      work: name,
      share: shareText(work.sheet.overlapShare, locale),
      median: shareText(sheets.overlapShare.median, locale),
    },
    essayUnknown1: {
      horizon: n(clock.horizonSteps),
      far: n(past.steps),
      span: film(past.steps),
      clean: n(past.clean.runs),
      bound: n(past.looked),
      lost: n(past.clean.lost),
      earliest: n(past.clean.earliest),
      still: n(past.clean.still),
      broken: n(past.energyBroken.length),
    },
    essayTermUnitIs: {
      gravity: n(clock.gravitationalConstant),
      massLow: n(Math.round(beginnings.mass.least)),
      massHigh: n(Math.round(beginnings.mass.most)),
    },
    essayTermStepIs: { dt: n(clock.dt), rate: n(clock.film.stepsPerSecond) },
    essayTermWarmUpIs: { warmup: n(clock.warmupSteps) },
    essayTermWindowIs: { steps: n(clock.steps), film: span(clock.film.seconds) },
    essayTermHorizonIs: { horizon: n(clock.horizonSteps) },
    essayTermBoundIs: { answers: n(clock.hysteresis), interval: n(clock.checkInterval) },
  };

  // Take one body away: the two that remain, pair by pair, the bound pairs first.
  const take = [...work.pairs]
    .sort((a, b) => Number(b.bound) - Number(a.bound))
    .map(({ pair, bound, period }): Sentence => {
      const alone = { out: body(third(pair)), a: body(pair[0]), b: body(pair[1]) };
      return bound && period !== null
        ? { key: 'essayTakeBound', blanks: { ...alone, time: film(period / clock.dt) } }
        : { key: 'essayTakeOpen', blanks: alone };
    });

  const { parted, gapAtWindowEnd, until } = work.twin;
  const gap = significant(1)(gapAtWindowEnd);
  const twin: Sentence =
    parted === null
      ? { key: 'essayTwinNever', blanks: { gap, horizon: n(until) } }
      : parted <= clock.steps
        ? { key: 'essayTwinInside', blanks: { step: n(parted), into: film(parted) } }
        : {
            key: 'essayTwinAfter',
            blanks: { gap, step: n(parted), after: film(parted - clock.steps) },
          };

  const claim: Sentence =
    work.sheet.stretch > 1
      ? {
          key: 'essayClaimForced',
          blanks: { stretch: significant(3)(work.sheet.stretch), work: name },
        }
      : { key: 'essayClaimFree', blanks: {} };

  const pair = drawnPair(work);
  const drawn = { a: body(pair.pair[0]), b: body(pair.pair[1]), work: name };

  return {
    id,
    orbit,
    work,
    blanks,
    cases: {
      take,
      twin: [twin],
      claim: [claim],
      pair: [{ key: pair.bound ? 'essayTwoFigure' : 'essayTwoFigureOpen', blanks: drawn }],
    },
    pair,
  };
}

/** A part of the essay as its sentences stand for the work in hand, blanks filled. */
export function sentences(part: Part, facts: EssayFacts, t: Messages): string[] {
  const found: readonly Sentence[] =
    typeof part === 'string'
      ? [{ key: part, blanks: facts.blanks[part] ?? {} }]
      : facts.cases[part.choose];
  return found.map(({ key, blanks }) => fill(t[key], blanks));
}

/** A paragraph: its parts' sentences, joined as the language joins two (the catalog's `sentences`). */
export function paragraph(parts: readonly Part[], facts: EssayFacts, t: Messages): string {
  return parts
    .flatMap((part) => sentences(part, facts, t))
    .reduce((first, second) => fill(t.sentences, { first, second }));
}
