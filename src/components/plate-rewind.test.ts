import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareRewind } from './plate-rewind';

/*
  The run back's canvas (plate-rewind.ts) against a recording 2D context: jsdom draws nothing,
  so what is checked is what the canvas is asked to draw, frame by frame.
*/
const MAP = { width: 4, height: 2, levels: [0, 60, 120, 180, 200, 220, 240, 255] };

type Call = { name: string; args: unknown[]; composite: string };
function recordingContext(
  calls: Call[],
  read?: (width: number, height: number) => Uint8ClampedArray,
) {
  const context = {
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: read ? read(width, height) : new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image: { data: Uint8ClampedArray }) =>
      calls.push({
        name: 'putImageData',
        args: [Uint8ClampedArray.from(image.data)],
        composite: context.globalCompositeOperation,
      }),
    drawImage: (...args: unknown[]) =>
      calls.push({ name: 'drawImage', args, composite: context.globalCompositeOperation }),
    clearRect: (...args: unknown[]) =>
      calls.push({ name: 'clearRect', args, composite: context.globalCompositeOperation }),
  };
  return context;
}

/** The map's levels in red, as the decoded WebP gives them. */
function mapPixels() {
  const data = new Uint8ClampedArray(MAP.levels.length * 4);
  MAP.levels.forEach((level, p) => data.set([level, level, level, 255], p * 4));
  return data;
}

let calls: Call[];
let bitmap: { close: ReturnType<typeof vi.fn> };
let decodes: boolean;
const film = { videoWidth: 1280, videoHeight: 828 } as HTMLVideoElement;
const alphas = (call: Call) =>
  [...(call.args[0] as Uint8ClampedArray)].filter((_, i) => i % 4 === 3);

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  decodes = true;
  bitmap = { close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  vi.stubGlobal(
    'Image',
    class {
      decoding = 'auto';
      src = '';
      naturalWidth = MAP.width;
      naturalHeight = MAP.height;
      decode = () => (decodes ? Promise.resolve() : Promise.reject(new Error('broken')));
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    // The map's own canvas is read back; the plate's and the mask's are only drawn on.
    return recordingContext(calls, () => mapPixels()) as unknown as RenderingContext;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 129,
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the run back’s canvas', () => {
  it('is not drawn where the arrival map will not decode', async () => {
    decodes = false;
    expect(
      await prepareRewind(document.createElement('canvas'), '/art/arrival/31-ink.webp'),
    ).toBeNull();
  });

  it('is not drawn where the browser has no 2D canvas', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(
      await prepareRewind(document.createElement('canvas'), '/art/arrival/31-ink.webp'),
    ).toBeNull();
  });

  it('runs from every mark standing to none, over the film’s held frame, then lets the frame go', async () => {
    const canvas = document.createElement('canvas');
    const rewind = (await prepareRewind(canvas, '/art/arrival/31-ink.webp'))!;
    const done = rewind.run(film, {
      duration: 1000,
      ease: (share) => share,
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(await done).toBe(true);
    // The canvas is sized to the plate, and the film's frame is laid where the player lays it.
    expect([canvas.width, canvas.height]).toEqual([200, 129]);
    const frames = calls.filter((call) => call.name === 'drawImage' && call.args[0] === bitmap);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames[0].args.slice(3, 5)).toEqual([expect.closeTo((129 * 1280) / 828, 6), 129]);
    // Each frame keeps the film only where the mask allows: drawn, then cut by the mask.
    const masks = calls.filter(
      (call) => call.name === 'drawImage' && call.args[0] instanceof HTMLCanvasElement,
    );
    expect(masks).toHaveLength(frames.length);
    expect(masks.every((call) => call.composite === 'destination-in')).toBe(true);
    const covers = calls.filter((call) => call.name === 'putImageData');
    expect(alphas(covers[0]).every((alpha) => alpha === 0)).toBe(true);
    expect(alphas(covers.at(-1)!).every((alpha) => alpha === 255)).toBe(true);
    // Later marks leave before earlier ones, all the way through.
    for (let index = 1; index < covers.length; index += 1) {
      const before = alphas(covers[index - 1]);
      alphas(covers[index]).forEach((alpha, p) => expect(alpha).toBeGreaterThanOrEqual(before[p]));
    }
    expect(bitmap.close).toHaveBeenCalledOnce();
    // Cleared, it holds no pixels until it runs again.
    rewind.clear();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('stops at once when asked: the canvas clears, the frame is let go, and the run says so', async () => {
    const canvas = document.createElement('canvas');
    const rewind = (await prepareRewind(canvas, '/art/arrival/31-ink.webp'))!;
    const controller = new AbortController();
    const done = rewind.run(film, {
      duration: 1000,
      ease: (share) => share,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(300);
    controller.abort();
    expect(await done).toBe(false);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(bitmap.close).toHaveBeenCalledOnce();
    const drawn = calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(drawn);
  });

  it('does not start on a film that has no frame yet, or once stopped', async () => {
    const rewind = (await prepareRewind(
      document.createElement('canvas'),
      '/art/arrival/31-ink.webp',
    ))!;
    const signal = new AbortController().signal;
    expect(
      await rewind.run({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, {
        duration: 1,
        ease: (s) => s,
        signal,
      }),
    ).toBe(false);
    expect(
      await rewind.run(film, { duration: 1, ease: (s) => s, signal: AbortSignal.abort() }),
    ).toBe(false);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
