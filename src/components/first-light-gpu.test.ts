import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAT, lensFor } from '@/lib/first-light/camera';
import type { PlateSpace } from '@/lib/first-light/samples';
import { LightEngine, LOOK, type Exposure } from './first-light-engine';
import { createEngine } from './first-light-engines';
import { GpuLightEngine, HEADROOM, KNEE, toneMap } from './first-light-gpu';

/** The WebGL engine's own curve, and both as the screen shows them, through its 2.2 gamma. */
const webgl = (x: number) => 1 - Math.exp(-x);
const shown = (light: number) => light ** (1 / 2.2);
const kneeAt = -Math.log(1 - KNEE);

describe('the tone map', () => {
  it('is the WebGL engine’s curve up to the knee', () => {
    let widest = 0;
    for (let x = 0; x <= kneeAt; x += 0.001)
      widest = Math.max(widest, Math.abs(shown(toneMap(x)) - shown(webgl(x))));
    expect(widest).toBeLessThan(0.01);
    expect(KNEE).toBeLessThan(1);
  });

  it('leaves the knee without a step or a kink', () => {
    const h = 1e-5;
    expect(Math.abs(toneMap(kneeAt + h) - toneMap(kneeAt))).toBeLessThan(1e-4);
    const below = (toneMap(kneeAt) - toneMap(kneeAt - h)) / h;
    const above = (toneMap(kneeAt + h) - toneMap(kneeAt)) / h;
    expect(Math.abs(above - below)).toBeLessThan(1e-3);
  });

  it('only ever rises', () => {
    for (let x = 0; x < 1000; x += 0.01) {
      if (x < 100) expect(toneMap(x + 0.01)).toBeGreaterThan(toneMap(x));
      else expect(toneMap(x + 0.01)).toBeGreaterThanOrEqual(toneMap(x));
    }
  });

  it('never passes the headroom, of three to four times the page’s white', () => {
    expect(HEADROOM).toBeGreaterThanOrEqual(3);
    expect(HEADROOM).toBeLessThanOrEqual(4);
    for (const x of [10, 100, 1e3, 1e6, 1e9, Infinity])
      expect(toneMap(x)).toBeLessThanOrEqual(HEADROOM);
    expect(toneMap(1e3)).toBeGreaterThan(HEADROOM - 1e-6);
  });

  it('keeps a lone trail as WebGL draws it, and lifts the bodies and the flare past white', () => {
    const trail = LOOK.intensity * LOOK.exposure;
    expect(toneMap(trail)).toBe(webgl(trail));
    // A body's core glare, 6.9, and at the flare's height three and a half times it.
    expect(toneMap(6.9 * LOOK.exposure)).toBeGreaterThan(1.5);
    expect(toneMap(6.9 * 3.5 * LOOK.exposure)).toBeGreaterThan(3);
  });
});

/** A stand-in for WebGPU that records what the engine asks of it. */
function fakeWebGpu() {
  const passes: { draws: [number, number | undefined][] }[] = [];
  const contexts = new Map<HTMLCanvasElement, ReturnType<typeof fakeContext>>();
  const handle = () => ({ label: '' });
  const texture = ({ size }: { size: [number, number] }) => ({
    label: '',
    width: size[0],
    height: size[1],
    createView: handle,
    destroy: vi.fn(),
  });
  let lose = () => {};
  class Device extends EventTarget {
    queue = { writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn() };
    lost = new Promise<{ reason: string; message: string }>((resolve) => {
      lose = () => resolve({ reason: 'unknown', message: 'The GPU went away' });
    });
    createBuffer = () => ({ label: '', destroy: vi.fn() });
    createTexture = texture;
    createSampler = handle;
    createShaderModule = () => ({ label: '', getCompilationInfo: async () => ({ messages: [] }) });
    createBindGroupLayout = handle;
    createPipelineLayout = handle;
    createRenderPipelineAsync = async () => ({ label: '', getBindGroupLayout: handle });
    createBindGroup = handle;
    createCommandEncoder = () => ({
      beginRenderPass: () => {
        const pass = { draws: [] as [number, number | undefined][] };
        passes.push(pass);
        return {
          setPipeline() {},
          setBindGroup() {},
          draw: (vertices: number, instances?: number) => pass.draws.push([vertices, instances]),
          end() {},
        };
      },
      finish: handle,
    });
    pushErrorScope() {}
    popErrorScope = async () => null;
    destroy = vi.fn();
  }
  const device = new Device();
  /** A canvas's context; a browser without tone mapping never reads it from a configuration. */
  function fakeContext(toneMapping = true) {
    return {
      configured: [] as Record<string, unknown>[],
      configure: vi.fn(function (this: { configured: Record<string, unknown>[] }, given: object) {
        const { device, format, alphaMode } = given as Record<string, unknown>;
        this.configured.push(toneMapping ? { ...given } : { device, format, alphaMode });
      }),
      unconfigure: vi.fn(),
      getCurrentTexture: () => texture({ size: [1, 1] }),
    };
  }
  const gpu = { requestAdapter: vi.fn(async () => ({ requestDevice: async () => device })) };
  return { gpu, device, passes, contexts, fakeContext, lose: () => lose() };
}

type Fake = ReturnType<typeof fakeWebGpu>;

/** The canvases answer with the stand-in's contexts, made as they are asked for. */
function answerCanvases(
  fake: Fake,
  options: { refuse?: HTMLCanvasElement; toneMapping?: boolean } = {},
) {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== 'webgpu' || this === options.refuse) return null;
    if (!fake.contexts.has(this)) fake.contexts.set(this, fake.fakeContext(options.toneMapping));
    return fake.contexts.get(this);
  } as unknown as HTMLCanvasElement['getContext']);
}

function withGpu(gpu: unknown) {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
}

const SPACE: PlateSpace = {
  stride: 100,
  count: 5,
  steps: Float64Array.from([0, 100, 200, 300, 400]),
  width: 3456,
  height: 2234,
  scale: 1,
  points: new Float32Array(5 * 9),
  drift: new Float32Array(5 * 3),
  depthCentre: 0,
  centre: [0, 0, 0],
  copies: [
    { cos: 1, sin: 0, scale: 1, mirror: false },
    { cos: 1, sin: 0, scale: 1, mirror: true },
  ],
};

function still(): HTMLImageElement {
  const image = new Image();
  Object.defineProperty(image, 'naturalWidth', { value: 1280 });
  Object.defineProperty(image, 'naturalHeight', { value: 828 });
  return image;
}

function moment(drawn: number, heads: number): Exposure {
  const lens = lensFor(FLAT, { width: 720, height: 480 }, SPACE);
  return { lens, drift: 1, drawn, heads, flare: 0 };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GpuLightEngine', () => {
  let fake: Fake;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    fake = fakeWebGpu();
    canvas = document.createElement('canvas');
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (_source: unknown, options: ImageBitmapOptions) => ({
        width: options.resizeWidth,
        height: options.resizeHeight,
        close: vi.fn(),
      })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete (navigator as Navigator & { gpu?: unknown }).gpu;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is not made without WebGPU, and leaves the canvas to WebGL 2', async () => {
    const asked = answerCanvases(fake);
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('asks the canvas for nothing until it has a device', async () => {
    const asked = answerCanvases(fake);
    withGpu({ requestAdapter: async () => null });
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    withGpu({
      requestAdapter: async () => ({ requestDevice: () => Promise.reject(new Error('no')) }),
    });
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('is not made where the browser cannot show light past white, and the canvas stays free', async () => {
    answerCanvases(fake, { toneMapping: false });
    withGpu(fake.gpu);
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    expect(fake.contexts.has(canvas)).toBe(false);
    expect(fake.device.destroy).toHaveBeenCalled();
  });

  it('lets the device go when the canvas has no WebGPU context', async () => {
    withGpu(fake.gpu);
    const asked = answerCanvases(fake, { refuse: canvas });
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    expect(asked.mock.contexts).toContain(canvas);
    expect(fake.device.destroy).toHaveBeenCalledTimes(1);
  });

  it('lets the device go when the canvas will not take its configuration', async () => {
    withGpu(fake.gpu);
    answerCanvases(fake);
    const refusing = fake.fakeContext();
    refusing.configure.mockImplementation(() => {
      throw new TypeError('rgba16float is not a canvas format here');
    });
    fake.contexts.set(canvas, refusing);
    expect(await GpuLightEngine.create(canvas)).toBeNull();
    expect(refusing.configure).toHaveBeenCalled();
    expect(fake.device.destroy).toHaveBeenCalledTimes(1);
  });

  it('configures its canvas in half floats, with extended range, opaque', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    expect(await GpuLightEngine.create(canvas)).toBeInstanceOf(GpuLightEngine);
    expect(fake.contexts.get(canvas)!.configured).toEqual([
      {
        device: fake.device,
        format: 'rgba16float',
        alphaMode: 'opaque',
        toneMapping: { mode: 'extended' },
      },
    ]);
  });

  it('reads the still’s colours from a copy about 520 pixels across', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    const engine = (await GpuLightEngine.create(canvas))!;
    engine.setScene(SPACE, still());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
      resizeWidth: 520,
      resizeHeight: 336,
      resizeQuality: 'high',
    });
    await settle();
    expect(fake.device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [520, 336],
    );
  });

  it('draws once the colours are in: the light, its glow, then the stage', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    const engine = (await GpuLightEngine.create(canvas))!;
    engine.setScene(SPACE, still());
    engine.resize(720, 480, 1);
    engine.draw(moment(0.6, 1));
    expect(fake.device.queue.submit).not.toHaveBeenCalled();

    await settle();
    engine.draw(moment(0.6, 1));
    expect(fake.device.queue.submit).toHaveBeenCalledTimes(1);
    // Every body's trail in both copies, as one strip each up to its head (2.4 of 4), then the
    // bodies; a quarter-size copy and four blurs; and the stage.
    expect(fake.passes.map((pass) => pass.draws)).toEqual([
      [
        [8, 6],
        [6, 6],
      ],
      ...Array.from({ length: 6 }, () => [[3, undefined]]),
    ]);

    engine.draw(moment(0.6, 0));
    expect(fake.passes[7].draws).toEqual([[8, 6]]);
  });

  it('is lost with its device', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    const engine = (await GpuLightEngine.create(canvas))!;
    expect(engine.lost).toBe(false);
    fake.lose();
    await settle();
    expect(engine.lost).toBe(true);
  });

  it('is lost at an error it did not expect, and says why', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    const engine = (await GpuLightEngine.create(canvas))!;
    fake.device.dispatchEvent(
      Object.assign(new Event('uncapturederror'), { error: { message: 'A pass went wrong' } }),
    );
    expect(engine.lost).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), 'A pass went wrong');
  });

  it('gives the canvas back as it goes, unless a newer engine has it', async () => {
    answerCanvases(fake);
    withGpu(fake.gpu);
    // React's development mode mounts twice: two engines on one canvas, the first let go.
    const first = (await GpuLightEngine.create(canvas))!;
    const second = (await GpuLightEngine.create(canvas))!;
    const context = fake.contexts.get(canvas)!;
    first.dispose();
    expect(context.unconfigure).not.toHaveBeenCalled();
    second.dispose();
    expect(context.unconfigure).toHaveBeenCalledTimes(1);
    expect(fake.device.destroy).toHaveBeenCalledTimes(2);
  });
});

describe('createEngine', () => {
  const gpuEngine = { lost: false } as unknown as GpuLightEngine;
  const glEngine = { lost: false } as unknown as LightEngine;
  let canvas: HTMLCanvasElement;

  function screen(hdr: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: hdr && query === '(dynamic-range: high)',
    }));
  }

  beforeEach(() => {
    canvas = document.createElement('canvas');
    vi.spyOn(LightEngine, 'create').mockReturnValue(glEngine);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete (navigator as Navigator & { gpu?: unknown }).gpu;
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps WebGL 2 on a standard screen, WebGPU or not', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create').mockResolvedValue(gpuEngine);
    screen(false);
    withGpu({});
    expect(await createEngine(canvas)).toBe(glEngine);
    expect(tried).not.toHaveBeenCalled();
  });

  it('tries WebGPU first on a screen that can show light past its white', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create').mockResolvedValue(gpuEngine);
    screen(true);
    withGpu({});
    expect(await createEngine(canvas)).toBe(gpuEngine);
    expect(tried).toHaveBeenCalledWith(canvas);
    expect(LightEngine.create).not.toHaveBeenCalled();
  });

  it('keeps WebGL 2 on such a screen without WebGPU', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create').mockResolvedValue(gpuEngine);
    screen(true);
    expect(await createEngine(canvas)).toBe(glEngine);
    expect(tried).not.toHaveBeenCalled();
  });

  it('tries WebGPU wherever the address asks for it', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create').mockResolvedValue(gpuEngine);
    screen(false);
    window.history.replaceState(null, '', '/first-light/31?engine=webgpu');
    expect(await createEngine(canvas)).toBe(gpuEngine);
    expect(tried).toHaveBeenCalledWith(canvas);
  });

  it('falls back to WebGL 2 when WebGPU cannot draw, or fails', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create');
    screen(true);
    withGpu({});
    tried.mockResolvedValueOnce(null);
    expect(await createEngine(canvas)).toBe(glEngine);
    tried.mockRejectedValueOnce(new Error('A chunk did not load'));
    expect(await createEngine(canvas)).toBe(glEngine);
    expect(tried).toHaveBeenCalledTimes(2);
    expect(LightEngine.create).toHaveBeenCalledTimes(2);
  });

  it('keeps WebGL 2 where the browser cannot be asked about its screen', async () => {
    const tried = vi.spyOn(GpuLightEngine, 'create').mockResolvedValue(gpuEngine);
    vi.stubGlobal('matchMedia', undefined);
    withGpu({});
    expect(await createEngine(canvas)).toBe(glEngine);
    expect(tried).not.toHaveBeenCalled();
  });
});
