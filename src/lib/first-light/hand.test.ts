import { describe, expect, it } from 'vitest';
import { FLAT } from './camera';
import {
  FLAT_HAND,
  HOLD_MS,
  PITCH_LIMIT,
  PITCH_STEP,
  SLOP_PX,
  SPRING_MS,
  UNTURNED,
  YAW_STEP,
  isMoving,
  isTurned,
  nextHand,
  openingOf,
  shotInHand,
  turnOf,
  type Hand,
} from './hand';

const PER_PIXEL = Math.PI / 1000;

/** A mouse takes the orbit at (500, 300) and draws it `dx`, `dy` CSS pixels. */
function dragged(dx: number, dy: number, from: Hand = FLAT_HAND, at = 0): Hand {
  const held = nextHand(from, { kind: 'grab', x: 500, y: 300, at, touch: false });
  return nextHand(held, {
    kind: 'move',
    x: 500 + dx,
    y: 300 + dy,
    at: at + 16,
    perPixel: PER_PIXEL,
  });
}

describe('the orbit in the hand', () => {
  it('rests in the generator’s view, unturned and closed', () => {
    expect(turnOf(FLAT_HAND, 0)).toEqual(UNTURNED);
    expect(isTurned(FLAT_HAND)).toBe(false);
    expect(isMoving(FLAT_HAND)).toBe(false);
    expect(openingOf(UNTURNED)).toBe(0);
    expect(shotInHand(UNTURNED)).toEqual(FLAT);
  });

  it('turns with the hand: the near side follows it', () => {
    const hand = dragged(100, 50);
    expect(hand.kind).toBe('held');
    const turn = turnOf(hand, 16);
    // Drawn right, the orbit's left comes toward the eye; drawn down, its top does.
    expect(turn.yaw).toBeCloseTo(-100 * PER_PIXEL, 12);
    expect(turn.pitch).toBeCloseTo(50 * PER_PIXEL, 12);
    expect(isTurned(hand)).toBe(true);
  });

  it('stops the tilt short of looking straight down or up', () => {
    expect(turnOf(dragged(0, 10_000), 16).pitch).toBe(PITCH_LIMIT);
    expect(turnOf(dragged(0, -10_000), 16).pitch).toBe(-PITCH_LIMIT);
  });

  it('springs back when let go, without overshoot, and lands exactly on the view', () => {
    const held = dragged(300, -120);
    const from = turnOf(held, 16);
    const springing = nextHand(held, { kind: 'release', at: 100 });
    expect(springing.kind).toBe('springing');
    expect(isMoving(springing)).toBe(true);
    let previous = Math.hypot(from.yaw, from.pitch);
    for (let t = 100; t <= 100 + SPRING_MS; t += 10) {
      const turn = turnOf(springing, t);
      const size = Math.hypot(turn.yaw, turn.pitch);
      // Always on the line back to the view, never past it.
      expect(size).toBeLessThanOrEqual(previous + 1e-12);
      expect(Math.sign(turn.yaw)).not.toBe(-Math.sign(from.yaw));
      previous = size;
    }
    expect(turnOf(springing, 100 + SPRING_MS)).toEqual(UNTURNED);
    expect(nextHand(springing, { kind: 'tick', at: 100 + SPRING_MS })).toBe(FLAT_HAND);
  });

  it('is caught mid-spring where it is', () => {
    const springing = nextHand(dragged(400, 0), { kind: 'release', at: 0 });
    const midway = turnOf(springing, SPRING_MS / 2);
    const caught = nextHand(springing, {
      kind: 'grab',
      x: 10,
      y: 10,
      at: SPRING_MS / 2,
      touch: false,
    });
    expect(caught.kind).toBe('held');
    expect(turnOf(caught, SPRING_MS / 2)).toEqual(midway);
  });

  it('gives the view back at once where motion is unwelcome', () => {
    expect(nextHand(dragged(300, 0), { kind: 'release', at: 0 }, true)).toBe(FLAT_HAND);
    const keyed = nextHand(FLAT_HAND, { kind: 'key', yaw: 1, pitch: 0, at: 0 });
    expect(nextHand(keyed, { kind: 'back', at: 0 }, true)).toBe(FLAT_HAND);
  });

  it('takes a finger only after a hold, so a swipe still scrolls', () => {
    const pressing = nextHand(FLAT_HAND, { kind: 'grab', x: 0, y: 0, at: 0, touch: true });
    expect(pressing.kind).toBe('pressing');
    expect(isMoving(pressing)).toBe(true);
    expect(isTurned(pressing)).toBe(false);
    // Before the hold, a finger that travels has begun to scroll the page.
    expect(
      nextHand(pressing, { kind: 'move', x: 0, y: SLOP_PX + 1, at: 50, perPixel: PER_PIXEL }),
    ).toBe(FLAT_HAND);
    // A small tremor is not a scroll.
    expect(
      nextHand(pressing, { kind: 'move', x: 1, y: SLOP_PX - 2, at: 50, perPixel: PER_PIXEL }).kind,
    ).toBe('pressing');
    // Lifted before the hold, it was a tap.
    expect(nextHand(pressing, { kind: 'release', at: 100 })).toBe(FLAT_HAND);
    expect(nextHand(pressing, { kind: 'tick', at: HOLD_MS - 1 }).kind).toBe('pressing');
    const held = nextHand(pressing, { kind: 'tick', at: HOLD_MS });
    expect(held.kind).toBe('held');
    const turned = nextHand(held, {
      kind: 'move',
      x: 200,
      y: 0,
      at: HOLD_MS + 16,
      perPixel: PER_PIXEL,
    });
    expect(turnOf(turned, HOLD_MS + 16).yaw).toBeCloseTo(-200 * PER_PIXEL, 12);
  });

  it('turns by keys in steps, three at a time with Shift, and stays where it is put', () => {
    const once = nextHand(FLAT_HAND, { kind: 'key', yaw: 1, pitch: 0, at: 0 });
    expect(once.kind).toBe('turned');
    expect(turnOf(once, 10_000)).toEqual({ yaw: YAW_STEP, pitch: 0 });
    expect(isMoving(once)).toBe(false);
    const thrice = nextHand(once, { kind: 'key', yaw: 0, pitch: -3, at: 10 });
    expect(turnOf(thrice, 10).pitch).toBeCloseTo(-3 * PITCH_STEP, 12);
    const back = nextHand(thrice, { kind: 'back', at: 20 });
    expect(back.kind).toBe('springing');
    // Asked back from the view itself, nothing happens.
    expect(nextHand(FLAT_HAND, { kind: 'back', at: 0 })).toBe(FLAT_HAND);
  });

  it('opens the depth as the turn grows, fully past about twenty degrees', () => {
    expect(openingOf({ yaw: 0.01, pitch: 0 })).toBeLessThan(0.01);
    expect(openingOf({ yaw: 0.2, pitch: 0 })).toBeGreaterThan(0.3);
    expect(openingOf({ yaw: 0.35, pitch: 0 })).toBe(1);
    expect(openingOf({ yaw: 0, pitch: -1 })).toBe(1);
    const open = shotInHand({ yaw: 0.6, pitch: 0.2 });
    expect(open).toMatchObject({ yaw: 0.6, pitch: 0.2, drift: 0, focus: 1 });
    expect(open.lens).toBeCloseTo(0.42, 12);
    expect(open.zoom).toBeCloseTo(0.9, 12);
  });
});
