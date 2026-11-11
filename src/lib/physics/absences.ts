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
  /** A body left the picture for a while, and came back. */
  | { kind: 'returned'; sample: number; absence: Absence }
  /** The record stops looking. */
  | { kind: 'record'; sample: number };

export interface EndingRules {
  /** The path's samples: its last is the last step the orbit was carried to. */
  samples: number;
  /** The path stops where the computation lost its energy (beyond.ts). */
  lost: boolean;
  /**
   * The body the record finds free of the other two, and the sample that is confirmed at; null
   * where it finds none, or where the path stops before the confirmation.
   */
  leaver: number | null;
  confirmed: number | null;
  /** An absence lasts when it runs this long, in samples, or to the path's end… */
  long: number;
  /** …and is one a visitor sees when it also takes the body this far, in widths of the picture. */
  far: number;
  /** How long the picture is held on what ends it, in samples… */
  beat: number;
  /** …and how long on the two a leaver leaves in the picture, when they stay. */
  linger: number;
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
 * `far` from the picture. The moments of a performance and its ending are made of these: a body
 * that stands just past the edge for a while has not gone anywhere.
 */
export const seen = (absence: Absence, rules: Pick<EndingRules, 'long' | 'far'>) =>
  absence.farthest >= rules.far && lasts(absence, rules);

/** The absence of a body that the path ends inside: it left, and was not seen back. */
const lastLeaving = (absences: readonly Absence[], body: number) =>
  absences.find((absence) => absence.body === body && absence.to === null) ?? null;

/**
 * The first sample from `since` on at which all three bodies are out of the picture at once,
 * and stay out for `lasting` samples. An emptiness the path ends inside counts whatever its
 * length, unless the path was `cut` short by lost energy: what a computation showed for a
 * moment before it stopped being an orbit is not an ending, so there it must have lasted too.
 *
 * Each body's absences follow one another in time, so the three lists are walked together once:
 * whichever absence ends first can share no later moment with the other two, and gives way to
 * that body's next.
 */
function emptySince(
  absences: readonly Absence[],
  since: number,
  lasting: number,
  last: number,
  cut: boolean,
): number | null {
  const of = [0, 1, 2].map((body) => absences.filter((absence) => absence.body === body));
  const at = [0, 0, 0];
  while (at.every((index, body) => index < of[body].length)) {
    const now = at.map((index, body) => of[body][index]);
    const from = Math.max(since, ...now.map((absence) => absence.from));
    const ends = now.map((absence) => absence.to ?? Infinity);
    const until = Math.min(...ends);
    const held = until === Infinity ? !cut || last - from >= lasting : until - from >= lasting;
    if (held) return from;
    at[ends.indexOf(until)] += 1;
  }
  return null;
}

/**
 * The first sample from which a body that came back at `back` stays on the picture for `beat`
 * samples: a return it at once undoes is not yet a return to end on. Null where the path ends
 * before it has stayed.
 */
function backToStay(
  absences: readonly Absence[],
  body: number,
  back: number,
  beat: number,
): number | null {
  let stays: number | null = back;
  for (const absence of absences) {
    if (absence.body !== body || stays === null || absence.from < stays) continue;
    if (absence.from - stays >= beat) break;
    stays = absence.to;
  }
  return stays;
}

/**
 * Where the performance ends.
 *
 * - Where the record finds a body free, and the path reaches the step that confirms it: once
 *   that body has left the picture for the last time, the performance runs until all three are
 *   out of it, and holds that a beat. Where the two it left stay in the picture, it lingers on
 *   them.
 * - Otherwise, until the first body a visitor sees go has come back to stay, and a beat more.
 *   Where none does: until the picture has emptied for good, if it has; and else to the path's
 *   end, which is the record's horizon, or the step at which the computation lost its energy.
 *   Nothing past such a step is performed, whatever comes first.
 */
export function endingOf(absences: readonly Absence[], rules: EndingRules): Ending {
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
  const absence = absences.find((one) => one.to !== null && seen(one, rules));
  if (absence) {
    const stays = backToStay(absences, absence.body, absence.to!, beat);
    return {
      kind: 'returned',
      sample: stays === null ? last : Math.min(last, stays + beat),
      absence,
    };
  }
  if (lost) return { kind: 'adrift', sample: last };
  const since = emptySince(absences, 0, Infinity, last, false);
  return since !== null
    ? { kind: 'empty', sample: Math.min(last, since + beat), since }
    : { kind: 'record', sample: last };
}

/**
 * The samples of a performance worth going straight to, in order: each leaving that a visitor
 * sees, each such body's return, and the picture standing empty. None lies past the ending.
 */
export function momentsOf(
  absences: readonly Absence[],
  ending: Ending,
  rules: Pick<EndingRules, 'long' | 'far'>,
): number[] {
  const moments = new Set<number>();
  for (const absence of absences) {
    if (!seen(absence, rules)) continue;
    if (absence.from <= ending.sample) moments.add(absence.from);
    if (absence.to !== null && absence.to <= ending.sample) moments.add(absence.to);
  }
  if (ending.kind === 'empty') moments.add(ending.since);
  // A leaving at the path's first sample is where the performance begins, not a moment in it.
  moments.delete(0);
  return [...moments].sort((a, b) => a - b);
}
