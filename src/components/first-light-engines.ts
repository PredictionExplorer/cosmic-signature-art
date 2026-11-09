import { LightEngine, type Engine, type InkPalette } from './first-light-engine';

/**
 * The engine for a canvas (docs/first-light.md §7):
 * - WebGPU, in extended range, where the screen can show light brighter than its white
 *   (first-light-gpu.ts), or where the address asks for it with `?engine=webgpu`, for testing;
 * - otherwise, or where WebGPU cannot draw, WebGL 2 in standard dynamic range;
 * - nothing where neither can, and the still simply stays.
 *
 * Ink on paper (§14) is drawn in WebGL 2 alone: paper is never brighter than white.
 *
 * A canvas takes one kind of context for good. The WebGPU engine asks for one only once its device
 * is in hand, so a canvas it could not use is still WebGL 2's to take.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  ink?: InkPalette,
): Promise<Engine | null> {
  if (ink) return LightEngine.create(canvas, ink);
  if (triesWebGpu()) {
    try {
      // Only the screens that can show it load the WebGPU engine.
      const { GpuLightEngine } = await import('./first-light-gpu');
      const engine = await GpuLightEngine.create(canvas);
      if (engine) return engine;
    } catch (failure) {
      console.warn('First Light falls back to WebGL 2:', failure);
    }
  }
  return LightEngine.create(canvas);
}

/** A screen that can show light past its white, with WebGPU; or the address asking for WebGPU. */
function triesWebGpu(): boolean {
  if (new URLSearchParams(window.location.search).get('engine') === 'webgpu') return true;
  const high = window.matchMedia?.('(dynamic-range: high)').matches ?? false;
  return high && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}
