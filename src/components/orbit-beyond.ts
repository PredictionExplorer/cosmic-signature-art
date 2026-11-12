import type { Messages } from '@/lib/i18n/en';
import { clock, fill, filmSpan } from '@/lib/i18n/format';
import {
  absencesOf,
  awayAt,
  endingOf,
  keptEndingOf,
  lasts,
  momentsOf,
  outTogether,
  type Absence,
  type FrameEnding,
  type KeptEnding,
  type Outside,
  type Span,
} from '@/lib/physics/absences';
import { confirmedAt, type BeyondPath } from '@/lib/physics/beyond';
import type { DerivedFate } from '@/lib/physics/orbit';
import { shareText } from './orbit-proof';
import { MATERIALS, type Picture } from './orbit-picture';
import { FADE_EVERY_SECONDS, type Continued, type Painter } from './orbit-painter';

/*
  After the frame (third-physics.md §5.6; docs/after-the-frame.md §8.3). The same physics runs on
  past the recorded window, at the film's pace, and the camera stays where the film's frame
  ended. So a body that goes far leaves the picture, and nothing follows it: the line beneath
  counts how far away it is, in widths of the picture. It comes back, or the picture empties.
  Then the drawing gives way to the still, unaltered; nothing is said or offered for a while;
  and one line says what happened, with the record's own word on it.

  Or the picture stays with one of the three (docs/after-the-frame.md §8.4). Where the picture
  draws the bodies where they were, the visitor is first asked: "Stay with one of the three, or
  with the frame." With a body, that body holds still in the picture (src/lib/physics/kept.ts)
  and the other two are drawn where they stand from it: one goes and comes back, or goes for
  good while the third stays near; or both go, and the body is alone in the picture. The still
  cannot lie under a picture that travels, so it leaves the stage until the performance is over.

  The path is carried once, off the main thread (src/lib/physics/beyond.ts). This module reads
  it for what the picture shows (src/lib/physics/absences.ts), plays it, and words it. Its
  trails are the bodies' hues drained of colour, each remembered for as long as the film runs.
*/

/**
 * After the frame, as it stands: a count, so that a repeat starts afresh, and where it has got
 * to. The visitor is asked whom to stay with; then, with their answer, it is performed, the
 * still stands alone in silence, and what happened is told. The answer is the body the picture
 * stays with (none: the frame, held where the film left it), so there is one only once the
 * question is answered, or was not asked.
 */
export type Beyond = { run: number } & (
  { phase: 'choosing' } | { phase: 'running' | 'resting' | 'told'; kept: number | null }
);

/** Asked whom to stay with; performed; then the still alone, in silence; then told. */
export type BeyondPhase = Beyond['phase'];

/** An absence lasts when it runs this long, in seconds of film, or to the path's end… */
const LASTING_SECONDS = 3;
/** …and is one a visitor sees the body go on when it also takes it this far, in widths. */
const SEEN_WIDTHS = 0.1;
/** The picture is held this long on what ends the performance… */
const BEAT_SECONDS = 2;
/**
 * …and this long on the two a leaver leaves in it, when they stay; and, in a picture that
 * stays with one body, on that body alone, or with the one that stayed by it.
 */
const LINGER_SECONDS = 8;
/** The drawing gives way to the still over --t-sit (orbit-score.module.css)… */
export const FADE_MS = 1200;
/** …and the still stands alone, with nothing said or offered, for as long as --t-rest after. */
export const REST_MS = 8000;
/** Further on arrives this many seconds of film before the next moment… */
const LEAD_SECONDS = 4;
/** …and is offered only where it saves at least this many more. */
const WORTH_SECONDS = 4;
/** Where nothing plays, a step lands this long after the moment, so the picture shows it. */
const PAST_SECONDS = 1;
/**
 * No frame advances a performance past the frame by more than this, so a tab coming back
 * resumes it where it was.
 */
export const LONGEST_FRAME_SECONDS = 0.1;

/** What the picture shows of a path past the window, and where a performance of it ends. */
export type HeldScript = {
  /** The path's samples in a second of the Light film. */
  perSecond: number;
  /** Copies of each body the picture draws: every one on Light, the first alone on Ink. */
  copies: number;
  outside: Outside;
  absences: Absence[];
  /**
   * The samples worth going straight to: a leaving, a return, the picture emptied, or one body
   * left alone in it.
   */
  moments: number[];
  /**
   * What counts as an absence that lasts, and as one a visitor sees the body go on: how far it
   * must go, and how far the film itself showed each body stand outside this picture.
   */
  rules: { long: number; far: number; filmed: readonly number[] };
  /**
   * Whether the picture's three marks are the bodies where they were. Eleven works draw another
   * space (a phase portrait, a hodograph, cross-braid, whose mark is made of two bodies'
   * coordinates): a mark that leaves such a picture is not a body leaving, so there the
   * picture's events still shape the performance, and no sentence names a body.
   */
  names: boolean;
} & (
  | {
      /** The work's own frame, held where the film left it. */
      kept: null;
      ending: FrameEnding;
    }
  | {
      /** The body the picture is kept on. */
      kept: number;
      ending: KeptEnding;
    }
);

/**
 * Reads a path for the picture it is drawn in: the work's frame, held or kept on one body
 * (`picture.kept`), whatever size it is drawn at. It is the same reading at every size, so the
 * section keeps it for as long as the path and the material stand.
 *
 * A picture kept on a body brings what the film itself showed of the other two (`kept.filmed`):
 * how far outside it the recorded window had each of them stand. The work's own frame holds the
 * whole window, so there the film showed none outside it.
 */
export function heldScript(
  path: BeyondPath,
  picture: Picture,
  fate: Pick<DerivedFate, 'outcome' | 'escaper' | 'ejectionStep'>,
  pace: number,
  names: boolean,
): HeldScript {
  const size = path.copies * 6;
  const copies = picture.drawn / 3;
  const perSecond = pace / path.stride;
  const outside: Outside = (sample, drawn) => picture.outside(path.pixels, size, sample, drawn);
  const absences = absencesOf(path.samples, copies, outside);
  const escaped = fate.outcome === 'ejection' && fate.ejectionStep !== null;
  const rules = {
    long: Math.round(LASTING_SECONDS * perSecond),
    far: SEEN_WIDTHS,
    filmed: picture.kept?.filmed ?? [0, 0, 0],
  };
  const all = {
    ...rules,
    samples: path.samples,
    lost: path.lost !== null,
    leaver: escaped ? fate.escaper : null,
    confirmed: escaped ? confirmedSample(path, fate.ejectionStep!) : null,
    beat: Math.round(BEAT_SECONDS * perSecond),
    linger: Math.round(LINGER_SECONDS * perSecond),
    // The film's length, in the path's samples: the window's steps at the path's stride.
    look: Math.round(path.from / path.stride),
  };
  const read = { perSecond, copies, outside, absences, rules, names };
  if (!picture.kept) {
    const ending = endingOf(absences, all);
    return { ...read, kept: null, ending, moments: momentsOf(absences, ending, rules) };
  }
  const kept = picture.kept.body;
  const ending = keptEndingOf(absences, all, kept);
  return { ...read, kept, ending, moments: momentsOf(absences, ending, rules) };
}

/** The path's sample at which the record's finding of a free body is confirmed. */
const confirmedSample = (path: BeyondPath, ejectionStep: number) =>
  Math.ceil((confirmedAt(ejectionStep) - path.from) / path.stride);

/**
 * Where Further on goes from `sample`: a few seconds before the next moment, to watch it come;
 * where nothing plays, just past it, to see it. With no moment left, towards the end; at the
 * end, nowhere.
 */
export function furtherOn(script: HeldScript, sample: number, still: boolean): number | 'end' {
  const { perSecond, ending, moments } = script;
  if (sample >= ending.sample) return 'end';
  const next = moments.find((moment) => moment > sample);
  // Standing a second past a moment, the picture already shows any other within that second.
  if (still)
    return next === undefined
      ? ending.sample
      : Math.min(ending.sample, next + Math.round(PAST_SECONDS * perSecond));
  return Math.max(sample, (next ?? ending.sample) - Math.round(LEAD_SECONDS * perSecond));
}

/**
 * Whether Further on saves a wait from `sample`. Where nothing plays it is the only way on,
 * however near the next moment is. At the end it goes nowhere, moving or still: it is not the
 * word that tells, or a visitor stepping with it would press on into whatever came to stand in
 * its place.
 */
export function worthGoingOn(script: HeldScript, sample: number, still: boolean): boolean {
  const target = furtherOn(script, sample, still);
  if (target === 'end') return false;
  return still || target - sample >= WORTH_SECONDS * script.perSecond;
}

/**
 * The bodies the line names as out of the picture at a sample: each one in an absence that
 * lasts, however near the edge it stands (a body past the edge by more than its own light is
 * out of sight). One that grazes the edge and is back within moments is not called out, or the
 * line would chatter with every crossing. From the sample at which the picture has emptied to
 * end the performance, all three are.
 */
export function outNow(script: HeldScript, sample: number): number[] {
  const { ending, absences, rules } = script;
  if (ending.kind === 'empty' && sample >= ending.since) return [0, 1, 2];
  return absences
    .filter(
      (absence) =>
        absence.from <= sample &&
        (absence.to === null || sample < absence.to) &&
        lasts(absence, rules),
    )
    .map((absence) => absence.body)
    .sort((a, b) => a - b);
}

/**
 * The line under the drawing while it runs: how far past the film, and who is out of the
 * picture; and first, where the picture stays with a body, which.
 */
export function beyondLine(
  script: HeldScript,
  path: BeyondPath,
  sample: number,
  t: Messages,
  number: Intl.NumberFormat,
): string {
  const line = lineOf(script, path, sample, t, number);
  return script.kept === null ? line : fill(t.beyondKeptLine, { body: script.kept + 1, line });
}

/**
 * The longest line a performance can say here, for the room the section keeps under the
 * picture: a body far away, said from a picture that stays with one where the visitor is asked
 * whom to stay with. Where the picture draws no body where it was, no line names one.
 */
export function longestBeyondLine(
  { names, asks, horizon }: { names: boolean; asks: boolean; horizon: number },
  t: Messages,
  number: Intl.NumberFormat,
  oneDecimal: Intl.NumberFormat,
): string {
  if (!names) return fill(t.orbitBeyond, { clock: clock(0), step: number.format(horizon) });
  const line = fill(t.beyondAway, { clock: clock(0), body: 3, widths: oneDecimal.format(88.8) });
  return asks ? fill(t.beyondKeptLine, { body: 3, line }) : line;
}

function lineOf(
  script: HeldScript,
  path: BeyondPath,
  sample: number,
  t: Messages,
  number: Intl.NumberFormat,
): string {
  const at = clock(sample / script.perSecond);
  const away = script.names ? outNow(script, sample) : [];
  if (away.length === 3) return fill(t.beyondEmptyNow, { clock: at });
  if (away.length === 2)
    return fill(t.beyondAwayTwo, { clock: at, a: away[0] + 1, b: away[1] + 1 });
  if (away.length === 1) {
    const far = awayAt(script.outside, sample, away[0], script.copies);
    // Just past the edge the distance rounds to nothing, and is not said.
    if (Math.round(far * 10) === 0) return fill(t.beyondOut, { clock: at, body: away[0] + 1 });
    const tenth = new Intl.NumberFormat(number.resolvedOptions().locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return fill(t.beyondAway, { clock: at, body: away[0] + 1, widths: tenth.format(far) });
  }
  return fill(t.orbitBeyond, {
    step: number.format(path.from + sample * path.stride),
    clock: at,
  });
}

/** What a picture is told to have shown: its sentences, and whether the record's finding follows. */
interface Told {
  said: string[];
  record: boolean;
}
const NOTHING_SHOWN: Told = { said: [], record: true };

/**
 * What happened, once it has: the picture's own event, in a sentence or two; what the record
 * finds; and, where the computation lost its energy, that it did. Each is said only where it is
 * true of this work:
 * - a body is named only where the picture draws the bodies where they were (`script.names`);
 * - "left" is said of a body's first leaving after the film; "left again" of one it came back
 *   from, and "last left" of one the path ends inside, where an earlier absence of that body
 *   had lasted long enough for the line to name it;
 * - the record finds a body free only where the path reaches the step that confirms it;
 * - it finds the three still bound only where it dates no ejection and the energy held to its
 *   horizon;
 * - where the path stops at lost energy, the last sentence says that.
 *
 * Of a picture that stays with one body, the first sentence says so, and "the picture" and "it"
 * in the sentences after are that picture:
 * - the body is "alone in it" from the sample at which the other two are both out of it, where
 *   the path ends with them away; "again" where they had both been out of it before, for long
 *   enough that the line said so;
 * - where a body seen to go came back to stay (the first whose return does: absences.ts,
 *   `settled`), and for half that absence or more the other was out too, what is told is how
 *   long the body was alone, "again" where it had been before; else the one body's leaving
 *   and its return;
 * - the one that stayed by the body is said to be "still in it" only if it is, from the
 *   other's leaving to the last sample performed; and not where the path stops at lost
 *   energy, which has the last word there (№ 030: four sentences are what a phone has room
 *   for).
 */
export function beyondFact(
  script: HeldScript,
  path: BeyondPath,
  fate: Pick<DerivedFate, 'outcome' | 'escaper' | 'ejectionStep' | 'horizonSteps'>,
  t: Messages,
  number: Intl.NumberFormat,
): string[] {
  const { locale } = number.resolvedOptions();
  const { absences, perSecond } = script;
  const span = (samples: number) => filmSpan(samples / perSecond, t, locale);
  const escaped = fate.outcome === 'ejection' && fate.ejectionStep !== null;
  const steps = number.format(fate.horizonSteps);
  /**
   * A leaving, said as the first, as one more, or as the last the path holds. It is one more
   * only after an earlier absence of that body that lasted: one the line had named. A crossing
   * of a few hundredths of a second, which neither the line nor the eye registers, does not
   * make the next leaving "again".
   */
  const left = (absence: Absence) => {
    const before = absences.some(
      (other) =>
        other.body === absence.body && other.from < absence.from && lasts(other, script.rules),
    );
    const words = !before
      ? t.beyondLeft
      : absence.to === null
        ? t.beyondLeftLast
        : t.beyondLeftAgain;
    return fill(words, { body: absence.body + 1, time: span(absence.from) });
  };
  const away = absences.filter((absence) => absence.to === null);
  /**
   * A body that left the picture and is not back as far as the path goes. The horizon is said
   * once: that the body is not back, and that the three are bound. Not of a path that stops
   * short of an ejection the record dates: there the three are not called bound. (A path that
   * lost its energy never ends so: it ends adrift.)
   */
  const notBack = (absence: Absence): Told =>
    escaped
      ? { said: [left(absence)], record: true }
      : { said: [left(absence), fill(t.beyondNotBack, { steps })], record: false };

  /** Whether a body is in the picture at every sample from `from` to `to`. */
  const inThroughout = (body: number, from: number, to: number) =>
    !absences.some(
      (absence) =>
        absence.body === body && absence.from <= to && (absence.to === null || absence.to > from),
    );

  /** A body that left the picture and came back to stay, from `back` (absences.ts, `settled`). */
  const cameBack = (absence: Absence, back: number): string[] => [
    left(absence),
    fill(t.beyondBack, { time: span(back - absence.from) }),
  ];

  /** What the work's own frame showed, held where the film left it. */
  const ofTheFrame = (ending: FrameEnding): Told => {
    switch (ending.kind) {
      // Nothing is told of the picture: the energy was lost before any return stayed, or no
      // body was seen to go for as far as the record looked (one may have stood just past the
      // edge for a while, as the line said then).
      case 'adrift':
      case 'record':
        return NOTHING_SHOWN;
      case 'returned':
        return { said: cameBack(ending.absence, ending.back), record: true };
      case 'away':
        return notBack(ending.absence);
      case 'empty':
      case 'parted': {
        // The body the record finds free; where it finds none, the last of the three to go.
        const gone = escaped
          ? away.find((absence) => absence.body === fate.escaper)
          : away.reduce<Absence | undefined>(
              (last, absence) => (!last || absence.from > last.from ? absence : last),
              undefined,
            );
        if (!gone) return NOTHING_SHOWN;
        if (ending.kind === 'empty')
          return {
            said: [
              left(gone),
              ending.since > gone.from
                ? fill(t.beyondEmptied, { time: span(ending.since - gone.from) })
                : t.beyondAlreadyEmpty,
            ],
            record: true,
          };
        // The other two are said to be in the picture only if they are, from its leaving to
        // the last sample performed.
        const stayed = [0, 1, 2].every(
          (body) => body === gone.body || inThroughout(body, gone.from, ending.sample),
        );
        return {
          said: [
            left(gone),
            ...(stayed ? [fill(t.beyondStayed, { time: span(ending.sample - gone.from) })] : []),
          ],
          record: true,
        };
      }
    }
  };

  /** What a picture kept on the body `on` showed of the other two. */
  const ofTheKept = (on: number, ending: KeptEnding): Told => {
    const stayedWith = fill(t.beyondKept, { body: on + 1 });
    const others = [0, 1, 2].filter((body) => body !== on);
    /** The stretches in which the body was alone in the picture for long enough that the line said so. */
    const alone = outTogether(absences, others).filter(
      (one): one is Span & { to: number } =>
        one.to !== null && one.to - one.from >= script.rules.long,
    );
    switch (ending.kind) {
      // Whom the picture stayed with, and no more: the energy lost, or nothing that went
      // farther than the film had shown.
      case 'adrift':
      case 'record':
        return { said: [stayedWith], record: true };
      case 'alone':
        // Every such stretch that ended, ended before this one began: it is alone "again".
        return {
          said: [
            stayedWith,
            fill(alone.length ? t.beyondAloneAgain : t.beyondAlone, {
              body: on + 1,
              time: span(ending.since),
            }),
          ],
          record: true,
        };
      case 'returned': {
        const { absence, back } = ending;
        const during = alone
          .filter((one) => one.from < back && one.to > absence.from)
          .reduce<(Span & { to: number }) | null>(
            (longest, one) =>
              !longest || one.to - one.from > longest.to - longest.from ? one : longest,
            null,
          );
        if (during && (during.to - during.from) * 2 >= back - absence.from) {
          // "Again" where it had been alone before, in a stretch that ended before this one.
          const before = alone.some((one) => one.to <= during.from);
          return {
            said: [
              stayedWith,
              fill(before ? t.beyondAloneForAgain : t.beyondAloneFor, {
                body: on + 1,
                span: span(during.to - during.from),
                time: span(during.from),
              }),
            ],
            record: true,
          };
        }
        return { said: [stayedWith, ...cameBack(absence, back)], record: true };
      }
      case 'parted': {
        // The body the record finds free; the picture may stay with it, and then shows none go.
        const gone = away.find((absence) => absence.body === fate.escaper);
        if (!gone) return { said: [stayedWith], record: true };
        const partner = others.find((body) => body !== gone.body);
        const stayed =
          partner !== undefined && !path.lost && inThroughout(partner, gone.from, ending.sample);
        return {
          said: [
            stayedWith,
            left(gone),
            ...(stayed
              ? [
                  fill(t.beyondOneStayed, {
                    body: partner + 1,
                    time: span(ending.sample - gone.from),
                  }),
                ]
              : []),
          ],
          record: true,
        };
      }
      case 'away': {
        const { said, record } = notBack(ending.absence);
        return { said: [stayedWith, ...said], record };
      }
    }
  };

  /** What the picture showed, where its marks are the bodies. */
  const pictured = (): Told =>
    !script.names
      ? NOTHING_SHOWN
      : script.kept === null
        ? ofTheFrame(script.ending)
        : ofTheKept(script.kept, script.ending);

  /** What the record finds, where the computation kept its energy as far as that. */
  const recorded = (): string[] => {
    if (escaped)
      return confirmedSample(path, fate.ejectionStep!) <= path.samples - 1
        ? [
            fill(t.beyondFree, {
              body: (fate.escaper ?? 0) + 1,
              step: number.format(fate.ejectionStep!),
            }),
          ]
        : [];
    return path.lost ? [] : [fill(t.beyondStill, { steps })];
  };

  const { said, record } = pictured();
  return [
    ...said,
    ...(record ? recorded() : []),
    ...(path.lost
      ? [
          fill(t.orbitAdrift, {
            step: number.format(path.lost.step),
            change: shareText(path.lost.change, locale),
          }),
        ]
      : []),
  ];
}

/** Everything After the frame draws with, and tells, as the section has set it out. */
export interface BeyondStage {
  path: BeyondPath;
  script: HeldScript;
  /** Which performance this is: a repeat starts afresh, a redraw carries on. */
  key: string;
  picture: Picture;
  /** The Light film's length, in seconds: how long a trail is remembered. */
  film: number;
  /** Nothing plays: the picture stands where it is, and Further on steps it. */
  still: boolean;
  inView: boolean;
  /** The bodies' canvas, and its size in device pixels. */
  mark: CanvasRenderingContext2D;
  width: number;
  height: number;
  painter: Painter;
  /**
   * How far the performance has run, in samples of the path: a redraw or a return carries on.
   * In a picture that stays with a body, also when the bodies began to be brought to it, so
   * that a redraw on the way carries the bringing on, and one after it does not begin it again.
   */
  live: { current: { key: string; sample: number; began?: number } | null };
  /** The section's animation frame, cancelled before each redraw. */
  frame: { current: number };
  /**
   * Says where the performance stands, and whether the bodies have been brought to where the
   * picture holds them: until they have, time waits, and there is nothing to go further on to.
   */
  speak: (sample: number, brought: boolean) => void;
  /** The performance has reached its end; or had none, where the path is one sample long. */
  onEnd: () => void;
}

/**
 * Draws After the frame where it stands and, where motion is welcome, performs it to its end.
 * Only while it runs: once it is over the section leaves the last frame standing under the
 * still, which the stylesheet brings back, and draws nothing until the visitor goes on.
 */
export function performBeyond(stage: BeyondStage): (() => void) | void {
  const { path, script, key, picture, film, still } = stage;
  const { mark, width, height, painter, live, frame, speak } = stage;
  const paint = MATERIALS[picture.material];
  const size = path.copies * 6;
  const { perSecond, ending } = script;
  const kept = picture.kept ?? null;
  const place = (index: number, body: number) => picture.continued(path.pixels, size, index, body);
  /**
   * In a picture that holds its body at the middle, every copy of that body stands there: the
   * first is drawn, and the others are not drawn on top of it.
   */
  const stacked = (body: number) =>
    kept !== null && kept.towards === 1 && body >= 3 && picture.body(body) === kept.body;
  const once = (body: number) => (stacked(body) ? 0 : 1);
  const trail: Continued = {
    place,
    // The body the picture stays with draws no trail in it: it does not move there.
    still: kept ? (body) => picture.body(body) === kept.body : undefined,
  };
  /** A trail is remembered for as long as the film runs: this many samples of the path. */
  const memory = Math.max(4, Math.round(film * perSecond));
  const lightsAt = (index: number) => {
    mark.clearRect(0, 0, width, height);
    painter.lights((body) => place(index, body), once);
  };
  /**
   * The three brought from where the film left them in the work's frame to where the kept
   * picture holds them, all by one move: `progress` runs 0 to 1. Copies that will stand on one
   * another fade as they come together.
   */
  const bring = (progress: number) => {
    if (!kept) return;
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    mark.clearRect(0, 0, width, height);
    painter.lights(
      (body) => {
        const [fromX, fromY] = kept.from(path.pixels, size, body);
        const [toX, toY] = place(0, body);
        return [fromX + (toX - fromX) * eased, fromY + (toY - fromY) * eased];
      },
      (body) => (stacked(body) ? 1 - eased : 1),
    );
  };

  if (live.current?.key !== key) live.current = { key, sample: 0 };
  const playhead = live.current;
  // Where motion is unwelcome the picture stands with its body at once: brought long ago,
  // even if the bringing had begun before motion became unwelcome (the venue paused mid-way).
  if (kept && still) playhead.began = Number.NEGATIVE_INFINITY;
  /** How far the bringing has come: from the moment it began, however often it is redrawn. */
  const brought = (now: number) =>
    playhead.began === undefined ? 0 : Math.min(1, (now - playhead.began) / FADE_MS);
  const arriving = kept !== null && brought(performance.now()) < 1;
  // In the work's own frame, the window dimmed: what the work recorded, behind what comes
  // next. A picture that travels has no window behind it: the window's strokes are drawn whole
  // once more as the bodies are brought, and the stylesheet lets them go with the still.
  if (!kept) painter.strokes(0, picture.last, paint.dimmed);
  else if (arriving) painter.strokes(0, picture.last);
  const sampleAt = (sample: number) => Math.min(ending.sample, Math.max(0, Math.floor(sample)));
  let index = sampleAt(playhead.sample);
  painter.retraced(memory, [trail, index]);
  if (arriving) bring(brought(performance.now()));
  else lightsAt(index);
  speak(index, !arriving);
  if (index >= ending.sample) {
    // Brought to its end by a step, or found there by a redraw; or there from the start, where
    // the path has nothing past the window to perform, at any pace.
    if (!still || ending.sample === 0) stage.onEnd();
    return;
  }
  if (still || !stage.inView) return;
  let last: number | null = null;
  let spoken = performance.now();
  /** Seconds performed since the trails last faded. */
  let unfaded = 0;
  const perform = (now: number) => {
    const elapsed = last === null ? 0 : Math.min(LONGEST_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    playhead.sample += elapsed * perSecond;
    unfaded += elapsed;
    const before = index;
    index = sampleAt(playhead.sample);
    if (unfaded >= FADE_EVERY_SECONDS) {
      unfaded = 0;
      painter.fade(film);
    }
    painter.continued(trail, before, index);
    lightsAt(index);
    const ended = index >= ending.sample;
    if (now - spoken > 250 || ended) {
      spoken = now;
      speak(index, true);
    }
    if (ended) {
      stage.onEnd();
      return;
    }
    frame.current = requestAnimationFrame(perform);
  };
  if (arriving) {
    // Time waits while the bodies are brought, for as long as the still takes to go.
    const arrive = (now: number) => {
      playhead.began ??= now;
      const progress = brought(now);
      bring(progress);
      if (progress < 1) {
        frame.current = requestAnimationFrame(arrive);
        return;
      }
      lightsAt(index);
      speak(index, true);
      frame.current = requestAnimationFrame(perform);
    };
    frame.current = requestAnimationFrame(arrive);
  } else frame.current = requestAnimationFrame(perform);
  return () => cancelAnimationFrame(frame.current);
}
