import { smooth, type Shot } from './camera';

/*
  The orbit in the hand (docs/first-light.md §14): how the work page's orbit is turned, and how it
  is given back.

  The generator turned the event and drew it flat. A hand turns it again, in depth, about the
  event's own middle. When the hand lets go, the orbit springs back to the generator's view, where
  it meets the still. Keys turn it in steps and leave it where they put it, until it is asked back.

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
  | { readonly kind: 'springing'; readonly from: Turn; readonly since: number };

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
  | { kind: 'back'; at: number };

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
    default:
      return UNTURNED;
  }
}

/** Given back to the generator's view: by a spring, or at once where motion is unwelcome. */
function giveBack(turn: Turn, at: number, still: boolean): Hand {
  if (still || (turn.yaw === 0 && turn.pitch === 0)) return FLAT_HAND;
  return { kind: 'springing', from: turn, since: at };
}

/**
 * The hand after a gesture. `still` (reduced motion, the visitor's pause, the hush) gives the
 * orbit back in one step: the view returns, but nothing moves to get there.
 */
export function nextHand(hand: Hand, gesture: Gesture, still = false): Hand {
  switch (gesture.kind) {
    case 'grab': {
      if (gesture.touch)
        return { kind: 'pressing', since: gesture.at, x: gesture.x, y: gesture.y, under: hand };
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
      if (hand.kind === 'held') return giveBack(hand.turn, gesture.at, still);
      return hand;
    case 'tick':
      if (hand.kind === 'pressing' && gesture.at - hand.since >= HOLD_MS) {
        const from = turnOf(hand.under, gesture.at);
        return { kind: 'held', turn: from, from, x: hand.x, y: hand.y };
      }
      if (hand.kind === 'springing' && gesture.at - hand.since >= SPRING_MS) return FLAT_HAND;
      return hand;
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
      return base;
    }
  }
}

/** Whether the hand is somewhere other than the generator's view. */
export function isTurned(hand: Hand): boolean {
  const base = hand.kind === 'pressing' ? hand.under : hand;
  return base.kind !== 'flat';
}

/** Whether the hand still changes with time: a hold being waited for, or a spring under way. */
export function isMoving(hand: Hand): boolean {
  return hand.kind === 'pressing' || hand.kind === 'springing';
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
