import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetReply, SheetRequest } from './sheet.worker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function workerScope() {
  const replies: { message: SheetReply; transfer?: Transferable[] }[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<SheetRequest>) => void) | null,
    postMessage: (message: SheetReply, transfer?: Transferable[]) =>
      replies.push({ message, transfer }),
  };
  vi.stubGlobal('self', scope);
  await import('./sheet.worker');
  const send = (data: SheetRequest) => scope.onmessage!({ data } as MessageEvent<SheetRequest>);
  return { send, replies };
}

/** A map of one front from a corner: each texel as many steps as it is far from it. */
function map(width: number, height: number, fromRight: boolean) {
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bytes[y * width + x] = Math.min(
        255,
        Math.round(Math.hypot(fromRight ? width - 1 - x : x, y)),
      );
  return bytes;
}

const REGION = { x: 0, y: -10, width: 120, height: 100 };
const ART = { x: 10, y: 0, width: 96, height: 64 };

describe('the sheet’s worker', () => {
  it('lays both sheets for a layout from the maps it was told, and hands them back by transfer', async () => {
    const { send, replies } = await workerScope();
    send({
      type: 'maps',
      width: 48,
      height: 32,
      ink: map(48, 32, true),
      light: map(48, 32, false),
    });
    // The maps alone are answered with nothing.
    expect(replies).toHaveLength(0);
    send({ type: 'lay', id: 7, region: REGION, art: ART });
    expect(replies).toHaveLength(1);
    const { message, transfer } = replies[0];
    if (message.type !== 'laid') throw new Error('not laid');
    expect(message.id).toBe(7);
    expect(message.night.region).toEqual(REGION);
    expect(message.paper.art).toEqual(ART);
    expect(transfer).toEqual([message.night.time.buffer, message.paper.time.buffer]);
    // The night follows Light's order (from the left), the paper Ink's (from the right).
    const { night, paper } = message;
    const at = (sheet: typeof night, col: number) => sheet.time[40 * sheet.cols + col];
    expect(at(night, 20)).toBeLessThan(at(night, 100));
    expect(at(paper, 100)).toBeLessThan(at(paper, 20));
  });

  it('says why it failed instead of throwing', async () => {
    const { send, replies } = await workerScope();
    // Asked for a sheet before it was told any map.
    send({ type: 'lay', id: 3, region: REGION, art: ART });
    expect(replies.map(({ message }) => message)).toEqual([
      { type: 'failed', id: 3, message: 'no maps to lay a sheet from' },
    ]);
  });
});
