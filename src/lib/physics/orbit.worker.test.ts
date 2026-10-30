import { afterEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
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
