import { describe, expect, it } from 'vitest';
import {
  FLAT,
  between,
  containedIn,
  lensFor,
  smooth,
  stillScale,
  toDevice,
  toStage,
  type Shot,
} from './camera';

const PLATE = { width: 3456, height: 2234 };
const DESK = { width: 1440, height: 852 };
const PHONE = { width: 375, height: 760 };

describe('First Light’s camera', () => {
  it.each([
    ['a desk', DESK],
    ['a phone', PHONE],
  ])('draws the flat view on %s exactly where the still lies', (_, stage) => {
    const lens = lensFor(FLAT, stage, PLATE);
    const scale = stillScale(stage, PLATE);
    const left = (stage.width - PLATE.width * scale) / 2;
    const top = (stage.height - PLATE.height * scale) / 2;
    for (const [px, py] of [
      [0, 0],
      [PLATE.width, PLATE.height],
      [812.5, 1999.25],
    ]) {
      // Plate space is centred on the plate; any depth lies flat in the generator's view.
      for (const z of [-900, 0, 1300]) {
        const [x, y] = toStage(lens, stage, px - PLATE.width / 2, py - PLATE.height / 2, z);
        expect(x).toBeCloseTo(left + px * scale, 6);
        expect(y).toBeCloseTo(top + py * scale, 6);
      }
    }
  });

  it('keeps the centre plane at the still’s scale as the lens widens: a dolly zoom', () => {
    const flat = lensFor(FLAT, DESK, PLATE);
    for (const lens of [0.1, 0.4, 0.8]) {
      const wide = lensFor({ ...FLAT, lens }, DESK, PLATE);
      const [x, y] = toDevice(wide, 1200, -700, 0);
      const [fx, fy] = toDevice(flat, 1200, -700, 0);
      expect(x).toBeCloseTo(fx, 9);
      expect(y).toBeCloseTo(fy, 9);
    }
  });

  it('parts what lies nearer from what lies farther once the lens has width', () => {
    const lens = lensFor({ ...FLAT, lens: 0.45 }, DESK, PLATE);
    // Plate space's z runs away from the eye: −500 is nearer, 500 farther.
    const [near, , nearSwell] = toDevice(lens, 800, 0, -500);
    const [far, , farSwell] = toDevice(lens, 800, 0, 500);
    const [plane] = toDevice(lens, 800, 0, 0);
    expect(near).toBeGreaterThan(plane);
    expect(far).toBeLessThan(plane);
    expect(nearSwell).toBeGreaterThan(1);
    expect(farSwell).toBeLessThan(1);
  });

  it('turns without stretching', () => {
    const { rotation: r } = lensFor({ ...FLAT, yaw: 0.9, pitch: -0.4 }, DESK, PLATE);
    const row = (i: number) => [r[i * 3], r[i * 3 + 1], r[i * 3 + 2]];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let i = 0; i < 3; i++) {
      expect(dot(row(i), row(i))).toBeCloseTo(1, 6);
      for (let j = i + 1; j < 3; j++) expect(dot(row(i), row(j))).toBeCloseTo(0, 6);
    }
    // A proper turn, not a mirror.
    const [a, b, c] = [row(0), row(1), row(2)];
    const det =
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    expect(det).toBeCloseTo(1, 6);
  });

  it('brings the right edge toward the eye with yaw, and the top edge with pitch', () => {
    const nearness = (shot: Shot, x: number, y: number) => {
      const { rotation: r } = lensFor(shot, DESK, PLATE);
      return r[6] * x + r[7] * y;
    };
    expect(nearness({ ...FLAT, yaw: 0.5 }, 1000, 0)).toBeGreaterThan(0);
    expect(nearness({ ...FLAT, pitch: 0.5 }, 0, -1000)).toBeGreaterThan(0);
  });

  it('narrows the lens so that nothing in the sculpture passes the eye', () => {
    const radius = 2400;
    const lens = lensFor({ ...FLAT, lens: 5, zoom: 3 }, PHONE, PLATE, radius, 0.35);
    // The nearest point of the sphere stands at least 35 % of the distance from the eye.
    expect(1 - radius * lens.inverseDistance).toBeGreaterThanOrEqual(0.35 - 1e-9);
    // An open lens within the bound is left as it was asked for.
    const open = lensFor({ ...FLAT, lens: 0.2 }, DESK, PLATE, 100);
    expect(open.inverseDistance).toBeCloseTo(0.2 / (DESK.height / 2 / stillScale(DESK, PLATE)), 12);
  });

  it('turns about the event’s own middle once it has found it, and about the plate’s when flat', () => {
    const centre = [400, -250, 30] as const;
    const found = lensFor({ ...FLAT, focus: 1 }, DESK, PLATE, 0, 0.35, centre);
    const [x, y] = toDevice(found, ...centre);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    // The generator's own view ignores the event's middle: its plate stays where the still is.
    const flat = lensFor(FLAT, DESK, PLATE, 0, 0.35, centre);
    expect(toDevice(flat, 0, 0, 0)).toEqual([0, 0, 1]);
  });

  it('lays the flat view on the still wherever the page has put it', () => {
    // The home's plate stands at the top of a phone, beneath where the head will come.
    const box = { x: 0, y: 56, width: 390, height: 520 };
    const still = containedIn(box, PLATE);
    expect(still.width).toBeCloseTo(390, 9);
    expect(still.y).toBeCloseTo(56 + (520 - (390 * PLATE.height) / PLATE.width) / 2, 9);
    const stage = { width: 390, height: 844 };
    const flat = lensFor(FLAT, stage, PLATE, 0, 0.35, [0, 0, 0], still);
    for (const [px, py] of [
      [0, 0],
      [PLATE.width, PLATE.height],
      [2000, 700],
    ]) {
      const [x, y] = toStage(flat, stage, px - PLATE.width / 2, py - PLATE.height / 2, 400);
      expect(x).toBeCloseTo(still.x + (px / PLATE.width) * still.width, 6);
      expect(y).toBeCloseTo(still.y + (py / PLATE.height) * still.height, 6);
    }
    // Once the camera has found the event, the event stands at the stage's centre.
    const found = lensFor({ ...FLAT, focus: 1 }, stage, PLATE, 0, 0.35, [10, 20, 0], still);
    expect(toStage(found, stage, 10, 20, 0)).toEqual([195, 422]);
  });

  it('zooms about the centre', () => {
    const lens = lensFor({ ...FLAT, zoom: 2 }, DESK, PLATE);
    const flat = lensFor(FLAT, DESK, PLATE);
    expect(toDevice(lens, 300, 200, 0)[0]).toBeCloseTo(2 * toDevice(flat, 300, 200, 0)[0], 9);
    expect(lens.pixelScale).toBeCloseTo(2 * flat.pixelScale, 12);
  });

  it('eases without a jolt and mixes shots', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(-1)).toBe(0);
    expect(smooth(2)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5, 12);
    // Flat at both ends: no speed as a move begins or ends.
    expect(smooth(0.001)).toBeLessThan(1e-7);
    expect(1 - smooth(0.999)).toBeLessThan(1e-7);
    const mid = between(FLAT, { yaw: 1, pitch: 2, lens: 0.4, zoom: 3, drift: 0, focus: 1 }, 0.25);
    expect(mid).toEqual({ yaw: 0.25, pitch: 0.5, lens: 0.1, zoom: 1.5, drift: 0.75, focus: 0.25 });
  });
});
