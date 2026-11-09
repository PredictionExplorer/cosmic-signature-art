import { FLAT, between, smooth, type Shot } from './camera';

/*
  First Light's performance, beat by beat (docs/first-light.md §4). It begins on the still, already
  painted, and ends on it, unaltered:

  1. open:   the picture opens; the camera leaves the flat view for the event in depth, and the
             still gives way to its own light over the first half second;
  2. rewind: time runs back; the light draws itself back along its paths into three stars;
  3. dance:  the window again, forward, on the Light film's own clock, while the camera travels;
             the closest approach flares as the bodies pass it;
  4. land:   the camera returns to the generator's view, and the depth flattens into the picture;
  5. settle: the light gives way to the still.
*/

/** Each beat's length, in milliseconds; the still's lift overlaps the opening's first moments. */
export const BEATS = {
  lift: 500,
  open: 1700,
  rewind: 1500,
  dance: 6000,
  land: 1500,
  settle: 500,
} as const;

const OPENED = BEATS.open;
const REWOUND = OPENED + BEATS.rewind;
const DANCED = REWOUND + BEATS.dance;
const LANDED = DANCED + BEATS.land;
/** The whole performance, from the still to the still. */
export const DURATION = LANDED + BEATS.settle;

export type Beat = 'open' | 'rewind' | 'dance' | 'land' | 'settle' | 'done';

/** Everything the stage draws at one moment of the performance. */
export interface Moment {
  beat: Beat;
  shot: Shot;
  /** The share of the window drawn, 0 to 1: where the trails' heads stand. */
  drawn: number;
  /** How brightly the heads burn: 0 while the whole window lies still, as in the still. */
  heads: number;
  /** The still's opacity over its light: 1 at either end. */
  still: number;
  /** The closest approach's flare as the bodies pass it, 0 to 1. */
  flare: number;
}

export interface Choreography {
  /** Where the camera stands once the picture has opened: turned, with width in its lens. */
  open: Shot;
  /** How far, in radians of yaw, the camera travels around the event while it plays. */
  travel: number;
  /** The share of the window drawn at each share of the dance: the Light film's own clock. */
  clock: (share: number) => number;
  /** The share of the window at its closest approach. */
  peak: number;
  /** How wide the flare is, as a share of the window. */
  flareWidth?: number;
}

/** The camera while the event plays: the open shot, carried around by a share of the travel. */
function travelling(c: Choreography, ms: number): Shot {
  const share = (ms - OPENED) / (DANCED - OPENED);
  // A long, even move: half a sine's ease, so the camera is never still and never hurried.
  const eased = (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, share)))) / 2;
  return { ...c.open, yaw: c.open.yaw + c.travel * eased };
}

/** The closest approach's flare as the drawing passes `drawn`: a bell about the peak's share. */
export function flareAt(drawn: number, peak: number, width = 0.012): number {
  return Math.exp(-(((drawn - peak) / width) ** 2));
}

export function momentAt(ms: number, c: Choreography): Moment {
  const flare = (drawn: number) => flareAt(drawn, c.peak, c.flareWidth);
  if (ms < OPENED) {
    const t = Math.max(0, ms) / BEATS.open;
    return {
      beat: 'open',
      shot: between(FLAT, c.open, smooth(t)),
      drawn: 1,
      heads: 0,
      still: 1 - smooth(Math.max(0, ms) / BEATS.lift),
      flare: 0,
    };
  }
  if (ms < REWOUND) {
    const t = (ms - OPENED) / BEATS.rewind;
    return {
      beat: 'rewind',
      shot: travelling(c, ms),
      drawn: 1 - smooth(t),
      heads: smooth(Math.min(1, t * 2)),
      still: 0,
      flare: 0,
    };
  }
  if (ms < DANCED) {
    const drawn = Math.min(1, Math.max(0, c.clock((ms - REWOUND) / BEATS.dance)));
    return {
      beat: 'dance',
      shot: travelling(c, ms),
      drawn,
      heads: 1,
      still: 0,
      flare: flare(drawn),
    };
  }
  if (ms < LANDED) {
    const t = smooth((ms - DANCED) / BEATS.land);
    return {
      beat: 'land',
      shot: between(travelling(c, DANCED), FLAT, t),
      drawn: 1,
      heads: 1 - t,
      still: 0,
      flare: 0,
    };
  }
  if (ms < DURATION) {
    return {
      beat: 'settle',
      shot: FLAT,
      drawn: 1,
      heads: 0,
      still: smooth((ms - LANDED) / BEATS.settle),
      flare: 0,
    };
  }
  return { beat: 'done', shot: FLAT, drawn: 1, heads: 0, still: 1, flare: 0 };
}

/**
 * The dance's own clock, slowed about the closest approach: from a share of the dance's time to a
 * share of the window. Near `peak` the window passes at `rate` of its pace, as a film slows for
 * the moment that matters; elsewhere a little quicker, so the dance keeps its length. Monotone,
 * from 0 to 1, and as smooth as the bell it slows by.
 */
export function slowedAround(
  peak: number,
  width = 0.03,
  rate = 0.25,
  samples = 1024,
): (share: number) => number {
  // The time each slice of the window takes, at a pace that dips by a bell about the peak.
  const elapsed = new Float64Array(samples + 1);
  for (let i = 1; i <= samples; i++) {
    const at = (i - 0.5) / samples;
    const pace = 1 - (1 - rate) * Math.exp(-(((at - peak) / width) ** 2));
    elapsed[i] = elapsed[i - 1] + 1 / pace;
  }
  const total = elapsed[samples];
  return (share) => {
    const time = Math.min(1, Math.max(0, share)) * total;
    let low = 1;
    let high = samples;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (elapsed[middle] < time) low = middle + 1;
      else high = middle;
    }
    const before = elapsed[low - 1];
    const span = elapsed[low] - before;
    return (low - 1 + (span > 0 ? (time - before) / span : 0)) / samples;
  };
}
