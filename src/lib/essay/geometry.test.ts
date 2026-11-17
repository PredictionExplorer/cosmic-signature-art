import { describe, expect, it } from 'vitest';
import {
  PLOT,
  clockMarks,
  doublingLine,
  logLine,
  onLogScale,
  pairDrawing,
  plait,
  plaitLengths,
  type Crossing,
} from './geometry';

const box = { width: 720, height: 340, pad: 40 };

describe('two bodies alone, drawn to scale', () => {
  const bound = {
    bound: true,
    eccentricity: 0.5,
    semiLatus: 75,
    anomaly: Math.PI / 3,
    semiMajor: 100,
  };

  it('sets each body on its own ellipse about the centre the two share', () => {
    const drawing = pairDrawing(bound, [100, 300], box);
    expect(drawing.path).toBeNull();
    expect(drawing.ellipses).toHaveLength(2);
    const [light, heavy] = drawing.ellipses;
    // The lighter body's ellipse is the larger, by the ratio of the masses.
    expect(light.rx / heavy.rx).toBeCloseTo(3, 1);
    expect(light.ry / light.rx).toBeCloseTo(Math.sqrt(1 - 0.25), 2);
    drawing.bodies.forEach((body, index) => {
      const { cx, cy, rx, ry } = drawing.ellipses[index];
      expect(((body.x - cx) / rx) ** 2 + ((body.y - cy) / ry) ** 2).toBeCloseTo(1, 1);
    });
    // The centre lies on the line between them, three times nearer the heavier.
    const [a, b] = drawing.bodies;
    const { centre } = drawing;
    const reach = (p: typeof a) => Math.hypot(p.x - centre.x, p.y - centre.y);
    expect(reach(a) / reach(b)).toBeCloseTo(3, 1);
    expect((a.x - centre.x) * (b.y - centre.y)).toBeCloseTo((a.y - centre.y) * (b.x - centre.x), 3);
    // Everything inside the box.
    for (const { cx, cy, rx, ry } of drawing.ellipses) {
      expect(cx - rx).toBeGreaterThanOrEqual(box.pad - 1);
      expect(cx + rx).toBeLessThanOrEqual(box.width - box.pad + 1);
      expect(cy - ry).toBeGreaterThanOrEqual(box.pad - 1);
      expect(cy + ry).toBeLessThanOrEqual(box.height - box.pad + 1);
    }
  });

  it('draws a pair that is not bound as one open curve past the other body', () => {
    const open = {
      bound: false,
      eccentricity: 1.4,
      semiLatus: 200,
      anomaly: -0.3,
      semiMajor: null,
    };
    const drawing = pairDrawing(open, [150, 250], box);
    expect(drawing.ellipses).toEqual([]);
    expect(drawing.path).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){64}$/);
    // The first body is the point the curve bends round; the second stands on the curve.
    expect(drawing.bodies[0]).toEqual(drawing.centre);
    const distance = Math.hypot(
      drawing.bodies[1].x - drawing.centre.x,
      drawing.bodies[1].y - drawing.centre.y,
    );
    expect(distance / drawing.scale).toBeCloseTo(200 / (1 + 1.4 * Math.cos(-0.3)), 6);
    const points = [...drawing.path!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [
      +x,
      +y,
    ]);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(box.pad - 1);
      expect(x).toBeLessThanOrEqual(box.width - box.pad + 1);
      expect(y).toBeGreaterThanOrEqual(box.pad - 1);
      expect(y).toBeLessThanOrEqual(box.height - box.pad + 1);
    }
  });

  it('draws an open curve out to a body that stands far along it, and a far thrower nearly straight', () => {
    const far = { bound: false, eccentricity: 30, semiLatus: 50, anomaly: 1.5, semiMajor: null };
    const drawing = pairDrawing(far, [100, 100], box);
    expect(drawing.path).not.toBeNull();
    expect(Number.isFinite(drawing.scale)).toBe(true);
    for (const body of drawing.bodies) {
      expect(body.x).toBeGreaterThanOrEqual(box.pad - 1);
      expect(body.x).toBeLessThanOrEqual(box.width - box.pad + 1);
    }
  });
});

describe('a plait of three strands', () => {
  const layout = { x: 20, y: 10, slot: 40, row: 30, lead: 10 };
  const pigtail: Crossing[] = [1, -2, 1, -2, 1, -2];

  it('changes the two strands’ rows at each crossing and draws the one that passes across again', () => {
    const drawn = plait([1], [0, 1, 2], layout);
    expect(drawn.order).toEqual([1, 0, 2]);
    expect(drawn.width).toBe(70);
    // A positive crossing: the upper row’s strand is the one drawn across.
    expect(drawn.over).toEqual([{ id: 0, d: 'M20 10C40 10 40 40 60 40' }]);
    expect(drawn.strands.map(({ id }) => id)).toEqual([0, 1, 2]);
    expect(drawn.strands[0].d).toBe('M10 10L20 10C40 10 40 40 60 40L70 40');
    expect(drawn.strands[1].d).toBe('M10 40L20 40C40 40 40 10 60 10L70 10');
    expect(drawn.strands[2].d).toBe('M10 70L60 70L70 70');
    // A negative one: the lower row’s strand passes across.
    expect(plait([-2], [0, 1, 2], layout).over).toEqual([{ id: 2, d: 'M20 70C40 70 40 40 60 40' }]);
  });

  it('brings a plait of three repeats back to the rows it began on', () => {
    expect(plait(pigtail, [0, 1, 2], layout).order).toEqual([0, 1, 2]);
    expect(plait(pigtail.slice(0, 2), [0, 1, 2], layout).order).toEqual([1, 2, 0]);
    expect(plait(pigtail, [2, 0, 1], layout).over.map(({ id }) => id)).toHaveLength(6);
  });

  it('cuts a long plait into lengths, each beginning on the rows the last ended on', () => {
    const lengths = plaitLengths(pigtail, [0, 1, 2], 4, layout);
    expect(lengths.map(({ over }) => over.length)).toEqual([4, 2]);
    expect(lengths[0].order).toEqual(plait(pigtail.slice(0, 4), [0, 1, 2], layout).order);
    expect(lengths[1].order).toEqual([0, 1, 2]);
    // The second length’s strands begin where the first’s ended.
    lengths[0].order.forEach((id, row) =>
      expect(lengths[1].strands.find((strand) => strand.id === id)!.d).toMatch(
        new RegExp(`^M10 ${10 + row * 30}L`),
      ),
    );
    // A work with no change of place still has its three strands to show.
    expect(plaitLengths([], [0, 1, 2], 4, layout)).toHaveLength(1);
  });
});

describe('a chart on a scale of powers of ten', () => {
  it('places a value between the foot and the head, and holds what lies outside to the edge', () => {
    expect(onLogScale(1e-12, -12, 3)).toBe(0);
    expect(onLogScale(1e3, -12, 3)).toBe(1);
    expect(onLogScale(1e-3, -12, 3)).toBeCloseTo(0.6, 12);
    expect(onLogScale(0, -12, 3)).toBe(0);
    expect(onLogScale(1e9, -12, 3)).toBe(1);
    expect(
      logLine(
        [
          [0, 1e-12],
          [0.5, 1e-3],
          [1, 1e3],
        ],
        -12,
        3,
      ),
    ).toBe(`M0 ${PLOT}L500 400L${PLOT} 0`);
  });

  it('draws steady doubling through the middle of the gaps it was fitted to', () => {
    // A gap that doubles every 50,000 steps exactly, kept every 100,000.
    const gaps = {
      every: 100_000,
      values: Array.from({ length: 31 }, (_unused, i) => 1e-12 * 4 ** i),
    };
    const line = doublingLine(gaps, 50_000)!;
    expect(line.from[0]).toBe(200_000);
    expect(line.from[1]).toBeCloseTo(1e-12 * 4 ** 2, 20);
    expect(line.to[1] / gaps.values[line.to[0] / gaps.every]).toBeCloseTo(1, 9);
    expect(doublingLine({ every: 100_000, values: [1e-12, 5] }, 50_000)).toBeNull();
  });

  it('marks a time line three to five times, on round seconds', () => {
    expect(clockMarks(30.03)).toEqual([0, 10, 20, 30]);
    expect(clockMarks(240.24)).toEqual([0, 60, 120, 180, 240]);
    expect(clockMarks(86)).toEqual([0, 30, 60]);
    expect(clockMarks(22.5)).toEqual([0, 5, 10, 15, 20]);
    expect(clockMarks(2000)).toEqual([0, 300, 600, 900, 1200, 1500, 1800]);
  });
});
