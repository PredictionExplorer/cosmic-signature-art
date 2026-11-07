// @vitest-environment node
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import registry from '@/lib/art/orbit-frames.json' with { type: 'json' };
import { plateFrame } from '@/lib/art/orbit-frames';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  FramedWindow,
  project,
  shoemakeRotation,
  sliceOf,
  symmetryCopies,
  traceAgreement,
  traceFromPixels,
} from './framing';
import { lightFilmFrames } from './light-film';

const framed = (id: number) => {
  const [performed] = performedOrbits([id]);
  return new FramedWindow(performed.window, plateFrame(id)!);
};
/** The bodies' pixels at `step`, read from a window run there. */
function pixelsAt(window: FramedWindow, step: number) {
  window.run(step, 1);
  return [...window.place()];
}

describe('a window on its plate, against the generator', () => {
  // frame_oracle.rs, the generator's own code from seed to pixels (CS-Image-Generation at
  // 4dc6d64): RenderContext::to_pixel of each body after the view, the drift and the fit, at a
  // step of the recorded window, as single-precision pixels.
  const oracle: Record<number, [number, number, number, number][]> = {
    // Position space, no symmetry.
    23: [
      [0, 0, 1142.5668, 1064.5079],
      [555, 1, 1172.2375, 2128.288],
      [250_000, 2, 1325.0867, 511.34042],
      [999_999, 0, 1504.6354, 1895.2346],
    ],
    // Phase space: a hodograph and a cross braid, to the window's last step, whose velocity
    // looks back a step.
    33: [
      [0, 1, 158.85274, 1393.4666],
      [250_000, 0, 819.99677, 1037.8827],
      [999_999, 2, 2179.2432, 1355.7412],
    ],
    10: [
      [555, 2, 1099.9619, 849.1225],
      [999_999, 1, 1998.7126, 1574.9855],
    ],
  };

  it.each(Object.keys(oracle).map(Number))(
    'places № %i’s bodies on the generator’s own pixels',
    (id) => {
      const window = framed(id);
      for (const [step, body, x, y] of oracle[id]) {
        const pixels = pixelsAt(window, step);
        expect(window.step).toBe(step);
        expect(pixels[body * 2]).toBe(Math.fround(x));
        expect(pixels[body * 2 + 1]).toBe(Math.fround(y));
      }
    },
    30_000,
  );

  it('draws a mirrored work twice, the second copy across the frame’s middle', () => {
    // № 007: a phase portrait, mirrored. Its first copy is the stroke itself, passed through
    // the renderer's single-precision transform.
    const window = framed(7);
    const pixels = pixelsAt(window, 250_000);
    expect(window.copies).toHaveLength(2);
    expect(pixels).toHaveLength(12);
    expect(pixels[0]).toBeCloseTo(1475.2216, 3);
    expect(pixels[1]).toBeCloseTo(896.3534, 3);
    expect(pixels[6]).toBeCloseTo(3456 - 1475.2216, 3);
    expect(pixels[7]).toBeCloseTo(896.3534, 3);
  }, 30_000);

  it('turns and shrinks a rotational work’s copies about the frame’s centre', () => {
    // № 006 draws each stroke three times, a third of a turn apart, inside the frame.
    const window = framed(6);
    const pixels = pixelsAt(window, 400_000);
    expect(window.copies).toHaveLength(3);
    const radius = (copy: number) =>
      Math.hypot(pixels[copy * 6] - 1728, pixels[copy * 6 + 1] - 1117);
    expect(radius(1)).toBeCloseTo(radius(0), 1);
    expect(radius(2)).toBeCloseTo(radius(0), 1);
    for (let i = 0; i < pixels.length; i += 2) {
      expect(pixels[i]).toBeGreaterThan(0);
      expect(pixels[i]).toBeLessThan(3456);
    }
  }, 30_000);

  it('restarts exactly, and never steps past the window', () => {
    const window = framed(23);
    const first = [...window.place()];
    window.run(10_000, 1_000);
    window.restart();
    expect(window.step).toBe(0);
    expect([...window.place()]).toEqual(first);
    window.run(2_000_000, 500_000);
    expect(window.done).toBe(true);
    expect(window.step).toBe(1_000_000);
  }, 30_000);
});

describe('the frame’s parts', () => {
  it('rotates by a proper rotation, whatever three uniforms it is drawn from', () => {
    for (const triple of [
      [0.448, 0.172, 0.359],
      [0, 0, 0],
      [1, 0.5, 0.25],
    ] as const) {
      const m = shoemakeRotation(triple);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          expect(
            m[r * 3] * m[c * 3] + m[r * 3 + 1] * m[c * 3 + 1] + m[r * 3 + 2] * m[c * 3 + 2],
          ).toBeCloseTo(r === c ? 1 : 0, 14);
    }
  });

  it('projects positions, phase portraits, cross braids and hodographs as app.rs does', () => {
    const at = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const velocity = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const into = (mode: Parameters<typeof project>[0]) => {
      const out = new Float64Array(9);
      project(mode, at, velocity, 0.5, out);
      return [...out];
    };
    expect(into('position')).toEqual(at);
    expect(into('phase_portrait')).toEqual([1, 5, 2, 4, 20, 5, 7, 35, 8]);
    expect(into('cross_braid')).toEqual([1, 5, 3, 4, 8, 6, 7, 2, 9]);
    expect(into('hodograph')).toEqual([5, 10, 3, 20, 25, 6, 35, 40, 9]);
  });

  it('copies a stroke once, twice for a mirror, k or 2k times for a rotation or dihedral', () => {
    expect(symmetryCopies('none', 3456, 2234)).toHaveLength(1);
    expect(symmetryCopies('mirror_x', 3456, 2234).map((copy) => copy.mirror)).toEqual([
      false,
      true,
    ]);
    const turns = symmetryCopies('rot3', 3456, 2234);
    expect(turns).toHaveLength(3);
    // rotational_fit_scale: the short edge over the diagonal, in single precision.
    expect(turns[0].scale).toBe(Math.fround(2234 / Math.fround(Math.sqrt(3456 ** 2 + 2234 ** 2))));
    expect(turns[1].cos).toBe(Math.fround(Math.cos((2 * Math.PI) / 3)));
    const dihedral = symmetryCopies('dih4', 3456, 2234);
    expect(dihedral.filter((copy) => copy.mirror)).toHaveLength(4);
    expect(() => symmetryCopies('spiral', 3456, 2234)).toThrow(/Unknown symmetry/);
  });
});

describe('the Light film’s trace', () => {
  it('reads sixteen slices a cell from an image’s red and green', () => {
    const trace = traceFromPixels([1, 128, 0, 255, 255, 0], {
      width: 2,
      height: 1,
      channels: 3,
      slices: 16,
      frames: 1802,
    });
    expect([...trace.bits]).toEqual([1 | (128 << 8), 65535]);
  });

  it('cuts the film into equal parts, the last frame in the last', () => {
    expect([0, 112, 113, 1801].map((frame) => sliceOf(frame, 1802, 16))).toEqual([0, 0, 1, 15]);
  });

  it('refuses a trace of another film', () => {
    const [performed] = performedOrbits([23]);
    const trace = { width: 1, height: 1, slices: 16, frames: 900, bits: new Uint16Array(1) };
    expect(() => traceAgreement(trace, performed.window, plateFrame(23)!)).toThrow(/another film/);
  });

  /*
    The comparison Phase A made of the orbit, made of the frame: in this engine, every indexed
    work's bodies, replayed in its frame, stand where its Light film gained light, in the part of
    the film that drew them, as often as the build measured them there, and far more often than
    any view the generator passed over.
  */
  it.each(registry.frames.map((entry) => [entry.id, entry] as const))(
    '№ %i’s bodies stand where its film drew them',
    async (id, entry) => {
      const path = fileURLToPath(new URL(`../../../public${entry.trace.src}`, import.meta.url));
      const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
      const trace = traceFromPixels(data, { ...info, slices: 16, frames: entry.film.frames });
      const [performed] = performedOrbits([id]);
      expect(entry.film.frames).toBe(lightFilmFrames(performed.window.steps));
      const agreement = traceAgreement(trace, performed.window, plateFrame(id)!, {
        stride: registry.parameters.traceStride,
      });
      expect(Math.round(agreement * 10_000) / 10_000).toBe(entry.trace.agreement);
      expect(agreement).toBeGreaterThanOrEqual(
        registry.parameters.accept.traceLead * entry.trace.otherViews,
      );
    },
    30_000,
  );
});
