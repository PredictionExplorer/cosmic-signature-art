import { smooth, type Shot } from './camera';

/*
  The orbit in the hand (docs/first-light.md §14): how the work page's orbit is turned, and how it
  is given back.

  The generator turned the event and drew it flat. A hand turns it again, in depth, about the
  event's own middle. When the hand lets go, the orbit springs back to the generator's view, where
  it meets the still. Keys turn it in steps and leave it where they put it, until it is asked back.

  On the home the orbit is an exhibit of its own (src/components/orbit-depth.tsx): there a turn
  stays where the hand leaves it (`stays`), and the orbit can be led from one turn to another
  without a hand, as it opens into depth and as a button steps it round. A turn that stays never
  rests part-open, where the still and the drawing would lie over each other: it goes on to
  where the depth stands open, or back to the picture's view (`restingTurn`).

  This module is pure. The section feeds it what the visitor does and the time, and draws the
  turn it reads back.
*/

/** How far the camera is turned from the generator's view, in radians. */
export interface Turn {
  readonly yaw: number;
  readonly pitch: number;
}

export const UNTURNED: Turn = { yaw: 0, pitch: 0 };

/** Touch takes the orbit only after a hold this long, so a swipe still scrolls the page. */
export const HOLD_MS = 300;
/** A finger that travels this far before the hold has begun to scroll the page instead. */
export const SLOP_PX = 8;
/** The way back to the generator's view. */
export const SPRING_MS = 700;
/** The camera stops short of looking straight down on the event, or straight up at it. */
export const PITCH_LIMIT = (80 * Math.PI) / 180;
/** One press of an arrow turns or tilts this far; Shift turns three times as far. */
export const YAW_STEP = (15 * Math.PI) / 180;
export const PITCH_STEP = (10 * Math.PI) / 180;
/** The depth opens fully once the turn passes this far, about twenty degrees. */
const OPENED = 0.35;
/** A turn left where it stays goes on to a place it may rest, in this long. */
export const SETTLE_MS = 260;

/** Where the hand has the orbit. */
export type Hand =
  | { readonly kind: 'flat' }
  /** A finger is down and waiting for the hold; `under` is the hand it found. */
  | {
      readonly kind: 'pressing';
      readonly since: number;
      readonly x: number;
      readonly y: number;
      readonly under: Hand;
    }
  /** Held: turned from `from` by the hand's travel since it took hold at (x, y). */
  | {
      readonly kind: 'held';
      readonly turn: Turn;
      readonly from: Turn;
      readonly x: number;
      readonly y: number;
    }
  /** Put there by keys, and left there. */
  | { readonly kind: 'turned'; readonly turn: Turn }
  /** On its way back to the generator's view. */
  | { readonly kind: 'springing'; readonly from: Turn; readonly since: number }
  /** Led from one turn to another over `ms`, with no hand on it: it rests where it is led. */
  | {
      readonly kind: 'led';
      readonly from: Turn;
      readonly to: Turn;
      readonly since: number;
      readonly ms: number;
    };

export const FLAT_HAND: Hand = { kind: 'flat' };

/** What the visitor does, with the time it happens, in milliseconds. */
export type Gesture =
  | { kind: 'grab'; x: number; y: number; at: number; touch: boolean }
  /** `perPixel` is how far the orbit turns, in radians, for each CSS pixel the hand travels. */
  | { kind: 'move'; x: number; y: number; at: number; perPixel: number }
  | { kind: 'release'; at: number }
  | { kind: 'tick'; at: number }
  /** Arrow presses: steps of yaw and of pitch, three to a press with Shift. */
  | { kind: 'key'; yaw: number; pitch: number; at: number }
  | { kind: 'back'; at: number }
  /** Lead the orbit to a turn over `ms`: an opening into depth, or a button's step round. */
  | { kind: 'lead'; to: Turn; ms: number; at: number };

const clampPitch = (pitch: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

/** The turn the hand gives the orbit at `at`. */
export function turnOf(hand: Hand, at: number): Turn {
  switch (hand.kind) {
    case 'held':
    case 'turned':
      return hand.turn;
    case 'pressing':
      return turnOf(hand.under, at);
    case 'springing': {
      const left = 1 - smooth((at - hand.since) / SPRING_MS);
      return left <= 0 ? UNTURNED : { yaw: hand.from.yaw * left, pitch: hand.from.pitch * left };
    }
    case 'led': {
      const share = smooth((at - hand.since) / hand.ms);
      if (share >= 1) return hand.to;
      return {
        yaw: hand.from.yaw + (hand.to.yaw - hand.from.yaw) * share,
        pitch: hand.from.pitch + (hand.to.pitch - hand.from.pitch) * share,
      };
    }
    default:
      return UNTURNED;
  }
}

/** A turn at rest: the generator's view where it is no turn at all. */
function resting(turn: Turn): Hand {
  return turn.yaw === 0 && turn.pitch === 0 ? FLAT_HAND : { kind: 'turned', turn };
}

/**
 * Where a turn that stays may rest, for an orbit brought to `turn` from `from`. Within twenty
 * degrees of the generator's view the depth is part-open and the drawing lies half over the
 * still, which is no place to stop: an orbit being opened goes on, the same way, to where the
 * depth stands open, and one being closed goes back to the picture's view. Farther out it
 * rests where it is put.
 */
export function restingTurn(turn: Turn, from: Turn = UNTURNED): Turn {
  const far = Math.hypot(turn.yaw, turn.pitch);
  if (far >= OPENED) return turn;
  const was = Math.hypot(from.yaw, from.pitch);
  // Hardly moved from the picture's view, or on its way back to it.
  const closing = far < was || (far === was && far < OPENED / 2);
  if (far < OPENED / 16 || closing) return UNTURNED;
  const out = OPENED / far;
  return { yaw: turn.yaw * out, pitch: turn.pitch * out };
}

/** Given back to the generator's view: by a spring, or at once where motion is unwelcome. */
function giveBack(turn: Turn, at: number, still: boolean): Hand {
  if (still || (turn.yaw === 0 && turn.pitch === 0)) return FLAT_HAND;
  return { kind: 'springing', from: turn, since: at };
}

/**
 * The hand after a gesture. `still` (reduced motion, the visitor's pause, the hush) gives the
 * orbit back, or leads it, in one step: the view changes, but nothing moves to get there.
 * `stays` leaves a turn where the hand lets it go: it returns only when it is asked back.
 */
export function nextHand(hand: Hand, gesture: Gesture, still = false, stays = false): Hand {
  switch (gesture.kind) {
    case 'grab': {
      if (gesture.touch)
        return {
          kind: 'pressing',
          since: gesture.at,
          x: gesture.x,
          y: gesture.y,
          // A second finger waits over what the first found, never over the first's own wait.
          under: hand.kind === 'pressing' ? hand.under : hand,
        };
      // A grab mid-spring catches the orbit where it is.
      const from = turnOf(hand, gesture.at);
      return { kind: 'held', turn: from, from, x: gesture.x, y: gesture.y };
    }
    case 'move': {
      if (hand.kind === 'pressing') {
        const travelled = Math.hypot(gesture.x - hand.x, gesture.y - hand.y);
        return travelled > SLOP_PX ? hand.under : hand;
      }
      if (hand.kind !== 'held') return hand;
      // The near side follows the hand: drawn right, the orbit's left comes toward the eye;
      // drawn down, its top does.
      const turn = {
        yaw: hand.from.yaw - (gesture.x - hand.x) * gesture.perPixel,
        pitch: clampPitch(hand.from.pitch + (gesture.y - hand.y) * gesture.perPixel),
      };
      return { ...hand, turn };
    }
    case 'release':
      if (hand.kind === 'pressing') return hand.under;
      if (hand.kind === 'held') {
        if (!stays) return giveBack(hand.turn, gesture.at, still);
        // Left part-open, it goes on to where it may rest.
        const to = restingTurn(hand.turn, hand.from);
        if (still || (to.yaw === hand.turn.yaw && to.pitch === hand.turn.pitch)) return resting(to);
        return { kind: 'led', from: hand.turn, to, since: gesture.at, ms: SETTLE_MS };
      }
      return hand;
    case 'tick':
      if (hand.kind === 'pressing' && gesture.at - hand.since >= HOLD_MS) {
        const from = turnOf(hand.under, gesture.at);
        return { kind: 'held', turn: from, from, x: hand.x, y: hand.y };
      }
      if (hand.kind === 'springing' && gesture.at - hand.since >= SPRING_MS) return FLAT_HAND;
      // Where motion has become unwelcome under way, an orbit that stays is where it was going.
      if (hand.kind === 'springing' && still && stays) return FLAT_HAND;
      if (hand.kind === 'led' && (still || gesture.at - hand.since >= hand.ms))
        return resting(hand.to);
      return hand;
    case 'lead': {
      // A hand that has the orbit keeps it: nothing leads it out from under a finger.
      if (hand.kind === 'held' || hand.kind === 'pressing') return hand;
      const from = turnOf(hand, gesture.at);
      const asked = { yaw: gesture.to.yaw, pitch: clampPitch(gesture.to.pitch) };
      const to = stays ? restingTurn(asked, from) : asked;
      if (still || !(gesture.ms > 0)) return resting(to);
      return { kind: 'led', from, to, since: gesture.at, ms: gesture.ms };
    }
    case 'key': {
      const base = turnOf(hand, gesture.at);
      return {
        kind: 'turned',
        turn: {
          yaw: base.yaw + gesture.yaw * YAW_STEP,
          pitch: clampPitch(base.pitch + gesture.pitch * PITCH_STEP),
        },
      };
    }
    case 'back': {
      const base = hand.kind === 'pressing' ? hand.under : hand;
      if (base.kind === 'held' || base.kind === 'turned')
        return giveBack(base.turn, gesture.at, still);
      if (base.kind === 'led') return giveBack(turnOf(base, gesture.at), gesture.at, still);
      return base;
    }
  }
}

/** Whether the hand is somewhere other than the generator's view. */
export function isTurned(hand: Hand): boolean {
  const base = hand.kind === 'pressing' ? hand.under : hand;
  return base.kind !== 'flat';
}

/**
 * Whether the hand still changes with time: a hold being waited for, a spring under way, or
 * the orbit being led.
 */
export function isMoving(hand: Hand): boolean {
  return hand.kind === 'pressing' || hand.kind === 'springing' || hand.kind === 'led';
}

/** How open the depth is, 0 to 1: closed at the generator's view, fully open past twenty degrees. */
export function openingOf(turn: Turn): number {
  return smooth(Math.hypot(turn.yaw, turn.pitch) / OPENED);
}

/**
 * The camera for a turn. Small turns keep the generator's flat lens and its drift, so the first
 * moment of a hold looks like the still turning. Past twenty degrees the lens has opened into
 * depth and the camera turns about the event's own middle, as First Light's does.
 */
export function shotInHand(turn: Turn): Shot {
  const open = openingOf(turn);
  return {
    yaw: turn.yaw,
    pitch: turn.pitch,
    lens: 0.42 * open,
    zoom: 1 - 0.1 * open,
    drift: 1 - open,
    focus: open,
  };
}
