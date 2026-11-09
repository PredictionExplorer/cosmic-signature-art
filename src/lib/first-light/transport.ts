/*
  The orbit section's clock (docs/first-light.md §14): where in the Light film the drawing stands,
  in seconds of the film.

  - It plays at the film's own pace, or, asked for the closest approach, at a quarter of that pace
    as the bodies pass it, as a film slows for the moment that matters.
  - It rests wherever it is put.
  - A slider sets it at once, either way. Let go, it plays on if it was playing.

  This module is pure. The section advances it each frame and draws the moment it reads back.
*/

export type Transport =
  | { readonly kind: 'resting'; readonly seconds: number }
  /** `slowAt` is the film's second at which time slows, or null at the film's own pace. */
  | { readonly kind: 'playing'; readonly seconds: number; readonly slowAt: number | null }
  /** Held by the slider; `resume` plays on when it is let go. */
  | {
      readonly kind: 'scrubbing';
      readonly seconds: number;
      readonly resume: boolean;
      readonly slowAt: number | null;
    };

/** About the closest approach the film passes at a quarter of its pace… */
export const SLOWED_RATE = 0.25;
/** …slowing over about this many seconds of film either side. */
export const SLOWED_WIDTH = 0.6;
/** The closest approach is played from this many seconds of film before it. */
export const CLOSEST_LEAD = 2;
/** Steps of the visitor's time no longer than this, so the slowing is followed closely. */
const SUBSTEP = 1 / 240;

/** How fast the film passes at `seconds`, as a share of its own pace. */
export function rateAt(seconds: number, slowAt: number | null): number {
  if (slowAt === null) return 1;
  return 1 - (1 - SLOWED_RATE) * Math.exp(-(((seconds - slowAt) / SLOWED_WIDTH) ** 2));
}

/** Resting at a moment of a film `film` seconds long. */
export function restingAt(seconds: number, film: number): Transport {
  return { kind: 'resting', seconds: Math.min(film, Math.max(0, seconds)) };
}

/** Playing on from where it stands; from the beginning once it has reached the end. */
export function play(transport: Transport, film: number): Transport {
  const from = transport.seconds >= film ? 0 : transport.seconds;
  const slowAt = transport.kind === 'resting' ? null : transport.slowAt;
  return { kind: 'playing', seconds: from, slowAt };
}

/** Resting where it stands. */
export function pause(transport: Transport): Transport {
  return { kind: 'resting', seconds: transport.seconds };
}

/** The clock after `elapsed` seconds of the visitor's time; it rests once the film has ended. */
export function advance(transport: Transport, elapsed: number, film: number): Transport {
  if (transport.kind !== 'playing') return transport;
  let seconds = transport.seconds;
  let left = Math.max(0, elapsed);
  while (left > 0 && seconds < film) {
    const dt = Math.min(left, SUBSTEP);
    seconds += dt * rateAt(seconds, transport.slowAt);
    left -= dt;
  }
  if (seconds >= film) return { kind: 'resting', seconds: film };
  return { ...transport, seconds };
}

/** Held by the slider at `seconds`. */
export function scrub(transport: Transport, seconds: number, film: number): Transport {
  return {
    kind: 'scrubbing',
    seconds: Math.min(film, Math.max(0, seconds)),
    resume: transport.kind === 'playing' || (transport.kind === 'scrubbing' && transport.resume),
    slowAt: transport.kind === 'resting' ? null : transport.slowAt,
  };
}

/** Let go by the slider: playing on if it was playing, and not at the end; else resting. */
export function letGo(transport: Transport, film: number): Transport {
  if (transport.kind !== 'scrubbing') return transport;
  if (transport.resume && transport.seconds < film)
    return { kind: 'playing', seconds: transport.seconds, slowAt: transport.slowAt };
  return { kind: 'resting', seconds: transport.seconds };
}

/**
 * The closest approach: played from a little before it, slowing as the bodies pass. Where motion
 * is unwelcome it rests on the closest approach itself.
 */
export function toClosest(closest: number, still: boolean): Transport {
  if (still) return { kind: 'resting', seconds: closest };
  return { kind: 'playing', seconds: Math.max(0, closest - CLOSEST_LEAD), slowAt: closest };
}
