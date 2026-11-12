import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { restingAt, type Transport } from '@/lib/first-light/transport';
import { lightFilmDuration } from '@/lib/physics/light-film';
import type { Rederivation } from '@/lib/physics/orbit';
import { recordingContext } from '../../tests/canvas-support';
import type { Painter } from './orbit-painter';
import type { Picture } from './orbit-picture';
import {
  performWindow,
  playingLine,
  windowLine,
  windowScore,
  type Clock,
  type WindowStage,
} from './orbit-window';

const t = messages('en');
const number = new Intl.NumberFormat('en');
const oneDecimal = new Intl.NumberFormat('en', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const words = { t, number, oneDecimal };

/** A million steps: a film of 1,802 frames, each adding 555 steps, sampled every 100. */
const steps = 1_000_000;
const stride = 100;
const count = steps / stride;
const film = lightFilmDuration(steps);

let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
let clockNow = 0;
/** The visitor's time passes, and the frame that was asked for comes. */
const nextFrame = (ms: number) => {
  clockNow += ms;
  const [[id, callback]] = [...frames];
  frames.delete(id);
  callback(clockNow);
};

beforeEach(() => {
  frames = new Map();
  clockNow = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameIds, callback);
    return frameIds;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the window’s line', () => {
  const window = {
    steps,
    film,
    closest: { step: 333_000, distance: 0.42, pair: [0, 2] as const },
  };
  const at = (seconds: number, kind: Clock['kind'] = 'playing') =>
    windowLine({ kind, seconds }, window, words);

  it('says the step the film has drawn, of all its steps, and the film’s clock', () => {
    expect(playingLine(333_555, 10, steps, t, number)).toBe(
      'Step 333,555 of 1,000,000 · 00:10 into the Light film',
    );
    // Ten seconds in, frame 600 has drawn every step through 555 × 601.
    expect(at(5)).toBe('Step 167,055 of 1,000,000 · 00:05 into the Light film');
  });

  it('says the closest approach from its step, for two seconds of the film', () => {
    // The frame before the one that draws the closest approach.
    expect(at(9.98)).toMatch(/^Step 332,445 /);
    expect(at(10)).toBe('Closest approach · bodies 1–3, 0.4 apart');
    expect(at(11.99)).toBe('Closest approach · bodies 1–3, 0.4 apart');
    // Two seconds are 120 frames' steps: 66,667 past it.
    expect(at(12)).toMatch(/^Step 400,155 /);
  });

  it('says nothing once the window stands whole, unless a hand holds it there', () => {
    expect(at(film, 'resting')).toBeNull();
    expect(at(film, 'playing')).toBeNull();
    expect(at(film, 'scrubbing')).toBe('Step 999,999 of 1,000,000 · 00:30 into the Light film');
    expect(at(film - 1, 'resting')).toMatch(/· 00:29 into the Light film$/);
  });
});

describe('the window’s score', () => {
  const trace = {
    samples: { separations: Float32Array.from([1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6]), count: 4 },
    closestApproach: { step: 100, distance: 1, pair: [0, 1] },
    syzygies: [150],
    braid: { events: [{ step: 250 }] },
  } as unknown as Pick<Rederivation, 'samples' | 'closestApproach' | 'syzygies' | 'braid'>;
  const strip = () => {
    const drawn = recordingContext();
    return {
      drawn,
      strip: { context: drawn.context, width: 800, height: 112, lane: 88, ratio: 2 },
    };
  };

  it('is drawn once on a canvas of its own, and shown with the playhead at a step', () => {
    const spare = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(spare.context);
    const { drawn, strip: on } = strip();
    const show = windowScore(on, trace, 401, stride, [0, 120, 240])!;
    // The three pairs' separations, on the spare canvas: nothing on the strip yet.
    expect(spare.named('stroke')).toHaveLength(3);
    expect(drawn.calls).toEqual([]);
    spare.clear();
    show(100);
    show(400);
    expect(spare.calls).toEqual([]);
    expect(drawn.calls.map((call) => call.name)).toEqual([
      ...['clearRect', 'drawImage', 'fillRect'],
      ...['clearRect', 'drawImage', 'fillRect'],
    ]);
    const [kept] = drawn.named('drawImage')[0].args as [HTMLCanvasElement];
    expect([kept.width, kept.height]).toEqual([800, 112]);
    // The playhead: a rule a CSS pixel wide down the lane, where the step falls across the strip.
    expect(drawn.named('fillRect').map((call) => call.args)).toEqual([
      [200, 0, 2, 88],
      [800, 0, 2, 88],
    ]);
  });

  it('is not to be had where the browser gives no canvas to keep it on', () => {
    expect(windowScore(strip().strip, trace, 401, stride, [0, 120, 240])).toBeNull();
  });
});

describe('the window, performed', () => {
  /** A stage whose painter and score keep what they were asked, in order. */
  function staged(kind: Picture['kind'], transport: Transport, over: Partial<WindowStage> = {}) {
    const done: string[] = [];
    const said: Clock[] = [];
    const painter: Painter = {
      strokes: (from, to) => done.push(`strokes ${from}→${to}`),
      lights: () => {},
      numbers: () => [],
      bodies: (sample, shown) => done.push(`bodies ${sample} ${shown ? 'shown' : 'gone'}`),
    };
    const trail = recordingContext();
    const stage: WindowStage = {
      // On the plate the still's own step comes after the samples; the plane ends on the last.
      picture: { kind, last: kind === 'plate' ? count : count - 1 } as Picture,
      painter,
      trail: trail.context,
      width: 800,
      height: 600,
      score: (step) => done.push(`score ${step}`),
      count,
      steps,
      stride,
      film,
      inView: true,
      transport: { current: transport },
      frame: { current: 0 },
      slider: { current: document.createElement('input') },
      sculpture: { current: { at: (step) => done.push(`depth ${step}`) } },
      say: (clock) => said.push(clock),
      onEnd: () => done.push('ended'),
      ...over,
    };
    const scene = performWindow(stage);
    /** What was done since this was last asked. */
    const since = () => done.splice(0);
    return { stage, scene, since, said, trail };
  }

  it('draws the window whole at once where the clock rests at its end', () => {
    const { since, stage, said } = staged('plate', restingAt(film, film));
    // To the still's own step, where the bodies stand as the work left them.
    expect(since()).toEqual([
      'strokes 0→10000',
      'bodies 10000 shown',
      'score 999999',
      'depth 999999',
    ]);
    expect(stage.slider.current!.value).toBe('1801');
    expect(said).toEqual([{ kind: 'resting', seconds: film }]);
    // Nothing plays.
    expect(frames.size).toBe(0);
  });

  it('lets the bodies leave a window drawn whole in the plane', () => {
    const { since } = staged('plane', restingAt(film, film));
    // The plane has no still's step to go on to: the playhead stands on the last sample's.
    expect(since()).toEqual(['strokes 0→9999', 'bodies 9999 gone', 'score 999900', 'depth 999999']);
  });

  it('adds strokes as the clock goes forward, and lays the drawing again when it goes back', () => {
    const { scene, since, stage, trail } = staged('plate', restingAt(10, film));
    expect(since()).toEqual([
      'strokes 0→3335',
      'bodies 3335 shown',
      'score 333555',
      'depth 333555',
    ]);
    expect(stage.slider.current!.value).toBe('600');
    scene.paint(12);
    expect(since()).toEqual([
      'strokes 3335→4001',
      'bodies 4001 shown',
      'score 400155',
      'depth 400155',
    ]);
    // The same moment again: no stroke is added to what stands.
    scene.paint(12);
    expect(since()).toEqual(['bodies 4001 shown', 'score 400155', 'depth 400155']);
    expect(trail.calls).toEqual([]);
    scene.paint(1);
    expect(trail.named('clearRect').map((call) => call.args)).toEqual([[0, 0, 800, 600]]);
    expect(since()).toEqual(['strokes 0→338', 'bodies 338 shown', 'score 33855', 'depth 33855']);
  });

  it('goes on to the still’s own step at the end of a window performed on the plate', () => {
    const { scene, since } = staged('plate', restingAt(10, film));
    since();
    scene.paint(film);
    expect(since()).toEqual([
      'strokes 3335→9999',
      'strokes 9999→10000',
      'bodies 10000 shown',
      'score 999999',
      'depth 999999',
    ]);
    // In the plane the window ends on its last sample, and the bodies leave the drawing.
    const plane = staged('plane', restingAt(10, film));
    plane.since();
    plane.scene.paint(film);
    expect(plane.since()).toEqual([
      'strokes 3335→9999',
      'bodies 9999 gone',
      'score 999999',
      'depth 999999',
    ]);
  });

  it('runs the film’s own clock while it plays, and says where it stands four times a second', () => {
    const playing: Transport = { kind: 'playing', seconds: 0, slowAt: null };
    const { since, said, stage } = staged('plate', playing);
    expect(said).toEqual([{ kind: 'playing', seconds: 0 }]);
    // The film's first frame has drawn 555 steps already.
    expect(since()).toEqual(['strokes 0→5', 'bodies 5 shown', 'score 555', 'depth 555']);
    nextFrame(100);
    // A tenth of a second of the film: six frames more, each adding 555 steps.
    expect(stage.transport.current.seconds).toBeCloseTo(0.1, 9);
    expect(since()).toEqual(['strokes 5→38', 'bodies 38 shown', 'score 3885', 'depth 3885']);
    nextFrame(100);
    expect(said).toHaveLength(1);
    nextFrame(100);
    expect(said).toHaveLength(2);
    expect(said[1].seconds).toBeCloseTo(0.3, 9);
    // A frame that comes late finds the drawing where the film would be.
    nextFrame(2_000);
    expect(stage.transport.current.seconds).toBeCloseTo(2.3, 9);
    expect(frames.size).toBe(1);
  });

  it('rests at the window’s end, says so at once, and asks for no further frame', () => {
    const nearEnd: Transport = { kind: 'playing', seconds: film - 0.05, slowAt: null };
    const { since, said, stage } = staged('plate', nearEnd);
    since();
    nextFrame(100);
    expect(stage.transport.current).toEqual({ kind: 'resting', seconds: film });
    expect(since().at(-1)).toBe('ended');
    // Said though a quarter of a second had not passed: the end is not left unsaid.
    expect(said.at(-1)).toEqual({ kind: 'resting', seconds: film });
    expect(frames.size).toBe(0);
  });

  it('keeps time only in view, and only while the clock plays', () => {
    const playing: Transport = { kind: 'playing', seconds: 3, slowAt: null };
    staged('plate', playing, { inView: false });
    expect(frames.size).toBe(0);
    staged('plate', restingAt(3, film));
    expect(frames.size).toBe(0);
  });

  it('follows a clock the hand has set, without two frames running at once', () => {
    const { scene, stage, said, since } = staged('plate', restingAt(3, film));
    since();
    stage.transport.current = { kind: 'playing', seconds: 20, slowAt: null };
    scene.paint(20);
    scene.speak();
    scene.run();
    scene.run();
    expect(said.at(-1)).toEqual({ kind: 'playing', seconds: 20 });
    expect(frames.size).toBe(1);
    // From where the drawing stood, three seconds in, to the twentieth.
    expect(since()).toContain('strokes 1004→6665');
  });
});
