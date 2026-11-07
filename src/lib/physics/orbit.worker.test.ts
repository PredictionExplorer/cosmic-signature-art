import { afterEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import { plateFrame } from '@/lib/art/orbit-frames';
import { framedSamples } from './framing';
import type { OrbitReply, OrbitRequest } from './orbit.worker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function workerScope() {
  const replies: { message: OrbitReply; transfer?: Transferable[] }[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<OrbitRequest>) => void) | null,
    postMessage: (message: OrbitReply, transfer?: Transferable[]) =>
      replies.push({ message, transfer }),
  };
  vi.stubGlobal('self', scope);
  await import('./orbit.worker');
  return { scope, replies };
}

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
    expect(done.transfer).toEqual([
      done.message.result.samples.positions.buffer,
      done.message.result.samples.separations.buffer,
    ]);
  }, 30_000);

  it('runs on to the fate when asked, and hands over the bodies After the frame starts from', async () => {
    const { scope, replies } = await workerScope();
    // № 054 ejects soonest, so its run past the window is short.
    const orbit = workOrbit(54)!;
    scope.onmessage!({
      data: {
        generation: orbit.generation,
        published: orbit.published,
        stride: 10_000,
        fate: { published: orbit.fate, lead: 30_000 },
      },
    } as MessageEvent<OrbitRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds.slice(-2)).toEqual(['done', 'fate']);
    const { message, transfer } = replies.at(-1)!;
    if (message.type !== 'fate') throw new Error('no fate');
    expect(message.comparison).toMatchObject({ key: 'fate', exact: true });
    expect(message.fate).toMatchObject({
      outcome: 'ejection',
      escaper: orbit.fate.escaper,
      ejectionStep: orbit.fate.ejectionStep,
    });
    expect(transfer).toEqual([
      message.fate.windowEnd.positions.buffer,
      message.fate.windowEnd.velocities.buffer,
      message.fate.approach!.positions.buffer,
      message.fate.approach!.velocities.buffer,
    ]);
  }, 30_000);

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
    expect(transfer).toEqual([message.framed!.pixels.buffer]);
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
