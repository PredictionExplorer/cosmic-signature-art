import type { Messages } from '@/lib/i18n/en';
import { clock, fill, filmSpan } from '@/lib/i18n/format';
import {
  absencesOf,
  awayAt,
  endingOf,
  lasts,
  momentsOf,
  seen,
  type Absence,
  type Ending,
  type Outside,
} from '@/lib/physics/absences';
import { confirmedAt, type BeyondPath } from '@/lib/physics/beyond';
import type { DerivedFate } from '@/lib/physics/orbit';
import { shareText } from './orbit-proof';
import { MATERIALS, type Picture } from './orbit-picture';
import type { Painter } from './orbit-painter';

/*
  After the frame (third-physics.md §5.6; docs/after-the-frame.md §8.3). The same physics runs on
  past the recorded window, at the film's pace, and the camera stays where the film's frame
  ended. So a body that goes far leaves the picture, and nothing follows it: the line beneath
  counts how far away it is, in widths of the picture. It comes back, or the picture empties.
  Then the drawing gives way to the still, unaltered; nothing is said or offered for a while;
  and one line says what happened, with the record's own word on it.

  The path is carried once, off the main thread (src/lib/physics/beyond.ts). This module reads
  it for what the picture shows (src/lib/physics/absences.ts), plays it, and words it. Its
  trails are the bodies' hues drained of colour, each remembered for as long as the film runs.
*/

/** After the frame, and a count so that a repeat starts afresh. */
export type Beyond = { run: number };

/** Performed; then the still alone, in silence; then told. */
export type BeyondPhase = 'running' | 'resting' | 'told';

/** An absence lasts when it runs this long, in seconds of film, or to the path's end… */
const LASTING_SECONDS = 3;
/** …and is one a visitor sees the body go on when it also takes it this far, in widths. */
const SEEN_WIDTHS = 0.1;
/** The picture is held this long on what ends the performance… */
const BEAT_SECONDS = 2;
/** …and this long on the two a leaver leaves in it, when they stay. */
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
/** A trail fades to a twentieth over the film's length: a step every half second performed. */
const FADE_EVERY_SECONDS = 0.5;
/** The continued trails: the bodies' hues drained of colour. */
const CONTINUED_ALPHA = 0.3;
/** No frame advances the performance by more than this, so a tab coming back resumes it. */
const LONGEST_FRAME_SECONDS = 0.1;

/** What the picture shows of a path past the window, and where a performance of it ends. */
export interface HeldScript {
  /** The path's samples in a second of the Light film. */
  perSecond: number;
  /** Copies of each body the picture draws: every one on Light, the first alone on Ink. */
  copies: number;
  outside: Outside;
  absences: Absence[];
  ending: Ending;
  /** The samples worth going straight to: a leaving, a return, the picture emptied. */
  moments: number[];
  /** What counts as an absence that lasts, and as one a visitor sees the body go on. */
  rules: { long: number; far: number };
  /**
   * Whether the picture's three marks are the bodies where they were. Eleven works draw another
   * space (a phase portrait, a hodograph, cross-braid, whose mark is made of two bodies'
   * coordinates): a mark that leaves such a picture is not a body leaving, so there the
   * picture's events still shape the performance, and no sentence names a body.
   */
  names: boolean;
}

/**
 * Reads a path for the picture it is drawn in: the work's frame, whatever size it is drawn at.
 * It is the same reading at every size, so the section keeps it for as long as the path and the
 * material stand.
 */
export function heldScript(
  path: BeyondPath,
  picture: Picture,
  fate: Pick<DerivedFate, 'outcome' | 'escaper' | 'ejectionStep'>,
  pace: number,
  names: boolean,
): HeldScript {
  const width = path.copies * 6;
  const copies = picture.drawn / 3;
  const perSecond = pace / path.stride;
  const outside: Outside = (sample, drawn) => picture.outside(path.pixels, width, sample, drawn);
  const absences = absencesOf(path.samples, copies, outside);
  const escaped = fate.outcome === 'ejection' && fate.ejectionStep !== null;
  const rules = { long: Math.round(LASTING_SECONDS * perSecond), far: SEEN_WIDTHS };
  const ending = endingOf(absences, {
    ...rules,
    samples: path.samples,
    lost: path.lost !== null,
    leaver: escaped ? fate.escaper : null,
    confirmed: escaped ? confirmedSample(path, fate.ejectionStep!) : null,
    beat: Math.round(BEAT_SECONDS * perSecond),
    linger: Math.round(LINGER_SECONDS * perSecond),
  });
  return {
    perSecond,
    copies,
    outside,
    absences,
    ending,
    moments: momentsOf(absences, ending, rules),
    rules,
    names,
  };
}

/** The path's sample at which the record's finding of a free body is confirmed. */
const confirmedSample = (path: BeyondPath, ejectionStep: number) =>
  Math.ceil((confirmedAt(ejectionStep) - path.from) / path.stride);

/**
 * Where Further on goes from `sample`: a few seconds before the next moment, to watch it come;
 * where nothing plays, just past it, to see it. With no moment left, towards the end, and at the
 * end, on.
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

/** Whether Further on saves a wait from `sample`: where nothing plays, it is the only way on. */
export function worthGoingOn(script: HeldScript, sample: number, still: boolean): boolean {
  const target = furtherOn(script, sample, still);
  if (still) return true;
  return target !== 'end' && target - sample >= WORTH_SECONDS * script.perSecond;
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

/** The line under the drawing while it runs: how far past the film, and who is out of the picture. */
export function beyondLine(
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

/**
 * What happened, once it has: the picture's own event, in a sentence or two; what the record
 * finds; and, where the computation lost its energy, that it did. Each is said only where it is
 * true of this work:
 * - a body is named only where the picture draws the bodies where they were (`script.names`);
 * - "left" is said of a body's first leaving after the film, "left again" of a later one it
 *   came back from, and "last left" of a later one the path ends inside;
 * - the record finds a body free only where the path reaches the step that confirms it;
 * - it finds the three still bound only where it dates no ejection and the energy held to its
 *   horizon;
 * - where the path stops at lost energy, the last sentence says that.
 */
export function beyondFact(
  script: HeldScript,
  path: BeyondPath,
  fate: Pick<DerivedFate, 'outcome' | 'escaper' | 'ejectionStep' | 'horizonSteps'>,
  t: Messages,
  number: Intl.NumberFormat,
): string[] {
  const { locale } = number.resolvedOptions();
  const { ending, absences, perSecond } = script;
  const span = (samples: number) => filmSpan(samples / perSecond, t, locale);
  const escaped = fate.outcome === 'ejection' && fate.ejectionStep !== null;
  const steps = number.format(fate.horizonSteps);
  /** A leaving, said as the first, as one more, or as the last the path holds. */
  const left = (absence: Absence) => {
    const before = absences.some(
      (other) => other.body === absence.body && other.from < absence.from,
    );
    const words = !before
      ? t.beyondLeft
      : absence.to === null
        ? t.beyondLeftLast
        : t.beyondLeftAgain;
    return fill(words, { body: absence.body + 1, time: span(absence.from) });
  };
  const away = absences.filter((absence) => absence.to === null);

  /** What the picture showed, where its marks are the bodies. */
  const pictured = (): { said: string[]; record: boolean } => {
    const none = { said: [], record: true };
    if (!script.names) return none;
    switch (ending.kind) {
      case 'adrift':
        return none;
      case 'returned':
        return {
          said: [
            left(ending.absence),
            fill(t.beyondBack, { time: span(ending.absence.to! - ending.absence.from) }),
          ],
          record: true,
        };
      case 'record': {
        const open = away.find((absence) => seen(absence, script.rules));
        if (!open) return none;
        // The horizon is said once: that the body is not back, and that the three are bound.
        return escaped || path.lost
          ? { said: [left(open)], record: true }
          : { said: [left(open), fill(t.beyondNotBack, { steps })], record: false };
      }
      case 'empty':
      case 'parted': {
        // The body the record finds free; where it finds none, the last of the three to go.
        const gone = escaped
          ? away.find((absence) => absence.body === fate.escaper)
          : away.reduce<Absence | undefined>(
              (last, absence) => (!last || absence.from > last.from ? absence : last),
              undefined,
            );
        if (!gone) return none;
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
        // The other two are said to be in the picture only if they are, at the last sample.
        const stayed = [0, 1, 2].every(
          (body) =>
            body === gone.body || awayAt(script.outside, ending.sample, body, script.copies) === 0,
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
  /** The continued trails' canvas, and the bodies'. */
  beyondTrail: CanvasRenderingContext2D;
  mark: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: number;
  hues: readonly number[];
  painter: Painter;
  /** How far the performance has run, in samples of the path: a redraw or a return carries on. */
  live: { current: { key: string; sample: number } | null };
  /** The section's animation frame, cancelled before each redraw. */
  frame: { current: number };
  /** Says where the performance stands. */
  speak: (sample: number) => void;
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
  const { beyondTrail, mark, width, height, ratio, hues, painter, live, frame, speak } = stage;
  const paint = MATERIALS[picture.material];
  const size = path.copies * 6;
  const { perSecond, ending } = script;
  const place = (index: number, body: number) => picture.continued(path.pixels, size, index, body);
  const trace = (first: number, last: number, alpha: number) => {
    if (last <= first) return;
    beyondTrail.globalCompositeOperation = paint.blend;
    beyondTrail.lineWidth = picture.material === 'ink' ? 0.75 * ratio : ratio;
    beyondTrail.lineJoin = 'round';
    for (let body = 0; body < picture.drawn; body++) {
      beyondTrail.strokeStyle = paint.continued(hues[picture.body(body)], alpha);
      beyondTrail.beginPath();
      beyondTrail.moveTo(...place(first, body));
      for (let index = first + 1; index <= last; index++) beyondTrail.lineTo(...place(index, body));
      beyondTrail.stroke();
    }
  };
  // Drawn whole (a resize, a return, a step), the last film's length of the path is traced in
  // quarters, each as faded as the performance would have left it.
  const memory = Math.max(4, Math.round(film * perSecond));
  const retrace = (last: number) => {
    beyondTrail.clearRect(0, 0, width, height);
    for (let quarter = 3; quarter >= 0; quarter--)
      trace(
        Math.max(0, last - Math.round(((quarter + 1) * memory) / 4)),
        Math.max(0, last - Math.round((quarter * memory) / 4)),
        CONTINUED_ALPHA * 0.05 ** (quarter / 4),
      );
  };
  const lightsAt = (index: number) => {
    mark.clearRect(0, 0, width, height);
    painter.lights((body) => place(index, body));
  };

  // The window, dimmed: what the work recorded, behind what comes next.
  painter.strokes(0, picture.last, paint.dimmed);
  if (live.current?.key !== key) live.current = { key, sample: 0 };
  const playhead = live.current;
  const sampleAt = (sample: number) => Math.min(ending.sample, Math.max(0, Math.floor(sample)));
  let index = sampleAt(playhead.sample);
  retrace(index);
  lightsAt(index);
  speak(index);
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
      beyondTrail.globalCompositeOperation = 'destination-out';
      beyondTrail.fillStyle = `rgb(0 0 0 / ${1 - 0.05 ** (FADE_EVERY_SECONDS / film)})`;
      beyondTrail.fillRect(0, 0, width, height);
    }
    trace(before, index, CONTINUED_ALPHA);
    lightsAt(index);
    const ended = index >= ending.sample;
    if (now - spoken > 250 || ended) {
      spoken = now;
      speak(index);
    }
    if (ended) {
      stage.onEnd();
      return;
    }
    frame.current = requestAnimationFrame(perform);
  };
  frame.current = requestAnimationFrame(perform);
  return () => cancelAnimationFrame(frame.current);
}
