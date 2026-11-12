import { beforeAll, describe, expect, it } from 'vitest';
import { plateFrame } from '@/lib/art/orbit-frames';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { catalogs } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { beyondPath, type BeyondPath } from '@/lib/physics/beyond';
import { HeldPlacement, framedSamples } from '@/lib/physics/framing';
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
import { keptPicture, platePicture, type Material, type Picture } from './orbit-picture';

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

/** A recorded window in which the three never left the middle: the film showed none of them out. */
const QUIET_FILM = {
  count: 1,
  copies: 1,
  pixels: Float32Array.from({ length: 12 }, (_, i) => (i % 2 ? 1_117 : 1_728)),
};

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
  // The recorded window as the frame places it: what the film itself showed.
  const framed = framedSamples(
    { ...start, positions: performed.window.positions, velocities: performed.window.velocities },
    frame,
    100,
  );
  /**
   * The path read for the work's plate in a material, as the page reads it: in the work's own
   * frame, or in the picture kept on a body.
   */
  const on = (material: Material, kept: number | null = null) => {
    const own = pictureOf(path.copies, material, frame);
    return {
      fate,
      path,
      script: heldScript(
        path,
        kept === null ? own : keptPicture(own, frame, framed, path.pixels, kept, 900, 582),
        fate,
        PACE,
        frame.projection === 'position',
      ),
    };
  };
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
  /** The body the picture stays with; none reads the path in the work's own frame. */
  held: number | null = null,
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
  const picture =
    held === null
      ? pictureOf()
      : keptPicture(pictureOf(), FRAME, QUIET_FILM, pixels, held, 900, 582);
  return { fate, path, script: heldScript(path, picture, fate, PACE, names) };
}
type Read = ReturnType<typeof made>;
const fact = ({ fate, path, script }: Read, t = en, number = english) =>
  beyondFact(script, path, fate, t, number);
const lineAt = ({ script, path }: Read, second: number, t = en, number = english) =>
  // The first sample at or past that second of film.
  beyondLine(script, path, Math.ceil(second * PER_SECOND), t, number);
const seconds = (script: HeldScript, sample: number) => sample / script.perSecond;

/** Eleven works carried past their windows once, for every test that reads one. */
let works: Record<number, ReturnType<typeof carried>>;
beforeAll(() => {
  works = Object.fromEntries(
    [25, 31, 16, 4, 30, 14, 54, 8, 62, 37, 63].map((id) => [id, carried(id)]),
  );
}, 300_000);

describe('what the picture shows of eight works, past their frames', () => {
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

  it('a body that came back for a second and stands just outside to the horizon: not said to have come back', () => {
    // Far out from 10 to 16 seconds, on the picture for one, then just past the edge for as far
    // as the record looks. The line's last word and the telling agree: it is out of the picture.
    const hovers = made(60, [
      { body: 2, from: 10, to: 16 },
      { body: 2, from: 17, far: 0.05 },
    ]);
    expect(fact(hovers)).toEqual([
      'Body 3 last left the picture 17.0 seconds after the film ended.',
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.',
    ]);
    const { script } = hovers;
    expect(script.ending.kind).toBe('away');
    expect(seconds(script, script.ending.sample)).toBeCloseTo(25, 1);
    expect(lineAt(hovers, 25)).toMatch(/body 3 is out of the picture/);
    // Its last leaving is a moment to go to, with the two a visitor saw.
    expect(script.moments.map((moment) => Math.round(seconds(script, moment)))).toEqual([
      10, 16, 17,
    ]);
  });

  it('a body gone to the horizon while another goes and comes back: the one gone is told', () => {
    const both = made(120, [
      { body: 0, from: 10 },
      { body: 2, from: 80, to: 90 },
    ]);
    expect(fact(both)).toEqual([
      'Body 1 left the picture 10.0 seconds after the film ended.',
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.',
    ]);
    // Performed for eight seconds past its leaving, not for the minute and a half to the
    // other's return.
    expect(seconds(both.script, both.script.ending.sample)).toBeCloseTo(18, 1);
  });

  it('a leaving after an earlier one: left again where it came back, last left where it did not', () => {
    // An earlier absence that lasted, which the line named, however near the edge it stood.
    const again = made(30, [
      { body: 2, from: 2, to: 6, far: 0.05 },
      { body: 2, from: 10, to: 16 },
    ]);
    expect(lineAt(again, 4)).toMatch(/body 3 is out of the picture/);
    expect(fact(again).slice(0, 2)).toEqual([
      'Body 3 left the picture again 10.0 seconds after the film ended.',
      'It came back 6.0 seconds later.',
    ]);
    const last = made(30, [
      { body: 2, from: 2, to: 6, far: 0.05 },
      { body: 2, from: 25 },
    ]);
    expect(fact(last)[0]).toBe('Body 3 last left the picture 25.0 seconds after the film ended.');
    // A graze of half a second, which neither the line nor the eye registers, makes no "again".
    const grazed = made(30, [
      { body: 2, from: 2, to: 2.5 },
      { body: 2, from: 10, to: 16 },
    ]);
    expect(lineAt(grazed, 2.2)).toMatch(/^00:02 past the film · step [\d,]+$/);
    expect(fact(grazed)[0]).toBe('Body 3 left the picture 10.0 seconds after the film ended.');
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
    // Out for a while in between and back at the last: not said to have been "still in it".
    const between = made(
      30,
      [
        { body: 1, from: 6 },
        { body: 0, from: 8, to: 12, far: 0.02 },
      ],
      freed,
    );
    expect(between.script.ending).toMatchObject({ kind: 'parted' });
    expect(fact(between)).toHaveLength(2);
    // In the picture throughout, the two are said to be.
    expect(fact(made(30, [{ body: 1, from: 6 }], freed))[1]).toBe(
      '8.0 seconds later the other two were still in it.',
    );
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
  it('steps to a second past each moment where nothing plays, then to the end, and no further', () => {
    expect(worthGoingOn(script, 0, true)).toBe(true);
    // Each step starts where the last one landed.
    const first = furtherOn(script, 0, true) as number;
    expect(second(first)).toBe(41);
    const next = furtherOn(script, first, true) as number;
    expect(second(next)).toBe(51);
    // It is the only way on, so it is offered however near the next stop is…
    expect(worthGoingOn(script, next, true)).toBe(true);
    expect(furtherOn(script, next, true)).toBe(script.ending.sample);
    // …and at the end it goes nowhere: it is not the word that tells, or a visitor stepping
    // with it would step on into whatever came to stand in its place.
    expect(furtherOn(script, script.ending.sample, true)).toBe('end');
    expect(worthGoingOn(script, script.ending.sample, true)).toBe(false);
    expect(worthGoingOn(script, script.ending.sample, false)).toBe(false);
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

describe('what a picture that stays with one body shows', () => {
  const kept = (id: number, body: number, material: Material = 'light') =>
    works[id].on(material, body - 1);
  const bound =
    'All three are still bound to one another at step 8,000,000, where the record stops looking.';

  it('№ 025, with the body the record finds free: the other two go, and it is alone', () => {
    const read = kept(25, 2);
    expect(read.script.kept).toBe(1);
    expect(read.script.ending).toMatchObject({ kind: 'alone' });
    // The other two are out 1.2 seconds after the film; eight more on the one body, alone.
    expect(seconds(read.script, read.script.ending.sample)).toBeCloseTo(9.2, 1);
    expect(fact(read)).toEqual([
      'The picture stayed with body 2.',
      'Body 2 was alone in it from 1.2 seconds after the film ended.',
      'The record finds body 2 no longer bound to the other two at step 1,210,000.',
    ]);
    // The line says first whom the picture stays with, and never that all three are out.
    expect(lineAt(read, 0)).toBe('Staying with body 2 · 00:00 past the film · step 1,000,000');
    expect(lineAt(read, 5)).toBe(
      'Staying with body 2 · 00:05 past the film · bodies 1 and 3 are out of the picture',
    );
    // The body it stays with is in its picture from the first sample to the last.
    expect(read.script.outside(0, 1)).toBe(0);
    expect(read.script.outside(read.path.samples - 1, 1)).toBe(0);
  });

  it('№ 025, with one of the two it leaves: that body goes, and the other is still there', () => {
    expect(fact(kept(25, 1))).toEqual([
      'The picture stayed with body 1.',
      'Body 2 left the picture 1.2 seconds after the film ended.',
      '8.0 seconds later body 3 was still in it.',
      'The record finds body 2 no longer bound to the other two at step 1,210,000.',
    ]);
    const third = kept(25, 3);
    expect(third.script.ending).toMatchObject({ kind: 'parted' });
    // It ends eight seconds after the body left, not at the step that confirms the record's
    // finding, 7.5 seconds after the film.
    expect(seconds(third.script, third.script.ending.sample)).toBeCloseTo(8.2, 1);
    expect(fact(third)).toEqual([
      'The picture stayed with body 3.',
      'Body 2 left the picture 0.2 seconds after the film ended.',
      '8.0 seconds later body 1 was still in it.',
      'The record finds body 2 no longer bound to the other two at step 1,210,000.',
    ]);
    expect(lineAt(third, 4)).toMatch(
      /^Staying with body 3 · 00:04 past the film · body 2 is out of the picture, [\d.]+ picture widths away$/,
    );
  });

  it('№ 031, a bound orbit: only what goes farther than the film showed is told, from each body alike', () => {
    // From body 3 the film itself showed body 1 a fifth of a picture outside, again and again.
    const third = kept(31, 3);
    expect(third.script.rules.filmed.map((far) => far.toFixed(2))).toEqual([
      '0.21',
      '0.07',
      '0.00',
    ]);
    // Twenty-three seconds after the film body 1 is out of it once more, for three seconds and
    // no farther than that: the line says so, and it is no event.
    expect(lineAt(third, 24)).toMatch(/^Staying with body 3 · 00:24 past the film · body 1 is out/);
    expect(
      third.script.moments.map((moment) => seconds(third.script, moment).toFixed(0)),
    ).not.toContain('23');
    // What is told is the excursion the work's own frame tells (body 3 gone from it 33.6 seconds
    // after the film): from body 3, the other two are the ones that go.
    expect(fact(third)).toEqual([
      'The picture stayed with body 3.',
      'Body 3 was alone in it for 10.8 seconds, from 33.1 seconds after the film ended.',
      bound,
    ]);
    // From body 1 it is body 3 that goes; the line had named it out before, so "again".
    expect(fact(kept(31, 1))).toEqual([
      'The picture stayed with body 1.',
      'Body 3 left the picture again 33.1 seconds after the film ended.',
      'It came back 11.3 seconds later.',
      bound,
    ]);
  });

  it('№ 014: a body alone before, with the other two back for a moment, is alone again', () => {
    const read = kept(14, 2);
    expect(fact(read)).toEqual([
      'The picture stayed with body 2.',
      'Body 2 was again alone in it from 28.3 seconds after the film ended.',
      'The record finds body 2 no longer bound to the other two at step 1,930,000.',
    ]);
    // The line had said so for more than twenty seconds, long before.
    expect(lineAt(read, 10)).toBe(
      'Staying with body 2 · 00:10 past the film · bodies 1 and 3 are out of the picture',
    );
  });

  it('№ 062 and № 037: a body that goes and is not back when the record stops looking', () => {
    const first = kept(62, 1);
    expect(first.script.ending).toMatchObject({ kind: 'away', absence: { body: 2 } });
    // Eight seconds after it went, not a hundred more to the record's horizon.
    expect(seconds(first.script, first.script.ending.sample)).toBeCloseTo(105, 0);
    const notBack =
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.';
    expect(fact(first)).toEqual([
      'The picture stayed with body 1.',
      'Body 3 last left the picture 1.6 minutes after the film ended.',
      notBack,
    ]);
    // With that body, the other two are the ones gone: it is alone, and the three are bound.
    expect(fact(kept(62, 3))).toEqual([
      'The picture stayed with body 3.',
      'Body 3 was alone in it from 1.6 minutes after the film ended.',
      bound,
    ]);
    // № 037's body 2 comes back a dozen times, for a quarter of a second at the first, and is
    // away from 108 seconds on. It is not told as a body that left and came back.
    const wanderer = kept(37, 3);
    expect(wanderer.script.ending).toMatchObject({ kind: 'away', absence: { body: 1 } });
    expect(seconds(wanderer.script, wanderer.script.ending.sample)).toBeCloseTo(115.7, 0);
    expect(fact(wanderer)).toEqual([
      'The picture stayed with body 3.',
      'Body 2 last left the picture 1.8 minutes after the film ended.',
      notBack,
    ]);
  });

  it('№ 063 with body 2: back from its one excursion, a swing the film had shown does not undo the return', () => {
    // Body 1 goes farther than the film showed it go once, forty seconds after the film. Back
    // from that, it is out of the picture again within eight seconds, but only as far as the
    // film had shown: the orbit doing what it had been doing. The return stands and is told.
    const read = kept(63, 2);
    expect(read.script.ending.kind).toBe('returned');
    expect(seconds(read.script, read.script.ending.sample)).toBeCloseTo(54.2, 1);
    expect(fact(read)).toEqual([
      'The picture stayed with body 2.',
      'Body 1 left the picture 39.7 seconds after the film ended.',
      'It came back 12.4 seconds later.',
      bound,
    ]);
  });

  it('№ 031 with body 2: alone, and not again, since it had not been before', () => {
    // From body 2 the picture shows body 3's excursion at 32 seconds undone three seconds after
    // its return, when bodies 1 and 3 both go: the first return that stays is body 1's, and what
    // is told is the stretch in which both were out.
    expect(fact(kept(31, 2))).toEqual([
      'The picture stayed with body 2.',
      'Body 2 was alone in it for 7.4 seconds, from 47.0 seconds after the film ended.',
      bound,
    ]);
  });

  it('№ 030 and № 004: where the computation lost its energy, the last sentence says so', () => {
    const lost = 'Past step 5,106,000 this is not an orbit: the computed energy changed by 0.3%.';
    expect(fact(kept(30, 3))).toEqual([
      'The picture stayed with body 3.',
      'Body 3 was again alone in it from 1.9 minutes after the film ended.',
      'The record finds body 3 no longer bound to the other two at step 4,830,000.',
      lost,
    ]);
    // With one of the two it leaves, the other is in the picture at the last; the energy has
    // the last word, and four sentences are what a phone has room for.
    expect(fact(kept(30, 1))).toEqual([
      'The picture stayed with body 1.',
      'Body 3 last left the picture 1.9 minutes after the film ended.',
      'The record finds body 3 no longer bound to the other two at step 4,830,000.',
      lost,
    ]);
    // Nothing is seen to go before № 004's energy breaks: whom the picture stayed with, and that.
    expect(fact(kept(4, 1))).toEqual([
      'The picture stayed with body 1.',
      'Past step 1,535,000 this is not an orbit: the computed energy changed by 780%.',
    ]);
  });

  it('№ 008, drawn twelve times: every copy of the body stands at the middle, on Light and on Ink', () => {
    const light = kept(8, 3);
    const ink = kept(8, 3, 'ink');
    expect(light.script.copies).toBe(12);
    expect(ink.script.copies).toBe(1);
    expect(fact(light)).toEqual([
      'The picture stayed with body 3.',
      'Body 3 was alone in it for 16.1 seconds, from 40.7 seconds after the film ended.',
      bound,
    ]);
    expect(fact(ink)).toEqual(fact(light));
  });

  it('says it in every reader’s language, and names the body the picture stays with first', () => {
    for (const locale of locales) {
      const t = catalogs[locale];
      const told = fact(kept(25, 2), t, new Intl.NumberFormat(locale));
      expect(told, locale).toHaveLength(3);
      expect(told[0], locale).toBe(t.beyondKept.replace('{body}', '2'));
      for (const sentence of told) expect(sentence, locale).not.toMatch(/\{\w+\}/);
      const line = lineAt(kept(25, 2), 5, t, new Intl.NumberFormat(locale));
      expect(line, locale).not.toMatch(/\{\w+\}/);
      // Its first words are that language's own, whatever stands on which side of the number.
      const [before, after] = t.beyondKeptLine.replace('{body}', '2').split('{line}');
      expect(line.startsWith(before) && line.endsWith(after), locale).toBe(true);
      expect(before, locale).toMatch(/2/);
    }
    const uk = catalogs.uk;
    expect(fact(kept(25, 2), uk, new Intl.NumberFormat('uk'))).toEqual([
      'Кадр лишався з тілом 2.',
      'Через 1,2 секунди після кінця фільму тіло 2 лишилося в кадрі одне.',
      'За записом, на кроці 1 210 000 тіло 2 уже не зв’язане з двома іншими.',
    ]);
    // How long, and from when: each in its own place in every language.
    const aloneFor: Record<string, string> = {
      en: 'Body 3 was alone in it for 10.8 seconds, from 33.1 seconds after the film ended.',
      uk: 'Через 33,1 секунди після кінця фільму тіло 3 на 10,8 секунди лишилося в кадрі одне.',
      ja: '映像が終わって 33.1 秒後から 10.8 秒のあいだ、フレームの中は天体 3 だけでした。',
      ko: '영상이 끝나고 33.1초 뒤부터 10.8초 동안 프레임 안에는 3번 천체만 있었습니다.',
      zh: '影片结束 33.1 秒后起，画面中只剩天体 3，持续了 10.8 秒。',
      'zh-TW': '影片結束 33.1 秒後起，畫面中只剩天體 3，持續了 10.8 秒。',
      'zh-HK': '影片結束 33.1 秒後起，畫面中只剩天體 3，持續了 10.8 秒。',
      vi: 'Từ 33,1 giây sau khi phim kết thúc, suốt 10,8 giây chỉ còn vật thể 3 trong khung hình.',
    };
    for (const locale of locales)
      expect(fact(kept(31, 3), catalogs[locale], new Intl.NumberFormat(locale))[1], locale).toBe(
        aloneFor[locale],
      );
  });
});

describe('what is said of a picture that stays with a body, each sentence only where it is so', () => {
  /** Body 2 is the one the record finds free; a path of a minute reaches the step that says so. */
  const keptOn = (
    kept: number,
    out: Parameters<typeof made>[1],
    fate: Parameters<typeof made>[2] = freed,
    lost: BeyondPath['lost'] = null,
    seconds_ = 60,
  ) => made(seconds_, out, fate, lost, true, kept);
  const free = 'The record finds body 2 no longer bound to the other two at step 1,090,000.';
  const boundStill =
    'All three are still bound to one another at step 8,000,000, where the record stops looking.';

  it('the one that stayed by the body is said to be still there only if it is', () => {
    // Body 2 goes at five seconds; body 3 is out of the picture when the eight are over.
    const read = keptOn(0, [
      { body: 1, from: 5 },
      { body: 2, from: 12, to: 20 },
    ]);
    expect(fact(read)).toEqual([
      'The picture stayed with body 1.',
      'Body 2 left the picture 5.0 seconds after the film ended.',
      free,
    ]);
    // Nor where it was out for most of the eight seconds and is back as they end: "still" is
    // said of the whole of them.
    const between = keptOn(0, [
      { body: 1, from: 5 },
      { body: 2, from: 6, to: 12.5 },
    ]);
    expect(between.script.ending).toMatchObject({ kind: 'parted' });
    expect(fact(between)).toEqual([
      'The picture stayed with body 1.',
      'Body 2 left the picture 5.0 seconds after the film ended.',
      free,
    ]);
    // Where it is, it is said…
    expect(fact(keptOn(0, [{ body: 1, from: 5 }]))).toEqual([
      'The picture stayed with body 1.',
      'Body 2 left the picture 5.0 seconds after the film ended.',
      '8.0 seconds later body 3 was still in it.',
      free,
    ]);
    // …but not where the path stops at lost energy, which has the last word.
    const lost = { step: 1_900_000, change: 0.02 } as NonNullable<BeyondPath['lost']>;
    const cut = fact(keptOn(0, [{ body: 1, from: 5 }], freed, lost, 20));
    expect(cut.slice(0, 3)).toEqual([
      'The picture stayed with body 1.',
      'Body 2 left the picture 5.0 seconds after the film ended.',
      free,
    ]);
    expect(cut[3]).toMatch(/^Past step 1,900,000 this is not an orbit/);
    expect(cut).toHaveLength(4);
  });

  it('a body that stayed with the free one, whose other two never both go: the record’s word alone', () => {
    // The picture stays with body 2, which the record finds free; body 1 goes, body 3 does not.
    const read = keptOn(1, [{ body: 0, from: 5 }]);
    expect(read.script.ending.kind).toBe('parted');
    expect(fact(read)).toEqual(['The picture stayed with body 2.', free]);
  });

  it('a body alone for less than half of the other’s absence: that body’s leaving and return', () => {
    const told = (alone: { from: number; to: number }[]) =>
      fact(
        keptOn(
          0,
          [{ body: 1, from: 5, to: 45 }, ...alone.map((one) => ({ body: 2, ...one }))],
          bound,
        ),
      );
    const single = [
      'The picture stayed with body 1.',
      'Body 2 left the picture 5.0 seconds after the film ended.',
      'It came back 40.0 seconds later.',
      boundStill,
    ];
    // Body 2 is away for forty seconds; body 3 with it for four of them, or for eighteen.
    expect(told([{ from: 10, to: 14 }])).toEqual(single);
    expect(told([{ from: 10, to: 28 }])).toEqual(single);
    // For half of it or more, what is told is how long the body was alone.
    expect(told([{ from: 10, to: 31 }])[1]).toBe(
      'Body 1 was alone in it for 21.0 seconds, from 10.0 seconds after the film ended.',
    );
    // Of two such stretches, the longer.
    const twice = fact(
      keptOn(
        0,
        [
          { body: 1, from: 5, to: 75 },
          { body: 2, from: 10, to: 16 },
          { body: 2, from: 30, to: 70 },
        ],
        bound,
        null,
        90,
      ),
    );
    // It had been alone before, for long enough that the line said so: "again".
    expect(twice[1]).toBe(
      'Body 1 was again alone in it for 40.0 seconds, from 30.0 seconds after the film ended.',
    );
    // An earlier stretch of two seconds, which the line never named, does not make it "again".
    const once = fact(
      keptOn(
        0,
        [
          { body: 1, from: 5, to: 75 },
          { body: 2, from: 10, to: 12 },
          { body: 2, from: 30, to: 70 },
        ],
        bound,
        null,
        90,
      ),
    );
    expect(once[1]).toBe(
      'Body 1 was alone in it for 40.0 seconds, from 30.0 seconds after the film ended.',
    );
  });

  it('a picture in which nothing goes farther than the film showed: the record’s word alone', () => {
    const read = keptOn(0, [], bound);
    expect(read.script.ending.kind).toBe('record');
    expect(fact(read)).toEqual(['The picture stayed with body 1.', boundStill]);
  });

  it('a body away on a path that stops short of an ejection the record dates is not called bound', () => {
    // The record dates an ejection confirmed 3.9 seconds after the film; this path is 3.5 long.
    const read = keptOn(0, [{ body: 2, from: 1 }], freed, null, 3.5);
    expect(read.script.ending.kind).toBe('away');
    expect(fact(read)).toEqual([
      'The picture stayed with body 1.',
      'Body 3 left the picture 1.0 seconds after the film ended.',
    ]);
    // Where the record dates none, the horizon is said once, of the body and of the three.
    expect(fact(keptOn(0, [{ body: 2, from: 1 }], bound, null, 3.5))).toEqual([
      'The picture stayed with body 1.',
      'Body 3 left the picture 1.0 seconds after the film ended.',
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.',
    ]);
  });

  it('"again" and "last" are said only after an absence the line had named', () => {
    // A crossing of a tenth of a second, then the leaving: plain "left".
    const grazed = keptOn(0, [
      { body: 1, from: 2, to: 2.1 },
      { body: 1, from: 5 },
    ]);
    expect(fact(grazed)[1]).toBe('Body 2 left the picture 5.0 seconds after the film ended.');
    // An absence of four seconds, which the line named, then the leaving: "last left".
    const named = keptOn(0, [
      { body: 1, from: 2, to: 6, far: 0.05 },
      { body: 1, from: 9 },
    ]);
    expect(lineAt(named, 4)).toBe(
      'Staying with body 1 · 00:04 past the film · body 2 is out of the picture, 0.1 picture widths away',
    );
    expect(fact(named)[1]).toBe('Body 2 last left the picture 9.0 seconds after the film ended.');
  });

  it('the line never says all three are out: the body the picture stays with is in it', () => {
    const read = keptOn(1, [
      { body: 0, from: 5 },
      { body: 2, from: 6 },
    ]);
    expect(read.script.ending).toMatchObject({ kind: 'alone' });
    expect(lineAt(read, 5.5)).toMatch(
      /^Staying with body 2 · 00:05 past the film · body 1 is out of the picture/,
    );
    expect(lineAt(read, 10)).toBe(
      'Staying with body 2 · 00:10 past the film · bodies 1 and 3 are out of the picture',
    );
    expect(outNow(read.script, read.script.ending.sample)).toEqual([0, 2]);
    // Further on goes to the moment the body is left alone.
    expect(read.script.moments.map((moment) => seconds(read.script, moment).toFixed(0))).toEqual([
      '5',
      '6',
    ]);
  });
});
