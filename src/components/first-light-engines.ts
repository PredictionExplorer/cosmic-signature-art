import { LightEngine, type Engine } from './first-light-engine';

/**
 * The engine for a canvas (docs/first-light.md §7): WebGL 2, in standard dynamic range, wherever
 * WebGL 2 can draw; nothing where it cannot, and the still simply stays. A canvas takes one kind
 * of context for good, so the choice is made before the canvas is asked for one.
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<Engine | null> {
  return LightEngine.create(canvas);
}
