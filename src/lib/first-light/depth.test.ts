import { describe, expect, it } from 'vitest';
import { FLAT, containedIn, lensFor, toDevice, type Shot, type Size } from './camera';
import {
  DEPTH_BEATS,
  OPEN_TURN,
  TRAVEL,
  depthDuration,
  depthMoment,
  driftedBounds,
  fillFor,
  holdOnStage,
  shotInDepth,
  travelAt,
} from './depth';
import { PITCH_LIMIT, UNTURNED } from './hand';
import type { PlateSpace } from './samples';

const STEPS = 1_000_000;
const SECONDS = 30;
/** A film that draws its steps evenly, for a clock that is easy to read. */
const evenly = (into: number) => Math.round((into / SECONDS) * (STEPS - 1));
const at = (ms: number) => depthMoment(ms, STEPS, SECONDS, evenly);
const REWOUND = DEPTH_BEATS.hold + DEPTH_BEATS.rewind;

describe('the orbit in depth, as the home performs it', () => {
  it('holds the whole picture, runs its light back into three bodies, then plays the window', () => {
    // As it opens, the window stands whole and no body burns: it is the picture, in depth.
    expect(at(0)).toEqual({ beat: 'hold', step: STEPS - 1, heads: 0, played: 0 });
    expect(at(DEPTH_BEATS.hold - 1).beat).toBe('hold');
    // The light runs back along its paths, and the bodies light as it goes.
    const back = at(DEPTH_BEATS.hold + DEPTH_BEATS.rewind / 2);
    expect(back.beat).toBe('rewind');
    expect(back.step).toBeCloseTo((STEPS - 1) / 2, 6);
    expect(back.heads).toBe(1);
    expect(at(DEPTH_BEATS.hold).step).toBe(STEPS - 1);
    expect(at(REWOUND - 1).step).toBeLessThan(1);
    // Then the window again, at the film's own pace.
    expect(at(REWOUND)).toEqual({ beat: 'window', step: 0, heads: 1, played: 0 });
    const half = at(REWOUND + (SECONDS * 1000) / 2);
    expect(half.beat).toBe('window');
    expect(half.step).toBe(evenly(SECONDS / 2));
    expect(half.played).toBeCloseTo(0.5, 12);
    // At rest the window is whole, the bodies where its last step leaves them.
    expect(at(depthDuration(SECONDS))).toEqual({
      beat: 'rest',
      step: STEPS - 1,
      heads: 1,
      played: 1,
    });
    expect(at(1e9).beat).toBe('rest');
    expect(depthDuration(SECONDS)).toBe(REWOUND + SECONDS * 1000);
  });

  it('never runs the window backward as it plays, nor past its last step', () => {
    let last = -1;
    for (let ms = REWOUND; ms <= depthDuration(SECONDS); ms += 250) {
      const { step } = at(ms);
      expect(step).toBeGreaterThanOrEqual(last);
      expect(step).toBeLessThanOrEqual(STEPS - 1);
      last = step;
    }
  });

  it('carries the camera round as the window plays: never still, never hurried, never back', () => {
    expect(travelAt(0)).toBe(0);
    expect(travelAt(1)).toBeCloseTo(TRAVEL, 12);
    expect(travelAt(0.5)).toBeCloseTo(TRAVEL / 2, 12);
    expect(travelAt(-1)).toBe(0);
    expect(travelAt(2)).toBeCloseTo(TRAVEL, 12);
    for (let share = 0.05; share <= 1; share += 0.05)
      expect(travelAt(share)).toBeGreaterThan(travelAt(share - 0.05));
  });

  it('is the generator’s own flat view unturned, and opens about the figure’s middle', () => {
    expect(shotInDepth(UNTURNED)).toEqual(FLAT);
    const open = shotInDepth(OPEN_TURN);
    expect(open).toMatchObject({ ...OPEN_TURN, zoom: 1, focus: 1 });
    expect(open.lens).toBeCloseTo(0.42, 12);
    // The camera's drift is kept at every turn: what turns is the picture's own figure.
    for (const yaw of [0, 0.1, 0.35, 1, 3]) expect(shotInDepth({ yaw, pitch: 0 }).drift).toBe(1);
    // A stage taller than the picture brings the figure nearer, only once it has opened.
    expect(shotInDepth(UNTURNED, 1.6).zoom).toBe(1);
    expect(shotInDepth(OPEN_TURN, 1.6).zoom).toBeCloseTo(1.6, 12);
    expect(fillFor(900, 600)).toBeCloseTo(1.38, 12);
    expect(fillFor(600, 600)).toBe(1);
    expect(fillFor(4000, 600)).toBe(1.6);
    expect(fillFor(600, 0)).toBe(1.6);
  });

  it('finds the figure with its drift: its middle, and how far it reaches', () => {
    // Two samples of three bodies; the second is carried 10 across and 4 into depth.
    const points = new Float32Array([
      ...[-1, 0, 0, 1, 0, 0, 0, 2, 0],
      ...[-1, 0, 0, 1, 0, 0, 0, 2, 0],
    ]);
    const drift = new Float32Array([0, 0, 0, 10, 0, 4]);
    const { centre, radius } = driftedBounds({ points, drift, count: 2 });
    expect(centre).toEqual([5, 1, 2]);
    expect(radius).toBeCloseTo(Math.hypot(11, 0, 4), 6);
    // Without a drift it is the bodies' own box.
    expect(driftedBounds({ points, drift: new Float32Array(6), count: 2 }).centre).toEqual([
      0, 1, 0,
    ]);
  });
});

describe('the figure held on the stage', () => {
  const PLATE: Size = { width: 3_456, height: 2_234 };
  const ONCE = [{ cos: 1, sin: 0, scale: 1, mirror: false }];
  type Figure = Pick<PlateSpace, 'points' | 'drift' | 'count' | 'width' | 'height' | 'copies'>;

  /** Three bodies on loops that fill the plate `reach` of the way to its edges, and as deep. */
  function figure(reach: number, copies = ONCE): Figure {
    const count = 360;
    const points = new Float32Array(count * 9);
    const drift = new Float32Array(count * 3);
    for (let sample = 0; sample < count; sample++) {
      for (let body = 0; body < 3; body++) {
        const turn = ((sample / count) * (body + 1) + body / 3) * 2 * Math.PI;
        const at = (sample * 3 + body) * 3;
        points[at] = Math.cos(turn) * (PLATE.width / 2) * reach * 0.9;
        points[at + 1] = Math.sin(turn + body) * (PLATE.height / 2) * reach;
        points[at + 2] = Math.sin(2 * turn + body) * (PLATE.height / 2) * reach;
      }
      // The camera's drift carries the later samples across, as a picture's does.
      drift[sample * 3] = (sample / count) * (PLATE.width / 2) * reach * 0.1;
    }
    return { points, drift, count, ...PLATE, copies };
  }

  /** How far the farthest point of every copy stands from the stage's middle: 1 is its edge. */
  function farthest(space: Figure, stage: Size, zoom: number, yaw: number, pitch: number) {
    const bounds = driftedBounds(space);
    const still = containedIn({ x: 0, y: 0, ...stage }, PLATE);
    const shot: Shot = { yaw, pitch, lens: 0.42, zoom, drift: 1, focus: 1 };
    const lens = lensFor(shot, stage, PLATE, bounds.radius, 0.35, bounds.centre, still);
    let far = 0;
    for (let sample = 0; sample < space.count; sample++)
      for (let body = 0; body < 3; body++) {
        const at = (sample * 3 + body) * 3;
        const x = space.points[at] + space.drift[sample * 3];
        const y = space.points[at + 1] + space.drift[sample * 3 + 1];
        const z = space.points[at + 2] + space.drift[sample * 3 + 2];
        for (const copy of space.copies) {
          const m = copy.mirror ? -1 : 1;
          const [across, up] = toDevice(
            lens,
            (m * copy.cos * x - copy.sin * y) * copy.scale,
            (m * copy.sin * x + copy.cos * y) * copy.scale,
            z * copy.scale,
          );
          far = Math.max(far, Math.abs(across), Math.abs(up));
        }
      }
    return far;
  }
  const hold = (space: Figure, stage: Size, most = 1) =>
    holdOnStage(
      space,
      driftedBounds(space),
      stage,
      containedIn({ x: 0, y: 0, ...stage }, PLATE),
      most,
    );
  const TILTS = [-PITCH_LIMIT, -0.9, -0.26, 0, 0.26, 0.7, 1.1, PITCH_LIMIT];
  const ROUND = Array.from({ length: 32 }, (_, index) => (index / 32) * 2 * Math.PI + 0.07);

  it('stands whole on a desk’s stage at every turn and every tilt, where at the still’s scale it is cut', () => {
    const space = figure(0.9);
    // The picture fills a stage of its own shape: turned at that scale, the figure leaves it.
    const stage = { width: 1_440, height: 580 };
    expect(farthest(space, stage, 1, OPEN_TURN.yaw, OPEN_TURN.pitch)).toBeGreaterThan(1);
    const at = hold(space, stage);
    for (const pitch of TILTS)
      for (const yaw of ROUND)
        expect(farthest(space, stage, at(pitch), yaw, pitch), `${yaw} ${pitch}`).toBeLessThan(1);
    // It steps back, and no farther than it must: at the view it opens to, the figure still
    // takes most of the stage.
    expect(at(OPEN_TURN.pitch)).toBeLessThan(1);
    const widest = Math.max(
      ...ROUND.map((yaw) => farthest(space, stage, at(OPEN_TURN.pitch), yaw, OPEN_TURN.pitch)),
    );
    expect(widest).toBeGreaterThan(0.75);
  });

  it('stands whole on a phone’s stage, which is narrower than it is tall', () => {
    const space = figure(0.9);
    const stage = { width: 390, height: 468 };
    const most = fillFor(468, containedIn({ x: 0, y: 0, ...stage }, PLATE).height);
    expect(most).toBe(1.6);
    const at = hold(space, stage, most);
    for (const pitch of TILTS)
      for (const yaw of ROUND)
        expect(farthest(space, stage, at(pitch), yaw, pitch), `${yaw} ${pitch}`).toBeLessThan(1);
    for (const pitch of TILTS) expect(at(pitch)).toBeLessThanOrEqual(most);
  });

  it('comes as near as the stage allows, and no nearer, to a figure that is small on its plate', () => {
    const space = figure(0.2);
    const at = hold(space, { width: 390, height: 468 }, 1.6);
    for (const pitch of TILTS) expect(at(pitch)).toBe(1.6);
    const desk = hold(space, { width: 1_440, height: 580 });
    for (const pitch of TILTS) expect(desk(pitch)).toBe(1);
  });

  it('measures every copy of a figure whose strokes are repeated about the centre', () => {
    // Three turns about the centre: a figure that lies off to one side is drawn on every side.
    const third = (2 * Math.PI) / 3;
    const copies = [0, 1, 2].map((turn) => ({
      cos: Math.cos(turn * third),
      sin: Math.sin(turn * third),
      scale: 0.54,
      mirror: false,
    }));
    const space = figure(0.9, copies);
    const stage = { width: 1_440, height: 580 };
    const at = hold(space, stage);
    for (const pitch of TILTS)
      for (const yaw of ROUND)
        expect(farthest(space, stage, at(pitch), yaw, pitch), `${yaw} ${pitch}`).toBeLessThan(1);
  });

  it('keeps one scale as the figure is turned round, and gives way only with the tilt', () => {
    const at = hold(figure(0.9), { width: 1_440, height: 580 });
    // The scale is the tilt's alone, the same tipped up as tipped down, and never above the limit's.
    expect(at(0.5)).toBe(at(-0.5));
    expect(at(PITCH_LIMIT + 1)).toBe(at(PITCH_LIMIT));
    for (const pitch of TILTS) {
      expect(at(pitch)).toBeGreaterThan(0.2);
      expect(Number.isFinite(at(pitch))).toBe(true);
    }
  });
});
