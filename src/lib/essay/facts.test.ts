import orbitFrames from '@/lib/art/orbit-frames.json';
import { describe, expect, it } from 'vitest';
import { collectionIndex } from '@/lib/art/collection-index';
import { essayFigures, essayWork, essayWorkCount } from '@/lib/art/essay-figures';
import { orbitIds, workOrbit } from '@/lib/art/orbit-records';
import { catalogs } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { ESSAY_EXEMPLAR, essayFacts, paragraph, sentences } from './facts';
import { CASES, FRAME, chapterKeys, type EssayCase, type EssayKey } from './structure';

const en = catalogs.en;
const ids = orbitIds();
const decided = new Set<EssayKey>(Object.values(CASES).flat());
/** Every key a reader is shown whatever the work: the chapters' and the frame's, less the cases'. */
const fixed = [...chapterKeys(), ...FRAME].filter((key) => !decided.has(key));
const blanksIn = (template: string) =>
  [...template.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
const facts31 = essayFacts(31, 'en', en)!;
const said = (key: EssayKey) => sentences(key, facts31, en)[0].replace(/\u00a0/g, ' ');

describe('the essay’s facts', () => {
  it('fill every blank of every sentence, for every work, in every language', () => {
    expect(ids).toHaveLength(essayWorkCount);
    const unfilled: string[] = [];
    const unfit: string[] = [];
    for (const locale of locales) {
      const t = catalogs[locale];
      for (const id of ids) {
        const facts = essayFacts(id, locale, t);
        if (!facts) {
          unfilled.push(`№ ${id} in ${locale}: no facts`);
          continue;
        }
        const texts = [
          ...fixed.flatMap((key) => sentences(key, facts, t)),
          ...(Object.keys(CASES) as EssayCase[]).flatMap((name) =>
            sentences({ choose: name }, facts, t),
          ),
        ];
        for (const text of texts)
          if (/\{\w+\}/.test(text)) unfilled.push(`№ ${id} in ${locale}: ${text}`);
        const values = [
          ...Object.values(facts.blanks),
          ...Object.values(facts.cases).flatMap((found) => found.map(({ blanks }) => blanks)),
        ].flatMap((blanks) => Object.values(blanks ?? {}));
        // A value is a figure or a name: never a mark the renderer would read, never a miss.
        for (const value of values)
          if (value === '' || /[*[\]^{}]|NaN|undefined|null|∞/.test(value))
            unfit.push(`№ ${id} in ${locale}: “${value}”`);
      }
    }
    expect(unfilled).toEqual([]);
    expect(unfit).toEqual([]);
  }, 30_000);

  it('hold exactly the blanks each sentence has', () => {
    for (const [key, blanks] of Object.entries(facts31.blanks) as [EssayKey, object][])
      expect(Object.keys(blanks).sort(), key).toEqual([...new Set(blanksIn(en[key]))]);
    for (const key of fixed)
      if (!(key in facts31.blanks)) expect(blanksIn(en[key]), key).toEqual([]);
    for (const id of ids)
      for (const found of Object.values(essayFacts(id, 'en', en)!.cases))
        for (const { key, blanks } of found)
          expect(Object.keys(blanks).sort(), `${key} of № ${id}`).toEqual(blanksIn(en[key]));
  });

  it('word № 031 as its record and the registries have it', () => {
    expect(
      sentences({ choose: 'take' }, facts31, en).map((text) => text.replace(/\u00a0/g, ' ')),
    ).toEqual([
      'Without body 3, bodies 1 and 2 are bound, and would lap one ellipse every 14.9 seconds of film.',
      'Without body 1, bodies 2 and 3 are bound, and would lap one ellipse every 17.4 seconds of film.',
      'Without body 2, bodies 1 and 3 are not bound: they would pass once and part.',
    ]);
    expect(said('essayTwin2')).toBe(
      'Every work’s page shows this, under *One part in a trillion*. The browser follows the work and a twin whose body 1 begins a trillionth of a unit to one side. For № 031 the gap doubles, on average, about every 181,000 steps, which is 5.4 seconds of its film.',
    );
    expect(sentences({ choose: 'twin' }, facts31, en)).toEqual([
      'When the film ends the two are still one line on the plate, 0.000000001 of a unit apart. At step 6,756,700, 2.9 minutes after the film, they stand three pixels apart, and soon after they share nothing.',
    ]);
    expect(said('essaySteps5')).toContain(
      'In № 004, near step 1,535,000, bodies 1 and 3 pass 0.11 of a unit apart, and in that one step they travel 2.2 times the gap between them. The computed energy changes by 780%. Within 5,000 steps, after several such passes, it has gone from −4,560 to +54,600',
    );
    expect(said('essaySteps5')).toContain('an ejection of body 1 at step 1,540,000');
    expect(said('essaySteps6')).toContain(
      'In 57 of the 72 works the computed energy stays within one part in a thousand',
    );
    expect(said('essaySteps6')).toContain('in 3 of those, № 022, № 066 and № 068, it is lost');
    expect(said('essaySteps3')).toContain('of lengths 1.351, −1.702 and 1.351 of a step');
    expect(said('essayFormula6')).toContain('more than 10^{80,000} terms');
    expect(said('essayFormula6')).toContain('more than 10^{8,000,000} when');
    expect(said('essaySteps2')).toContain('the published trait reads “Eternal Dance”');
    expect(said('essaySteps2')).toContain('its **horizon**, 4.0 minutes at the film’s pace');
    expect(said('essayPlait5')).toContain('That of № 031 begins ');
    expect(said('essayUnknown1')).toContain(
      'to step 60,000,000, 30.0 minutes at the film’s pace, 23 of the 36 works',
    );
    expect(said('essayCurrent5')).toContain('for between 0.7 seconds and 6.9 seconds');
    expect(said('essayCurrent5')).toContain('Fresh ink is black for 0.8 seconds of film');
    expect(said('essayInkMade')).toContain('a grid of 2,160 by 1,536 points');
    expect(facts31.pair.pair).toEqual([1, 2]);
    expect(sentences({ choose: 'pair' }, facts31, en)[0]).toMatch(
      /^Bodies 2 and 3 of №.031, alone/,
    );
  });

  it('words a work’s picture as the registry of its frame has it: № 031, and every work', () => {
    const plain = (text: string) => text.replace(/\u00a0/g, ' ');
    // The registry itself (src/lib/art/orbit-frames.json), read here and not through the facts.
    expect(sentences('essayViewScores', facts31, en).map(plain)).toEqual([
      'Derived again from the seed of № 031, the four views score 0.813, 0.828, 0.751 and 0.698 on a scale from 0 to 1, in the order drawn. Number 2 was kept.',
    ]);
    expect(sentences('essayViewDrift', facts31, en).map(plain)).toEqual([
      'While the film of № 031 runs, its camera is carried for 11% of the time one circuit of its ellipse would take. Its drift eccentricity is 0.40; a circle’s is 0.',
    ]);
    expect(sentences('essayStrokeRecord', facts31, en).map(plain)).toEqual([
      'Its structure is “Orbit Ribbons” and its palette “Rose Mono”. Its dominant wavelength is 632 nanometres: the wavelength nearest in hue to its most strongly coloured body.',
    ]);
    expect(plain(said('essayOrbitCopy'))).toContain('of masses 130.7, 251.0 and 125.0');
    const frames = new Map(
      (
        orbitFrames as unknown as {
          frames: {
            id: number;
            projection: string;
            symmetry: string;
            view: { candidate: number; scores: string[] };
            drift: { arcFraction: number | string; eccentricity: number | string };
          }[];
        }
      ).frames.map((frame) => [frame.id, frame]),
    );
    const more: number[] = [];
    for (const id of ids) {
      const facts = essayFacts(id, 'en', en)!;
      const frame = frames.get(id)!;
      const scores = frame.view.scores.map(Number);
      const printed = (['first', 'second', 'third', 'fourth'] as const).map((name) =>
        Number(facts.blanks.essayViewScores![name]),
      );
      // Each score is cut to three places or more and never raised, all four to the same
      // number of places, and the view kept is the one the generator kept: as printed, no other
      // view reads its equal unless it scored exactly the same, and the kept is the first of
      // the highest, as the sentence before says.
      const places = facts.blanks.essayViewScores!.first.split('.')[1].length;
      expect(places, `№ ${id}`).toBeGreaterThanOrEqual(3);
      scores.forEach((score, index) => {
        expect(printed[index], `№ ${id}`).toBeLessThanOrEqual(score);
        expect(score - printed[index], `№ ${id}`).toBeLessThan(10 ** -places);
        if (score !== scores[frame.view.candidate])
          expect(printed[index], `№ ${id}`).toBeLessThan(printed[frame.view.candidate]);
      });
      expect(facts.blanks.essayViewScores!.kept, `№ ${id}`).toBe(String(frame.view.candidate + 1));
      expect(printed.indexOf(Math.max(...printed)), `№ ${id}`).toBe(frame.view.candidate);
      more.push(places);
      // The camera's share of a circuit, to the nearest whole per cent from a tenth up.
      const share = facts.blanks.essayViewDrift!.share;
      const arc = Number(frame.drift.arcFraction);
      if (arc >= 0.1) expect(share, `№ ${id}`).toBe(`${Math.round(arc * 100)}%`);
      else expect(Number(share.replace('%', '')), `№ ${id}`).toBeGreaterThan(0);
      expect(facts.blanks.essayViewDrift!.eccentricity, `№ ${id}`).toBe(
        Number(frame.drift.eccentricity).toFixed(2),
      );
      // What the orbit in depth says it is: the bodies' paths, or the drawing of another space;
      // and that its strokes are repeated exactly where they are.
      expect(
        facts.cases.depth.map(({ key }) => key),
        `№ ${id}`,
      ).toEqual([
        frame.projection === 'position' ? 'essayOrbitPlaces' : 'essayOrbitSpace',
        ...(frame.symmetry === 'none' ? [] : ['essayOrbitCopies']),
      ]);
    }
    // Three places tell nearly every work; a few need one more to tell two views apart.
    expect(more.filter((places) => places === 3).length).toBeGreaterThan(60);
    expect(Math.max(...more)).toBeLessThanOrEqual(5);
    // Two that a rounding would have told wrongly: a first view just under two that score 1,
    // and a camera carried past one whole circuit.
    expect(sentences('essayViewScores', essayFacts(29, 'en', en)!, en).map(plain)[0]).toContain(
      'score 0.999, 1.000, 1.000 and 0.973 on a scale from 0 to 1, in the order drawn. Number 2 was kept.',
    );
    expect(essayFacts(13, 'en', en)!.blanks.essayViewDrift!.share).toBe('108%');
  });

  it('write numbers as each language does', () => {
    const uk = essayFacts(31, 'uk', catalogs.uk)!;
    expect(uk.blanks.essaySteps1!.steps).toBe('1\u00a0000\u00a0000');
    expect(uk.blanks.essaySteps3!.back).toBe('−1,702');
    expect(essayFacts(31, 'vi', catalogs.vi)!.blanks.essaySteps1!.rate).toBe('33.300');
    // A list in the language's own words, and a stretch of film in the catalog's.
    expect(essayFacts(31, 'ja', catalogs.ja)!.blanks.essaySteps6!.insideWorks).toBe(
      '№\u00a0022、№\u00a0066、№\u00a0068',
    );
    expect(uk.blanks.essayTwin2!.control).toBe(catalogs.uk.oneInATrillion);
  });

  it('choose each sentence the work decides', () => {
    const { clock } = essayFigures;
    for (const id of ids) {
      const facts = essayFacts(id, 'en', en)!;
      const work = essayWork(id)!;
      // One body taken away at a time: three sentences, the bound pairs first.
      const take = facts.cases.take.map(({ key }) => key);
      const bound = work.pairs.filter((pair) => pair.bound).length;
      expect(take).toEqual([
        ...Array(bound).fill('essayTakeBound'),
        ...Array(3 - bound).fill('essayTakeOpen'),
      ]);
      expect(new Set(facts.cases.take.map(({ blanks }) => blanks.out)).size).toBe(3);
      expect(facts.pair.bound).toBe(bound > 0);
      expect(facts.cases.pair[0].key).toBe(bound ? 'essayTwoFigure' : 'essayTwoFigureOpen');
      const { parted } = work.twin;
      expect(facts.cases.twin[0].key).toBe(
        parted === null
          ? 'essayTwinNever'
          : parted <= clock.steps
            ? 'essayTwinInside'
            : 'essayTwinAfter',
      );
      expect(facts.cases.claim[0].key).toBe(
        work.sheet.stretch > 1 ? 'essayClaimForced' : 'essayClaimFree',
      );
    }
    // Every form is some work's: none is written for a case the collection does not have.
    const used = new Set(
      ids.flatMap((id) =>
        Object.values(essayFacts(id, 'en', en)!.cases).flatMap((found) =>
          found.map(({ key }) => key),
        ),
      ),
    );
    expect([...used].sort()).toEqual([...decided].sort());
  });

  it('join a paragraph’s sentences as the language joins two', () => {
    const joined = paragraph(['essayTakeLead', { choose: 'take' }, 'essayTakeAll'], facts31, en);
    expect(joined.split('. ')).toHaveLength(5);
    expect(joined.endsWith(en.essayTakeAll)).toBe(true);
  });

  it('are nothing for a work the registries do not hold, and the exemplar always has them', () => {
    expect(essayFacts(9999, 'en', en)).toBeUndefined();
    expect(essayFacts(ESSAY_EXEMPLAR, 'en', en)).toBeDefined();
  });
});

describe('what the essay says of the whole collection', () => {
  const { clock, energy, twins, past, sheets, traits, integrator, beginnings, ink, plait } =
    essayFigures;

  it('is true of the registries the pages read', () => {
    const records = ids.map((id) => workOrbit(id)!);
    // “Here the first ranking counts once”: the chaos weight is 1 for every work.
    expect(new Set(collectionIndex.works.map((work) => work.borda?.chaosWeight))).toEqual(
      new Set([1]),
    );
    // “for no work more than {most}”.
    expect(traits.syzygies.most).toBe(
      Math.max(...records.map((record) => record.published.syzygyCount)),
    );
    // “In every one of the {works} works two bodies overlap on the sheet at some moment.”
    expect(sheets.overlapAtSomeTime).toHaveLength(essayWorkCount);
    expect(energy.kept.length + energy.lost.length).toBe(essayWorkCount);
    expect(energy.lostInsideWindow.every((id) => energy.lost.includes(id))).toBe(true);
    expect(twins.measured).toBe(essayWorkCount);
    expect(twins.clean.outcome).toBeLessThanOrEqual(twins.clean.differ);
    expect(twins.clean.differ).toBeLessThanOrEqual(twins.clean.works);
    // Past the horizon: the runs that keep their energy and those that lose it are all of them.
    expect(past.looked).toBe(
      records.filter((record) => record.fate.outcome === 'eternal_dance').length,
    );
    expect(past.clean.runs + past.energyBroken.length).toBe(past.looked);
    expect(past.clean.lost + past.clean.still).toBe(past.clean.runs);
    expect(past.clean.earliest).toBeGreaterThan(clock.horizonSteps);
    expect(past.steps).toBeGreaterThan(clock.horizonSteps);
    expect(records.every((record) => record.fate.horizonSteps === clock.horizonSteps)).toBe(true);
    expect(records.every((record) => record.generation.steps === clock.steps)).toBe(true);
  });

  it('draws two examples of the energy that are what their caption says', () => {
    const { heldExample, lostExample, heldWithin } = energy;
    expect(energy.kept).toContain(heldExample.id);
    expect(energy.lost).toContain(lostExample.id);
    // “stays within a few parts in ten trillion”, to twice the window.
    expect(Math.max(...heldExample.series.values)).toBeLessThan(1e-12);
    const before = lostExample.series.values.filter(
      (_value, index) => (index + 1) * lostExample.series.every < lostExample.step,
    );
    // “stays as close until its near miss, then leaps past … one part in a thousand”.
    expect(Math.max(...before)).toBeLessThan(1e-12);
    expect(Math.max(...lostExample.series.values)).toBeGreaterThan(heldWithin);
    // The pass, the loss and the dated ejection, in that order; the energy ends above nothing.
    expect(lostExample.pass.step).toBeLessThanOrEqual(lostExample.step);
    expect(lostExample.pass.until).toBe(lostExample.ejected.step);
    expect(lostExample.pass.passes).toBeGreaterThan(2);
    expect(lostExample.pass.energyBefore).toBeLessThan(0);
    expect(lostExample.pass.energyAfter).toBeGreaterThan(0);
    expect(workOrbit(lostExample.id)!.fate).toMatchObject({
      outcome: 'ejection',
      escaper: lostExample.ejected.body,
      ejectionStep: lostExample.ejected.step,
    });
  });

  it('states the generator’s ranges, its three pushes and its water as they are', () => {
    expect([beginnings.mass.least, beginnings.mass.most].map(Math.round)).toEqual([100, 300]);
    expect([beginnings.place.least, beginnings.place.most].map(Math.round)).toEqual([-300, 300]);
    expect([beginnings.velocity.least, beginnings.velocity.most].map(Math.round)).toEqual([-1, 1]);
    // “the heaviest is at most three times the lightest”.
    expect(beginnings.mass.most / beginnings.mass.least).toBeLessThanOrEqual(3);
    expect(integrator.w1 + integrator.w0 + integrator.w1).toBeCloseTo(1, 12);
    expect(integrator.w0).toBeLessThan(-1);
    expect(clock.film.stepsPerSecond * clock.film.seconds).toBeGreaterThanOrEqual(clock.steps);
    // “a patch a twentieth of the sheet’s height across … up to three times as long as it is wide”.
    expect(ink.shared.bodyRadius * 2).toBeCloseTo(1 / 10 / 2 + 0.05, 12);
    expect(ink.shared.maxAspect).toBe(3);
    expect(ink.shared.supersample ** 2).toBe(9);
    // “fades, over about six seconds”: the fading’s time constant, eight times over.
    expect(ink.shared.fadeFraction * clock.film.seconds * 8).toBeCloseTo(6, 0);
    // The golden ratio squared: what one repeat of the plait must do to a line.
    expect(plait.pigtail).toBeCloseTo(((1 + Math.sqrt(5)) / 2) ** 2, 12);
    expect(plait.plain).toBe(1);
  });
});
