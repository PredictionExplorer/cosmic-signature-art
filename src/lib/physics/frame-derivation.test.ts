import { beforeAll, describe, expect, it } from 'vitest';
import registry from '@/lib/art/orbit-frames.json' with { type: 'json' };
import { frameOf, loadOrbitFrames } from '@/lib/art/orbit-frames';
import { workOrbit } from '@/lib/art/orbit-records';
import { performedOrbits } from '@/lib/art/orbit-windows';
import {
  adaptiveStacks,
  chooseView,
  deriveFrame,
  fitBox,
  preferredStructure,
  profileChoices,
  frameDifferences,
  FIT_TOLERANCE,
  type DerivedFrame,
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
  it('keeps the first of views that tie, as the generator’s strict comparison does', () => {
    // Four copies of one view score alike: the first is kept.
    const sample = [0, 1, 2].map((body) =>
      Float64Array.from({ length: 900 }, (_, i) =>
        i % 3 === 2 ? 0 : Math.sin(i * 0.01 + body) * (1 + body) + (i % 3) * 0.5,
      ),
    );
    const triple = [0.448, 0.172, 0.359] as const;
    const tied = chooseView([triple, triple, triple, triple], sample, { primary: 'orbit_ribbons' });
    expect(new Set(tied.scores).size).toBe(1);
    expect(tied.candidate).toBe(0);
    // № 070: every view's proxy render scores the full 1, and the registry keeps the first.
    expect(entryOf(70).view.scores.map(Number)).toEqual([1, 1, 1, 1]);
    expect(entryOf(70).view.candidate).toBe(0);
  });
});

/*
  CI measures coverage on a shared runner, four to five times slower than a laptop over these
  derivations (vitest.config.ts): one derivation took 14–17 s there, and № 023 framed from all
  four views 37 s. The budgets are sized to the runner, with room to spare.
*/
const ONE_DERIVATION = process.env.CI ? 120_000 : 30_000;
const EVERY_VIEW = process.env.CI ? 240_000 : 60_000;

const parsed = loadOrbitFrames(registry);

/**
 * A derived frame as the registry keeps it: every choice and draw to the bit, the fit within
 * FIT_TOLERANCE, since V8 rounds sines, cosines and logarithms apart in the last bit from one
 * machine to another (frame-derivation.ts).
 */
function expectRegistered(derived: DerivedFrame, entry: Entry) {
  expect(derived.checks.every((row) => row.exact)).toBe(true);
  const stored = parsed.get(entry.id)!;
  expect(
    frameDifferences(
      { frame: frameOf(stored), candidate: stored.view.candidate, scores: stored.view.scores },
      { frame: derived.frame, candidate: derived.view.candidate, scores: derived.view.scores },
    ),
  ).toEqual([]);
}

describe('two derivations of one frame', () => {
  const stored = parsed.get(15)!;
  const record = () => ({
    frame: structuredClone(frameOf(stored)),
    candidate: stored.view.candidate,
    scores: [...stored.view.scores],
  });

  it('are one frame when only the last bits of the fit differ, as CI’s x86-64 found', () => {
    const elsewhere = record();
    // CI derived № 015's box.maxX as …524 where an arm64 Mac wrote …535: two ulps.
    elsewhere.frame.box.maxX = 448.30874704216524;
    elsewhere.frame.drift.semiMajor *= 1 + Number.EPSILON;
    expect(frameDifferences(record(), elsewhere)).toEqual([]);
  });

  it('differ in any choice or draw, or in a fit moved past a trillionth of the frame', () => {
    const changed = (change: (copy: ReturnType<typeof record>) => void) => {
      const copy = record();
      change(copy);
      return frameDifferences(record(), copy);
    };
    expect(changed((copy) => (copy.candidate = (copy.candidate + 1) % 4))).toEqual(['candidate']);
    expect(changed((copy) => (copy.frame.symmetry = 'rot3'))).toEqual(['symmetry']);
    expect(changed((copy) => (copy.frame.drift.config.scale *= 1 + Number.EPSILON))).toEqual([
      'drift.scale',
    ]);
    expect(
      changed((copy) => (copy.frame.box.minY -= 10 * FIT_TOLERANCE * copy.frame.box.width)),
    ).toEqual(['box.minY']);
    expect(changed((copy) => copy.scores.pop())).toEqual(['scores']);
  });
});

describe('a frame, derived', () => {
  // № 023, the suite's day's work: derived once, framed from all four views, for every test that
  // needs it.
  let twentyThree: DerivedFrame;
  beforeAll(() => {
    twentyThree = deriveFrame(workOrbit(23)!.generation, windowOf(23), traitsOf(entryOf(23)), {
      everyView: true,
    });
  }, EVERY_VIEW);

  it('re-derives № 023’s frame from its seed, exactly as the registry keeps it', () => {
    expectRegistered(twentyThree, entryOf(23));
  });

  it('scores № 023’s four seeded views exactly as the generator did, and keeps the second', () => {
    // frame_oracle.rs: score_trajectory's totals for the four candidates, in their order.
    // To the bit on this Mac, as on CI; another machine's logarithms may round a few ulps apart.
    [0.9369672225752924, 0.9407767818578638, 0.9219878301302269, 0.9325664495797676].forEach(
      (score, k) => expect(Math.abs(twentyThree.view.scores[k] - score)).toBeLessThanOrEqual(1e-15),
    );
    expect(twentyThree.view.candidate).toBe(1);
  });

  it('frames the window from every view on request, the chosen one among them', () => {
    expect(twentyThree.views).toHaveLength(4);
    expect(twentyThree.views![1]).toEqual(twentyThree.frame);
    expect(twentyThree.views![0].box).not.toEqual(twentyThree.frame.box);
  });

  it(
    're-derives a hodograph’s frame, its velocities scaled over the whole window',
    () => {
      const entry = entryOf(33);
      expect(entry.projection).toBe('hodograph');
      expectRegistered(
        deriveFrame(workOrbit(33)!.generation, windowOf(33), traitsOf(entry)),
        entry,
      );
    },
    ONE_DERIVATION,
  );

  it('refuses a frame whose labels differ from the trait file’s, before reading the stream', () => {
    const traits = traitsOf(entryOf(23));
    const derive = (changed: Partial<FramingTraits>) => () =>
      deriveFrame(workOrbit(23)!.generation, windowOf(23), { ...traits, ...changed });
    expect(derive({ symmetry: 'rot3' })).toThrow(/symmetry differ/);
    expect(derive({ stack: 'spokes' })).toThrow(/stack differ/);
    expect(derive({ projection: 'polar' })).toThrow(/projection differ/);
  });

  it(
    'refuses a frame whose published drift differs by a single bit',
    () => {
      const traits = traitsOf(entryOf(23));
      const scale = traits.drift.scale;
      const nudged = {
        ...traits,
        drift: { ...traits.drift, scale: scale + scale * Number.EPSILON },
      };
      expect(() => deriveFrame(workOrbit(23)!.generation, windowOf(23), nudged)).toThrow(
        /driftScale differ/,
      );
    },
    ONE_DERIVATION,
  );
});
