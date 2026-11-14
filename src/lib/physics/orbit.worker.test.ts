import { afterEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { plateFrame } from '@/lib/art/orbit-frames';
import { beyondEnd, beyondPath } from './beyond';
import { HeldPlacement, framedSamples } from './framing';
import { lightFilmDuration } from './light-film';
import { plateSpace } from '../first-light/samples';
import type { OrbitReply, OrbitRequest } from './orbit.worker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/**
 * The worker's scope, posting as a worker posts: each reply is cloned, and the buffers it names
 * are handed over for real, so the worker can no longer read them. `transfer` keeps the buffers
 * it gave away, emptied by the giving.
 */
async function workerScope() {
  const replies: { message: OrbitReply; transfer?: Transferable[] }[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<OrbitRequest>) => void) | null,
    postMessage: (message: OrbitReply, transfer?: Transferable[]) =>
      replies.push({ message: structuredClone(message, { transfer }), transfer }),
  };
  vi.stubGlobal('self', scope);
  await import('./orbit.worker');
  return { scope, replies };
}

/** Given away: a buffer handed over holds nothing where it came from. */
const givenAway = (transfer: Transferable[] | undefined) =>
  (transfer ?? []).map((buffer) => (buffer as ArrayBuffer).byteLength);

describe('the orbit worker', () => {
  it('reports progress, then the derivation and its comparison, handing the samples over', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(0)!;
    scope.onmessage!({
      data: { generation: orbit.generation, published: orbit.published, stride: 10_000 },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds[0]).toBe('progress');
    expect(kinds.at(-1)).toBe('done');
    const done = replies.at(-1)!;
    if (done.message.type !== 'done') throw new Error('not done');
    expect(done.message.comparisons.every((row) => row.exact)).toBe(true);
    // Handed over, not copied: the two sample arrays arrive whole, and the worker's are empty.
    expect(givenAway(done.transfer)).toEqual([0, 0]);
    expect(done.message.result.samples.positions.length).toBeGreaterThan(0);
    expect(done.message.result.samples.separations.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs on to the fate when asked, and keeps the bodies at the window’s end', async () => {
    const { scope, replies } = await workerScope();
    // № 054 ejects soonest, so its run past the window is short.
    const orbit = workOrbit(54)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        fate: { published: orbit.fate },
      },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    // Not asked for what lies past the frame, it stops at the fate.
    expect(kinds.slice(-2)).toEqual(['done', 'fate']);
    const { message } = replies.at(-1)!;
    if (message.type !== 'fate') throw new Error('no fate');
    expect(message.comparison).toMatchObject({ key: 'fate', exact: true });
    expect(message.fate).toMatchObject({
      outcome: 'ejection',
      escaper: orbit.fate.escaper,
      ejectionStep: orbit.fate.ejectionStep,
    });
    expect(message.fate.windowEnd.positions).toHaveLength(9);
  }, 30_000);

  it('carries the orbit on past the window when asked, on its plate, from the fate’s own bodies', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(54)!;
    const frame = plateFrame(54)!;
    const steps = orbit.generation.steps;
    const pace = steps / lightFilmDuration(steps);
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 100,
        fate: { published: orbit.fate },
        beyond: { pace },
        frame,
      },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds.slice(-4)).toEqual(['done', 'framed', 'fate', 'beyond']);
    const fated = replies.at(-2)!;
    const { message, transfer } = replies.at(-1)!;
    if (fated.message.type !== 'fate' || message.type !== 'beyond') throw new Error('no path');
    // The fate's bodies are copied to the page, never handed over: the path is carried on from
    // them after that message, and a worker that had given them away could carry nothing.
    expect(fated.transfer).toBeUndefined();
    const path = message.beyond!;
    expect(path).not.toBeNull();
    // The same path the page's own modules make of the same fate, on the same held plate: the
    // worker adds nothing, and the camera is held where the film's frame ended.
    const start = { masses: orbit.published.masses, dt: orbit.generation.dt, steps };
    const expected = beyondPath({
      ...start,
      fate: fated.message.fate,
      pace,
      stride: 100,
      plate: new HeldPlacement(frame, start),
    });
    expect(path).toMatchObject({ from: steps, stride: 100, lost: null, copies: expected.copies });
    expect(path.samples).toBe(Math.floor((beyondEnd(fated.message.fate, pace) - steps) / 100) + 1);
    expect(path.pixels).toHaveLength(path.samples * path.copies * 6);
    // Number by number: a clone is of another realm than the test's own arrays.
    expect([...path.pixels]).toEqual([...expected.pixels]);
    // Handed over, not copied.
    expect(givenAway(transfer)).toEqual([0]);
  }, 60_000);

  it('carries no path where the window has no plate to place it on', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(54)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        fate: { published: orbit.fate },
        beyond: { pace: 33_300 },
      },
    } as MessageEvent<OrbitRequest>);
    // Still said, so a page that waits for it knows there is none.
    expect(replies.at(-1)!.message).toEqual({ type: 'beyond', beyond: null });
  }, 30_000);

  it('samples the window in depth before it carries the path, which is the longest and the last', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(54)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        fate: { published: orbit.fate },
        beyond: { pace: 33_300 },
        frame: plateFrame(54)!,
        space: true,
      },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds.slice(-5)).toEqual(['done', 'framed', 'fate', 'space', 'beyond']);
    const last = replies.at(-1)!.message;
    expect(last.type === 'beyond' && last.beyond).toBeTruthy();
  }, 60_000);

  it('places the derived window on its plate when given the frame, and hands it over', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(0)!;
    const frame = plateFrame(0)!;
    scope.onmessage!({
      data: { generation: orbit.generation, published: orbit.published, stride: 10_000, frame },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds.slice(-2)).toEqual(['done', 'framed']);
    const done = replies.at(-2)!.message;
    const { message, transfer } = replies.at(-1)!;
    if (done.type !== 'done' || message.type !== 'framed') throw new Error('not framed');
    // What is drawn is what was derived: the derived window's own first state, replayed.
    const { windowStart, masses } = done.result;
    const expected = framedSamples(
      {
        masses,
        dt: orbit.generation.dt,
        steps: orbit.generation.steps,
        positions: windowStart.positions,
        velocities: windowStart.velocities,
      },
      frame,
      10_000,
    );
    expect(message.framed).toMatchObject({ stride: 10_000, count: 100, copies: 1 });
    expect([...message.framed!.pixels]).toEqual([...expected.pixels]);
    expect(givenAway(transfer)).toEqual([0]);
  }, 30_000);

  it('samples the derived window in depth when asked, and hands it over', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(0)!;
    const frame = plateFrame(0)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        frame,
        space: true,
      },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds.slice(-3)).toEqual(['done', 'framed', 'space']);
    const done = replies.at(-3)!.message;
    const { message, transfer } = replies.at(-1)!;
    if (done.type !== 'done' || message.type !== 'space') throw new Error('no space');
    // The same derived window, before the generator drew it flat.
    const { windowStart, masses } = done.result;
    const expected = plateSpace(
      {
        masses,
        dt: orbit.generation.dt,
        steps: orbit.generation.steps,
        positions: windowStart.positions,
        velocities: windowStart.velocities,
      },
      frame,
      10_000,
    );
    expect(message.space).toMatchObject({ stride: 10_000, count: expected.count });
    expect([...message.space!.points]).toEqual([...expected.points]);
    expect(givenAway(transfer)).toEqual([0, 0, 0]);
    expect(message.space!.drift.length).toBeGreaterThan(0);
    expect(message.space!.steps.length).toBeGreaterThan(0);
  }, 30_000);

  it('samples nothing in depth without a frame to sample it in', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(0)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        space: true,
      },
    } as MessageEvent<OrbitRequest>);
    expect(replies.map(({ message }) => message.type)).not.toContain('space');
  }, 30_000);

  it('says why it failed instead of throwing', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(0)!;
    scope.onmessage!({
      data: {
        generation: { ...orbit.generation, seed: '0x123' },
        published: orbit.published,
        stride: 10_000,
      },
    } as MessageEvent<OrbitRequest>);
    expect(replies.at(-1)!.message).toEqual({
      type: 'failed',
      message: expect.stringMatching(/hex/),
    });
  });
});
