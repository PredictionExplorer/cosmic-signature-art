import { describe, expect, it } from 'vitest';
import {
  VOCABULARIES,
  familyOf,
  sameStack,
  scoreView,
  stackLabel,
  stackLayers,
  type LayerStack,
} from './view-score';

/**
 * Three random walks from an integer generator: every coordinate is a sum of dyadic fractions,
 * exact in any language, so the generator and this port score the very same geometry.
 */
function walk(steps: number) {
  let state = 20261106;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const bodies = [0, 1, 2].map(() => new Float64Array(steps * 2));
  const at = [
    [0, 0],
    [3, 1],
    [-2, 2.5],
  ];
  for (let s = 0; s < steps; s++)
    for (let b = 0; b < 3; b++) {
      at[b][0] += (next() - 0.5) * 0.5;
      at[b][1] += (next() - 0.5) * 0.5;
      bodies[b][s * 2] = at[b][0];
      bodies[b][s * 2 + 1] = at[b][1];
    }
  return bodies;
}
/** A loop for each body, as aesthetic_score.rs's own tests draw. */
function loops(steps: number, turns: number) {
  return [0, 1, 2].map((body) => {
    const phase = body * 2.1;
    const radius = 1 + body * 0.4;
    const points = new Float64Array(steps * 2);
    for (let step = 0; step < steps; step++) {
      const t = (step / steps) * 2 * Math.PI * turns;
      points[step * 2] = radius * Math.cos(t + phase) + 0.3 * Math.sin(2.7 * t + phase);
      points[step * 2 + 1] = radius * Math.sin(t + phase) + 0.3 * Math.cos(1.9 * t);
    }
    return points;
  });
}
const line = (steps: number) =>
  [0, 1, 2].map((body) => {
    const points = new Float64Array(steps * 2);
    for (let step = 0; step < steps; step++) {
      points[step * 2] = step / steps;
      points[step * 2 + 1] = step / steps + body * 0.001;
    }
    return points;
  });
const candidates = { gridSize: 192, samplesPerBody: 24_000 };

describe('the generator’s proxy score, on geometry both can draw exactly', () => {
  // score_oracle.rs, built from CS-Image-Generation at 4dc6d64: score_trajectory's totals for
  // this walk, with the view selection's parameters and then the candidates'.
  const published: [string, LayerStack, number, number][] = [
    ['triangle_web', { primary: 'triangle_web' }, 0.7843163013037787, 0.7001048823528655],
    ['orbit_ribbons', { primary: 'orbit_ribbons' }, 1, 0.9960396126762946],
    ['duet', { primary: 'duet', droppedEdge: 1 }, 0.6947419978255591, 0.6201508013158892],
    ['spokes', { primary: 'spokes' }, 0.8367436642059841, 0.7765695388252696],
    ['time_chords', { primary: 'time_chords' }, 0.9922340124284936, 0.9491935738399061],
    ['nebula_veil', { primary: 'nebula_veil' }, 0.7304469459165738, 0.6673610640473845],
    ['harmonic_weave', { primary: 'harmonic_weave' }, 0.8141766200934017, 0.7396234284852159],
    [
      'stipple_constellation',
      { primary: 'stipple_constellation' },
      0.9522322796127739,
      0.6321882527034588,
    ],
    ['tangent_caustics', { primary: 'tangent_caustics' }, 0.909697519662449, 0.8806082184196066],
    [
      'chords over a weave',
      { primary: 'time_chords', underlay: { vocabulary: 'harmonic_weave', alpha: 0.24 } },
      1,
      0.9781664656868718,
    ],
    [
      'ribbons over a veil',
      { primary: 'orbit_ribbons', underlay: { vocabulary: 'nebula_veil', alpha: 0.37 } },
      0.8809413014187579,
      0.8529423095444403,
    ],
    [
      'chords with an underlay and an accent',
      {
        primary: 'time_chords',
        underlay: { vocabulary: 'stipple_constellation', alpha: 0.38 },
        accent: { vocabulary: 'nebula_veil', alpha: 0.05 },
      },
      0.9197528103087836,
      0.8661507276829951,
    ],
  ];
  const geometry = walk(9_000);

  it.each(published)('scores %s as the generator does', (_, stack, view, candidate) => {
    // To the last bit, or one ulp where Math.log and the generator's libm round apart.
    expect(scoreView(geometry, stack).total).toBeCloseTo(view, 15);
    expect(scoreView(geometry, stack, candidates).total).toBeCloseTo(candidate, 15);
  });
});

describe('what the proxy score prefers (aesthetic_score.rs’s own tests)', () => {
  it('scores a rich tangle above a degenerate line, the same every time', () => {
    const stack: LayerStack = {
      primary: 'orbit_ribbons',
      underlay: { vocabulary: 'time_chords', alpha: 0.45 },
    };
    const rich = scoreView(loops(4_000, 7), stack, candidates);
    expect(rich.total).toBeGreaterThan(scoreView(line(4_000), stack, candidates).total);
    expect(scoreView(loops(4_000, 7), stack, candidates)).toEqual(rich);
  });

  it('scores nothing for no geometry, or geometry that is not a number', () => {
    const empty = [0, 1, 2].map(() => new Float64Array(0));
    expect(scoreView(empty, { primary: 'triangle_web' }).total).toBe(0);
    const nan = [0, 1, 2].map(() => new Float64Array(16).fill(NaN));
    expect(scoreView(nan, { primary: 'triangle_web' }).total).toBe(0);
    expect(scoreView(walk(10).slice(0, 2), { primary: 'triangle_web' }).total).toBe(0);
  });

  it('draws every vocabulary to a score in [0, 1] with ink on the grid', () => {
    const geometry = loops(3_000, 6);
    for (const primary of VOCABULARIES) {
      const score = scoreView(geometry, { primary, droppedEdge: 1 }, candidates);
      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(1);
      expect(score.coverage).toBeGreaterThan(0);
      for (const part of [score.veilFraction, score.crispness, score.negativeSpace]) {
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lays more ink with an underlay, and credits a lush weave', () => {
    const geometry = loops(3_000, 6);
    const solo = scoreView(geometry, { primary: 'triangle_web' }, candidates);
    const stacked = scoreView(
      geometry,
      { primary: 'triangle_web', underlay: { vocabulary: 'nebula_veil', alpha: 0.4 } },
      candidates,
    );
    expect(stacked.coverage).toBeGreaterThan(solo.coverage);
    const ribbons = scoreView(loops(4_000, 7), { primary: 'orbit_ribbons' }, candidates);
    const woven = scoreView(
      loops(4_000, 7),
      { primary: 'orbit_ribbons', underlay: { vocabulary: 'harmonic_weave', alpha: 0.29 } },
      candidates,
    );
    expect(woven.coverage).toBeGreaterThan(ribbons.coverage);
    expect(woven.total).toBeGreaterThan(ribbons.total * 0.8);
  });
});

describe('layer stacks', () => {
  const stack: LayerStack = {
    primary: 'time_chords',
    underlay: { vocabulary: 'stipple_constellation', alpha: 0.3812 },
    accent: { vocabulary: 'nebula_veil', alpha: 0.049 },
  };

  it('are labelled as the trait files label them, alphas to two places', () => {
    expect(stackLabel(stack)).toBe('time_chords+stipple_constellation@0.38+nebula_veil@0.05');
    expect(stackLabel({ primary: 'orbit_ribbons' })).toBe('orbit_ribbons');
  });

  it('draw the primary at full strength first, then the underlay and the accent', () => {
    expect(stackLayers(stack)).toEqual([
      { vocabulary: 'time_chords', alpha: 1 },
      stack.underlay,
      stack.accent,
    ]);
  });

  it('are the same only when every layer and alpha is', () => {
    expect(sameStack(stack, { ...stack })).toBe(true);
    expect(
      sameStack(stack, {
        ...stack,
        underlay: { vocabulary: 'stipple_constellation', alpha: 0.38 },
      }),
    ).toBe(false);
    expect(
      sameStack({ primary: 'duet', droppedEdge: 0 }, { primary: 'duet', droppedEdge: 1 }),
    ).toBe(false);
    expect(sameStack({ primary: 'spokes' }, { primary: 'spokes', accent: stack.accent })).toBe(
      false,
    );
  });

  it('know each vocabulary’s family', () => {
    expect(VOCABULARIES.map(familyOf)).toEqual([
      'edges',
      'trails',
      'edges',
      'radial',
      'chords',
      'veil',
      'weave',
      'dots',
      'tangent',
    ]);
  });
});
