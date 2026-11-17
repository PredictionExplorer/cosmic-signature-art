import { describe, expect, it } from 'vitest';
import { FLAT } from './camera';
import {
  FLAT_HAND,
  HOLD_MS,
  PITCH_LIMIT,
  PITCH_STEP,
  SETTLE_MS,
  SLOP_PX,
  SPRING_MS,
  UNTURNED,
  YAW_STEP,
  isMoving,
  isTurned,
  nextHand,
  openingOf,
  restingTurn,
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

  // The home's exhibit (src/components/orbit-depth.tsx): a turn that stays, and a led turn.
  describe('as an exhibit of its own', () => {
    const STAYS = true;

    it('rests where the hand leaves it, and returns only when it is asked back', () => {
      const held = dragged(300, -120);
      const turn = turnOf(held, 16);
      const left = nextHand(held, { kind: 'release', at: 20 }, false, STAYS);
      expect(left).toEqual({ kind: 'turned', turn });
      expect(isMoving(left)).toBe(false);
      expect(turnOf(left, 60_000)).toEqual(turn);
      // Asked back, it springs as the work page's does.
      const back = nextHand(left, { kind: 'back', at: 100 }, false, STAYS);
      expect(back.kind).toBe('springing');
      expect(nextHand(back, { kind: 'tick', at: 100 + SPRING_MS }, false, STAYS)).toBe(FLAT_HAND);
      // A press released where it began leaves the generator's view as it was, not a turn of nothing.
      const pressed = nextHand(FLAT_HAND, { kind: 'grab', x: 5, y: 5, at: 0, touch: false });
      expect(nextHand(pressed, { kind: 'release', at: 10 }, false, STAYS)).toBe(FLAT_HAND);
    });

    it('never rests part-open: a turn being opened goes on, one being closed goes back', () => {
      // Twenty degrees is where the depth stands fully open: farther out a turn rests as it is.
      const far = { yaw: 0.5, pitch: -0.3 };
      expect(restingTurn(far)).toBe(far);
      expect(openingOf(far)).toBe(1);
      // Nearer, and brought there from the picture's view, it goes on the same way to where the
      // depth is open; hardly moved at all, it is the picture's view still.
      const out = restingTurn({ yaw: 0.12, pitch: -0.16 });
      expect(Math.hypot(out.yaw, out.pitch)).toBeCloseTo(0.35, 12);
      expect(out.yaw / out.pitch).toBeCloseTo(0.12 / -0.16, 12);
      expect(openingOf(out)).toBe(1);
      expect(restingTurn({ yaw: 0.01, pitch: 0.01 })).toBe(UNTURNED);
      expect(restingTurn(UNTURNED)).toBe(UNTURNED);
      // Brought there from farther out, it was being closed: it goes back to the picture.
      expect(restingTurn({ yaw: 0.2, pitch: 0 }, { yaw: 0.6, pitch: 0 })).toBe(UNTURNED);
      // Caught part-way and let go where it was: on if it was mostly open, back if not.
      const most = { yaw: 0.3, pitch: 0 };
      const little = { yaw: 0.1, pitch: 0 };
      expect(restingTurn(most, most).yaw).toBeCloseTo(0.35, 12);
      expect(restingTurn(little, little)).toBe(UNTURNED);

      // A hand that lets go part-open: the orbit is led on, and rests fully open.
      const held = dragged(-70, 0);
      expect(openingOf(turnOf(held, 16))).toBeLessThan(1);
      const left = nextHand(held, { kind: 'release', at: 20 }, false, STAYS);
      expect(left).toMatchObject({ kind: 'led', since: 20, ms: SETTLE_MS });
      const rested = nextHand(left, { kind: 'tick', at: 20 + SETTLE_MS }, false, STAYS);
      expect(rested.kind).toBe('turned');
      expect(openingOf(turnOf(rested, 1_000))).toBe(1);
      expect(turnOf(rested, 1_000).yaw).toBeCloseTo(0.35, 12);
      // Where motion is unwelcome it is there in one step.
      expect(nextHand(held, { kind: 'release', at: 20 }, true, STAYS)).toEqual(rested);
      // Drawn back toward the picture and let go, it lands on the picture.
      const back = dragged(60, 0, { kind: 'turned', turn: { yaw: 0.5, pitch: 0 } });
      const closing = nextHand(back, { kind: 'release', at: 20 }, false, STAYS);
      expect(closing).toMatchObject({ kind: 'led', to: UNTURNED });
      expect(nextHand(closing, { kind: 'tick', at: 20 + SETTLE_MS }, false, STAYS)).toBe(FLAT_HAND);
      // A lead that would end part-open ends where it may rest, too.
      const stepped = nextHand(
        { kind: 'turned', turn: { yaw: 0.62, pitch: -0.26 } },
        { kind: 'lead', to: { yaw: 0.1, pitch: -0.26 }, ms: 300, at: 0 },
        false,
        STAYS,
      );
      expect(nextHand(stepped, { kind: 'tick', at: 300 }, false, STAYS)).toBe(FLAT_HAND);
      // On a work's page nothing of this applies: the hand springs back, the lead ends as asked.
      expect(nextHand(held, { kind: 'release', at: 20 }).kind).toBe('springing');
      const asked = nextHand(FLAT_HAND, {
        kind: 'lead',
        to: { yaw: 0.1, pitch: 0 },
        ms: 100,
        at: 0,
      });
      expect(turnOf(nextHand(asked, { kind: 'tick', at: 100 }), 100)).toEqual({
        yaw: 0.1,
        pitch: 0,
      });
    });

    it('is where it was going at once when motion becomes unwelcome under way', () => {
      const to = { yaw: 0.62, pitch: -0.26 };
      const led = nextHand(FLAT_HAND, { kind: 'lead', to, ms: 1000, at: 0 }, false, STAYS);
      expect(nextHand(led, { kind: 'tick', at: 300 }, true, STAYS)).toEqual({
        kind: 'turned',
        turn: to,
      });
      const back = nextHand({ kind: 'turned', turn: to }, { kind: 'back', at: 0 }, false, STAYS);
      expect(nextHand(back, { kind: 'tick', at: 100 }, true, STAYS)).toBe(FLAT_HAND);
      // The work page's spring is its own: it runs its course.
      expect(nextHand(back, { kind: 'tick', at: 100 }, true)).toBe(back);
    });

    it('lets a second finger wait over what the first found, never over the first’s wait', () => {
      const turned: Hand = { kind: 'turned', turn: { yaw: 0.6, pitch: 0 } };
      const first = nextHand(turned, { kind: 'grab', x: 10, y: 10, at: 0, touch: true });
      const second = nextHand(first, { kind: 'grab', x: 90, y: 10, at: 40, touch: true });
      expect(second).toMatchObject({ kind: 'pressing', since: 40, under: turned });
      // Both lift: the hand is what it was, and no hold arrives for a finger that has gone.
      const lifted = nextHand(second, { kind: 'release', at: 80 });
      expect(lifted).toBe(turned);
      expect(nextHand(lifted, { kind: 'tick', at: 80 + HOLD_MS })).toBe(turned);
    });

    it('is led from one turn to another without a hand, and rests where it is led', () => {
      const to = { yaw: 0.62, pitch: -0.26 };
      const led = nextHand(FLAT_HAND, { kind: 'lead', to, ms: 1000, at: 0 });
      expect(led.kind).toBe('led');
      expect(isMoving(led)).toBe(true);
      expect(isTurned(led)).toBe(true);
      expect(turnOf(led, 0)).toEqual(UNTURNED);
      // Half way in time is half way round: the ease is even about its middle.
      expect(turnOf(led, 500).yaw).toBeCloseTo(0.31, 12);
      expect(turnOf(led, 500).pitch).toBeCloseTo(-0.13, 12);
      // It never passes where it is led, and lands there exactly.
      for (let at = 0; at <= 1000; at += 50) {
        expect(turnOf(led, at).yaw).toBeLessThanOrEqual(to.yaw);
        expect(turnOf(led, at).yaw).toBeGreaterThanOrEqual(0);
      }
      expect(turnOf(led, 5000)).toEqual(to);
      const rested = nextHand(led, { kind: 'tick', at: 1000 });
      expect(rested).toEqual({ kind: 'turned', turn: to });
      // Led on from where it rests: a button's step round.
      const stepped = nextHand(rested, {
        kind: 'lead',
        to: { yaw: 1, pitch: -0.26 },
        ms: 300,
        at: 2000,
      });
      expect(turnOf(stepped, 2000)).toEqual(to);
      expect(turnOf(nextHand(stepped, { kind: 'tick', at: 2300 }), 2300).yaw).toBe(1);
      // Led to the generator's view, it ends flat: the still stands alone again.
      const home = nextHand(rested, { kind: 'lead', to: UNTURNED, ms: 300, at: 3000 });
      expect(nextHand(home, { kind: 'tick', at: 3300 })).toBe(FLAT_HAND);
    });

    it('is led in one step where motion is unwelcome, and never past the tilt’s limit', () => {
      const to = { yaw: 0.62, pitch: -0.26 };
      expect(nextHand(FLAT_HAND, { kind: 'lead', to, ms: 1000, at: 0 }, true)).toEqual({
        kind: 'turned',
        turn: to,
      });
      expect(nextHand(FLAT_HAND, { kind: 'lead', to, ms: 0, at: 0 })).toEqual({
        kind: 'turned',
        turn: to,
      });
      expect(nextHand(FLAT_HAND, { kind: 'lead', to: UNTURNED, ms: 1000, at: 0 }, true)).toBe(
        FLAT_HAND,
      );
      const steep = nextHand(FLAT_HAND, { kind: 'lead', to: { yaw: 0, pitch: 9 }, ms: 100, at: 0 });
      expect(turnOf(steep, 100).pitch).toBe(PITCH_LIMIT);
    });

    it('is caught where it is by a hand, a key or a call back, and leads nothing out of a hand', () => {
      const to = { yaw: 0.6, pitch: 0 };
      const led = nextHand(FLAT_HAND, { kind: 'lead', to, ms: 1000, at: 0 });
      // A hand catches it mid-way: nothing jumps.
      const caught = nextHand(led, { kind: 'grab', x: 0, y: 0, at: 500, touch: false });
      expect(caught.kind).toBe('held');
      expect(turnOf(caught, 500).yaw).toBeCloseTo(0.3, 12);
      // A hand that holds it keeps it: a lead is refused, by a finger still waiting too.
      expect(nextHand(caught, { kind: 'lead', to, ms: 100, at: 600 })).toBe(caught);
      const pressing = nextHand(FLAT_HAND, { kind: 'grab', x: 0, y: 0, at: 0, touch: true });
      expect(nextHand(pressing, { kind: 'lead', to, ms: 100, at: 10 })).toBe(pressing);
      // A key steps on from where it stands.
      const keyed = nextHand(led, { kind: 'key', yaw: 1, pitch: 0, at: 500 });
      expect(turnOf(keyed, 500).yaw).toBeCloseTo(0.3 + YAW_STEP, 12);
      // Asked back mid-way, it springs from where it stands.
      const back = nextHand(led, { kind: 'back', at: 500 });
      expect(back).toMatchObject({ kind: 'springing', since: 500 });
      expect(turnOf(back, 500).yaw).toBeCloseTo(0.3, 12);
      // A finger that waits over a led orbit takes it, where it has been led to by then.
      const waiting = nextHand(led, { kind: 'grab', x: 0, y: 0, at: 200, touch: true });
      expect(turnOf(waiting, 500).yaw).toBeCloseTo(0.3, 12);
      const taken = nextHand(waiting, { kind: 'tick', at: 200 + HOLD_MS });
      expect(taken.kind).toBe('held');
    });
  });
});
