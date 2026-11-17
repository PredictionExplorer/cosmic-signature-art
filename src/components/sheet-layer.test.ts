import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Maps, Sheets } from '@/lib/crossing/sheet';
import type { SheetReply, SheetRequest } from '@/lib/crossing/sheet.worker';
import { SheetLayer } from './sheet-layer';

afterEach(() => vi.unstubAllGlobals());

/** A map of one front from the left: each texel as many steps as it is far from that edge. */
const MAPS: Maps = (() => {
  const bytes = new Uint8Array(48 * 32);
  for (let p = 0; p < bytes.length; p++) bytes[p] = (p % 48) * 4;
  return { width: 48, height: 32, ink: bytes, light: bytes };
})();
const REGION = { x: 0, y: -10, width: 120, height: 100 };
const ART = { x: 10, y: 0, width: 96, height: 64 };

/** A worker the test answers for: what it was sent, and a way to reply or to fail. */
function fakeWorker() {
  const made: FakeWorker[] = [];
  class FakeWorker {
    sent: SheetRequest[] = [];
    onmessage: ((event: MessageEvent<SheetReply>) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    constructor() {
      made.push(this);
    }
    postMessage(message: SheetRequest) {
      this.sent.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    reply(message: SheetReply) {
      this.onmessage?.({ data: message } as MessageEvent<SheetReply>);
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  return made;
}

const SHEETS = { night: { cols: 1 }, paper: { cols: 2 } } as unknown as Sheets;

describe('the layer that lays a work’s sheets', () => {
  it('tells its worker the maps once, then asks it for each layout', async () => {
    const made = fakeWorker();
    const layer = new SheetLayer(MAPS);
    const [worker] = made;
    expect(worker.sent).toEqual([{ type: 'maps', ...MAPS }]);
    const laid = layer.lay(REGION, ART);
    expect(worker.sent.at(-1)).toEqual({ type: 'lay', id: 1, region: REGION, art: ART });
    worker.reply({ type: 'laid', id: 1, ...SHEETS });
    await expect(laid).resolves.toEqual(SHEETS);
  });

  it('answers only the newest layout: one it overtook resolves null', async () => {
    const made = fakeWorker();
    const layer = new SheetLayer(MAPS);
    const [worker] = made;
    const first = layer.lay(REGION, ART);
    const second = layer.lay({ ...REGION, width: 200 }, ART);
    await expect(first).resolves.toBeNull();
    // The first layout's sheets arrive late, and are for no one.
    worker.reply({ type: 'laid', id: 1, ...SHEETS });
    worker.reply({ type: 'laid', id: 2, ...SHEETS });
    await expect(second).resolves.toEqual(SHEETS);
  });

  it('lays the sheets itself where this browser has no workers', async () => {
    vi.stubGlobal('Worker', undefined);
    const layer = new SheetLayer(MAPS);
    const sheets = await layer.lay(REGION, ART);
    expect(sheets?.night.region).toEqual(REGION);
    expect(sheets?.paper.art).toEqual(ART);
  });

  it('lays the sheets itself when its worker cannot be made', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('refused');
        }
      },
    );
    const sheets = await new SheetLayer(MAPS).lay(REGION, ART);
    expect(sheets?.night.cols).toBeGreaterThan(1);
  });

  it('takes over from a worker that fails, for whoever was waiting and from then on', async () => {
    const made = fakeWorker();
    const layer = new SheetLayer(MAPS);
    const [worker] = made;
    const waiting = layer.lay(REGION, ART);
    worker.onerror?.();
    expect(worker.terminated).toBe(true);
    expect((await waiting)?.night.region).toEqual(REGION);
    // The next layout is laid here, with no word to the worker that failed.
    const sent = worker.sent.length;
    expect((await layer.lay({ ...REGION, width: 200 }, ART))?.night.region.width).toBe(200);
    expect(worker.sent).toHaveLength(sent);
  });

  it('takes over when the worker says it failed', async () => {
    const made = fakeWorker();
    const layer = new SheetLayer(MAPS);
    const waiting = layer.lay(REGION, ART);
    made[0].reply({ type: 'failed', id: 1, message: 'no maps to lay a sheet from' });
    expect((await waiting)?.paper.art).toEqual(ART);
  });

  it('lets its worker go, and whoever waits on it, when it is disposed', async () => {
    const made = fakeWorker();
    const layer = new SheetLayer(MAPS);
    const waiting = layer.lay(REGION, ART);
    layer.dispose();
    expect(made[0].terminated).toBe(true);
    await expect(waiting).resolves.toBeNull();
  });
});
