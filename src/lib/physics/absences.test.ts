import { describe, expect, it } from 'vitest';
import {
  absencesOf,
  awayAt,
  endingOf,
  keptEndingOf,
  lasts,
  momentsOf,
  outTogether,
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
      back: 260,
      absence: absences[2],
    });
  });

  it('once the body that came back has stayed a beat: a return at once undone is not one', () => {
    // Back at 160, out again ten samples later, back to stay at 185: the beat runs from there.
    const undone = [away(2, 100, 160), away(2, 170, 185), away(2, 400, 500)];
    expect(endingOf(undone, rules())).toEqual({
      kind: 'returned',
      sample: 205,
      back: 185,
      absence: undone[0],
    });
    // Out again within the beat, for long but only just past the edge: waited out too, since
    // it has gone nowhere. The return told is still the first.
    const grazed = [away(2, 100, 160), away(2, 170, 230, 0.05)];
    expect(endingOf(grazed, rules())).toEqual({
      kind: 'returned',
      sample: 250,
      back: 230,
      absence: grazed[0],
    });
    // Just past the edge to the path's end: it never stood on the picture for a beat, so it
    // has not come back to stay. The picture ends on a body gone, a while after it last left.
    const hovers = [away(2, 100, 160), away(2, 170, null, 0.05)];
    expect(endingOf(hovers, rules())).toEqual({ kind: 'away', sample: 250, absence: hovers[1] });
    // Out again on the very sample the beat ends: the performance would end with it out.
    const onTheBeat = [away(2, 100, 160), away(2, 180, null, 0.05)];
    expect(endingOf(onTheBeat, rules())).toMatchObject({ kind: 'away', absence: onTheBeat[1] });
    const pastTheBeat = [away(2, 100, 160), away(2, 181, null, 0.05)];
    expect(endingOf(pastTheBeat, rules())).toMatchObject({ kind: 'returned', sample: 180 });
    // Seen to go again within the beat: it has not stayed, and the return told is the one it
    // stays from.
    const again = [away(2, 100, 160), away(2, 170, 230)];
    expect(endingOf(again, rules())).toEqual({
      kind: 'returned',
      sample: 250,
      back: 230,
      absence: again[1],
    });
    // Another body's leaving does not undo it.
    const other = [away(2, 100, 160), away(0, 165, 600)];
    expect(endingOf(other, rules())).toMatchObject({ kind: 'returned', sample: 180 });
  });

  it('once it is not seen to go again within the linger: the same test as a kept picture’s', () => {
    // Back for a beat and more, and seen to go again within the linger (№ 052's own frame, back
    // for seven seconds): not a return to end on. The performance goes on to the one that stays.
    const soon = [away(2, 100, 160), away(2, 200, 300)];
    expect(endingOf(soon, rules())).toEqual({
      kind: 'returned',
      sample: 320,
      back: 300,
      absence: soon[1],
    });
    // One that only takes the body just past the edge again undoes nothing…
    const near = [away(2, 100, 160), away(2, 200, 300, 0.05)];
    expect(endingOf(near, rules())).toEqual({
      kind: 'returned',
      sample: 180,
      back: 160,
      absence: near[0],
    });
    // …nor does one that begins once the linger is over.
    const later = [away(2, 100, 160), away(2, 240, 300)];
    expect(endingOf(later, rules())).toEqual({
      kind: 'returned',
      sample: 180,
      back: 160,
      absence: later[0],
    });
    // Lost energy just after a return: whether it stays is not known, and nothing is made of it.
    expect(endingOf([away(2, 100, 485)], rules({ lost: true, samples: 500 }))).toEqual({
      kind: 'adrift',
      sample: 499,
    });
  });

  it('a while past the leaving of a body that is seen to go and is not back', () => {
    // It comes back for moments, and is away when the record stops looking: it has not come back.
    const gone = [away(2, 100, 160), away(2, 170, 400), away(2, 420, null)];
    expect(endingOf(gone, rules())).toEqual({ kind: 'away', sample: 500, absence: gone[2] });
    expect(endingOf([away(0, 5, 10), away(2, 900, null)], rules())).toEqual({
      kind: 'away',
      sample: 980,
      absence: away(2, 900, null),
    });
    // The picture emptied for good comes first, however long after.
    const emptied = [away(2, 420, null), away(0, 700, null), away(1, 800, null)];
    expect(endingOf(emptied, rules())).toEqual({ kind: 'empty', sample: 820, since: 800 });
    // An emptiness that ends is not that: all three stand just past the edge for a while and
    // are back, and later one is seen to go and is not. The picture ends on the one gone.
    const passing = [
      away(0, 100, 200, 0.05),
      away(1, 100, 200, 0.05),
      away(2, 100, 200, 0.05),
      away(2, 500, null),
    ];
    expect(endingOf(passing, rules())).toEqual({ kind: 'away', sample: 580, absence: passing[3] });
    // Two gone, the third in the picture: the first of them to go is the one it ends on.
    const two = [away(0, 300, null), away(2, 600, null)];
    expect(endingOf(two, rules())).toEqual({ kind: 'away', sample: 380, absence: two[0] });
  });

  it('on a body gone to the path’s end, where it went before a return would have ended the performance', () => {
    // Body 1 is seen to go at 100 and is away as far as the path goes. Body 3 goes at 800 and
    // is back to stay at 900: the picture is not told by the one that came back.
    const absences = [away(0, 100, null), away(2, 800, 900)];
    expect(endingOf(absences, rules())).toEqual({
      kind: 'away',
      sample: 180,
      absence: absences[0],
    });
    // Gone while the return's beat is held: the picture ends on the body gone.
    const during = [away(2, 100, 160), away(0, 175, null)];
    expect(endingOf(during, rules())).toEqual({ kind: 'away', sample: 255, absence: during[1] });
    // Gone only once the return has ended the performance: the return is what was shown.
    const after = [away(2, 100, 160), away(0, 180, null)];
    expect(endingOf(after, rules())).toMatchObject({ kind: 'returned', sample: 180 });
    // Just past the edge to the path's end, of a body never seen to go: it has gone nowhere.
    const near = [away(2, 100, 160), away(0, 150, null, 0.05)];
    expect(endingOf(near, rules())).toMatchObject({ kind: 'returned', sample: 180 });
    // Where the computation lost its energy the path stops, and no body is gone to its end:
    // the return is told.
    expect(endingOf(absences, rules({ lost: true }))).toMatchObject({
      kind: 'returned',
      sample: 920,
    });
    // The same in a picture kept on body 2, of the other two.
    expect(keptEndingOf(absences, rules(), 1)).toEqual({
      kind: 'away',
      sample: 180,
      absence: absences[0],
    });
    // There, what the film showed a body do is not seen: back for a second from an excursion
    // that was, then out to the path's end no farther than the film had it, it has not come
    // back, and the picture ends on it gone.
    const filmed = [away(2, 100, 160, 0.7), away(2, 170, null, 0.59)];
    expect(keptEndingOf(filmed, rules({ filmed: [0, 0, 0.5] }), 0)).toEqual({
      kind: 'away',
      sample: 250,
      absence: filmed[1],
    });
  });

  it('at the record’s horizon, where no body is seen to leave', () => {
    // Just past the edge to the path's end, it has gone nowhere.
    expect(endingOf([away(0, 5, 10), away(2, 900, null, 0.05)], rules())).toEqual({
      kind: 'record',
      sample: 999,
    });
    expect(endingOf([], rules())).toEqual({ kind: 'record', sample: 999 });
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

describe('the picture, staying with one body', () => {
  it('finds every stretch in which the other two are out of it at once', () => {
    const absences = [
      away(1, 10, 40),
      away(2, 20, 30),
      // The second is back, and out again before the first returns: two stretches, not one.
      away(2, 35, 60),
      away(1, 70, null),
      away(2, 90, null),
    ];
    expect(outTogether(absences, [1, 2])).toEqual([
      { from: 20, to: 30 },
      { from: 35, to: 40 },
      { from: 90, to: null },
    ]);
    // A body with no absence is never out: nor, then, are the two together.
    expect(outTogether(absences, [0, 1])).toEqual([]);
    // Absences that only touch share no sample.
    expect(outTogether([away(0, 10, 20), away(1, 20, 30)], [0, 1])).toEqual([]);
    // All three: what the work's own frame asks.
    expect(outTogether([away(0, 5, 50), away(1, 10, null), away(2, 20, 40)], [0, 1, 2])).toEqual([
      { from: 20, to: 40 },
    ]);
  });

  /** The record finds body 1 free, confirmed at sample 200. */
  const freed = (over: Partial<EndingRules> = {}) => rules({ leaver: 1, confirmed: 200, ...over });

  it('with the body the record finds free: lingers on it alone, once the other two are out for good', () => {
    const absences = [
      // They had both been out before, and came back.
      away(0, 50, 90),
      away(2, 55, 95),
      away(2, 300, null),
      away(0, 320, null),
    ];
    // From the later of their last leavings, and for as long as the picture lingers.
    expect(keptEndingOf(absences, freed(), 1)).toEqual({ kind: 'alone', sample: 400, since: 320 });
    // Never past the path's end.
    expect(keptEndingOf(absences, freed({ samples: 350 }), 1)).toEqual({
      kind: 'alone',
      sample: 349,
      since: 320,
    });
    // Its moments: each leaving a visitor sees, each return, and the body left alone.
    const ending = keptEndingOf(absences, freed(), 1);
    expect(momentsOf(absences, ending, rules())).toEqual([50, 55, 90, 95, 300, 320]);
  });

  it('does not wait for the step that confirms the record’s finding', () => {
    // The other two are out for good at sample 60; the generator's fifth answer comes at 900.
    const absences = [away(0, 40, null), away(2, 60, null)];
    expect(keptEndingOf(absences, freed({ confirmed: 900 }), 1)).toEqual({
      kind: 'alone',
      sample: 140,
      since: 60,
    });
  });

  it('with that body, lingers from the record’s finding where the other two do not both go', () => {
    expect(keptEndingOf([away(0, 300, null)], freed(), 1)).toEqual({ kind: 'parted', sample: 280 });
    expect(keptEndingOf([], freed(), 1)).toEqual({ kind: 'parted', sample: 280 });
    // A finding confirmed inside the recorded window, long before the path begins: lingered on
    // from the path's first sample, with either body, as the frame's ending has it.
    const early = freed({ confirmed: -5_000 });
    expect(keptEndingOf([], early, 1)).toEqual({ kind: 'parted', sample: 80 });
    expect(keptEndingOf([], early, 0)).toEqual({ kind: 'parted', sample: 80 });
    expect(endingOf([], early)).toEqual({ kind: 'parted', sample: 80 });
  });

  it('holds two bodies out at a path cut by lost energy to a beat, as the frame does', () => {
    const absences = [away(0, 700, null), away(2, 985, null)];
    // Fifteen samples of it before the computation stopped being an orbit: not an ending.
    expect(keptEndingOf(absences, freed({ lost: true }), 1)).toEqual({
      kind: 'parted',
      sample: 280,
    });
    // Twenty: it is one, and the picture lingers as far as the path goes.
    expect(
      keptEndingOf([away(0, 700, null), away(2, 979, null)], freed({ lost: true }), 1),
    ).toEqual({ kind: 'alone', sample: 999, since: 979 });
  });

  it('with one of the two left behind: lingers from the free body’s last leaving', () => {
    const absences = [
      away(1, 30, 80),
      // The one that stays by it grazes the edge now and then.
      away(2, 100, 104, 0.02),
      away(1, 120, null),
    ];
    // Body 1 last leaves at 120, long before the record's step confirms it at 600.
    expect(keptEndingOf(absences, freed({ confirmed: 600 }), 0)).toEqual({
      kind: 'parted',
      sample: 200,
    });
    // Where it has not left the picture when the path ends, from the record's finding.
    expect(keptEndingOf([away(1, 30, 80)], freed(), 0)).toEqual({ kind: 'parted', sample: 280 });
  });

  it('in a bound orbit: ends when a body seen to go has come back to stay', () => {
    const absences = [away(2, 15, 18, 0.02), away(1, 100, 200), away(2, 110, 190)];
    expect(keptEndingOf(absences, rules(), 0)).toEqual({
      kind: 'returned',
      sample: 220,
      back: 200,
      absence: absences[1],
    });
    // A brief crossing of the edge just after is no leaving: it is back to stay once past it.
    const grazed = [away(1, 100, 200), away(1, 205, 210, 0.02)];
    expect(keptEndingOf(grazed, rules(), 0)).toEqual({
      kind: 'returned',
      sample: 230,
      back: 210,
      absence: grazed[0],
    });
  });

  it('does not end on a return the body undoes: it ends on the one it stays from, and tells that', () => {
    // Back for five samples, then gone for long again: the second leaving is the one told.
    const undone = [away(1, 100, 200), away(1, 205, 260)];
    expect(keptEndingOf(undone, rules(), 0)).toEqual({
      kind: 'returned',
      sample: 280,
      back: 260,
      absence: undone[1],
    });
    // Back for a beat and more, and seen to go again within the linger: not a return to end on
    // either.
    const soon = [away(1, 100, 200), away(1, 250, 300)];
    expect(keptEndingOf(soon, rules(), 0)).toEqual({
      kind: 'returned',
      sample: 320,
      back: 300,
      absence: soon[1],
    });
    // What undoes a return is what makes an event. An absence that takes the body no farther
    // than the film showed it go is the orbit doing what it had been doing: the return stands
    // (№ 063, kept on body 2: back from its one excursion, the body swings out as the film had
    // shown it, and nothing was ever told of the excursion).
    const filmed = [0, 0.5, 0];
    const routine = [away(1, 100, 200, 0.7), away(1, 250, 300, 0.55)];
    expect(keptEndingOf(routine, rules({ filmed }), 0)).toEqual({
      kind: 'returned',
      sample: 220,
      back: 200,
      absence: routine[0],
    });
    // № 037: a body that comes back for moments and is away when the record stops looking has
    // not come back. A while past its last leaving, it is told as away.
    const gone = [away(1, 100, 200), away(1, 230, 400), away(1, 420, null)];
    expect(keptEndingOf(gone, rules(), 0)).toEqual({
      kind: 'away',
      sample: 500,
      absence: gone[2],
    });
    // Lost energy just after a return: whether it stays is not known, and nothing is made of it.
    expect(keptEndingOf([away(1, 100, 485)], rules({ lost: true, samples: 500 }), 0)).toEqual({
      kind: 'adrift',
      sample: 499,
    });
  });

  it('counts as seen only what goes farther than the film showed that body go', () => {
    // The film showed body 2 half a width outside this picture: 0.55 is what it had been doing.
    const filmed = [0, 0.5, 0];
    expect(seen(away(1, 100, 200, 0.55), rules({ filmed }))).toBe(false);
    expect(seen(away(1, 100, 200, 0.6), rules({ filmed }))).toBe(true);
    // Body 3 was never outside it: a tenth of a width is seen, as in the work's own frame.
    expect(seen(away(2, 100, 200, 0.1), rules({ filmed }))).toBe(true);
    // So an orbit that goes on as the film showed it ends nothing, and is looked at for as long
    // as the film ran (`look`), not to the record's horizon.
    const routine = [away(1, 100, 200, 0.55), away(1, 400, 500, 0.5)];
    expect(keptEndingOf(routine, rules({ filmed, look: 300 }), 0)).toEqual({
      kind: 'record',
      sample: 300,
    });
    expect(keptEndingOf(routine, rules({ filmed }), 0)).toEqual({ kind: 'record', sample: 999 });
    // The first to go farther is what ends it.
    const farther = [away(1, 100, 200, 0.55), away(1, 400, 500, 0.7)];
    expect(keptEndingOf(farther, rules({ filmed, look: 300 }), 0)).toMatchObject({
      kind: 'returned',
      sample: 520,
      absence: farther[1],
    });
    expect(
      momentsOf(farther, keptEndingOf(farther, rules({ filmed }), 0), rules({ filmed })),
    ).toEqual([400, 500]);
  });

  it('in a bound orbit: lingers on the body alone where the other two go about together', () => {
    const absences = [away(1, 400, null), away(2, 410, null)];
    expect(keptEndingOf(absences, rules(), 0)).toEqual({ kind: 'alone', sample: 490, since: 410 });
    // The second need not go far: it is out, and the body is alone in the picture.
    const near = [away(1, 400, null), away(2, 410, null, 0.05)];
    expect(keptEndingOf(near, rules(), 0)).toEqual({ kind: 'alone', sample: 490, since: 410 });
    // Its moment is the body left alone, which no seen leaving marks here.
    const edge = [away(1, 300, null, 0.05), away(2, 320, null, 0.05)];
    const ending = keptEndingOf(edge, rules({ leaver: 0, confirmed: 200 }), 0);
    expect(ending).toEqual({ kind: 'alone', sample: 400, since: 320 });
    expect(momentsOf(edge, ending, rules())).toEqual([320]);
  });

  it('in a bound orbit: lingers where one body is seen to go and is not back when the path ends', () => {
    const absences = [away(2, 400, null, 0.5)];
    expect(keptEndingOf(absences, rules(), 0)).toEqual({
      kind: 'away',
      sample: 480,
      absence: absences[0],
    });
    // The other, out as the record stops looking long after, is no part of it.
    const later = [away(2, 400, null, 0.5), away(1, 900, null)];
    expect(keptEndingOf(later, rules(), 0)).toEqual({
      kind: 'away',
      sample: 480,
      absence: later[0],
    });
    // One that only stands past the edge has not gone anywhere: the record's horizon ends it.
    expect(keptEndingOf([away(2, 400, null, 0.05)], rules(), 0)).toEqual({
      kind: 'record',
      sample: 999,
    });
  });

  it('where the computation lost its energy, performs nothing past it and makes nothing of it', () => {
    expect(keptEndingOf([away(2, 400, null)], rules({ lost: true, samples: 500 }), 0)).toEqual({
      kind: 'adrift',
      sample: 499,
    });
    // Not even of the other two out together as it stopped: what a failed computation showed
    // is not the picture's event.
    expect(
      keptEndingOf(
        [away(1, 300, null), away(2, 310, null)],
        rules({ lost: true, samples: 500 }),
        0,
      ),
    ).toEqual({ kind: 'adrift', sample: 499 });
    // Unless a body had been seen to go and come back before it did.
    const back = [away(1, 100, 200)];
    expect(keptEndingOf(back, rules({ lost: true, samples: 500 }), 0)).toMatchObject({
      kind: 'returned',
      sample: 220,
    });
  });

  it('takes the record’s finding as confirmed at the path’s last sample too', () => {
    // Body 2 is the one the record finds free, confirmed at the very last sample: the picture
    // that stays with body 1 lingers from its leaving, as on any path that reaches the step.
    expect(keptEndingOf([away(1, 100, null)], freed({ confirmed: 999 }), 0)).toEqual({
      kind: 'parted',
      sample: 180,
    });
  });
});

describe('at the path’s end', () => {
  it('never ends past the last sample, whatever ends it', () => {
    const short = rules({ samples: 500 });
    // A return, a body not back, and a body left alone, each within the linger of the end.
    expect(keptEndingOf([away(1, 100, 490)], short, 0)).toMatchObject({
      kind: 'returned',
      sample: 499,
      back: 490,
    });
    expect(keptEndingOf([away(1, 480, null)], short, 0)).toMatchObject({
      kind: 'away',
      sample: 499,
    });
    expect(keptEndingOf([away(1, 470, null), away(2, 480, null)], short, 0)).toEqual({
      kind: 'alone',
      sample: 499,
      since: 480,
    });
    // With the record's free body: its last leaving, or its finding, within the linger too.
    const freed = { ...short, leaver: 1, confirmed: 100 };
    expect(keptEndingOf([away(1, 480, null)], freed, 0)).toEqual({ kind: 'parted', sample: 499 });
    expect(keptEndingOf([], { ...freed, confirmed: 480 }, 1)).toEqual({
      kind: 'parted',
      sample: 499,
    });
    expect(
      keptEndingOf([away(0, 470, null), away(2, 480, null)], { ...freed, confirmed: 480 }, 1),
    ).toEqual({ kind: 'alone', sample: 499, since: 480 });
    // And the work's own frame.
    expect(endingOf([away(1, 100, 490)], short)).toMatchObject({ kind: 'returned', sample: 499 });
    expect(endingOf([away(1, 480, null)], short)).toMatchObject({ kind: 'away', sample: 499 });
  });
});

describe('whatever the path', () => {
  /** Made paths by the hundred, from a small generator that gives the same ones every run. */
  function madePaths(count: number): Absence[][] {
    let state = 20_261_111;
    const next = (below: number) => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      // The high bits: a generator of this kind repeats its low ones every few draws.
      return (state >>> 16) % below;
    };
    const paths: Absence[][] = [];
    for (let made = 0; made < count; made++) {
      const absences: Absence[] = [];
      for (const body of [0, 1, 2]) {
        let from = next(200);
        for (let more = next(5); more > 0 && from < 990; more--) {
          const length = [3, 12, 40, 150][next(4)];
          const open = next(6) === 0 || from + length >= 999;
          const farthest = [0.02, 0.05, 0.3, 1][next(4)];
          absences.push({ body, from, to: open ? null : from + length, farthest });
          if (open) break;
          from += length + [5, 15, 60, 200][next(4)];
        }
      }
      paths.push(absences.sort((a, b) => a.from - b.from || a.body - b.body));
    }
    return paths;
  }

  it('ends on a return only if it stays, and at the horizon only if no body was seen to go', () => {
    const kinds = new Set<string>();
    for (const absences of madePaths(600))
      for (const lost of [false, true]) {
        const all = rules({ lost });
        // The picture that stays with body 1 never shows body 1 leave it.
        const others = absences.filter((absence) => absence.body !== 0);
        for (const [ending, shown] of [
          [endingOf(absences, all), absences],
          [keptEndingOf(others, all, 0), others],
        ] as const) {
          kinds.add(ending.kind);
          expect(ending.sample).toBeGreaterThanOrEqual(0);
          expect(ending.sample).toBeLessThanOrEqual(999);
          const sawAny = shown.some((absence) => seen(absence, all));
          // Nothing a visitor saw is performed and left untold: the horizon is for a picture
          // in which no body was seen to go, and lost energy is said where it was lost.
          if (ending.kind === 'record') expect(sawAny).toBe(false);
          if (ending.kind === 'adrift') expect(lost).toBe(true);
          /** A body a visitor has seen go, out of the picture from `one` to the path's end. */
          const gone = (one: Absence) =>
            one.to === null &&
            shown.some(
              (other) => other.body === one.body && other.from <= one.from && seen(other, all),
            );
          if (ending.kind === 'away') expect(gone(ending.absence)).toBe(true);
          // An emptied picture is one all three are out of from then to the path's end.
          if (ending.kind === 'empty')
            for (const body of [0, 1, 2])
              expect(
                shown.some(
                  (one) => one.body === body && one.to === null && one.from <= ending.since,
                ),
              ).toBe(true);
          if (ending.kind === 'returned') {
            const { absence, back } = ending;
            expect(seen(absence, all)).toBe(true);
            expect(back).toBeGreaterThanOrEqual(absence.to!);
            // It ends with that body on the picture…
            const out = shown.filter(
              (other) =>
                other.body === absence.body &&
                other.from <= ending.sample &&
                (other.to === null || other.to > ending.sample),
            );
            expect(out).toEqual([]);
            // …and with no body gone to the path's end before it, where the energy held.
            if (!lost)
              expect(shown.filter((one) => gone(one) && one.from < ending.sample)).toEqual([]);
            // From its return on, the body is not seen to go before it has stayed, nor within
            // the linger after.
            const undone = shown.filter(
              (other) =>
                other.body === absence.body &&
                other.from >= absence.to! &&
                other.from - back < all.linger &&
                seen(other, all),
            );
            expect(undone).toEqual([]);
          }
        }
      }
    // The made paths reach every ending but those only the record's free body gives.
    expect([...kinds].sort()).toEqual(['adrift', 'alone', 'away', 'empty', 'record', 'returned']);
  });
});
