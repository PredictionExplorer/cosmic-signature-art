import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, SPRING_MS } from '@/lib/first-light/hand';
import { hexToLinear } from '@/lib/first-light/material';
import type { PlateSpace } from '@/lib/first-light/samples';
import type { Engine, Exposure } from './first-light-engine';
import { OrbitSculpture, type Sculpture } from './orbit-sculpture';

const engine = vi.hoisted(() => ({
  made: [] as { canvas: HTMLCanvasElement; ink: unknown; engine: FakeEngine }[],
  refuse: false,
}));
type FakeEngine = Engine & {
  draws: Exposure[];
  scenes: unknown[][];
  disposed: boolean;
};
vi.mock('./first-light-engines', () => ({
  createEngine: async (canvas: HTMLCanvasElement, ink?: unknown) => {
    if (engine.refuse) return null;
    const made: FakeEngine = {
      lost: false,
      look: { intensity: 1, width: 1, glow: 0, exposure: 1, bodySize: 1 },
      draws: [],
      scenes: [],
      disposed: false,
      setScene(...args: unknown[]) {
        made.scenes.push(args);
      },
      resize() {},
      draw(exposure) {
        made.draws.push(exposure);
      },
      dispose() {
        made.disposed = true;
      },
    };
    engine.made.push({ canvas, ink, engine: made });
    return made;
  },
}));
const image = vi.hoisted(() => ({ width: 640 }));
vi.mock('./decoded-image', () => ({ decoded: async () => image }));

let frames = new Map<number, FrameRequestCallback>();
let frameIds = 0;
let now = 0;

/** Runs the frames now due, at `at`. */
function nextFrame(at = now) {
  now = at;
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((callback) => callback(at)));
}

function space(): PlateSpace {
  return {
    stride: 100,
    count: 3,
    steps: Float64Array.from([0, 100, 199]),
    width: 3_456,
    height: 2_234,
    scale: 1,
    points: Float32Array.from({ length: 27 }, (_, i) => (i % 7) * 10),
    drift: new Float32Array(9),
    depthCentre: 0,
    centre: [0, 0, 0],
    copies: [{ cos: 1, sin: 0, scale: 1, mirror: false }],
  };
}

const onReady = vi.fn();
const onTurned = vi.fn();
const onPlayPause = vi.fn();

function Staged(props: {
  handle: React.RefObject<Sculpture | null>;
  material?: 'light' | 'ink';
  tone?: string;
  still?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  return (
    <div ref={stage} data-testid="stage">
      <OrbitSculpture
        handle={props.handle}
        stage={stage}
        space={SPACE}
        material={props.material ?? 'light'}
        tone={props.tone}
        colours="/art/31-light-640.webp"
        hues={[19.2, 22.5, 9.2]}
        closestStep={100}
        still={props.still ?? false}
        label="The orbit in depth"
        onReady={onReady}
        onTurned={onTurned}
        onPlayPause={onPlayPause}
      />
    </div>
  );
}
const SPACE = space();

async function staged(props: Partial<Parameters<typeof Staged>[0]> = {}) {
  const handle = createRef<Sculpture | null>() as React.RefObject<Sculpture | null>;
  const view = render(<Staged handle={handle} {...props} />);
  const canvas = view.container.querySelector('canvas')!;
  Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 517, configurable: true });
  const stage = view.getByTestId('stage');
  return { ...view, canvas, stage, handle };
}

const cover = (stage: HTMLElement) => Number(stage.style.getPropertyValue('--cover') || 0);
const lastDraw = () => engine.made.at(-1)!.engine.draws.at(-1)!;

beforeEach(() => {
  engine.made = [];
  engine.refuse = false;
  frames = new Map();
  now = 1_000;
  onReady.mockClear();
  onTurned.mockClear();
  onPlayPause.mockClear();
  vi.stubGlobal('WebGL2RenderingContext', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameIds, callback);
    return frameIds;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the orbit in the hand', () => {
  it('waits for the engine, then offers itself to the hand and the keyboard', async () => {
    const { canvas } = await staged();
    expect(canvas).toHaveAttribute('data-turns', 'false');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    expect(canvas).toHaveAttribute('data-turns', 'true');
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAccessibleName('The orbit in depth');
    // Light reads its colours from the still; it draws nothing until it is turned.
    const [{ ink, engine: made }] = engine.made;
    expect(ink).toBeUndefined();
    expect(made.scenes).toEqual([[SPACE, image]]);
    expect(made.draws).toHaveLength(0);
  });

  it('lays ink on the sheet’s own tone, and needs no still for it', async () => {
    await staged({ material: 'ink', tone: '#efe8dc' });
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    const [{ ink, engine: made }] = engine.made;
    expect(ink).toMatchObject({ paper: hexToLinear('#efe8dc'), bodyRadius: 0.025 });
    expect(made.scenes).toEqual([[SPACE, undefined]]);
  });

  it('is never offered where it cannot be drawn', async () => {
    engine.refuse = true;
    const { canvas } = await staged();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas).toHaveAttribute('data-turns', 'false');
    // Ink without the sheet's tone is not drawn either.
    cleanup();
    engine.refuse = false;
    const ink = await staged({ material: 'ink' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.made).toHaveLength(0);
    expect(ink.canvas).toHaveAttribute('data-turns', 'false');
  });

  it('turns with a drag, opens into depth, and springs back exactly to the view', async () => {
    const { canvas, stage } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 500,
      clientY: 300,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 300,
      clientY: 340,
    });
    nextFrame(1_016);
    expect(canvas).toHaveAttribute('data-view', 'turned');
    expect(onTurned).toHaveBeenLastCalledWith(true);
    expect(cover(stage)).toBe(1);
    // 200 pixels of an 800-pixel stage: a quarter turn of yaw, in depth.
    expect(lastDraw().lens.inverseDistance).toBeGreaterThan(0);
    expect(lastDraw().drift).toBe(0);
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse' });
    nextFrame(1_016 + SPRING_MS / 2);
    expect(cover(stage)).toBeGreaterThan(0);
    nextFrame(1_016 + SPRING_MS + 1);
    expect(canvas).toHaveAttribute('data-view', 'flat');
    expect(onTurned).toHaveBeenLastCalledWith(false);
    expect(cover(stage)).toBe(0);
    // At rest it asks for no more frames.
    expect(frames.size).toBe(0);
  });

  it('draws the moment the section stands at while it is turned', async () => {
    const { canvas, handle } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(canvas, { key: 'ArrowLeft', shiftKey: true });
    nextFrame();
    act(() => handle.current!.at(100));
    nextFrame();
    expect(lastDraw().drawn).toBeCloseTo(0.5, 12);
    // The closest approach is at step 100: the light flares there.
    expect(lastDraw().flare).toBeCloseTo(1, 12);
  });

  it('turns by keys and stays, returns on Escape, and plays or pauses on Space', async () => {
    const { canvas } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    nextFrame(5_000);
    expect(canvas).toHaveAttribute('data-view', 'turned');
    nextFrame(50_000);
    expect(canvas).toHaveAttribute('data-view', 'turned');
    fireEvent.keyDown(canvas, { key: 'Escape' });
    nextFrame(50_000 + SPRING_MS + 1);
    expect(canvas).toHaveAttribute('data-view', 'flat');
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('is given back by the section’s own word', async () => {
    const { canvas, handle } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    nextFrame();
    act(() => handle.current!.back());
    nextFrame(now + SPRING_MS + 1);
    expect(canvas).toHaveAttribute('data-view', 'flat');
  });

  it('takes a finger only after a hold', async () => {
    const { canvas } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.pointerDown(canvas, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 400,
      clientY: 200,
    });
    nextFrame(1_000 + HOLD_MS / 2);
    expect(canvas).toHaveAttribute('data-view', 'flat');
    nextFrame(1_000 + HOLD_MS);
    fireEvent.pointerMove(canvas, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });
    nextFrame(1_000 + HOLD_MS + 16);
    expect(canvas).toHaveAttribute('data-view', 'turned');
    // A swipe that moves before the hold scrolls the page and never turns it.
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'touch' });
    nextFrame(10_000);
    fireEvent.pointerDown(canvas, {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 400,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 400,
      clientY: 260,
    });
    nextFrame(10_000 + HOLD_MS * 2);
    expect(canvas).toHaveAttribute('data-view', 'flat');
  });

  it('leaves to the page a touch that lands while the page still coasts, and holds back only what it may', async () => {
    const { canvas } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    const touched = (type: 'touchstart' | 'touchmove', cancelable: boolean) => {
      const event = new Event(type, { bubbles: true, cancelable });
      fireEvent(canvas, event);
      return event;
    };
    const finger = (pointerId: number, clientX: number) => ({
      pointerId,
      pointerType: 'touch',
      clientX,
      clientY: 200,
    });
    // A finger that stops a coasting page: the browser marks the touch as the page's (its
    // touchstart cannot be cancelled). However long it rests, the hand does not take it, and
    // no move of it is held back.
    fireEvent.pointerDown(canvas, finger(7, 400));
    touched('touchstart', false);
    nextFrame(1_000 + HOLD_MS * 2);
    fireEvent.pointerMove(canvas, finger(7, 200));
    nextFrame(1_000 + HOLD_MS * 2 + 16);
    expect(canvas).toHaveAttribute('data-view', 'flat');
    expect(touched('touchmove', true).defaultPrevented).toBe(false);
    fireEvent.pointerUp(canvas, finger(7, 200));
    // With the page at rest the touch is the orbit's: held, it is taken, and the page is kept
    // still beneath it.
    nextFrame(10_000);
    fireEvent.pointerDown(canvas, finger(8, 400));
    touched('touchstart', true);
    nextFrame(10_000 + HOLD_MS);
    expect(touched('touchmove', true).defaultPrevented).toBe(true);
    fireEvent.pointerMove(canvas, finger(8, 200));
    nextFrame(10_000 + HOLD_MS + 16);
    expect(canvas).toHaveAttribute('data-view', 'turned');
    // A move the browser will not let be held back is not asked for: asking logs an error.
    const late = new Event('touchmove', { bubbles: true, cancelable: false });
    const asked = vi.spyOn(late, 'preventDefault');
    fireEvent(canvas, late);
    expect(asked).not.toHaveBeenCalled();
  });

  it('returns at once where motion is unwelcome', async () => {
    const { canvas, stage } = await staged({ still: true });
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 500,
      clientY: 300,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 300,
    });
    nextFrame();
    expect(cover(stage)).toBe(1);
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse' });
    nextFrame();
    expect(canvas).toHaveAttribute('data-view', 'flat');
    expect(cover(stage)).toBe(0);
  });

  it('gives the drawing back whole and lets the engine go when it leaves', async () => {
    const { canvas, stage, unmount } = await staged();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(canvas, { key: 'ArrowLeft', shiftKey: true });
    nextFrame();
    expect(cover(stage)).toBe(1);
    unmount();
    expect(engine.made[0].engine.disposed).toBe(true);
    expect(stage.style.getPropertyValue('--cover')).toBe('');
  });
});
