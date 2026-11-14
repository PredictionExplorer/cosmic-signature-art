/*
  After the frame, with the frame held (docs/after-the-frame.md §4 step 3, and §8.3). The camera
  stays where the film's frame ended, so a body that goes far leaves the picture, and nothing
  follows it. This module reads a path past the window (beyond.ts) and says what the picture
  shows of it: which body is out of the picture, since when and how far, and where a performance
  of it ends. It knows nothing of canvases: a page tells it how far outside its picture a drawn
  body stands, and draws.

  A body is in the picture while its centre is on it. Where a picture draws a body more than
  once (Light draws every stroke again about a work's symmetry; Ink draws the first copy alone),
  it is in the picture while any copy the picture draws is.

  The picture may also stay with one of the three (§8.4; kept.ts places it). That body never
  leaves it, so what it shows is the other two: one goes and comes back, or goes for good; or
  both go, and the body it stays with is alone in it.
*/

/** A body's time out of the picture, in samples of a path past the window. */
export interface Absence {
  body: number;
  /** The first sample at which it stood outside the picture… */
  from: number;
  /** …and the first at which it was back on it; null when the path ends with it away. */
  to: number | null;
  /** The farthest it stood from the picture's edge while away, in widths of the picture. */
  farthest: number;
}

/** How far outside the picture a drawn body stands at a sample, in widths of the picture: 0 on it. */
export type Outside = (sample: number, drawn: number) => number;

/** How far a point stands from the rectangle 0…width by 0…height, in widths of it: 0 on it. */
export function outsideFrame(x: number, y: number, width: number, height: number): number {
  const dx = x < 0 ? -x : x > width ? x - width : 0;
  const dy = y < 0 ? -y : y > height ? y - height : 0;
  // Asked of every body at every sample of a path, and nearly always of one on the picture.
  return dx === 0 && dy === 0 ? 0 : Math.sqrt(dx * dx + dy * dy) / width;
}

/** How far a body stands outside the picture at a sample: as far as the nearest of its copies. */
export function awayAt(outside: Outside, sample: number, body: number, copies: number): number {
  let nearest = Infinity;
  for (let copy = 0; copy < copies; copy++) {
    const far = outside(sample, copy * 3 + body);
    // One copy on the picture, and the body is in it.
    if (!(far > 0)) return 0;
    if (far < nearest) nearest = far;
  }
  return nearest;
}

/** Every absence of every body over `samples` samples, in the order they begin. */
export function absencesOf(samples: number, copies: number, outside: Outside): Absence[] {
  const found: Absence[] = [];
  for (let body = 0; body < 3; body++) {
    let open: Absence | null = null;
    for (let sample = 0; sample < samples; sample++) {
      const far = awayAt(outside, sample, body, copies);
      if (far > 0) {
        if (!open) {
          open = { body, from: sample, to: null, farthest: far };
          found.push(open);
        } else if (far > open.farthest) open.farthest = far;
      } else if (open) {
        open.to = sample;
        open = null;
      }
    }
  }
  return found.sort((a, b) => a.from - b.from || a.body - b.body);
}

/** Where a performance past the frame ends, and why. `sample` is the last sample performed. */
export type Ending =
  /** The computation lost its energy there: nothing past it is an orbit, and none is performed. */
  | { kind: 'adrift'; sample: number }
  /** Every body has left the picture: `since` is the first sample at which all three were out. */
  | { kind: 'empty'; sample: number; since: number }
  /** The body the record finds free has gone, and the picture has not emptied after it. */
  | { kind: 'parted'; sample: number }
  /**
   * A body left the picture for a while, and came back to stay: on the picture from `back`,
   * which is the absence's own end, or later where it crossed the edge again before it stayed.
   */
  | { kind: 'returned'; sample: number; absence: Absence; back: number }
  /** Nothing a visitor sees happened as far as the path was looked at. */
  | { kind: 'record'; sample: number }
  /**
   * In a picture kept on one body: the other two are out of it from `since`, and the path ends
   * with both still away.
   */
  | { kind: 'alone'; sample: number; since: number }
  /**
   * A body a visitor has seen go left the picture, and the path ends with it still away (in
   * the work's own frame, without the picture having emptied): of an orbit the record finds
   * bound, or of one whose dated ejection the path stops short of.
   */
  | { kind: 'away'; sample: number; absence: Absence };

/** How the work's own frame can end: `alone` is an ending of a picture kept on one body. */
export type FrameEnding = Exclude<Ending, { kind: 'alone' }>;
/** How a picture kept on one body can end: that body is always in it, so it never empties. */
export type KeptEnding = Exclude<Ending, { kind: 'empty' }>;

export interface EndingRules {
  /** The path's samples: its last is the last step the orbit was carried to. */
  samples: number;
  /** The path stops where the computation lost its energy (beyond.ts). */
  lost: boolean;
  /**
   * The body the record finds free of the other two, and the sample that is confirmed at; null
   * where it finds none. The sample is counted from the path's first, so it may lie past the
   * path's last (the path stops short of the confirmation, and no body is then treated as
   * free) or before its first (the finding was confirmed inside the recorded window).
   */
  leaver: number | null;
  confirmed: number | null;
  /** An absence lasts when it runs this long, in samples, or to the path's end… */
  long: number;
  /** …and is one a visitor sees when it also takes the body this far, in widths of the picture. */
  far: number;
  /**
   * How far outside the picture each body stood at most while the film ran, in widths of the
   * picture. None did in the work's own frame, which holds the whole recorded window. In a
   * picture that stays with one body the other two often did, and an absence that takes a body
   * no farther than the film showed it go is the orbit doing what it had been doing: only one
   * that takes it `far` farther than that is one a visitor sees it go on.
   */
  filmed?: readonly number[];
  /**
   * How long the picture is held on what ends it, in samples: and how long a body must be on
   * the picture, crossings aside, to have come back…
   */
  beat: number;
  /**
   * …and how long it is held on the two a leaver leaves in the picture, on one body alone, or
   * past a leaving a body is not back from. Within as long of a return, a body seen to go again
   * undoes it; and within as long of one body's last leaving, the other's makes the kept body
   * alone.
   */
  linger: number;
  /**
   * How long a picture kept on one body is looked at where no body is seen to go in it as far
   * as the path goes: the film's own length, in samples. (The work's frame is looked at to the
   * path's end.)
   */
  look?: number;
}

/**
 * Whether an absence lasts: `long` samples, or to the path's end. The line under the picture
 * names every body in one, however near the edge it stands, and none in a shorter one: a body
 * that grazes the edge and is back within moments is not called out, or the line would chatter
 * with every crossing.
 */
export const lasts = (absence: Absence, { long }: Pick<EndingRules, 'long'>) =>
  absence.to === null || absence.to - absence.from >= long;

/**
 * Whether an absence is one a visitor sees the body go on: it lasts, and it takes the body
 * `far` from the picture, and that much farther than the film ever showed it stand (`filmed`).
 * The moments of a performance and its ending are made of these: a body that stands just past
 * the edge for a while has not gone anywhere, and one that goes where the film showed it go
 * has done nothing new.
 */
export const seen = (absence: Absence, rules: Pick<EndingRules, 'long' | 'far' | 'filmed'>) =>
  absence.farthest >= rules.far + (rules.filmed?.[absence.body] ?? 0) && lasts(absence, rules);

/** The absence of a body that the path ends inside: it left, and was not seen back. */
const lastLeaving = (absences: readonly Absence[], body: number) =>
  absences.find((absence) => absence.body === body && absence.to === null) ?? null;

/** A stretch of a path, in samples: `to` is the first sample past it, null where the path ends inside it. */
export interface Span {
  from: number;
  to: number | null;
}

/**
 * Every stretch in which all of `bodies` are out of the picture at once, in order.
 *
 * Each body's absences follow one another in time, so the lists are walked together once:
 * whichever absence ends first can share no later moment with the others, and gives way to
 * that body's next.
 */
export function outTogether(absences: readonly Absence[], bodies: readonly number[]): Span[] {
  const of = bodies.map((body) => absences.filter((absence) => absence.body === body));
  const at = bodies.map(() => 0);
  const spans: Span[] = [];
  while (at.every((index, which) => index < of[which].length)) {
    const now = at.map((index, which) => of[which][index]);
    const from = Math.max(...now.map((absence) => absence.from));
    const ends = now.map((absence) => absence.to ?? Infinity);
    const until = Math.min(...ends);
    if (until > from) spans.push({ from, to: until === Infinity ? null : until });
    at[ends.indexOf(until)] += 1;
  }
  return spans;
}

/**
 * The first sample from `since` on at which all three bodies are out of the picture at once,
 * and stay out for `lasting` samples. An emptiness the path ends inside counts whatever its
 * length, unless the path was `cut` short by lost energy: what a computation showed for a
 * moment before it stopped being an orbit is not an ending, so there it must have lasted too.
 */
function emptySince(
  absences: readonly Absence[],
  since: number,
  lasting: number,
  last: number,
  cut: boolean,
): number | null {
  for (const span of outTogether(absences, [0, 1, 2])) {
    const from = Math.max(since, span.from);
    const held = span.to === null ? !cut || last - from >= lasting : span.to - from >= lasting;
    if (held) return from;
  }
  return null;
}

/**
 * From when a body that came back at `back` is on the picture to stay: a return to end a
 * performance on. It is one unless a visitor sees the body go again (`seen`) before it has
 * been on the picture a beat, or within the linger after:
 *
 * - in № 037, seen from body 3, a body comes back a dozen times, for a third of a second at
 *   the first, and is out of the picture for most of two minutes;
 * - in № 052's own frame a body is back for seven seconds, gone for twenty-one, back for
 *   five, and then gone as far as the record looks.
 *
 * What undoes a return is what makes an event. A crossing of the edge, or an absence that
 * takes the body no farther than the film showed it go, is not one: where it follows within a
 * beat it is waited out, and the body has stayed once it is back from it. Where the path ends
 * inside it, the body never stood on the picture for a beat: it has not come back to stay,
 * however near the edge it stands, and the picture ends on a body gone (`goneToTheEnd`).
 *
 * So a return that ends a performance ends it with its body on the picture.
 */
function settled(
  absences: readonly Absence[],
  rules: EndingRules,
  body: number,
  back: number,
): number | null {
  const { samples, lost, beat, linger } = rules;
  const last = samples - 1;
  let at = back;
  for (const absence of absences) {
    if (absence.body !== body || absence.from < at) continue;
    // On the picture through the beat and at the sample that ends it, where the performance
    // would end: the body has stayed.
    if (absence.from - at > beat) break;
    if (seen(absence, rules) || absence.to === null) return null;
    at = absence.to;
  }
  if (lost && last - at < beat) return null;
  const goneAgain = absences.some(
    (absence) =>
      absence.body === body &&
      absence.from >= at &&
      absence.from - at < linger &&
      seen(absence, rules),
  );
  return goneAgain ? null : at;
}

/**
 * The first absence a visitor sees a body come back from to stay, and from when it stays. One
 * whose return does not stay is passed over: the picture goes on to the next.
 */
function firstReturnToStay(
  absences: readonly Absence[],
  rules: EndingRules,
): Extract<Ending, { kind: 'returned' }> | null {
  const last = rules.samples - 1;
  for (const absence of absences) {
    if (absence.to === null || !seen(absence, rules)) continue;
    const back = settled(absences, rules, absence.body, absence.to);
    if (back !== null)
      return { kind: 'returned', sample: Math.min(last, back + rules.beat), absence, back };
  }
  return null;
}

/**
 * A body a visitor has seen go that is out of the picture as far as the path goes: the absence
 * the path ends inside. Either a visitor sees the body go on it, or it follows one of that
 * body's on which they did: the body went far, came back, and stands out of the picture since,
 * however near. The first to begin, where there are two.
 */
function goneToTheEnd(absences: readonly Absence[], rules: EndingRules): Absence | null {
  return (
    absences.find(
      (one) =>
        one.to === null &&
        absences.some(
          (other) => other.body === one.body && other.from <= one.from && seen(other, rules),
        ),
    ) ?? null
  );
}

/**
 * What ends a performance in which the record finds no body free, where the energy held: the
 * first return that stays, or a body gone to the path's end. The body gone has it where it
 * went before the return would have ended the performance: a picture is not told by the one
 * that came back while another it showed leave is out of it for as far as the record looks.
 * Where the computation lost its energy the path stops, and no body is gone to its end.
 */
function resolved(
  absences: readonly Absence[],
  rules: EndingRules,
): { returned: Extract<Ending, { kind: 'returned' }> | null; gone: Absence | null } {
  const gone = rules.lost ? null : goneToTheEnd(absences, rules);
  const returned = firstReturnToStay(absences, rules);
  return { returned: returned && gone && gone.from < returned.sample ? null : returned, gone };
}

/**
 * Where the performance ends, with the work's own frame held.
 *
 * - Where the record finds a body free, and the path reaches the step that confirms it: once
 *   that body has left the picture for the last time, the performance runs until all three are
 *   out of it, and holds that a beat. Where the two it left stay in the picture, it lingers on
 *   them.
 * - Otherwise, until a body a visitor sees go has come back to stay (`settled`), and a beat
 *   more: unless another has gone by then, and is out to the path's end (`resolved`).
 * - Where none does, and the energy held: until the picture has emptied to the path's end, if
 *   it has; else a while past the leaving of a body a visitor has seen go that the path ends
 *   without (`goneToTheEnd`); and where nothing a visitor sees happens at all, to the path's
 *   end, which is the record's horizon.
 * - Nothing past a step at which the computation lost its energy is performed, whatever comes
 *   first.
 *
 * So a picture in which a body was seen to go never ends as if nothing had happened.
 */
export function endingOf(absences: readonly Absence[], rules: EndingRules): FrameEnding {
  const { samples, lost, leaver, confirmed, beat, linger } = rules;
  const last = samples - 1;
  if (leaver !== null && confirmed !== null && confirmed <= last) {
    const gone = lastLeaving(absences, leaver);
    // Only an emptiness after the leaver's last leaving: the picture may have stood empty
    // before it, with that body yet to come back and go again.
    const since = gone ? emptySince(absences, gone.from, beat, last, lost) : null;
    if (since !== null) return { kind: 'empty', sample: Math.min(last, since + beat), since };
    return {
      kind: 'parted',
      sample: Math.min(last, Math.max(confirmed, gone?.from ?? 0) + linger),
    };
  }
  const { returned, gone } = resolved(absences, rules);
  if (returned) return returned;
  if (lost) return { kind: 'adrift', sample: last };
  const since = emptySince(absences, 0, Infinity, last, false);
  if (since !== null) return { kind: 'empty', sample: Math.min(last, since + beat), since };
  return gone
    ? { kind: 'away', sample: Math.min(last, gone.from + linger), absence: gone }
    : { kind: 'record', sample: last };
}

/**
 * Where the performance ends in a picture that stays with one body (`kept`). That body is
 * always in it, so the picture never empties: it shows the other two go, or one of them.
 *
 * - Where the record finds a body free, and the path reaches the step that confirms it:
 *   - the picture stays with that body: once the other two are out of it for the last time the
 *     path holds, it lingers on the one body alone;
 *   - it stays with one of the two left behind: it lingers on them from the free body's last
 *     leaving. The step that confirms the record's finding may come much later, and is not
 *     waited for: what the record finds is said, not performed.
 * - Otherwise, as in the work's own frame: until a body a visitor sees go has come back to
 *   stay (`settled`), and a beat more, unless the other has gone by then, and is out to the
 *   path's end (`resolved`).
 * - Where none does, and the energy held: a while past the leaving of a body a visitor has
 *   seen go that the path ends without (`goneToTheEnd`). On the kept body alone, where the
 *   other has gone too by then and is not back either (it is the kept body that goes apart
 *   from the two); on the two, where it has not. A body that merely happens to be out as the
 *   record stops looking, long after, is no part of it.
 * - And where nothing a visitor sees happens at all: for as long as the film ran.
 */
export function keptEndingOf(
  absences: readonly Absence[],
  rules: EndingRules,
  kept: number,
): KeptEnding {
  const { samples, lost, leaver, confirmed, beat, linger } = rules;
  const last = samples - 1;
  const others = [0, 1, 2].filter((body) => body !== kept);
  /** From when the other two are both out of the picture, where the path ends with them away. */
  const bothAway = (): number | null => {
    const [one, other] = others.map((body) => lastLeaving(absences, body));
    if (!one || !other) return null;
    const since = Math.max(one.from, other.from);
    // A path cut short by lost energy must have shown it for a beat (emptySince, above).
    return lost && last - since < beat ? null : since;
  };
  if (leaver !== null && confirmed !== null && confirmed <= last) {
    // A finding confirmed inside the recorded window is lingered on from the path's first
    // sample, as the frame's ending has it: never from before the path begins.
    const found = Math.max(0, confirmed);
    if (leaver === kept) {
      const since = bothAway();
      return since !== null
        ? { kind: 'alone', sample: Math.min(last, since + linger), since }
        : { kind: 'parted', sample: Math.min(last, found + linger) };
    }
    const gone = lastLeaving(absences, leaver);
    return { kind: 'parted', sample: Math.min(last, (gone?.from ?? found) + linger) };
  }
  const { returned, gone } = resolved(absences, rules);
  if (returned) return returned;
  if (lost) return { kind: 'adrift', sample: last };
  if (!gone) return { kind: 'record', sample: Math.min(last, rules.look ?? last) };
  const other = lastLeaving(
    absences,
    others.find((body) => body !== gone.body)!,
  );
  if (other && other.from <= gone.from + linger) {
    const since = Math.max(gone.from, other.from);
    return { kind: 'alone', sample: Math.min(last, since + linger), since };
  }
  return { kind: 'away', sample: Math.min(last, gone.from + linger), absence: gone };
}

/**
 * The samples of a performance worth going straight to, in order: each leaving that a visitor
 * sees, each such body's return (and the sample from which the one told stays), the picture
 * standing empty or holding one body alone, and the leaving of a body gone to the path's end.
 * None lies past the ending.
 */
export function momentsOf(
  absences: readonly Absence[],
  ending: Ending,
  rules: Pick<EndingRules, 'long' | 'far' | 'filmed'>,
): number[] {
  const moments = new Set<number>();
  for (const absence of absences) {
    if (!seen(absence, rules)) continue;
    if (absence.from <= ending.sample) moments.add(absence.from);
    if (absence.to !== null && absence.to <= ending.sample) moments.add(absence.to);
  }
  if (ending.kind === 'empty' || ending.kind === 'alone') moments.add(ending.since);
  // The return a telling counts to, where the body crossed the edge again before it stayed.
  if (ending.kind === 'returned') moments.add(ending.back);
  // The leaving a telling will name is one to go to, though the body stands only just outside.
  if (ending.kind === 'away') moments.add(ending.absence.from);
  // A leaving at the path's first sample is where the performance begins, not a moment in it.
  moments.delete(0);
  return [...moments].sort((a, b) => a - b);
}
