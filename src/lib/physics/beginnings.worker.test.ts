import { afterEach, describe, expect, it, vi } from 'vitest';
import { workOrbit } from '@/lib/art/orbit-records';
import type { BeginningsReply, BeginningsRequest } from './beginnings.worker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function workerScope() {
  const replies: { message: BeginningsReply; transfer?: Transferable[] }[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<BeginningsRequest>) => void) | null,
    postMessage: (message: BeginningsReply, transfer?: Transferable[]) =>
      replies.push({ message, transfer }),
  };
  vi.stubGlobal('self', scope);
  await import('./beginnings.worker');
  return { scope, replies };
}

describe('the beginnings worker', () => {
  it('hands every chunk over as it is measured, then the totals and the chosen one', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(23)!;
    scope.onmessage!({
      data: { generation: orbit.generation, chunk: 25_000 },
    } as MessageEvent<BeginningsRequest>);
    const kinds = replies.map(({ message }) => message.type);
    expect(kinds).toEqual(['chunk', 'chunk', 'chunk', 'chunk', 'done']);
    const first = replies[0];
    if (first.message.type !== 'chunk') throw new Error('not a chunk');
    expect(first.message.progress).toEqual({ done: 25_000, total: 100_000 });
    expect(first.transfer).toEqual([
      first.message.chunk.energies.buffer,
      first.message.chunk.momenta.buffer,
      first.message.chunk.passed.buffer,
    ]);
    const done = replies.at(-1)!.message;
    if (done.type !== 'done') throw new Error('not done');
    expect(done.result.count).toBe(100_000);
    expect(done.result.passed).toBe(100_000);
    expect(done.result.chosen).toMatchObject({
      index: orbit.generation.selectedIndex,
      energy: orbit.published.totalEnergy,
      angularMomentum: orbit.published.angularMomentum,
      massesExact: true,
    });
    expect(done.seconds).toBe(done.result.milliseconds / 1000);
  }, 30_000);

  it('says why it failed instead of throwing', async () => {
    const { scope, replies } = await workerScope();
    const orbit = workOrbit(23)!;
    scope.onmessage!({
      data: { generation: { ...orbit.generation, seed: '0x123' }, chunk: 2_500 },
    } as MessageEvent<BeginningsRequest>);
    expect(replies.map(({ message }) => message)).toEqual([
      { type: 'failed', message: expect.stringMatching(/hex/) },
    ]);
  });
});
