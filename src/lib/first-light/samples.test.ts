import { describe, expect, it } from 'vitest';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { framedSamples, type WindowStart } from '@/lib/physics/framing';
import { headAt, plateSpace, sampleAt, sampleCount, sculptureRadius } from './samples';

/** A work's window cut short: the same first state, so its first steps are the window's own. */
function opening(id: number, steps: number): WindowStart {
  const [performed] = performedOrbits([id]);
  return { ...performed.window, steps };
}

describe('First Light in plate space', () => {
  // Position space without symmetry (№ 031), phase space with a mirror (№ 7), a cross braid
  // (№ 10), a hodograph with three turns (№ 15) and positions in six (№ 8).
  it.each([31, 7, 10, 15, 8])(
    'lands every sample of № %i on the pixels the plate itself places',
    (id) => {
      // The last step, 20,049, falls between samples, so both keep it as one more row.
      const start = opening(id, 20_050);
      const frame = plateFrame(id)!;
      const space = plateSpace(start, frame, 100);
      const placed = framedSamples(start, frame, 100);
      const width = placed.copies * 6;
      expect(space.count).toBe(placed.count + 1);
      // The first copy is the stroke itself; a turned work shrinks even that one about the
      // centre, so its diagonal fits every turn (symmetryCopies).
      const [first] = space.copies;
      for (let sample = 0; sample < space.count; sample++) {
        for (let body = 0; body < 3; body++) {
          const o = (sample * 3 + body) * 3;
          const dx = space.points[o] + space.drift[sample * 3];
          const dy = space.points[o + 1] + space.drift[sample * 3 + 1];
          const x = frame.width / 2 + (dx * first.cos - dy * first.sin) * first.scale;
          const y = frame.height / 2 + (dx * first.sin + dy * first.cos) * first.scale;
          expect(x).toBeCloseTo(placed.pixels[sample * width + body * 2], 2);
          expect(y).toBeCloseTo(placed.pixels[sample * width + body * 2 + 1], 2);
        }
      }
    },
  );

  it('ends on the window’s last step, where the still ends', () => {
    const start = opening(31, 1_234);
    const space = plateSpace(start, plateFrame(31)!, 100);
    expect(space.count).toBe(sampleCount(1_234, 100));
    expect(Array.from(space.steps.slice(-3))).toEqual([1_100, 1_200, 1_233]);
  });

  it('keeps a last step that falls on the stride once', () => {
    expect(sampleCount(1_001, 100)).toBe(11);
    const space = plateSpace(opening(31, 1_001), plateFrame(31)!, 100);
    expect(space.steps[space.count - 1]).toBe(1_000);
    expect(space.steps[space.count - 2]).toBe(900);
  });

  it('turns about the middle of its own depth', () => {
    const space = plateSpace(opening(31, 20_001), plateFrame(31)!, 100);
    let near = Infinity;
    let far = -Infinity;
    for (let i = 2; i < space.points.length; i += 3) {
      near = Math.min(near, space.points[i]);
      far = Math.max(far, space.points[i]);
    }
    expect(near + far).toBeCloseTo(0, 3);
    expect(far).toBeGreaterThan(0);
    // The sphere about the plate's centre holds the farthest sample.
    expect(sculptureRadius(space)).toBeGreaterThanOrEqual(far);
  });

  it('carries the generator’s one scale from the box to the plate', () => {
    const frame = plateFrame(31)!;
    const space = plateSpace(opening(31, 501), frame, 100);
    expect(space.scale).toBeCloseTo(frame.width / frame.box.width, 12);
    expect(space.scale).toBeCloseTo(frame.height / frame.box.height, 9);
    expect(space.copies).toHaveLength(1);
  });

  it('finds the sample nearest a step', () => {
    const space = plateSpace(opening(31, 1_234), plateFrame(31)!, 100);
    expect(sampleAt(space, 0)).toBe(0);
    expect(sampleAt(space, 149)).toBe(1);
    expect(sampleAt(space, 151)).toBe(2);
    expect(sampleAt(space, 1_220)).toBe(space.count - 1);
    expect(sampleAt(space, 99_999)).toBe(space.count - 1);
  });

  it('places any step among the samples, evenly between two', () => {
    // 1,234 steps at a stride of 100: samples at 0, 100, …, 1,200 and the last step, 1,233.
    const space = plateSpace(opening(31, 1_234), plateFrame(31)!, 100);
    expect(headAt(space, -5)).toBe(0);
    expect(headAt(space, 0)).toBe(0);
    expect(headAt(space, 150)).toBeCloseTo(1.5, 12);
    expect(headAt(space, 1_200)).toBe(space.count - 2);
    expect(headAt(space, 1_211)).toBeCloseTo(space.count - 2 + 11 / 33, 12);
    expect(headAt(space, 1_233)).toBe(space.count - 1);
    expect(headAt(space, 5_000)).toBe(space.count - 1);
  });

  it('refuses a stride or a window it cannot sample', () => {
    const frame = plateFrame(31)!;
    expect(() => plateSpace(opening(31, 100), frame, 0)).toThrow(/stride/);
    expect(() => plateSpace(opening(31, 100), frame, 1.5)).toThrow(/stride/);
    expect(() => plateSpace(opening(31, 1), frame, 10)).toThrow(/two steps/);
  });
});
