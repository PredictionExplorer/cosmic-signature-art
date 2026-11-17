import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEPTH_BEATS, OPEN_MS, OPEN_TURN, STEP_MS, TRAVEL } from '@/lib/first-light/depth';
import { HOLD_MS, PITCH_STEP, SETTLE_MS, SPRING_MS, YAW_STEP } from '@/lib/first-light/hand';
import type { PlateSpace } from '@/lib/first-light/samples';
import type { ShowWork } from '@/lib/first-light/show-work';
import { lightFilmDuration } from '@/lib/physics/light-film';
import type { ArtInterpretation } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { words } from '@/lib/i18n/words';
import type { Engine, Exposure } from './first-light-engine';
import { OrbitDepth } from './orbit-depth';
import { ORBIT_DEPTH_WORDS } from './orbit-depth.words';

/*
  The orbit in depth, with an engine that records what it is asked to draw: the hand, the
  performance and every control are the component's own.
*/
const engine = vi.hoisted(() => ({
  made: [] as { canvas: HTMLCanvasElement; engine: FakeEngine }[],
  refuse: false,
  staged: [] as unknown[],
  /** The space the stage is set with; a test may give a figure of its own. */
  space: null as unknown,
}));
type FakeEngine = Engine & {
  draws: Exposure[];
  sizes: [number, number, number][];
  disposed: boolean;
  lost: boolean;
};
vi.mock('./first-light-engines', () => ({
  createEngine: async (canvas: HTMLCanvasElement) => {
    if (engine.refuse) return null;
    const made: FakeEngine = {
      lost: false,
      look: { intensity: 1, width: 2, glow: 0, exposure: 1, bodySize: 1 },
      draws: [],
      sizes: [],
      disposed: false,
      setScene() {},
      resize(width, height, ratio) {
        made.sizes.push([width, height, ratio]);
      },
      draw(exposure) {
        made.draws.push(exposure);
      },
      dispose() {
        made.disposed = true;
      },
    };
    engine.made.push({ canvas, engine: made });
    return made;
  },
}));
vi.mock('./first-light-show', () => ({
  setTheStage: async (_engine: Engine, work: unknown) => {
    engine.staged.push(work);
    return engine.space ?? SPACE;
  },
}));
const motion = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as 'playing' | 'hushed',
  toggle: vi.fn(),
}));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const STEPS = 1_000_000;
const SECONDS = lightFilmDuration(STEPS);
const REWOUND = DEPTH_BEATS.hold + DEPTH_BEATS.rewind;

/** Three samples of three bodies; the camera's drift carries the second and third across. */
function space(): PlateSpace {
  return {
    stride: 500_000,
    count: 3,
    steps: Float64Array.from([0, 500_000, STEPS - 1]),
    width: 3_456,
    height: 2_234,
    scale: 1,
    points: Float32Array.from({ length: 27 }, (_, i) => ((i * 37) % 200) - 100),
    drift: Float32Array.from([0, 0, 0, 40, 0, 10, 80, 0, 20]),
    depthCentre: 0,
    centre: [0, 0, 0],
    copies: [{ cos: 1, sin: 0, scale: 1, mirror: false }],
  };
}
const SPACE = space();
const WORK = {
  start: { steps: STEPS },
  frame: {},
  closestStep: 500_000,
  rungs: [{ src: '/art/stills/23-light-640.webp', width: 640 }],
} as unknown as ShowWork;
const STILL = {
  id: 'light',
  still: '/art/23-light.webp',
  width: 3_456,
  height: 2_234,
  films: [],
} as unknown as ArtInterpretation;
const t = words(en, ORBIT_DEPTH_WORDS);
const NAME = 'The orbit of № 023 in depth.';

let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
let now = 0;
/** Runs the frames now due, at `at`. */
function frameAt(at: number) {
  now = at;
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((callback) => callback(at)));
}
/** Runs frames every `every` ms until `until`. */
function runTo(until: number, every = 100) {
  while (now < until) frameAt(Math.min(until, now + every));
}

/** The observers the exhibit sets: the one with a margin says it is near, the other that it is seen. */
let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] =
  [];
const observed = (near: boolean) =>
  observers.filter(({ options }) => Boolean(options?.rootMargin) === near);
function sees(ratio: number) {
  act(() => {
    for (const { callback } of observed(false))
      callback(
        [{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
  });
}
function nears() {
  act(() => {
    for (const { callback } of observed(true))
      callback(
        [{ isIntersecting: true, intersectionRatio: 0.01 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
  });
}

const exhibit = (work: ShowWork | null = WORK) => (
  <OrbitDepth work={work} still={STILL} label="№ 023" name={NAME} about="orbit-about" t={t} />
);
function shown(work: ShowWork | null = WORK) {
  const view = render(exhibit(work));
  const figure = view.container.querySelector('figure')!;
  const canvas = view.container.querySelector('canvas')!;
  const stage = canvas.parentElement!;
  for (const node of [canvas, stage]) {
    Object.defineProperty(node, 'clientWidth', { value: 1_000, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 600, configurable: true });
  }
  return { ...view, figure, canvas, stage };
}
/** The exhibit, near and ready, not yet seen. */
async function ready(work: ShowWork | null = WORK) {
  const view = shown(work);
  nears();
  await waitFor(() => expect(view.figure).toHaveAttribute('data-phase', 'ready'));
  return view;
}
/** The exhibit ready and in view: it has opened by itself, and its performance runs. */
async function opened() {
  const view = await ready();
  sees(1);
  return view;
}

const made = () => engine.made.at(-1)!.engine;
const lastDraw = () => made().draws.at(-1)!;
/** The turn a draw was made with, read back from its lens. */
const yawOf = ({ lens }: Exposure) => Math.atan2(lens.rotation[2], lens.rotation[0]);
const pitchOf = ({ lens }: Exposure) => Math.atan2(-lens.rotation[7], -lens.rotation[4]);
const button = (name: string) => screen.getByRole('button', { name });

/** The callbacks the exhibit gives a ResizeObserver: a test calls them as a stage changes size. */
let resizers: (() => void)[] = [];

beforeEach(() => {
  engine.made = [];
  engine.staged = [];
  engine.refuse = false;
  engine.space = null;
  resizers = [];
  Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'playing' });
  motion.toggle.mockClear();
  frames = new Map();
  observers = [];
  now = 1_000;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameIds, callback);
    return frameIds;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options });
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
      }
      observe() {
        resizers.push(this.callback);
      }
      disconnect() {
        resizers = resizers.filter((callback) => callback !== this.callback);
      }
    },
  );
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the orbit in depth', () => {
  it('is the Light still and a sentence until it is near: nothing is asked of the browser', () => {
    const { figure, canvas } = shown();
    expect(figure).toHaveAttribute('data-phase', 'resting');
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(screen.getByRole('img', { name: '№ 023 · Light'.replace(' ', ' ') })).toBeVisible();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveAttribute('tabindex', '-1');
    // The line that waits is taken away where no script will ever compute it.
    expect(screen.getByText(t.depthWaiting)).toBeVisible();
    expect(screen.getByText(t.depthWaiting)).toHaveAttribute('data-awaits-stream');
    // What it is (an analysis, and of what) is the page's, beneath it, and the figure says where.
    expect(figure).toHaveAttribute('aria-describedby', 'orbit-about');
    for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled();
    expect(engine.made).toHaveLength(0);
    expect(engine.staged).toHaveLength(0);
  });

  it('readies itself once near, and offers itself to the hand, the keys and its buttons', async () => {
    const { canvas, figure } = await ready();
    expect(engine.staged).toEqual([WORK]);
    expect(canvas).toHaveAttribute('data-turns', 'true');
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAccessibleName(NAME);
    // How it is turned is said for a pointer and for a finger; the stylesheet shows one.
    expect(screen.getByText(t.depthHint)).toBeInTheDocument();
    expect(screen.getByText(t.depthHintTouch)).toBeInTheDocument();
    expect(screen.queryByText(t.depthWaiting)).toBeNull();
    expect(
      screen
        .getAllByRole('button')
        .map((control) => control.getAttribute('aria-label') ?? control.textContent),
    ).toEqual([
      t.depthTurnLeft,
      t.depthTurnRight,
      t.depthTiltUp,
      t.depthTiltDown,
      t.depthOpen,
      t.play,
    ]);
    expect(screen.getByText(t.depthHint)).not.toHaveAttribute('data-awaits-stream');
    for (const control of screen.getAllByRole('button')) expect(control).toBeEnabled();
    // Its lines stand alone in depth: broader than First Light's, which land on a still.
    expect(made().look.width).toBe(3);
    // Not yet seen, it has not opened: the still stands, and nothing is drawn over it.
    expect(figure).toHaveAttribute('data-view', 'picture');
    frameAt(1_100);
    expect(canvas.style.opacity).toBe('0');
    expect(made().draws).toHaveLength(0);
  });

  it('opens by itself as it comes into view: the picture in depth, its light run back, then the window', async () => {
    const { canvas, figure } = await opened();
    const began = now;
    expect(figure).toHaveAttribute('data-playing', 'playing');
    // The camera leaves the generator's view for one a quarter turn short of side on.
    runTo(began + OPEN_MS / 2);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(Number(canvas.style.opacity)).toBeGreaterThan(0);
    expect(yawOf(lastDraw())).toBeGreaterThan(0);
    expect(yawOf(lastDraw())).toBeLessThan(OPEN_TURN.yaw);
    // While it opens the whole window stands, and no body burns: it is the picture.
    expect(lastDraw()).toMatchObject({ drawn: 1, heads: 0, flare: 0, drift: 1 });
    runTo(began + OPEN_MS);
    expect(canvas.style.opacity).toBe('1');
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    expect(pitchOf(lastDraw())).toBeCloseTo(OPEN_TURN.pitch, 6);
    // Then the light runs back along its paths into three bodies…
    runTo(began + DEPTH_BEATS.hold + DEPTH_BEATS.rewind / 2);
    expect(lastDraw().drawn).toBeGreaterThan(0.2);
    expect(lastDraw().drawn).toBeLessThan(0.8);
    expect(lastDraw().heads).toBe(1);
    // …and the window plays again, at the film's pace: a third of the film, about a third drawn.
    runTo(began + REWOUND + (SECONDS * 1000) / 3);
    expect(lastDraw().drawn).toBeGreaterThan(0.3);
    expect(lastDraw().drawn).toBeLessThan(0.37);
    expect(screen.getByRole('button', { name: t.pause })).toBeEnabled();
    // At its closest approach the bodies flare.
    runTo(began + REWOUND + (SECONDS * 1000) / 2, 50);
    expect(
      Math.max(
        ...made()
          .draws.slice(-8)
          .map(({ flare }) => flare),
      ),
    ).toBeGreaterThan(0.5);
    // Played through, it rests in depth with the window whole, and offers to play again.
    runTo(began + REWOUND + SECONDS * 1000 + 200);
    expect(figure).toHaveAttribute('data-playing', 'ended');
    expect(lastDraw()).toMatchObject({ drawn: 1, heads: 1, flare: 0 });
    expect(button(t.again)).toBeEnabled();
    // At rest nothing asks for another frame.
    frameAt(now + 100);
    expect(frames.size).toBe(0);
  });

  it('carries the camera slowly round as the window plays, until a hand takes it', async () => {
    const { canvas } = await opened();
    const began = now;
    runTo(began + REWOUND + (SECONDS * 1000) / 2);
    // Half the film played: half the travel, beyond the view it opened onto.
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw + TRAVEL / 2, 2);
    const before = yawOf(lastDraw());
    // A hand takes it where it stands: nothing jumps, and the camera travels no more.
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 500,
      clientY: 300,
    });
    frameAt(now + 16);
    expect(yawOf(lastDraw())).toBeCloseTo(before, 2);
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 400,
      clientY: 300,
    });
    frameAt(now + 16);
    // Drawn left by a tenth of the stage, it turns a tenth of half a turn.
    expect(yawOf(lastDraw())).toBeCloseTo(before + Math.PI / 10, 2);
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse' });
    const left = before + Math.PI / 10;
    // Let go, it stays where it was left while the window plays on.
    runTo(now + 5_000);
    expect(yawOf(lastDraw())).toBeCloseTo(left, 2);
    expect(lastDraw().drawn).toBeGreaterThan(0.6);
  });

  it('steps round and tips by its four buttons, led and not jumped, and returns by one word', async () => {
    const { canvas, figure } = await opened();
    const began = now;
    runTo(began + OPEN_MS + 50);
    fireEvent.click(button(t.depthTurnLeft));
    const from = yawOf(lastDraw());
    frameAt(now + STEP_MS / 2);
    expect(yawOf(lastDraw())).toBeGreaterThan(from);
    expect(yawOf(lastDraw())).toBeLessThan(from + 2 * YAW_STEP);
    frameAt(now + STEP_MS);
    expect(yawOf(lastDraw())).toBeCloseTo(from + 2 * YAW_STEP, 6);
    fireEvent.click(button(t.depthTurnRight));
    frameAt(now + STEP_MS);
    expect(yawOf(lastDraw())).toBeCloseTo(from, 6);
    // Up and down tip it, the one way to tilt it that asks for no drag and no key.
    fireEvent.click(button(t.depthTiltUp));
    frameAt(now + STEP_MS);
    expect(pitchOf(lastDraw())).toBeCloseTo(OPEN_TURN.pitch - 2 * PITCH_STEP, 6);
    fireEvent.click(button(t.depthTiltDown));
    frameAt(now + STEP_MS);
    expect(pitchOf(lastDraw())).toBeCloseTo(OPEN_TURN.pitch, 6);
    expect(yawOf(lastDraw())).toBeCloseTo(from, 6);
    // A step that would rest within twenty degrees of the picture's view, where the drawing
    // lies half over the still, goes on to the picture's view; the window waits there.
    fireEvent.click(button(t.depthTurnRight));
    frameAt(now + STEP_MS / 2);
    expect(Number(canvas.style.opacity)).toBeGreaterThan(0);
    frameAt(now + STEP_MS);
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(canvas.style.opacity).toBe('0');
    expect(figure).toHaveAttribute('data-playing', 'held');
    // And the next step opens it on the other side.
    fireEvent.click(button(t.depthTurnRight));
    frameAt(now + OPEN_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(canvas.style.opacity).toBe('1');
    expect(yawOf(lastDraw())).toBeCloseTo(-OPEN_TURN.yaw, 6);
    // The one word for the view it opens from returns it there: the still alone.
    fireEvent.click(button(t.orbitGeneratorView));
    frameAt(now + SPRING_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(canvas.style.opacity).toBe('0');
    expect(screen.queryByRole('button', { name: t.orbitGeneratorView })).toBeNull();
    // And one word opens it again, onto the view it first opened on.
    fireEvent.click(button(t.depthOpen));
    frameAt(now + OPEN_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    // From the picture's view a tip opens it too, as far as the depth needs to stand open.
    fireEvent.click(button(t.orbitGeneratorView));
    frameAt(now + SPRING_MS + 20);
    fireEvent.click(button(t.depthTiltDown));
    frameAt(now + STEP_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(canvas.style.opacity).toBe('1');
    expect(pitchOf(lastDraw())).toBeGreaterThan(0.34);
    expect(yawOf(lastDraw())).toBeCloseTo(0, 6);
  });

  it('never rests part-open: a small turn goes on into depth, and one being closed goes back to the picture', async () => {
    const { canvas, figure } = await ready();
    const mouse = { pointerId: 1, pointerType: 'mouse', button: 0 };
    // A drag of 70 px is thirteen degrees: let go there, the drawing would lie half over the still.
    fireEvent.pointerDown(canvas, { ...mouse, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(canvas, { ...mouse, clientX: 430, clientY: 300 });
    frameAt(now + 16);
    expect(Number(canvas.style.opacity)).toBeGreaterThan(0.2);
    expect(Number(canvas.style.opacity)).toBeLessThan(0.8);
    fireEvent.pointerUp(canvas, mouse);
    frameAt(now + SETTLE_MS + 20);
    // It goes on, the way it was being turned, to where the depth stands open, and rests.
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(canvas.style.opacity).toBe('1');
    expect(yawOf(lastDraw())).toBeCloseTo(0.35, 2);
    expect(frames.size).toBe(0);
    // Drawn back toward the picture's view and let go, it goes back to the picture.
    fireEvent.pointerDown(canvas, { ...mouse, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(canvas, { ...mouse, clientX: 560, clientY: 300 });
    fireEvent.pointerUp(canvas, mouse);
    frameAt(now + SETTLE_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(canvas.style.opacity).toBe('0');
    // A key's step from the picture's view opens it as far as it must, and the step back closes it.
    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    frameAt(now + STEP_MS);
    expect(canvas.style.opacity).toBe('1');
    expect(pitchOf(lastDraw())).toBeCloseTo(-0.35, 2);
    fireEvent.keyDown(canvas, { key: 'ArrowDown' });
    frameAt(now + STEP_MS);
    expect(figure).toHaveAttribute('data-view', 'picture');
    // A click on the stage while it opens by itself catches it part-way, and it goes on or back.
    sees(1);
    frameAt(now + 16);
    fireEvent.click(button(t.depthOpen));
    frameAt(now + OPEN_MS / 4);
    fireEvent.pointerDown(canvas, { ...mouse, clientX: 500, clientY: 300 });
    fireEvent.pointerUp(canvas, mouse);
    frameAt(now + SETTLE_MS + 20);
    expect(['0', '1']).toContain(canvas.style.opacity);
  });

  it('turns by the arrow keys, returns by Home or Escape, and plays or pauses by Space', async () => {
    const { canvas, figure } = await ready();
    // From the generator's view a first press to a side opens it to that side.
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    frameAt(now + OPEN_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(yawOf(lastDraw())).toBeCloseTo(-OPEN_TURN.yaw, 6);
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    frameAt(now + STEP_MS);
    expect(yawOf(lastDraw())).toBeCloseTo(-OPEN_TURN.yaw + YAW_STEP, 6);
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
    frameAt(now + STEP_MS);
    expect(pitchOf(lastDraw())).toBeCloseTo(OPEN_TURN.pitch + 3 * PITCH_STEP, 6);
    // A key held with a modifier is the browser's own.
    const kept = yawOf(lastDraw());
    fireEvent.keyDown(canvas, { key: 'ArrowLeft', metaKey: true });
    frameAt(now + STEP_MS);
    expect(yawOf(lastDraw())).toBeCloseTo(kept, 6);
    // Space plays the window, and holds it.
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(figure).toHaveAttribute('data-playing', 'playing');
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(figure).toHaveAttribute('data-playing', 'held');
    for (const key of ['Home', 'Escape']) {
      fireEvent.keyDown(canvas, { key });
      frameAt(now + SPRING_MS + 20);
      expect(figure, key).toHaveAttribute('data-view', 'picture');
      fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
      frameAt(now + OPEN_MS + 20);
      expect(figure, key).toHaveAttribute('data-view', 'depth');
    }
  });

  it('holds its performance, and plays it again from the bodies, by its own words', async () => {
    const { figure } = await opened();
    const began = now;
    runTo(began + REWOUND + 6_000);
    const reached = lastDraw().drawn;
    fireEvent.click(button(t.pause));
    expect(figure).toHaveAttribute('data-playing', 'held');
    runTo(now + 3_000);
    expect(lastDraw().drawn).toBe(reached);
    // Play goes on from where it was held.
    fireEvent.click(button(t.play));
    runTo(now + 3_000);
    expect(lastDraw().drawn).toBeGreaterThan(reached);
    // Played through, Again runs the light back first, then the window.
    runTo(began + REWOUND + SECONDS * 1000 + 4_000);
    expect(figure).toHaveAttribute('data-playing', 'ended');
    // The camera has travelled round as it played, and rests there.
    const rested = yawOf(lastDraw());
    expect(rested).toBeCloseTo(OPEN_TURN.yaw + TRAVEL, 2);
    fireEvent.click(button(t.again));
    frameAt(now + 16);
    // Played again, the camera goes on from where it has come to: it does not cut back.
    expect(yawOf(lastDraw())).toBeCloseTo(rested, 3);
    frameAt(now + DEPTH_BEATS.rewind / 2);
    expect(lastDraw().drawn).toBeLessThan(1);
    runTo(now + DEPTH_BEATS.rewind);
    expect(lastDraw().drawn).toBeLessThan(0.05);
    expect(yawOf(lastDraw())).toBeCloseTo(rested, 3);
    runTo(now + (SECONDS * 1000) / 2);
    expect(yawOf(lastDraw())).toBeGreaterThan(rested + 0.3);
  });

  it('plays in depth: Play pressed as it springs back opens it again', async () => {
    const { canvas, figure } = await opened();
    runTo(now + REWOUND + 3_000);
    fireEvent.keyDown(canvas, { key: 'Escape' });
    frameAt(now + SPRING_MS / 4);
    expect(figure).toHaveAttribute('data-playing', 'held');
    fireEvent.keyDown(canvas, { key: ' ' });
    runTo(now + OPEN_MS + SPRING_MS);
    // It did not land on the picture with the window playing unseen beneath it.
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(figure).toHaveAttribute('data-playing', 'playing');
    expect(canvas.style.opacity).toBe('1');
  });

  it('waits where it stood while out of view, and goes on when it is seen again', async () => {
    await opened();
    const began = now;
    runTo(began + REWOUND + 5_000);
    const reached = lastDraw().drawn;
    sees(0);
    runTo(now + 4_000);
    expect(lastDraw().drawn).toBe(reached);
    sees(1);
    runTo(now + 2_000);
    expect(lastDraw().drawn).toBeGreaterThan(reached);
    // The time it waited is not played through in one stride.
    expect(lastDraw().drawn).toBeLessThan(reached + 0.1);
  });

  it('opens once half of it is seen, and at once if it is seen before it is ready', async () => {
    const first = await ready();
    // A third of the stage on the screen is not yet the exhibit in view.
    sees(0.3);
    frameAt(now + 500);
    expect(first.figure).toHaveAttribute('data-view', 'picture');
    expect(first.figure).toHaveAttribute('data-playing', 'idle');
    sees(0.5);
    frameAt(now + 16);
    expect(first.figure).toHaveAttribute('data-view', 'depth');
    expect(first.figure).toHaveAttribute('data-playing', 'playing');
    first.unmount();
    // The order a visitor who arrives at the part meets: on the screen first, ready after.
    const second = shown();
    sees(1);
    nears();
    await waitFor(() => expect(second.figure).toHaveAttribute('data-phase', 'ready'));
    frameAt(now + 16);
    expect(second.figure).toHaveAttribute('data-view', 'depth');
    expect(second.figure).toHaveAttribute('data-playing', 'playing');
  });

  it('opens and plays nothing unasked where motion is unwelcome: its buttons step it in one move', async () => {
    motion.paused = true;
    const { figure, canvas, rerender } = await ready();
    sees(1);
    frameAt(now + 2_000);
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(figure).toHaveAttribute('data-playing', 'idle');
    expect(canvas.style.opacity).toBe('0');
    // One word shows it in depth at once: the whole window, turned, and nothing moves to get there.
    fireEvent.click(button(t.depthOpen));
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(canvas.style.opacity).toBe('1');
    expect(lastDraw()).toMatchObject({ drawn: 1, heads: 1 });
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    fireEvent.click(button(t.depthTurnLeft));
    frameAt(now + 16);
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw + 2 * YAW_STEP, 6);
    expect(frames.size).toBe(0);
    // Asked back, it is there in one step.
    fireEvent.click(button(t.orbitGeneratorView));
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'picture');
    // Play is an explicit word: it lifts the pause, as a plate's does, and then it plays.
    fireEvent.click(button(t.play));
    expect(motion.toggle).toHaveBeenCalledOnce();
    motion.paused = false;
    rerender(exhibit());
    expect(figure).toHaveAttribute('data-playing', 'playing');
    expect(button(t.pause)).toBeEnabled();
  });

  it('holds its performance under a hush, and goes on when it lifts', async () => {
    const view = await opened();
    const began = now;
    runTo(began + REWOUND + 4_000);
    const reached = lastDraw().drawn;
    motion.theatre = 'hushed';
    view.rerender(exhibit());
    runTo(now + 3_000);
    expect(lastDraw().drawn).toBe(reached);
    motion.theatre = 'playing';
    view.rerender(exhibit());
    runTo(now + 2_000);
    expect(lastDraw().drawn).toBeGreaterThan(reached);
  });

  it('is held by the visitor’s own Pause where it stands, says so, and plays on by its own word', async () => {
    const view = await opened();
    const began = now;
    runTo(began + REWOUND + (SECONDS * 1000) / 2);
    const reached = lastDraw().drawn;
    const turned = yawOf(lastDraw());
    expect(turned).toBeCloseTo(OPEN_TURN.yaw + TRAVEL / 2, 2);
    motion.paused = true;
    view.rerender(exhibit());
    runTo(now + 3_000);
    // Nothing moves: not the window, and not the camera, which stays where it had travelled to.
    expect(lastDraw().drawn).toBe(reached);
    expect(yawOf(lastDraw())).toBeCloseTo(turned, 6);
    // It says it is held: the word is Play, as a plate's is, and Play lifts the pause.
    expect(view.figure).toHaveAttribute('data-playing', 'held');
    expect(screen.queryByRole('button', { name: t.pause })).toBeNull();
    fireEvent.click(button(t.play));
    expect(motion.toggle).toHaveBeenCalledOnce();
    motion.paused = false;
    view.rerender(exhibit());
    runTo(now + 2_000);
    expect(view.figure).toHaveAttribute('data-playing', 'playing');
    expect(lastDraw().drawn).toBeGreaterThan(reached);
    expect(yawOf(lastDraw())).toBeGreaterThan(turned);
  });

  it('is where it was going at once when motion becomes unwelcome as it opens', async () => {
    const view = await opened();
    const began = now;
    runTo(began + OPEN_MS / 3);
    expect(yawOf(lastDraw())).toBeLessThan(OPEN_TURN.yaw - 0.1);
    motion.paused = true;
    view.rerender(exhibit());
    frameAt(now + 16);
    // The camera does not glide on under a pause: it stands open, on the view it was opening to.
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    expect(view.canvas.style.opacity).toBe('1');
    frameAt(now + 16);
    expect(frames.size).toBe(0);
  });

  it('does not open by itself under reduced motion, but plays when it is asked', async () => {
    motion.reducedMotion = true;
    const { figure } = await ready();
    sees(1);
    frameAt(now + 2_000);
    expect(figure).toHaveAttribute('data-view', 'picture');
    fireEvent.click(button(t.play));
    frameAt(now + 16);
    // It is shown in depth in one step, and the window plays; the camera does not travel.
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(figure).toHaveAttribute('data-playing', 'playing');
    const asked = now;
    runTo(asked + REWOUND + 10_000);
    // Ten seconds of a film of thirty: a third of the window drawn, not the whole of it.
    expect(lastDraw().drawn).toBeGreaterThan(0.2);
    expect(lastDraw().drawn).toBeLessThan(0.45);
    expect(figure).toHaveAttribute('data-playing', 'playing');
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    runTo(asked + REWOUND + SECONDS * 1000 + 500);
    expect(figure).toHaveAttribute('data-playing', 'ended');
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
  });

  it('is taken by a finger only after a hold, so a swipe still scrolls the page', async () => {
    const { canvas, figure } = await ready();
    const touch = { pointerId: 7, pointerType: 'touch' };
    // A swipe: the finger travels before the hold, and the orbit is left alone.
    fireEvent.pointerDown(canvas, { ...touch, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(canvas, { ...touch, clientX: 200, clientY: 340 });
    frameAt(now + HOLD_MS + 20);
    fireEvent.pointerUp(canvas, touch);
    expect(figure).toHaveAttribute('data-view', 'picture');
    // A hold takes it; then it follows the finger, and the page's own move is held back.
    fireEvent.pointerDown(canvas, { ...touch, clientX: 200, clientY: 300 });
    frameAt(now + HOLD_MS + 20);
    fireEvent.pointerMove(canvas, { ...touch, clientX: 500, clientY: 300 });
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'depth');
    const held = new Event('touchmove', { cancelable: true });
    canvas.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    fireEvent.pointerUp(canvas, touch);
    frameAt(now + 1_000);
    // Let go, it stays.
    expect(figure).toHaveAttribute('data-view', 'depth');
    const free = new Event('touchmove', { cancelable: true });
    canvas.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
    // A touch the browser has already given to the page (it cannot be cancelled) is never taken.
    fireEvent.keyDown(canvas, { key: 'Home' });
    frameAt(now + SPRING_MS + 20);
    fireEvent.pointerDown(canvas, { ...touch, clientX: 200, clientY: 300 });
    canvas.dispatchEvent(new Event('touchstart', { cancelable: false }));
    frameAt(now + HOLD_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'picture');
  });

  it('is not taken by a swipe or a tap that lands on its stage: it still opens by itself, and its camera travels on', async () => {
    const { canvas, figure } = await ready();
    const touch = { pointerId: 9, pointerType: 'touch' };
    // The stage comes up under a scrolling thumb before half of it is in view.
    fireEvent.pointerDown(canvas, { ...touch, clientX: 200, clientY: 500 });
    fireEvent.pointerMove(canvas, { ...touch, clientX: 200, clientY: 380 });
    fireEvent.pointerUp(canvas, touch);
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'picture');
    // Seen, it opens by itself all the same, and performs.
    sees(1);
    const began = now;
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(figure).toHaveAttribute('data-playing', 'playing');
    // A tap while it plays is no hand on it either: the camera travels on.
    runTo(began + REWOUND + (SECONDS * 1000) / 4);
    fireEvent.pointerDown(canvas, { ...touch, clientX: 200, clientY: 300 });
    frameAt(now + 60);
    fireEvent.pointerUp(canvas, touch);
    const tapped = yawOf(lastDraw());
    runTo(began + REWOUND + (SECONDS * 1000) / 2);
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw + TRAVEL / 2, 2);
    expect(yawOf(lastDraw())).toBeGreaterThan(tapped + 0.1);
  });

  it('is taken by a finger that holds it while the camera travels, where it stands: nothing jumps', async () => {
    const { canvas } = await opened();
    const began = now;
    runTo(began + REWOUND + (SECONDS * 1000) / 2);
    const before = yawOf(lastDraw());
    const touch = { pointerId: 3, pointerType: 'touch' };
    fireEvent.pointerDown(canvas, { ...touch, clientX: 500, clientY: 300 });
    // The hold is reached: the orbit is the finger's from the view it had come to.
    frameAt(now + HOLD_MS + 20);
    expect(yawOf(lastDraw())).toBeCloseTo(before, 3);
    // Held, the camera travels no more, though the window plays on.
    const played = lastDraw().drawn;
    runTo(now + 2_000);
    expect(yawOf(lastDraw())).toBeCloseTo(before, 3);
    expect(lastDraw().drawn).toBeGreaterThan(played);
    // And it follows the finger from there: a tenth of the stage, a tenth of half a turn.
    fireEvent.pointerMove(canvas, { ...touch, clientX: 400, clientY: 300 });
    frameAt(now + 16);
    expect(yawOf(lastDraw())).toBeCloseTo(before + Math.PI / 10, 2);
    fireEvent.pointerUp(canvas, touch);
  });

  it('ignores a press that is not the main button, and a pointer it does not hold', async () => {
    const { canvas, figure } = await ready();
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientX: 5,
      clientY: 5,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 5 });
    fireEvent.pointerMove(canvas, { pointerId: 9, pointerType: 'mouse', clientX: 400, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 9, pointerType: 'mouse' });
    frameAt(now + 50);
    expect(figure).toHaveAttribute('data-view', 'picture');
    // The menu is the browser's at the generator's view, and the orbit's own once it is turned.
    expect(fireEvent.contextMenu(canvas)).toBe(true);
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    frameAt(now + OPEN_MS + 20);
    expect(fireEvent.contextMenu(canvas)).toBe(false);
    // While one pointer holds it, another's move turns nothing and another's release frees nothing.
    const mouse = { pointerId: 1, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(canvas, { ...mouse, clientX: 500, clientY: 300 });
    frameAt(now + 16);
    const held = yawOf(lastDraw());
    fireEvent.pointerMove(canvas, { pointerId: 9, pointerType: 'pen', clientX: 100, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 9, pointerType: 'pen' });
    frameAt(now + 16);
    expect(yawOf(lastDraw())).toBeCloseTo(held, 6);
    fireEvent.pointerMove(canvas, { ...mouse, clientX: 400, clientY: 300 });
    frameAt(now + 16);
    expect(yawOf(lastDraw())).toBeCloseTo(held + Math.PI / 10, 6);
    fireEvent.pointerUp(canvas, mouse);
  });

  it('is not left held by nobody when two fingers land on it', async () => {
    const { canvas, figure } = await ready();
    const first = { pointerId: 11, pointerType: 'touch', isPrimary: true };
    const second = { pointerId: 12, pointerType: 'touch', isPrimary: false };
    // A two-finger tap: the second finger is the page's (a pinch) and takes nothing.
    fireEvent.pointerDown(canvas, { ...first, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(canvas, { ...second, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, first);
    fireEvent.pointerUp(canvas, second);
    frameAt(now + HOLD_MS + 50);
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-view', 'picture');
    expect(button(t.depthOpen)).toBeEnabled();
    // The arrows still answer.
    fireEvent.click(button(t.depthTurnLeft));
    frameAt(now + OPEN_MS + 20);
    expect(figure).toHaveAttribute('data-view', 'depth');
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw, 6);
    fireEvent.click(button(t.depthTurnLeft));
    frameAt(now + STEP_MS + 20);
    expect(yawOf(lastDraw())).toBeCloseTo(OPEN_TURN.yaw + 2 * YAW_STEP, 6);
  });

  it('draws the same moment again when its stage changes size, at rest too', async () => {
    const { stage, canvas, figure } = await opened();
    const began = now;
    runTo(began + REWOUND + SECONDS * 1000 + 500);
    expect(figure).toHaveAttribute('data-playing', 'ended');
    frameAt(now + 16);
    expect(frames.size).toBe(0);
    expect(made().sizes.at(-1)!.slice(0, 2)).toEqual([1_000, 600]);
    const drawn = made().draws.length;
    for (const node of [canvas, stage]) {
      Object.defineProperty(node, 'clientWidth', { value: 390, configurable: true });
      Object.defineProperty(node, 'clientHeight', { value: 468, configurable: true });
    }
    // At rest nothing draws unless the stage's own observer asks.
    frameAt(now + 16);
    expect(made().draws).toHaveLength(drawn);
    act(() => resizers.forEach((callback) => callback()));
    frameAt(now + 16);
    expect(made().draws).toHaveLength(drawn + 1);
    expect(made().sizes.at(-1)!.slice(0, 2)).toEqual([390, 468]);
  });

  it('holds a figure that fills its plate whole on the stage once it is turned', async () => {
    // Three bodies on loops that reach nine tenths of the way to the plate's edges, and as deep.
    const count = 240;
    const points = new Float32Array(count * 9);
    for (let sample = 0; sample < count; sample++)
      for (let body = 0; body < 3; body++) {
        const turn = ((sample / count) * (body + 1) + body / 3) * 2 * Math.PI;
        const at = (sample * 3 + body) * 3;
        points[at] = Math.cos(turn) * 1_728 * 0.8;
        points[at + 1] = Math.sin(turn + body) * 1_117 * 0.9;
        points[at + 2] = Math.sin(2 * turn + body) * 1_117 * 0.9;
      }
    engine.space = {
      ...space(),
      stride: 1,
      count,
      steps: Float64Array.from({ length: count }, (_, i) =>
        Math.round((i / (count - 1)) * (STEPS - 1)),
      ),
      points,
      drift: new Float32Array(count * 3),
    };
    const { canvas } = await opened();
    runTo(now + OPEN_MS + 50);
    expect(canvas.style.opacity).toBe('1');
    // The still lies 928 px wide on this stage: 0.2685 screen points to a point of the plate.
    const still = 928.1 / 3_456;
    // Turned at that scale the figure would leave the stage: the camera has stepped back.
    expect(lastDraw().lens.pixelScale).toBeLessThan(still * 0.95);
    expect(lastDraw().lens.pixelScale).toBeGreaterThan(still * 0.3);
  });

  it('keeps a small figure at the still’s own scale', async () => {
    await opened();
    runTo(now + OPEN_MS + 50);
    expect(lastDraw().lens.pixelScale).toBeCloseTo(928.11 / 3_456, 3);
  });

  it('says so, and leaves the still, where the browser cannot draw it', async () => {
    engine.refuse = true;
    const { figure, canvas } = shown();
    nears();
    await waitFor(() => expect(figure).toHaveAttribute('data-phase', 'unavailable'));
    expect(screen.getByText(t.depthUnavailable)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(t.depthUnavailable);
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled();
    // Seen, it asks for no frame: there is nothing to draw.
    frameAt(now + 16);
    sees(1);
    expect(frames.size).toBe(0);
  });

  it('gives the still back if the engine is lost, and says it cannot be drawn', async () => {
    const { figure, canvas } = await opened();
    runTo(now + OPEN_MS + 100);
    made().lost = true;
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-phase', 'unavailable');
    expect(canvas.style.opacity).toBe('0');
    expect(screen.getByRole('status')).toHaveTextContent(t.depthUnavailable);
  });

  it('gives the still back at once when the context is lost while the orbit rests', async () => {
    const { figure, canvas } = await opened();
    const began = now;
    runTo(began + REWOUND + SECONDS * 1000 + 500);
    frameAt(now + 16);
    // At rest in depth nothing is being drawn, and no frame is waited for.
    expect(frames.size).toBe(0);
    expect(canvas.style.opacity).toBe('1');
    made().lost = true;
    fireEvent(canvas, new Event('webglcontextlost'));
    frameAt(now + 16);
    expect(figure).toHaveAttribute('data-phase', 'unavailable');
    expect(canvas.style.opacity).toBe('0');
  });

  it('stands as the still alone for a work with no frame to perform it on', () => {
    const { figure } = shown(null);
    nears();
    expect(figure).toHaveAttribute('data-phase', 'resting');
    expect(screen.getByText(t.depthUnavailable)).toBeVisible();
    expect(engine.made).toHaveLength(0);
  });

  it('lets the engine go when it leaves the page', async () => {
    const view = await opened();
    runTo(now + 500);
    const engineMade = made();
    view.unmount();
    expect(engineMade.disposed).toBe(true);
    expect(frames.size).toBe(0);
  });
});
