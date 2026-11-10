import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import { lightFilmDuration } from '@/lib/physics/light-film';
import type { EnergyKept } from '@/lib/physics/orbit';
import type { Expression } from './collection-traits';
import { drawsPositions } from './orbit-frames';
import type { WorkOrbit } from './orbit-records';

/*
  One true line under every still (docs/after-the-frame.md §4 step 2, and §8.2). A newcomer is
  told what the picture holds, in the record's own facts and no feeling. Each line is one or two
  sentences, and they travel apart so that the strip can set each whole on a line of its own.

  A work's line (fateLine). Each sentence is said only where it is true of that work:
  - together through the window: of every work whose record dates no ejection inside it. In
    every window the three stay within the picture, and the record's test never calls one free;
  - no longer bound: where the record dates an ejection and the computation kept its energy all
    the way there (orbit-energy.ts), so that what goes is a body and not the arithmetic. The
    date is the record's: the step at which its test first finds the body free of the other
    two. In about half the works the body is still in the picture then, and in others it has
    been gone for seconds, so the sentence says what is so at that step and not that it leaves
    then;
  - still bound where the record stops looking: where it dates none, with the energy kept
    through its whole horizon. Bound, and not together: in most of these works a body goes far
    from the other two and comes back, and at the horizon it may be many pictures away.
  A work whose computation lost its energy on the way is given the first sentence alone. The
  record beneath it says what was found.

  The home's line (homeLine) says what the picture is, and so its second sentence is said only
  of a picture that is one.
*/

/** Under a minute, a wait is told in seconds; past it, in minutes. One decimal either way. */
const MINUTE = 60;

/**
 * How long after the Light film's last frame a step falls, at the film's own pace, in words.
 * The Ink film keeps the same clock, frame for frame. One decimal always, so the unit keeps
 * one form in every language the venue speaks.
 */
function sinceFilm(after: number, steps: number, t: Messages, locale: Locale): string {
  const seconds = (after * lightFilmDuration(steps)) / steps;
  const tenth = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // Rounded as it will print, so that 59.96 seconds is a minute and never "60.0 seconds".
  return Math.round(seconds * 10) < MINUTE * 10
    ? fill(t.fateSeconds, { n: tenth.format(seconds) })
    : fill(t.fateMinutes, { n: tenth.format(seconds / MINUTE) });
}

/**
 * The line for one work, as the sentences it is made of, from its record and the venue's measure
 * of its energy. Null when the record dates an ejection by the recorded window's last step: the
 * first sentence would not be true of it, and the caller keeps the work's label.
 */
export function fateLine(
  orbit: Pick<WorkOrbit, 'fate' | 'generation'>,
  energy: EnergyKept | undefined,
  t: Messages,
  locale: Locale,
): readonly string[] | null {
  const { steps } = orbit.generation;
  const { outcome, ejectionStep, horizonSteps } = orbit.fate;
  const dated = outcome === 'ejection' ? ejectionStep : null;
  if (dated !== null && dated <= steps) return null;
  const number = new Intl.NumberFormat(locale);
  const together = fill(t.fateTogether, { steps: number.format(steps) });
  // Unmeasured, or adrift before its fate: only what the window itself shows.
  if (!energy || energy.broken) return [together];
  return [
    together,
    dated !== null
      ? fill(t.fateLeaves, { time: sinceFilm(dated - steps, steps, t, locale) })
      : fill(t.fateStill, { steps: number.format(horizonSteps) }),
  ];
}

/**
 * The home's line under one material's still: three bodies, and what this picture of them is.
 * The second sentence calls the Light still a long exposure of their motion and the Ink still
 * the ink that motion stirred, which is so of a picture that draws the bodies where they were.
 * Seventeen works draw another space or repeat every stroke about a symmetry (orbit-frames.ts);
 * until they have words of their own, the home says the first sentence alone on their days.
 */
export function homeLine(id: number, expression: Expression, t: Messages): readonly string[] {
  if (!drawsPositions(id)) return [t.homeLine];
  return [t.homeLine, expression === 'light' ? t.homeLineLight : t.homeLineInk];
}
