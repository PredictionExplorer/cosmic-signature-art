import type { Messages } from '@/lib/i18n/en';
import { fill, filmSpan } from '@/lib/i18n/format';
import { essayFigures, essayWork, essayWorkCount, type EssayWork } from '@/lib/art/essay-figures';
import { collectionIndex, cycles, indexedWork } from '@/lib/art/collection-index';
import { workPicture, type WorkPicture } from '@/lib/art/orbit-frames';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import { workNumber } from '@/lib/art/number';
import { QUICK_GATE } from '@/lib/physics/beginnings';
import { shareText } from '@/components/orbit-proof';
import type { EssayCase, EssayKey, Part } from './structure';

/*
  What the essay's blanks hold, for one work in one language. Every figure the essay states of
  the venue comes through here from a committed registry: the essay's own
  (src/lib/art/essay-figures.json, by scripts/build-essay-figures.mjs), the orbit records and
  the collection index. Nothing is typed in by hand but what the essay cites from a source:
  Belorizky's two counts (BELORIZKY) and the generator's own sheet of paper (KOZO). Numbers are
  written as the reader's language writes them, and a stretch of film as the venue words one
  everywhere ("5.4 seconds", "2.9 minutes").
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
  /** How the work's picture is projected, repeated, viewed and carried (orbit-frames.ts). */
  readonly picture: WorkPicture;
}

/** The words the facts are worded with. */
export type FactWords = Pick<
  Messages,
  'fateSeconds' | 'fateMinutes' | 'oneInATrillion' | 'wavelengthValue'
>;

/**
 * Belorizky's two counts (the source marked `beloriszky`): the powers of ten of the number of
 * terms Sundman's series needs, for three equal masses and for one holding a two-hundredth.
 */
const BELORIZKY = { equal: 80_000, unequal: 8_000_000 } as const;

/**
 * The sheet the generator computes for every Ink (the source marked `ember-paper`): its width,
 * the size of the clouds its fibre gathers in, and the fibres that show at its surface, all in
 * millimetres but the count, which is to the square centimetre.
 */
const KOZO = {
  width: 1490,
  floc: { least: 1.5, most: 8 },
  fibres: 1.5,
  fibre: { short: 5, long: 15 },
} as const;

/** The published names of the strokes a work is drawn in, as the collection index keeps them. */
const STRUCTURES = { ribbons: 'Orbit Ribbons', chords: 'Time Chords' } as const;
const structureCount = (name: string) =>
  collectionIndex.works.filter((work) => work.traits?.structure === name).length;

/** How long an Ink took the studio's machine, across the collection, in hours. */
const INK_HOURS = (() => {
  const hours = collectionIndex.works
    .map((work) => essayWork(work.id)?.ink.seconds)
    .filter((seconds): seconds is number => seconds !== undefined)
    .map((seconds) => seconds / 3600);
  return { least: Math.min(...hours), most: Math.max(...hours) };
})();

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
  const indexed = indexedWork(id);
  const weight = indexed?.borda?.equilibriumWeight;
  const picture = workPicture(id);
  const cycle = cycles().find((candidate) => candidate.cycle === indexed?.cycle);
  if (!work || !orbit || !indexed || weight === undefined || !picture || !cycle) return undefined;
  const { structure, palette } = indexed.traits ?? {};
  if (!structure || !palette || indexed.wavelengthNm === undefined || !indexed.mintedAt)
    return undefined;

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
  const mass = (index: number) => places(1)(orbit.published.masses[index]);
  /**
   * The four views' scores as a reader may check them against the rule the sentence before
   * states (the highest is kept; where two score alike, the first drawn). They are cut, never
   * rounded up, to three places, or to as many more as it takes for no view to be printed the
   * equal of the one kept unless it scored exactly the same: № 029's first view scores 0.99979
   * beside two that score 1, and reads 0.999.
   */
  const viewScores = (scores: readonly number[], kept: number): string[] => {
    for (let digits = 3; ; digits++) {
      const scale = 10 ** digits;
      const cut = scores.map((value) => Math.floor(value * scale + 1e-9) / scale);
      const told = scores.every((value, index) => value === scores[kept] || cut[index] < cut[kept]);
      if (told || digits === 9) return cut.map(places(digits));
    }
  };
  const scored = viewScores(picture.views.scores, picture.views.kept);
  /**
   * The camera's share of a circuit, in whole per cent from a tenth of one up, so that a share
   * past a whole circuit keeps its last figure (1.076 is 108 %, where two significant figures
   * gave 110 %); under a tenth, to two figures.
   */
  const circuit = (share: number) =>
    share >= 0.1
      ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(share)
      : shareText(share, locale);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });

  const blanks: Partial<Record<EssayKey, Blanks>> = {
    essayStandfirst: { work: name },
    essayOfWork: { work: name },
    essayOrbitCopy: { work: name, one: mass(0), two: mass(1), three: mass(2) },
    essayDepthLabel: { work: name },
    essayLightCopy: { work: name },
    essayBorn2: {
      work: name,
      date: day.format(new Date(indexed.mintedAt)),
      count: n(cycle.count),
      cycle: n(cycle.cycle),
    },
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
    essayViewScores: {
      work: name,
      first: scored[0],
      second: scored[1],
      third: scored[2],
      fourth: scored[3],
      kept: n(picture.views.kept + 1),
    },
    essayViewDrift: {
      work: name,
      share: circuit(picture.drift.arcFraction),
      eccentricity: places(2)(picture.drift.eccentricity),
    },
    essayView6: {
      count: n(essayFigures.pictures.otherSpace),
      works,
      repeated: n(essayFigures.pictures.symmetry),
    },
    essayStroke4: {
      ribbons: n(structureCount(STRUCTURES.ribbons)),
      works,
      chords: n(structureCount(STRUCTURES.chords)),
    },
    essayStrokeRecord: {
      structure,
      palette,
      wavelength: fill(t.wavelengthValue, { n: n(indexed.wavelengthNm) }),
    },
    essayStroke6: { frames: n(clock.film.frames), stride: n(clock.film.stepsPerFrame) },
    essayStroke7: { width: n(picture.size.width), height: n(picture.size.height) },
    essayPaper1: {
      width: n(KOZO.width),
      flocLow: n(KOZO.floc.least),
      flocHigh: n(KOZO.floc.most),
      fibres: n(KOZO.fibres),
      fibreShort: n(KOZO.fibre.short),
      fibreLong: n(KOZO.fibre.long),
    },
    essayPaper4: { least: places(1)(INK_HOURS.least), most: places(1)(INK_HOURS.most) },
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

  // What the orbit in depth is a drawing of: places, or the space the work is drawn in; then,
  // where the picture repeats its strokes, that the repeats turn with it.
  const depth: Sentence[] = [
    picture.projection === 'position'
      ? { key: 'essayOrbitPlaces', blanks: {} }
      : {
          key: 'essayOrbitSpace',
          blanks: { work: name, count: n(essayFigures.pictures.otherSpace) },
        },
    ...(picture.repeated ? [{ key: 'essayOrbitCopies', blanks: {} } as const] : []),
  ];

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
      depth,
    },
    pair,
    picture,
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
