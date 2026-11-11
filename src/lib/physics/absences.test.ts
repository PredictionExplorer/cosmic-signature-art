import { describe, expect, it } from 'vitest';
import {
  absencesOf,
  awayAt,
  endingOf,
  lasts,
  momentsOf,
  outsideFrame,
  seen,
  type Absence,
  type EndingRules,
  type Outside,
} from './absences';

/** A picture ten samples to the second: an absence lasts at three, and is seen a tenth of a width out. */
const rules = (over: Partial<EndingRules> = {}): EndingRules => ({
  samples: 1_000,
  lost: false,
  leaver: null,
  confirmed: null,
  long: 30,
  far: 0.1,
  beat: 20,
  linger: 80,
  ...over,
});
const away = (body: number, from: number, to: number | null, farthest = 1): Absence => ({
  body,
  from,
  to,
  farthest,
});
/** Where each drawn body stands outside the picture: the farthest of the stretches it is in. */
const outsideOf =
  (stretches: { drawn: number; from: number; to: number; far: number }[]): Outside =>
  (sample, drawn) =>
    Math.max(
      0,
      ...stretches
        .filter((one) => one.drawn === drawn && sample >= one.from && sample < one.to)
        .map((one) => one.far),
    );

describe('the picture, with the frame held', () => {
  it('measures how far a point stands outside it, in widths of the picture', () => {
    expect(outsideFrame(100, 50, 200, 100)).toBe(0);
    // On an edge is on the picture.
    expect(outsideFrame(200, 100, 200, 100)).toBe(0);
    expect(outsideFrame(300, 50, 200, 100)).toBe(0.5);
    expect(outsideFrame(-50, 50, 200, 100)).toBe(0.25);
    // Past a corner, as the crow flies: 60 across and 80 down of a picture 200 wide.
    expect(outsideFrame(260, 180, 200, 100)).toBeCloseTo(0.5, 12);
    expect(outsideFrame(100, -40, 200, 100)).toBe(0.2);
  });

  it('finds each body’s time away, how far it went, and whether it came back', () => {
    const outside = outsideOf([
      { drawn: 1, from: 10, to: 20, far: 0.4 },
      { drawn: 1, from: 15, to: 18, far: 0.9 },
      { drawn: 2, from: 50, to: 100, far: 2 },
      { drawn: 0, from: 5, to: 6, far: 0.01 },
    ]);
    expect(absencesOf(100, 1, outside)).toEqual([
      away(0, 5, 6, 0.01),
      away(1, 10, 20, 0.9),
      // Still away when the path ends.
      away(2, 50, null, 2),
    ]);
    // In the order they begin; two that begin together, in the order of the bodies.
    const together = outsideOf([
      { drawn: 2, from: 30, to: 40, far: 1 },
      { drawn: 0, from: 30, to: 50, far: 1 },
      { drawn: 1, from: 10, to: 20, far: 1 },
    ]);
    expect(absencesOf(100, 1, together).map((absence) => absence.body)).toEqual([1, 0, 2]);
  });

  it('keeps a body in the picture while any copy of it is', () => {
    // Two copies of each body: body 2 is drawn at 1 and at 4.
    const outside = outsideOf([
      { drawn: 1, from: 10, to: 40, far: 0.5 },
      { drawn: 4, from: 20, to: 30, far: 0.2 },
    ]);
    expect(awayAt(outside, 15, 1, 2)).toBe(0);
    expect(awayAt(outside, 25, 1, 2)).toBe(0.2);
    // Gone only while both copies are, and as far as the nearer of them.
    expect(absencesOf(50, 2, outside)).toEqual([away(1, 20, 30, 0.2)]);
    expect(absencesOf(50, 1, outside)).toEqual([away(1, 10, 40, 0.5)]);
  });

  it('says an absence lasts when it runs three seconds, or to the path’s end, however near', () => {
    expect(lasts(away(0, 10, 40, 0.01), rules())).toBe(true);
    expect(lasts(away(0, 10, 39, 5), rules())).toBe(false);
    // The path ends inside it: it lasts, though it has only begun.
    expect(lasts(away(0, 998, null, 0.01), rules())).toBe(true);
  });

  it('counts as seen an absence that lasts and takes the body a tenth of a width away', () => {
    expect(seen(away(0, 10, 40, 0.1), rules())).toBe(true);
    expect(seen(away(0, 10, 39, 5), rules())).toBe(false);
    expect(seen(away(0, 10, 400, 0.09), rules())).toBe(false);
    expect(seen(away(0, 10, null, 0.1), rules())).toBe(true);
    // One the path ends inside must take the body as far as any other: just past the edge to
    // the horizon, it has gone nowhere.
    expect(seen(away(0, 10, null, 0.05), rules())).toBe(false);
  });
});

describe('where a performance past the frame ends', () => {
  it('when the first body to leave for a while has come back, and a beat more', () => {
    const absences = [away(0, 5, 10), away(2, 100, 400, 0.05), away(1, 200, 260, 0.3)];
    expect(endingOf(absences, rules())).toEqual({
      kind: 'returned',
      sample: 280,
      absence: absences[2],
    });
  });

  it('once the body that came back has stayed a beat: a return at once undone is not one', () => {
    // Back at 160, out again ten samples later, back to stay at 185: the beat runs from there.
    const undone = [away(2, 100, 160), away(2, 170, 185), away(2, 400, 500)];
    expect(endingOf(undone, rules())).toEqual({
      kind: 'returned',
      sample: 205,
      absence: undone[0],
    });
    // A second leaving a beat or more after the return leaves the first return standing.
    const stayed = [away(2, 100, 160), away(2, 180, 300)];
    expect(endingOf(stayed, rules())).toMatchObject({ kind: 'returned', sample: 180 });
    // It never stays before the path ends: performed to the path's end.
    const gone = [away(2, 100, 160), away(2, 170, null)];
    expect(endingOf(gone, rules())).toMatchObject({ kind: 'returned', sample: 999 });
    // Another body's leaving does not undo it.
    const other = [away(2, 100, 160), away(0, 165, 600)];
    expect(endingOf(other, rules())).toMatchObject({ kind: 'returned', sample: 180 });
  });

  it('at the record’s horizon, where no body is seen to leave and come back', () => {
    expect(endingOf([away(0, 5, 10), away(2, 900, null)], rules())).toEqual({
      kind: 'record',
      sample: 999,
    });
  });

  it('when the picture is empty, once the body the record finds free has gone for good', () => {
    // All three are out together for a hundred samples early on, before the leaver comes back
    // and goes for the last time; the picture then empties only briefly, and then for good.
    const absences = [
      away(0, 40, 200),
      away(2, 45, 190),
      away(1, 50, 150),
      away(1, 300, null),
      away(2, 310, null),
      away(0, 320, 330),
      away(0, 400, null),
    ];
    expect(endingOf(absences, rules({ leaver: 1, confirmed: 350 }))).toEqual({
      kind: 'empty',
      sample: 420,
      since: 400,
    });
  });

  it('holds an emptiness the path ends inside to its beat only where lost energy cut the path', () => {
    // The two the leaver left cross the edge four samples before the path's last.
    const absences = [away(1, 300, null), away(0, 390, null), away(2, 395, null)];
    const cut = rules({ samples: 400, leaver: 1, confirmed: 350 });
    // The record's horizon, or a minute past the escape: the path ends, and they are out.
    expect(endingOf(absences, cut)).toEqual({ kind: 'empty', sample: 399, since: 395 });
    // The computation stopped being an orbit there: four samples of emptiness are not an ending.
    expect(endingOf(absences, { ...cut, lost: true })).toEqual({ kind: 'parted', sample: 399 });
    // One that had lasted its beat before the path was cut is.
    const lasted = [away(1, 300, null), away(0, 360, null), away(2, 370, null)];
    expect(endingOf(lasted, { ...cut, lost: true })).toEqual({
      kind: 'empty',
      sample: 390,
      since: 370,
    });
  });

  it('on the two a leaver leaves in the picture, when they stay', () => {
    expect(endingOf([away(1, 300, null)], rules({ leaver: 1, confirmed: 350 }))).toEqual({
      kind: 'parted',
      sample: 430,
    });
    // A leaver not yet out of the picture at the path's end: counted from its confirmation.
    expect(endingOf([], rules({ leaver: 1, confirmed: 350 }))).toEqual({
      kind: 'parted',
      sample: 430,
    });
    // And never past the path.
    expect(endingOf([away(1, 960, null)], rules({ leaver: 1, confirmed: 350 })).sample).toBe(999);
  });

  it('where the computation lost its energy, unless a body had left and come back before', () => {
    // The path stops before the step that would confirm an escape: no body is called free.
    const lost = rules({ samples: 300, lost: true, leaver: 1, confirmed: 350 });
    expect(endingOf([away(1, 250, null)], lost)).toEqual({ kind: 'adrift', sample: 299 });
    expect(endingOf([away(2, 100, 160), away(1, 250, null)], lost)).toMatchObject({
      kind: 'returned',
      sample: 180,
    });
    // A path of one sample: a window that lost its energy inside itself.
    expect(endingOf([], rules({ samples: 1, lost: true }))).toEqual({ kind: 'adrift', sample: 0 });
  });

  it('on a picture that empties for good, where the record finds none free', () => {
    const absences = [away(0, 70, null), away(2, 80, null), away(1, 110, null)];
    expect(endingOf(absences, rules())).toEqual({ kind: 'empty', sample: 130, since: 110 });
  });

  it('names the moments worth going straight to, and none past the ending', () => {
    const absences = [away(0, 0, 40), away(2, 5, 10), away(1, 200, 260, 0.3), away(0, 500, 700)];
    const ending = endingOf(absences, rules());
    // The leaving at the film's own end is where the performance begins, not a moment in it.
    expect(momentsOf(absences, { kind: 'record', sample: 999 }, rules())).toEqual([
      40, 200, 260, 500, 700,
    ]);
    expect(ending).toMatchObject({ kind: 'returned', sample: 60 });
    expect(momentsOf(absences, ending, rules())).toEqual([40]);
    expect(
      momentsOf([away(1, 300, null)], { kind: 'empty', sample: 420, since: 400 }, rules()),
    ).toEqual([300, 400]);
  });
});
