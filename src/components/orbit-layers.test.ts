import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordingContext } from '../../tests/canvas-support';
import { layers, type Canvases } from './orbit-layers';

/** A canvas laid out at a size in CSS pixels, with a context to draw on (or none). */
function canvas(width: number, height: number, context: CanvasRenderingContext2D | null) {
  const node = document.createElement('canvas');
  node.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  node.getContext = (() => context) as HTMLCanvasElement['getContext'];
  return node;
}

/** The section's five: four over a 400 × 300 picture, and the strip beneath it. */
function five(context: CanvasRenderingContext2D | null = recordingContext().context): Canvases {
  return {
    trails: canvas(400, 300, context),
    continued: canvas(400, 300, context),
    marks: canvas(400, 300, context),
    events: canvas(400, 56, context),
    names: canvas(400, 300, context),
  };
}

const display = (ratio: number | undefined) => vi.stubGlobal('devicePixelRatio', ratio);

afterEach(() => vi.unstubAllGlobals());

describe('the orbit section’s canvases', () => {
  it('sizes each to its box at the display’s own pixels', () => {
    display(2);
    const canvases = five();
    const sheet = layers(canvases)!;
    expect(sheet).toMatchObject({ width: 800, height: 600, ratio: 2 });
    for (const node of Object.values(canvases) as HTMLCanvasElement[]) expect(node.width).toBe(800);
    expect(canvases.events!.height).toBe(112);
    // The strip keeps the 12 px beneath its lane for the ticks.
    expect(sheet.strip).toMatchObject({ width: 800, height: 112, lane: 112 - 24, ratio: 2 });
  });

  it('draws two pixels to one at most, and one where the display does not say', () => {
    display(3);
    expect(layers(five())).toMatchObject({ width: 800, ratio: 2 });
    display(undefined);
    expect(layers(five())).toMatchObject({ width: 400, ratio: 1 });
  });

  it('keeps a canvas at least a pixel each way while it is not laid out', () => {
    display(1);
    const canvases = { ...five(), trails: canvas(0, 0, recordingContext().context) };
    expect(layers(canvases)).toMatchObject({ width: 1, height: 1 });
  });

  it('hands each layer its own context', () => {
    display(1);
    const own = () => recordingContext().context;
    const canvases: Canvases = {
      trails: canvas(10, 10, own()),
      continued: canvas(10, 10, own()),
      marks: canvas(10, 10, own()),
      events: canvas(10, 10, own()),
      names: canvas(10, 10, own()),
    };
    const sheet = layers(canvases)!;
    expect(sheet.trail).toBe(canvases.trails!.getContext('2d'));
    expect(sheet.continued).toBe(canvases.continued!.getContext('2d'));
    expect(sheet.mark).toBe(canvases.marks!.getContext('2d'));
    expect(sheet.names).toBe(canvases.names!.getContext('2d'));
    expect(sheet.strip.context).toBe(canvases.events!.getContext('2d'));
  });

  it('sizes nothing while a canvas is missing', () => {
    display(2);
    const canvases = { ...five(), names: null };
    expect(layers(canvases)).toBeNull();
    // A canvas keeps the size it had: sizing it would have wiped what stands on it.
    expect(canvases.trails!.width).toBe(300);
    expect(canvases.events!.height).toBe(150);
  });

  it('is not to be had where the browser gives no context', () => {
    display(1);
    expect(layers(five(null))).toBeNull();
    expect(layers({ ...five(), events: canvas(400, 56, null) })).toBeNull();
  });

  it('reads the numbers’ face from the page when asked, with a face to fall back on', () => {
    display(1);
    const canvases = five();
    const sheet = layers(canvases)!;
    expect(sheet.font()).toBe('monospace');
    canvases.names!.style.setProperty('--font-mono', ' "IBM Plex Mono", monospace ');
    document.body.append(canvases.names!);
    expect(sheet.font()).toBe('"IBM Plex Mono", monospace');
    canvases.names!.remove();
  });
});
