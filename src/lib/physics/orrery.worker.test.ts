import { afterEach, describe, expect, it, vi } from 'vitest';
import { performedOrbits } from '@/lib/art/orbit-windows';
import type { OrreryReply, OrreryRequest } from './orrery';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

const [orbit] = performedOrbits([31]);

/** A canvas handed to the worker, counting the strokes made on it; or one with no context. */
function canvas(drawable = true) {
  const strokes = { count: 0 };
  const context = {
    canvas: { width: 174, height: 112 },
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineJoin: 'miter',
    strokeStyle: '',
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke: () => void (strokes.count += 1),
  };
  const offscreen = { getContext: () => (drawable ? context : null) } as unknown as OffscreenCanvas;
  return { strokes, offscreen, size: context.canvas };
}

/** The worker's scope, on a clock the test turns; nothing else may wake it. */
async function workerScope() {
  const replies: OrreryReply[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<OrreryRequest>) => void) | null,
    postMessage: (message: OrreryReply) => void replies.push(message),
  };
  const clock = { now: 0 };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  const beats = {
    requestAnimationFrame: vi.fn(),
    setTimeout: vi.spyOn(globalThis, 'setTimeout'),
    setInterval: vi.spyOn(globalThis, 'setInterval'),
  };
  vi.stubGlobal('requestAnimationFrame', beats.requestAnimationFrame);
  vi.stubGlobal('self', scope);
  await import('./orrery.worker');
  const send = (data: OrreryRequest) => scope.onmessage!({ data } as MessageEvent<OrreryRequest>);
  return { send, replies, clock, beats };
}

const cell = (offscreen: OffscreenCanvas) => ({
  id: orbit.id,
  canvas: offscreen,
  window: orbit.window,
  hues: orbit.bodyHues,
});

describe('the Orrery’s worker', () => {
  it('draws a frame only when the page asks, and keeps no beat of its own', async () => {
    const { send, replies, clock, beats } = await workerScope();
    const work = canvas();
    send({ type: 'cells', ratio: 1, moving: true, cells: [cell(work.offscreen)] });
    send({ type: 'visible', id: orbit.id, visible: true });
    send({ type: 'frame' });
    expect(replies).toEqual([{ type: 'framed', more: true }]);
    // A second of the film goes by unasked: nothing is drawn, and nothing is set to draw it.
    clock.now = 1000;
    expect(work.strokes.count).toBe(0);
    expect(beats.requestAnimationFrame).not.toHaveBeenCalled();
    expect(beats.setTimeout).not.toHaveBeenCalled();
    expect(beats.setInterval).not.toHaveBeenCalled();
    // Asked again, it draws the film up to now, and answers once.
    send({ type: 'frame' });
    expect(work.strokes.count).toBeGreaterThan(0);
    expect(replies).toEqual([
      { type: 'framed', more: true },
      { type: 'framed', more: true },
    ]);
  });

  it('says it has nothing to draw before its canvases come, and while none is in view', async () => {
    const { send, replies } = await workerScope();
    send({ type: 'frame' });
    send({ type: 'cells', ratio: 1, moving: true, cells: [cell(canvas().offscreen)] });
    send({ type: 'frame' });
    expect(replies).toEqual([
      { type: 'framed', more: false },
      { type: 'framed', more: false },
    ]);
  });

  it('under a still preference draws each cell whole over the frames it is asked for, then rests', async () => {
    const { send, replies } = await workerScope();
    send({ type: 'cells', ratio: 1, moving: false, cells: [cell(canvas().offscreen)] });
    send({ type: 'visible', id: orbit.id, visible: true });
    let asked = 0;
    while (replies.at(-1)?.type !== 'framed' || (replies.at(-1) as { more: boolean }).more) {
      send({ type: 'frame' });
      asked += 1;
      if (asked > 1000) throw new Error('never drawn whole');
    }
    expect(replies).toContainEqual({ type: 'drawn', id: orbit.id });
    expect(replies.at(-1)).toEqual({ type: 'framed', more: false });
  });

  it('takes a new size and a change of motion to its cells', async () => {
    const { send, replies } = await workerScope();
    const work = canvas();
    send({ type: 'cells', ratio: 1, moving: true, cells: [cell(work.offscreen)] });
    send({ type: 'visible', id: orbit.id, visible: true });
    send({ type: 'size', id: orbit.id, width: 300, height: 194 });
    expect(work.size).toEqual({ width: 300, height: 194 });
    // Put still, the cell is drawn whole over the frames it is asked for.
    send({ type: 'moving', moving: false });
    for (let asked = 0; asked < 1000 && !replies.some((reply) => reply.type === 'drawn'); asked++)
      send({ type: 'frame' });
    expect(replies).toContainEqual({ type: 'drawn', id: orbit.id });
  });

  it('gives up when a canvas will not be drawn on', async () => {
    const { send, replies } = await workerScope();
    send({ type: 'cells', ratio: 1, moving: true, cells: [cell(canvas(false).offscreen)] });
    send({ type: 'visible', id: orbit.id, visible: true });
    send({ type: 'frame' });
    expect(replies).toEqual([{ type: 'failed' }, { type: 'framed', more: false }]);
  });
});
