import { describe, expect, it } from 'vitest';
import registry from '@/lib/art/orbit-frames.json' with { type: 'json' };
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  adaptiveStacks,
  chooseView,
  deriveFrame,
  eachProjectedStep,
  fitBox,
  preferredStructure,
  profileChoices,
  velocityScaleOf,
  viewTriples,
  type FramingTraits,
} from './frame-derivation';
import { stackLabel } from './view-score';

type Entry = (typeof registry.frames)[number];
const entryOf = (id: number) => registry.frames.find((entry) => entry.id === id)!;
const traitsOf = (entry: Entry): FramingTraits => ({
  projection: entry.projection,
  symmetry: entry.symmetry,
  stack: entry.stack,
  preferredStack: entry.preferredStack,
  wildcard: entry.wildcard,
  drift: {
    enabled: true,
    mode: 'elliptical',
    scale: Number(entry.drift.scale),
    arcFraction: Number(entry.drift.arcFraction),
    eccentricity: Number(entry.drift.eccentricity),
  },
  width: entry.width,
  height: entry.height,
});
const windowOf = (id: number) => performedOrbits([id])[0].window;

describe('the profile’s own choices (visual_profile.rs)', () => {
  it.each(registry.frames.map((entry) => [entry.id, entry] as const))(
    'gives № %i the stack, wildcard, symmetry and projection its trait file states',
    (_, entry) => {
      const choices = profileChoices(entry.seed);
      expect(stackLabel(choices.stack)).toBe(entry.preferredStack);
      expect(choices.wildcard).toBe(entry.wildcard);
      expect(choices.symmetry).toBe(entry.symmetry);
      expect(choices.projection).toBe(entry.projection);
      // The chosen stack is the seed's own or one of the curated fallbacks.
      expect(adaptiveStacks(choices.stack).map(stackLabel)).toContain(entry.stack);
    },
  );

  it('rolls a Duet with the edge it drops, and keeps it in the fallbacks', () => {
    // № 071's structure roll fell in the Duet's band (Phase A's 24 draws).
    const structure = preferredStructure(workOrbit(71)!.generation.seed);
    expect(structure.primary).toBe('duet');
    expect(structure.droppedEdge).toBeGreaterThanOrEqual(0);
    expect(structure.droppedEdge).toBeLessThanOrEqual(2);
    const stacks = adaptiveStacks(structure);
    expect(stacks[0]).toEqual(structure);
    expect(stacks.map(stackLabel)).toEqual([
      'duet',
      'orbit_ribbons+harmonic_weave@0.29',
      'time_chords+harmonic_weave@0.24',
      'orbit_ribbons',
      'time_chords',
    ]);
  });
});

describe('the fit (render/context.rs)', () => {
  it('pads every side by a twentieth, then widens to the frame’s aspect about the middle', () => {
    const wide = fitBox({ minX: 0, maxX: 100, minY: 0, maxY: 50 }, 1920, 1080);
    expect(wide.width / wide.height).toBeCloseTo(1920 / 1080, 12);
    expect(wide.width).toBeCloseTo(110, 12);
    expect((wide.minY + wide.maxY) / 2).toBeCloseTo(25, 12);
    const tall = fitBox({ minX: 0, maxX: 50, minY: 0, maxY: 100 }, 1920, 1080);
    expect(tall.height).toBeCloseTo(110, 12);
    expect((tall.minX + tall.maxX) / 2).toBeCloseTo(25, 12);
    const square = fitBox({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 100, 100);
    expect(square).toEqual({ minX: -5, maxX: 105, minY: -5, maxY: 105, width: 110, height: 110 });
  });

  it('opens a degenerate extent by half a unit each way', () => {
    const point = fitBox({ minX: 3, maxX: 3, minY: 7, maxY: 7 }, 100, 100);
    expect(point.width).toBeCloseTo(1.1, 12);
    expect(point.height).toBeCloseTo(1.1, 12);
  });
});

describe('the view (app.rs apply_view_orientation)', () => {
  it('scores № 023’s four seeded views exactly as the generator did, and keeps the second', () => {
    // frame_oracle.rs: score_trajectory's totals for the four candidates, in their order.
    const window = windowOf(23);
    const stride = Math.floor(window.steps / 6_000);
    const count = Math.ceil(window.steps / stride);
    const sample = [0, 1, 2].map(() => new Float64Array(count * 3));
    eachProjectedStep(window, 'position', 1, (point, step) => {
      if (step % stride !== 0) return;
      for (let b = 0; b < 3; b++)
        sample[b].set(point.subarray(b * 3, b * 3 + 3), (step / stride) * 3);
    });
    const { candidate, scores } = chooseView(viewTriples(entryOf(23).seed), sample, {
      primary: 'orbit_ribbons',
    });
    expect(scores).toEqual([
      0.9369672225752924, 0.9407767818578638, 0.9219878301302269, 0.9325664495797676,
    ]);
    expect(candidate).toBe(1);
  }, 30_000);

  it('keeps the first of views that tie, as the generator’s strict comparison does', () => {
    // № 070: every view's proxy render scores the full 1.
    expect(entryOf(70).view.scores.map(Number)).toEqual([1, 1, 1, 1]);
    expect(entryOf(70).view.candidate).toBe(0);
  });
});

describe('a frame, derived', () => {
  // A plain orbit, a hodograph, and a mirrored phase portrait: re-derived here as the build
  // derived them, which is this engine to the last bit.
  it.each([23, 33, 7])(
    're-derives № %i’s frame from its seed, exactly as the registry keeps it',
    (id) => {
      const entry = entryOf(id);
      const derived = deriveFrame(workOrbit(id)!.generation, windowOf(id), traitsOf(entry));
      expect(derived.checks.every((row) => row.exact)).toBe(true);
      expect(derived.view.candidate).toBe(entry.view.candidate);
      expect(derived.view.scores).toEqual(entry.view.scores.map(Number));
      const { frame } = derived;
      expect(frame.view).toEqual(entry.view.triple.map(Number));
      expect(frame.velocityScale).toBe(Number(entry.velocityScale));
      expect(frame.drift.orientation.initialMeanAnomaly).toBe(
        Number(entry.drift.initialMeanAnomaly),
      );
      expect(frame.drift.semiMajor).toBe(Number(entry.drift.semiMajor));
      expect(frame.box).toEqual(
        Object.fromEntries(Object.entries(entry.box).map(([key, value]) => [key, Number(value)])),
      );
    },
    30_000,
  );

  it('measures a phase-space window’s velocity scale over the whole window', () => {
    const entry = entryOf(33);
    expect(entry.projection).toBe('hodograph');
    expect(velocityScaleOf(windowOf(33))).toBe(Number(entry.velocityScale));
  }, 30_000);

  it('refuses a frame when a published value differs by a single bit', () => {
    const entry = entryOf(23);
    const traits = traitsOf(entry);
    const scale = traits.drift.scale;
    const nudged = { ...traits, drift: { ...traits.drift, scale: scale + scale * Number.EPSILON } };
    expect(() => deriveFrame(workOrbit(23)!.generation, windowOf(23), nudged)).toThrow(
      /driftScale differ/,
    );
    expect(() =>
      deriveFrame(workOrbit(23)!.generation, windowOf(23), { ...traits, symmetry: 'rot3' }),
    ).toThrow(/symmetry differ/);
    expect(() =>
      deriveFrame(workOrbit(23)!.generation, windowOf(23), { ...traits, stack: 'spokes' }),
    ).toThrow(/stack differ/);
  }, 30_000);

  it('frames the window from every view on request, the chosen one among them', () => {
    const entry = entryOf(23);
    const derived = deriveFrame(workOrbit(23)!.generation, windowOf(23), traitsOf(entry), {
      everyView: true,
    });
    expect(derived.views).toHaveLength(4);
    expect(derived.views![entry.view.candidate]).toEqual(derived.frame);
    expect(derived.views![0].box).not.toEqual(derived.frame.box);
  }, 30_000);
});
