import { describe, expect, it } from 'vitest';
import type { FramedSamples } from '@/lib/physics/framing';
import { recordingContext } from '../../tests/canvas-support';
import { FADE_EVERY_SECONDS, orbitPainter, type Continued } from './orbit-painter';
import { MATERIALS, platePicture, type Material } from './orbit-picture';

/** A million steps sampled every hundred: the Light film adds 555 steps a frame. */
const steps = 1_000_000;
const stride = 100;
const hues = [10, 130, 250];
const masses = [100, 200, 300];

/**
 * Twenty samples and the still's own step, in two copies. A drawn body stands at
 * x = 10 × its sample + its own index, y = 100 × its own index, in a frame drawn one to one.
 */
const frame = { width: 400, height: 300 };
const framed: FramedSamples = {
  stride,
  count: 20,
  copies: 2,
  pixels: Float32Array.from({ length: 21 * 12 }, (_, i) => {
    const sample = Math.floor(i / 12);
    const drawn = (i % 12) >> 1;
    return i % 2 ? drawn * 100 : sample * 10 + drawn;
  }),
};

function painting(material: Material = 'light', ratio = 1) {
  const trail = recordingContext();
  const past = recordingContext();
  const mark = recordingContext();
  const picture = platePicture(framed, frame, material, 400, 300, ratio);
  const painter = orbitPainter({
    trail: trail.context,
    continued: past.context,
    mark: mark.context,
    picture,
    width: 400,
    height: 300,
    ratio,
    hues,
    masses,
    closestApproach: { step: 1_000, pair: [0, 2] },
    steps,
    stride,
  });
  return { painter, picture, trail, past, mark };
}

/** The paths a context was asked to stroke: each as its points' x, with the style it was stroked in. */
function paths(drawn: ReturnType<typeof recordingContext>) {
  const found: { xs: number[]; style: unknown; width: unknown; blend: unknown }[] = [];
  let xs: number[] = [];
  for (const call of drawn.calls) {
    if (call.name === 'beginPath') xs = [];
    else if (call.name === 'moveTo' || call.name === 'lineTo') xs.push(call.args[0] as number);
    else if (call.name === 'stroke')
      found.push({
        xs,
        style: call.set.strokeStyle,
        width: call.set.lineWidth,
        blend: call.set.globalCompositeOperation,
      });
  }
  return found;
}

describe('the orbit’s painter', () => {
  it('strokes the trails a path for each frame of the Light film, each body in its hue', () => {
    const { painter, trail } = painting();
    painter.strokes(0, 12);
    const stroked = paths(trail);
    // Samples 1 to 5 are the film's first frame, 6 to 11 its second, 12 opens its third: three
    // paths a drawn body, joined end to end.
    expect(stroked).toHaveLength(6 * 3);
    expect(stroked.slice(0, 3).map((path) => path.xs)).toEqual([
      [0, 10, 20, 30, 40, 50],
      [50, 60, 70, 80, 90, 100, 110],
      [110, 120],
    ]);
    // Light adds: both copies of body 1 in its hue, then body 2's, a CSS pixel wide.
    expect(stroked[0]).toMatchObject({
      style: MATERIALS.light.trail(10, 0.2),
      width: 1,
      blend: 'lighter',
    });
    expect(stroked[3].style).toBe(MATERIALS.light.trail(130, 0.2));
    expect(stroked[9].style).toBe(MATERIALS.light.trail(10, 0.2));
    // The window behind what comes after it is stroked fainter.
    trail.clear();
    painter.strokes(0, 5, 0.07);
    expect(paths(trail)[0].style).toBe(MATERIALS.light.trail(10, 0.07));
    // Nothing to add: nothing stroked.
    trail.clear();
    painter.strokes(5, 5);
    expect(trail.named('stroke')).toEqual([]);
  });

  it('draws in graphite on paper: the first copy alone, a hair finer, darkening', () => {
    const { painter, trail } = painting('ink', 2);
    painter.strokes(0, 5);
    const stroked = paths(trail);
    expect(stroked).toHaveLength(3);
    expect(stroked[0]).toMatchObject({
      style: MATERIALS.ink.trail(10, 0.2),
      width: 1.5,
      blend: 'multiply',
    });
  });

  it('draws each body as a light on night, fainter or not at all when told', () => {
    const { painter, picture, mark } = painting();
    painter.lights((drawn) => [drawn * 50, 20]);
    const lights = mark.named('arc');
    expect(lights).toHaveLength(6);
    expect(lights[4].args.slice(0, 3)).toEqual([200, 20, picture.reach(masses[1])]);
    expect(mark.named('fill')).toHaveLength(6);
    expect(mark.named('stroke')).toEqual([]);
    // Copies of a body that stand on one another are drawn once; a body arriving, fainter.
    mark.clear();
    painter.lights(
      (drawn) => [drawn * 50, 20],
      (drawn) => (drawn === 3 ? 0 : drawn === 4 ? 0.5 : 1),
    );
    expect(mark.named('arc')).toHaveLength(5);
    expect(mark.named('arc')[3].set.globalAlpha).toBe(0.5);
    // The layer is left drawing at full strength.
    expect(mark.context.globalAlpha).toBe(1);
  });

  it('outlines each body on paper at the Ink edition’s size, with its centre marked', () => {
    const { painter, picture, mark } = painting('ink', 2);
    painter.lights((drawn) => [drawn * 50, 20]);
    const drawn = mark.named('arc');
    // An outline and a centre for each of the three.
    expect(drawn.map((call) => call.args[2])).toEqual([
      ...[picture.reach(0), 3],
      ...[picture.reach(0), 3],
      ...[picture.reach(0), 3],
    ]);
    expect(mark.named('stroke')).toHaveLength(3);
    expect(mark.named('fill')).toHaveLength(3);
    expect(mark.named('stroke')[1].set.strokeStyle).toBe(MATERIALS.ink.body(130));
  });

  it('rings the closest approach where it happened, in each copy, once the drawing has reached it', () => {
    const { painter, mark } = painting();
    painter.bodies(9, true);
    expect(mark.calls[0]).toMatchObject({ name: 'clearRect', args: [0, 0, 400, 300] });
    // Before the tenth sample: the six lights alone.
    expect(mark.named('stroke')).toEqual([]);
    expect(mark.named('arc')).toHaveLength(6);
    mark.clear();
    painter.bodies(10, true);
    const rings = mark.named('arc').slice(0, 2);
    // Midway between bodies 1 and 3 at sample 10, in the first copy and in the second; on the
    // plate the ring is no wider than a twenty-fifth of its height.
    expect(rings.map((call) => call.args.slice(0, 3))).toEqual([
      [(100 + 102) / 2, (0 + 200) / 2, 12],
      [(103 + 105) / 2, (300 + 500) / 2, 12],
    ]);
    expect(mark.named('stroke')).toHaveLength(2);
    expect(mark.named('stroke')[0].set.strokeStyle).toBe(MATERIALS.light.mark);
    // The bodies gone from the drawing, the ring stays.
    mark.clear();
    painter.bodies(20, false);
    expect(mark.named('arc')).toHaveLength(2);
  });

  describe('past the window', () => {
    /** A path that puts a drawn body at x = 10 × its sample + its own index. */
    const along: Continued = { place: (index, drawn) => [index * 10 + drawn, drawn * 100] };

    it('adds a stretch of a path to the trails past the window, each body’s hue drained of colour', () => {
      const { painter, past, trail } = painting();
      painter.continued(along, 3, 6);
      const stroked = paths(past);
      expect(stroked).toHaveLength(6);
      expect(stroked[1]).toEqual({
        xs: [31, 41, 51, 61],
        style: MATERIALS.light.continued(130, 0.3),
        width: 1,
        blend: 'lighter',
      });
      // The window's own trails are not touched, and nothing is added where nothing moved.
      expect(trail.calls).toEqual([]);
      past.clear();
      painter.continued(along, 6, 6);
      expect(past.calls).toEqual([]);
    });

    it('draws a path in a tone of its own, and leaves out the body a picture stays with', () => {
      const { painter, past } = painting();
      const red = (alpha: number) => `red / ${alpha}`;
      painter.continued({ ...along, tone: red }, 0, 1);
      expect(paths(past).map((path) => path.style)).toEqual(Array(6).fill('red / 0.3'));
      past.clear();
      // Body 2 holds still in its picture: neither of its copies leaves a trail.
      painter.continued({ ...along, still: (drawn) => drawn % 3 === 1 }, 0, 1);
      expect(paths(past).map((path) => path.xs[0])).toEqual([0, 2, 3, 5]);
    });

    it('lays the remembered length again in quarters, the oldest the most faded', () => {
      const { painter, past } = painting('ink');
      painter.retraced(8, [along, 20]);
      expect(past.calls[0]).toMatchObject({ name: 'clearRect', args: [0, 0, 400, 300] });
      const stroked = paths(past);
      // Three bodies on paper, four quarters each: samples 12 to 20, two at a time.
      expect(stroked).toHaveLength(12);
      expect(stroked.filter((_, i) => i % 3 === 0).map((path) => path.xs)).toEqual([
        [120, 130, 140],
        [140, 150, 160],
        [160, 170, 180],
        [180, 190, 200],
      ]);
      // As faded as a performance would have left each: to a twentieth over the whole length.
      expect(stroked[0].style).toBe(MATERIALS.ink.continued(10, 0.3 * 0.05 ** 0.75));
      expect(stroked[9].style).toBe(MATERIALS.ink.continued(10, 0.3));
      // A path shorter than what is remembered is drawn from its first sample.
      past.clear();
      painter.retraced(8, [along, 3]);
      expect(paths(past).map((path) => path.xs[0])).toEqual([0, 1, 2, 10, 11, 12]);
    });

    it('lays two paths again, one after the other, each to its own last sample', () => {
      const { painter, past } = painting('ink');
      const red = (alpha: number) => `red / ${alpha}`;
      painter.retraced(4, [along, 8], [{ ...along, tone: red }, 6]);
      expect(past.named('clearRect')).toHaveLength(1);
      const stroked = paths(past);
      expect(stroked).toHaveLength(24);
      expect(stroked[9].xs).toEqual([70, 80]);
      expect(stroked[21]).toMatchObject({ xs: [50, 60], style: 'red / 0.3' });
    });

    it('fades the trails a step towards a twentieth over the time they are remembered', () => {
      const { painter, past } = painting();
      painter.fade(30);
      expect(past.calls).toHaveLength(1);
      expect(past.calls[0]).toMatchObject({
        name: 'fillRect',
        args: [0, 0, 400, 300],
        set: {
          globalCompositeOperation: 'destination-out',
          fillStyle: `rgb(0 0 0 / ${1 - 0.05 ** (FADE_EVERY_SECONDS / 30)})`,
        },
      });
      // Sixty such steps, one every half second for thirty, leave a twentieth.
      const kept = 0.05 ** (FADE_EVERY_SECONDS / 30);
      expect(kept ** 60).toBeCloseTo(0.05, 12);
    });
  });
});
