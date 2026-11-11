import { beforeAll, describe, expect, it } from 'vitest';
import { plateFrame } from '@/lib/art/orbit-frames';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { catalogs } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { beyondPath, type BeyondPath } from '@/lib/physics/beyond';
import { HeldPlacement } from '@/lib/physics/framing';
import { lightFilmDuration } from '@/lib/physics/light-film';
import { deriveFate, type DerivedFate } from '@/lib/physics/orbit';
import {
  beyondFact,
  beyondLine,
  furtherOn,
  heldScript,
  outNow,
  worthGoingOn,
  type HeldScript,
} from './orbit-beyond';
import { platePicture, type Material, type Picture } from './orbit-picture';

const en = catalogs.en;
const english = new Intl.NumberFormat('en');
const STEPS = 1_000_000;
const PACE = STEPS / lightFilmDuration(STEPS);
/** The worker's samples in a second of film. */
const PER_SECOND = PACE / 100;
const FRAME = { width: 3_456, height: 2_234 };
/** A plate's picture as the section makes it, at any size: only its frame decides who is in it. */
const pictureOf = (copies = 1, material: Material = 'light', frame = FRAME): Picture =>
  platePicture(
    { stride: 100, count: 1, copies, pixels: new Float32Array(copies * 12) },
    frame,
    material,
    900,
    582,
    1,
  );

/** A work's own path past its window, as the worker carries it. */
function carried(id: number) {
  const orbit = workOrbit(id)!;
  const [performed] = performedOrbits([id]);
  const steps = orbit.generation.steps;
  const start = { masses: orbit.published.masses, dt: orbit.generation.dt, steps };
  const fate = deriveFate(
    { ...start, positions: performed.window.positions, velocities: performed.window.velocities },
    { steps, threshold: orbit.fate.escapeThreshold, horizonSteps: orbit.fate.horizonSteps },
  );
  const frame = plateFrame(id)!;
  const path = beyondPath({
    ...start,
    fate,
    pace: PACE,
    stride: 100,
    plate: new HeldPlacement(frame, start),
  });
  /** The path read for the work's plate in a material, as the page reads it. */
  const on = (material: Material) => ({
    fate,
    path,
    script: heldScript(
      path,
      pictureOf(path.copies, material, frame),
      fate,
      PACE,
      frame.projection === 'position',
    ),
  });
  return { ...on('light'), on };
}

const bound = {
  outcome: 'eternal_dance',
  escaper: null,
  ejectionStep: null,
  horizonSteps: 8_000_000,
} as const;
/** Body 2 is found free at step 1,090,000: confirmed 3.9 seconds of film after the window. */
const freed = {
  outcome: 'ejection',
  escaper: 1,
  ejectionStep: 1_090_000,
  horizonSteps: 8_000_000,
} as const;

/**
 * A path made for the test: each body at the middle of the frame, but for the stretches named
 * (in seconds of film; without a `to`, to the path's end), when it stands `far` widths outside.
 */
function made(
  seconds: number,
  out: { body: number; from: number; to?: number; far?: number }[],
  fate: Pick<DerivedFate, 'outcome' | 'escaper' | 'ejectionStep' | 'horizonSteps'> = bound,
  lost: BeyondPath['lost'] = null,
  names = true,
) {
  const samples = Math.round(seconds * PER_SECOND) + 1;
  const pixels = new Float32Array(samples * 6);
  for (let sample = 0; sample < samples; sample++)
    for (let body = 0; body < 3; body++) {
      const at = sample / PER_SECOND;
      const away = out.find(
        (one) => one.body === body && at >= one.from && at < (one.to ?? Infinity),
      );
      pixels[(sample * 3 + body) * 2] = away ? FRAME.width * (1 + (away.far ?? 1)) : 1_728;
      pixels[(sample * 3 + body) * 2 + 1] = 1_117;
    }
  const path: BeyondPath = { from: STEPS, stride: 100, samples, pixels, copies: 1, lost };
  return { fate, path, script: heldScript(path, pictureOf(), fate, PACE, names) };
}
type Read = ReturnType<typeof made>;
const fact = ({ fate, path, script }: Read, t = en, number = english) =>
  beyondFact(script, path, fate, t, number);
const lineAt = ({ script, path }: Read, second: number, t = en, number = english) =>
  // The first sample at or past that second of film.
  beyondLine(script, path, Math.ceil(second * PER_SECOND), t, number);
const seconds = (script: HeldScript, sample: number) => sample / script.perSecond;

describe('what the picture shows of eight works, past their frames', () => {
  let works: Record<number, ReturnType<typeof carried>>;
  beforeAll(() => {
    works = Object.fromEntries([25, 31, 16, 4, 30, 14, 54, 8].map((id) => [id, carried(id)]));
  }, 240_000);

  it('№ 025: body 2 leaves, and the other two are out of the picture 7.2 seconds later', () => {
    const { script, path, fate } = works[25];
    expect(script.ending.kind).toBe('empty');
    // Two seconds with all three out, then the end.
    expect(seconds(script, script.ending.sample)).toBeCloseTo(12.57, 1);
    expect(script.moments.map((moment) => seconds(script, moment).toFixed(1))).toEqual([
      '3.4',
      '8.4',
      '10.6',
    ]);
    expect(fact(works[25])).toEqual([
      'Body 2 left the picture 3.4 seconds after the film ended.',
      '7.2 seconds later the other two had left it too.',
      'The record finds body 2 no longer bound to the other two at step 1,210,000.',
    ]);
    // The picture's own event comes before the record's date for it, 6.3 seconds after the film.
    expect(script.moments[0]).toBeLessThan((fate.ejectionStep! - path.from) / path.stride);
  });

  it('№ 031: body 3 leaves the picture for 8.8 seconds, and comes back', () => {
    const { script, path } = works[31];
    expect(script.ending).toMatchObject({ kind: 'returned', absence: { body: 2 } });
    expect(seconds(script, script.ending.sample)).toBeCloseTo(44.38, 1);
    expect(fact(works[31])).toEqual([
      'Body 3 left the picture 33.6 seconds after the film ended.',
      'It came back 8.8 seconds later.',
      'All three are still bound to one another at step 8,000,000, where the record stops looking.',
    ]);
    // Its path runs to the record's horizon, though the performance ends long before.
    expect(path.from + (path.samples - 1) * path.stride).toBe(8_000_000);
  });

  it('№ 016: body 3 goes, and the two it left are still in the picture', () => {
    expect(works[16].script.ending.kind).toBe('parted');
    expect(fact(works[16])).toEqual([
      'Body 3 left the picture 42.2 seconds after the film ended.',
      '8.0 seconds later the other two were still in it.',
      'The record finds body 3 no longer bound to the other two at step 1,730,000.',
    ]);
  });

  it('№ 004: nothing is performed past the step that lost the energy, and nothing else is said', () => {
    const { script, path } = works[4];
    expect(script.ending).toEqual({ kind: 'adrift', sample: path.samples - 1 });
    expect(fact(works[4])).toEqual([
      'Past step 1,535,000 this is not an orbit: the computed energy changed by 780%.',
    ]);
  });

  it('№ 014: a body that left and came back is said to have last left, not left', () => {
    // The line had named body 2 out of the picture from 3.5 seconds after the film for 22.6,
    // before it came back; the fact speaks of its last leaving, and says so.
    const read = works[14];
    expect(lineAt(read, 10)).toMatch(/^00:10 past the film · body 2 is out of the picture, /);
    expect(lineAt(read, 27)).toBe('00:27 past the film · step 1,899,100');
    expect(fact(read)).toEqual([
      'Body 2 last left the picture 28.7 seconds after the film ended.',
      'The other two had already left it.',
      'The record finds body 2 no longer bound to the other two at step 1,930,000.',
    ]);
  });

  it('№ 030: a path cut by lost energy does not end on a picture that emptied for an instant', () => {
    // The energy breaks seven seconds past the confirmation. The two body 3 left cross the edge
    // 1.6 and 0.2 seconds before the path stops: all three out, for 0.17 seconds of film.
    const { script, path } = works[30];
    const last = path.samples - 1;
    expect(outNow(script, last)).toEqual([0, 1, 2]);
    expect(script.ending).toEqual({ kind: 'parted', sample: last });
    // Nothing is said of the other two; the record's finding is; and why the performance stops.
    expect(fact(works[30])).toEqual([
      'Body 3 last left the picture 1.9 minutes after the film ended.',
      'The record finds body 3 no longer bound to the other two at step 4,830,000.',
      'Past step 5,106,000 this is not an orbit: the computed energy changed by 0.3%.',
    ]);
  });

  it('№ 054: a picture that does not draw the bodies where they were names none', () => {
    // Plotted in cross-braid space, where a mark is made of two bodies' coordinates. Its marks
    // leave the picture and the performance ends on that; no sentence calls a mark a body.
    const read = works[54];
    expect(plateFrame(54)!.projection).toBe('cross_braid');
    expect(read.script.ending.kind).toBe('empty');
    expect(read.script.moments.length).toBeGreaterThan(0);
    for (const second of [0, 3, 10, 33])
      expect(lineAt(read, second)).toMatch(/^00:\d\d past the film · step [\d,]+$/);
    expect(fact(read)).toEqual([
      'The record finds body 2 no longer bound to the other two at step 1,090,000.',
    ]);
  });

  it('№ 008: each material is told of its own picture, every copy on Light and one on Ink', () => {
    // Drawn six times round and mirrored: twelve copies of each body on Light, the first alone
    // on Ink. Body 2 is back in the Ink picture 1.6 seconds after a copy of it is back in the
    // Light one.
    const light = works[8].on('light');
    const ink = works[8].on('ink');
    expect(works[8].path.copies).toBe(12);
    expect([light.script.copies, ink.script.copies]).toEqual([12, 1]);
    expect(fact(light)).toEqual([
      'Body 2 left the picture 2.5 minutes after the film ended.',
      'It came back 51.0 seconds later.',
      'All three are still bound to one another at step 8,000,000, where the record stops looking.',
    ]);
    expect(fact(ink)[1]).toBe('It came back 52.6 seconds later.');
  });

  it('says it in every reader’s language, with that language’s digits, and never of an escape', () => {
    const told = Object.fromEntries(
      locales.map((locale) => [
        locale,
        fact(works[25], catalogs[locale], new Intl.NumberFormat(locale)),
      ]),
    );
    expect(told.uk).toEqual([
      'Тіло 2 вийшло з кадру через 3,4 секунди після кінця фільму.',
      // By then they were out: not that they left then.
      'Ще через 7,2 секунди два інші теж були поза кадром.',
      'За записом, на кроці 1\u00a0210\u00a0000 тіло 2 уже не зв’язане з двома іншими.',
    ]);
    expect(told.ja[0]).toBe('映像が終わって 3.4 秒後、天体 2 がフレームの外に出ました。');
    expect(told.ko[0]).toBe('영상이 끝나고 3.4초 뒤, 2번 천체가 프레임 밖으로 나갔습니다.');
    expect(told.zh[1]).toBe('再过 7.2 秒，另外两个也已离开画面。');
    expect(told.vi[2]).toBe(
      'Hồ sơ ghi nhận vật thể 2 không còn gắn kết với hai vật còn lại ở bước 1.210.000.',
    );
    for (const locale of locales) {
      expect(told[locale]).toHaveLength(3);
      for (const sentence of told[locale]) expect(sentence).not.toMatch(/[{}]/);
    }
    // The dance's line, in each: the three, not "they".
    const still = locales.map(
      (locale) => fact(works[31], catalogs[locale], new Intl.NumberFormat(locale))[2],
    );
    expect(still[0]).toMatch(/^All three are still bound/);
    expect(new Set(still).size).toBeGreaterThanOrEqual(7);
  });
});

describe('what is said of an ending, each sentence only where it is so', () => {
  const stillBound =
    'All three are still bound to one another at step 8,000,000, where the record stops looking.';

  it('a bound orbit with nothing seen to leave: the record’s word alone', () => {
    // A body just past the edge for seven seconds, and one far out but back within two: the
    // picture is flat, and says nothing of how far a body went behind it.
    expect(fact(made(20, [{ body: 0, from: 2, to: 9, far: 0.05 }]))).toEqual([stillBound]);
    expect(fact(made(20, [{ body: 0, from: 2, to: 4, far: 2 }]))).toEqual([stillBound]);
  });

  it('a bound orbit with a body still away at the horizon: the horizon is said once', () => {
    expect(fact(made(20, [{ body: 2, from: 15 }]))).toEqual([
      'Body 3 left the picture 15.0 seconds after the film ended.',
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.',
    ]);
  });

  it('a leaving after an earlier one: left again where it came back, last left where it did not', () => {
    // A graze of half a second is an earlier leaving too.
    const again = made(30, [
      { body: 2, from: 2, to: 2.5 },
      { body: 2, from: 10, to: 16 },
    ]);
    expect(fact(again).slice(0, 2)).toEqual([
      'Body 3 left the picture again 10.0 seconds after the film ended.',
      'It came back 6.0 seconds later.',
    ]);
    const last = made(30, [
      { body: 2, from: 2, to: 2.5 },
      { body: 2, from: 25 },
    ]);
    expect(fact(last)[0]).toBe('Body 3 last left the picture 25.0 seconds after the film ended.');
    // Another body's earlier leaving is not this one's.
    const first = made(30, [
      { body: 0, from: 2, to: 2.5 },
      { body: 2, from: 10, to: 16 },
    ]);
    expect(fact(first)[0]).toBe('Body 3 left the picture 10.0 seconds after the film ended.');
  });

  it('a bound orbit whose picture empties for good: the last to go, and the two gone before', () => {
    const emptied = made(20, [
      { body: 0, from: 7 },
      { body: 2, from: 8 },
      { body: 1, from: 11 },
    ]);
    expect(emptied.script.ending).toMatchObject({ kind: 'empty' });
    expect(fact(emptied)).toEqual([
      'Body 2 left the picture 11.0 seconds after the film ended.',
      'The other two had already left it.',
      stillBound,
    ]);
  });

  it('a leaver that was the last of the three to go', () => {
    const last = made(
      20,
      [
        { body: 0, from: 4 },
        { body: 2, from: 4 },
        { body: 1, from: 9 },
      ],
      freed,
    );
    expect(fact(last)).toEqual([
      'Body 2 left the picture 9.0 seconds after the film ended.',
      'The other two had already left it.',
      'The record finds body 2 no longer bound to the other two at step 1,090,000.',
    ]);
  });

  it('one of the other two gone before the leaver: by then both had left, not then', () => {
    // As in № 054: body 1 out first, the leaver second, body 3 last.
    const before = made(
      40,
      [
        { body: 0, from: 2 },
        { body: 1, from: 5 },
        { body: 2, from: 32 },
      ],
      freed,
    );
    expect(fact(before)[1]).toBe('27.0 seconds later the other two had left it too.');
    expect(fact(before, catalogs.ko, new Intl.NumberFormat('ko'))[1]).toBe(
      '다시 27.0초 뒤에는 나머지 둘도 프레임 밖에 있었습니다.',
    );
    expect(fact(before, catalogs.ja, new Intl.NumberFormat('ja'))[1]).toBe(
      'さらに 27.0 秒後には、他の二つもフレームの外に出ていました。',
    );
  });

  it('a leaver gone, with one of the two it left out of the picture at the last', () => {
    // Body 1 comes and goes, so the picture never stays empty; at the last sample it is out.
    const coming = made(
      30,
      [
        { body: 1, from: 6 },
        { body: 0, from: 13.5, to: 14.5, far: 0.02 },
      ],
      freed,
    );
    expect(coming.script.ending).toMatchObject({ kind: 'parted' });
    expect(fact(coming)).toEqual([
      'Body 2 left the picture 6.0 seconds after the film ended.',
      'The record finds body 2 no longer bound to the other two at step 1,090,000.',
    ]);
  });

  it('a body that left and came back before the computation lost its energy', () => {
    // The path stops at the lost energy, before the step that would confirm the record's
    // escape: no body is called free, and the record's word on the three is not said.
    const lost = { step: 2_000_000, change: 0.5, closest: 0.2 };
    const later = { ...freed, ejectionStep: 3_000_000 };
    expect(fact(made(25, [{ body: 0, from: 5, to: 12 }], later, lost))).toEqual([
      'Body 1 left the picture 5.0 seconds after the film ended.',
      'It came back 7.0 seconds later.',
      'Past step 2,000,000 this is not an orbit: the computed energy changed by 50%.',
    ]);
    // Nor is a bound orbit's, where its energy broke before the horizon.
    expect(fact(made(25, [{ body: 0, from: 5, to: 12 }], bound, lost))).toHaveLength(3);
    expect(fact(made(25, [], bound, lost))).toEqual([
      'Past step 2,000,000 this is not an orbit: the computed energy changed by 50%.',
    ]);
  });

  it('a picture whose marks are not the bodies: what the record finds, and no more', () => {
    const marks = made(20, [{ body: 2, from: 4, to: 10 }], bound, null, false);
    // The marks' leaving still shapes the performance…
    expect(marks.script.ending).toMatchObject({ kind: 'returned' });
    expect(marks.script.moments).toHaveLength(2);
    // …and no line or sentence calls a mark a body.
    expect(lineAt(marks, 6)).toBe('00:06 past the film · step 1,199,800');
    expect(fact(marks)).toEqual([stillBound]);
  });

  it('counts a wait of a minute or more in minutes', () => {
    const long = fact(made(200, [{ body: 0, from: 90, to: 174 }]));
    expect(long[0]).toBe('Body 1 left the picture 1.5 minutes after the film ended.');
    expect(long[1]).toBe('It came back 1.4 minutes later.');
  });
});

describe('the line while it runs', () => {
  const read = made(20, [
    { body: 1, from: 3, far: 1.37 },
    { body: 0, from: 5 },
    { body: 2, from: 8 },
  ]);
  const at = (second: number, t = en, number = english) => lineAt(read, second, t, number);

  it('counts the time past the film and the step while all three are in the picture', () => {
    expect(at(0)).toBe('00:00 past the film · step 1,000,000');
    expect(at(2)).toBe('00:02 past the film · step 1,066,600');
  });
  it('counts how far a body that has left stands, in widths of the picture', () => {
    expect(at(4)).toBe(
      '00:04 past the film · body 2 is out of the picture, 1.4 picture widths away',
    );
    expect(at(4, catalogs.uk, new Intl.NumberFormat('uk'))).toBe(
      '00:04 після фільму · тіло 2 поза кадром, за 1,4 ширини кадру',
    );
  });
  it('names two that are out, and says when all three are', () => {
    expect(at(6)).toBe('00:06 past the film · bodies 1 and 2 are out of the picture');
    expect(at(9)).toBe('00:09 past the film · all three are out of the picture');
  });

  it('names a body that stands just past the edge for a while, without a distance of nothing', () => {
    // Out of sight by more than its own light, 0.03 widths out for eight seconds.
    const near = made(30, [{ body: 0, from: 5, to: 13, far: 0.03 }]);
    expect(lineAt(near, 8)).toBe('00:08 past the film · body 1 is out of the picture');
    expect(lineAt(near, 8, catalogs.ja, new Intl.NumberFormat('ja'))).toBe(
      '映像の後 00:08 · 天体 1 はフレームの外',
    );
    // It is no moment of the performance, and no ending: it went nowhere.
    expect(near.script.moments).toEqual([]);
    expect(near.script.ending.kind).toBe('record');
  });
  it('says nothing of a body that grazes the edge and is back within three seconds', () => {
    const graze = made(30, [{ body: 0, from: 5, to: 7.9, far: 2 }]);
    expect(lineAt(graze, 6)).toBe('00:06 past the film · step 1,199,800');
    // Four seconds out is said.
    const longer = made(30, [{ body: 0, from: 5, to: 9, far: 2 }]);
    expect(lineAt(longer, 6)).toMatch(/body 1 is out of the picture/);
  });
  it('says all three are out for as long as they are, whoever went how far', () => {
    // As in № 062: two stand just past the edge to the horizon while the third is far away.
    const hover = made(60, [
      { body: 0, from: 10, far: 0.06 },
      { body: 1, from: 12, far: 0.05 },
      { body: 2, from: 5, to: 40, far: 0.5 },
    ]);
    expect(lineAt(hover, 20)).toBe('00:20 past the film · all three are out of the picture');
    expect(lineAt(hover, 45)).toBe('00:45 past the film · bodies 1 and 2 are out of the picture');
    expect(hover.script.ending).toMatchObject({ kind: 'returned', absence: { body: 2 } });
  });
  it('says all three are out from the moment that ends the performance, however short their absences', () => {
    // The last two leave together two and a half seconds before the path ends: neither absence
    // lasts three, and the picture has emptied to end on all the same.
    const late = made(
      20,
      [
        { body: 1, from: 4 },
        { body: 0, from: 14, to: 16.5 },
        { body: 2, from: 14, to: 16.5 },
      ],
      freed,
    );
    expect(late.script.ending).toMatchObject({ kind: 'empty' });
    expect(lineAt(late, 15)).toBe('00:15 past the film · all three are out of the picture');
  });
});

describe('Further on', () => {
  // Body 3 leaves forty seconds after the film and is back at fifty; the end is at fifty-two.
  const { script } = made(80, [{ body: 2, from: 40, to: 50 }]);
  const sample = (second: number) => Math.round(second * PER_SECOND);
  const second = (target: number | 'end') =>
    target === 'end' ? target : Math.round(target / PER_SECOND);

  it('goes to four seconds before the next moment, to watch it come', () => {
    expect(script.ending).toMatchObject({ kind: 'returned' });
    expect(second(furtherOn(script, sample(1), false))).toBe(36);
    expect(second(furtherOn(script, sample(41), false))).toBe(46);
    // Past the last moment, towards the end; at the end, on to what happened.
    expect(second(furtherOn(script, sample(50.5), false))).toBe(51);
    expect(furtherOn(script, script.ending.sample, false)).toBe('end');
  });
  it('is worth it only where it saves a wait', () => {
    expect(worthGoingOn(script, sample(1), false)).toBe(true);
    expect(worthGoingOn(script, sample(33), false)).toBe(false);
    expect(worthGoingOn(script, sample(38), false)).toBe(false);
    expect(worthGoingOn(script, sample(41), false)).toBe(true);
    expect(worthGoingOn(script, sample(51), false)).toBe(false);
  });
  it('steps to a second past each moment where nothing plays, then to the end, then on', () => {
    expect(worthGoingOn(script, 0, true)).toBe(true);
    // Each step starts where the last one landed.
    const first = furtherOn(script, 0, true) as number;
    expect(second(first)).toBe(41);
    const next = furtherOn(script, first, true) as number;
    expect(second(next)).toBe(51);
    expect(furtherOn(script, next, true)).toBe(script.ending.sample);
    expect(furtherOn(script, script.ending.sample, true)).toBe('end');
    expect(worthGoingOn(script, script.ending.sample, true)).toBe(true);
  });
  it('does not stop twice on moments the picture already shows together', () => {
    // Two bodies leave a fifth of a second apart: a second past the first, both are out.
    const close = made(30, [
      { body: 0, from: 10, to: 20 },
      { body: 1, from: 10.2, to: 21 },
    ]).script;
    const first = furtherOn(close, 0, true) as number;
    expect(second(first)).toBe(11);
    // The next stop is the first return, not the leaving a fifth of a second on.
    expect(second(furtherOn(close, first, true))).toBe(21);
  });
});
