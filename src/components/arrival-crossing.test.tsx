import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { cubicBezier, invertEasing } from '@/lib/crossing/timing';
import { useArrivalCrossing } from './arrival-crossing';
import { rgb } from './sheet-pictures';
import { SeamController } from './turn';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const light = work.media.find((media) => media.id === 'light')!;
const root = () => document.documentElement;

/**
 * A viewer's use of the crossing: its canvas over a stage of two layers, each a plate and a
 * strip, under a running head; and a Turn that asks for it first.
 */
function Viewer({
  enabled,
  expression = 'ink',
  wing = null,
}: {
  enabled: boolean;
  expression?: 'ink' | 'light';
  wing?: number | null;
}) {
  const [seam] = useState(() => new SeamController());
  const { canvas, whenReady } = useArrivalCrossing({
    seam,
    ink,
    light,
    expression,
    enabled,
    wingSeam: () => wing,
  });
  return (
    <>
      <canvas className="page-sheet" />
      <header className="site-header">
        <canvas className="head-sheet" />
        <div className="head-row">
          <a href="/collection">Collection</a>
        </div>
      </header>
      <main>
        <div data-stage="">
          <canvas ref={canvas} data-crossing="" />
          <div data-layer="ink">
            <div data-plate-ground="paper" style={{ backgroundColor: 'rgb(239, 233, 221)' }}>
              <div className="plate">
                <div className="art-media" />
              </div>
              <div className="strip">
                <button type="button">Light</button>
              </div>
            </div>
          </div>
          <div data-layer="light">
            <div data-plate-ground="night">
              <div className="strip">
                <span>Ink</span>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            const button = event.currentTarget;
            void whenReady(400).then(() => button.setAttribute('data-answered', ''));
          }}
        >
          Turn
        </button>
      </main>
    </>
  );
}

/**
 * A WebGL context that records what the painter asks of it (the last value of each uniform by
 * name), and that the test can lose and restore.
 */
function fakeWebGL() {
  const calls: string[] = [];
  const floats = new Map<string, number>();
  const ints = new Map<string, number>();
  const pairs = new Map<string, [number, number]>();
  const triples = new Map<string, [number, number, number]>();
  const quads = new Map<string, [number, number, number, number]>();
  /** Every texture given its pixels: the size of each upload made from bytes. */
  const uploads: [number, number][] = [];
  let lost = false;
  type At = { name: string } | null;
  const methods: Record<string, (...args: never[]) => unknown> = {
    isContextLost: () => lost,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getExtension: () => ({}),
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1f: (at: At, value: number) => at && floats.set(at.name, value),
    uniform1i: (at: At, value: number) => at && ints.set(at.name, value),
    uniform2f: (at: At, x: number, y: number) => at && pairs.set(at.name, [x, y]),
    uniform3f: (at: At, x: number, y: number, z: number) => at && triples.set(at.name, [x, y, z]),
    uniform4f: (at: At, x: number, y: number, z: number, w: number) =>
      at && quads.set(at.name, [x, y, z, w]),
    texImage2D: (...args: unknown[]) => {
      if (args.length === 9) uploads.push([args[3] as number, args[4] as number]);
    },
  };
  const gl = new Proxy(methods, {
    get(target, property) {
      if (typeof property !== 'string' || property === 'then') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(property)) return 0;
      calls.push(property);
      return target[property] ?? (() => ({}));
    },
  }) as unknown as WebGLRenderingContext;
  return {
    gl,
    calls,
    floats,
    ints,
    pairs,
    triples,
    quads,
    uploads,
    lose: () => (lost = true),
    restore: () => (lost = false),
  };
}

/** A map as a 2D canvas gives it back: one front from the left of a 48 × 32 map. */
const MAP = { width: 48, height: 32 };
function fake2d() {
  const painted: ImageData[] = [];
  return {
    painted,
    context: {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) data[(y * width + x) * 4] = Math.min(255, x * 5);
        return { data, width, height };
      },
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: (picture: ImageData) => painted.push(picture),
    },
  };
}

let frames: FrameRequestCallback[] = [];
/** Run the frames the crossing asked for, as the browser would on its next paint. */
function paint() {
  const now = frames;
  frames = [];
  act(() => now.forEach((frame) => frame(performance.now())));
}
/**
 * A Turn begins on <html>, with the seam where the straight seam would paint it: by time unless
 * a finger or the Overture drives it, toward the night unless it is bound for the paper.
 */
async function turn(
  seam: number | null,
  mode: 'time' | 'drag' | 'overture' = 'time',
  to: 'night' | 'paper' = 'night',
) {
  await act(async () => {
    if (seam === null) {
      root().removeAttribute('data-turning');
      root().removeAttribute('data-turn-to');
      root().style.removeProperty('--seam');
    } else {
      root().setAttribute('data-turning', mode);
      root().setAttribute('data-turn-to', to);
      root().style.setProperty('--seam', `${seam}%`);
    }
  });
}

let decode: () => Promise<void> = () => Promise.resolve();
beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  decode = () => Promise.resolve();
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => decode(),
  });
  // Every image the crossing loads has a size: a map is read at its own.
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => MAP.width,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => MAP.height,
  });
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    if (handle) frames[handle - 1] = () => {};
  });
  root().setAttribute('data-room', 'paper');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  Reflect.deleteProperty(HTMLImageElement.prototype, 'naturalWidth');
  Reflect.deleteProperty(HTMLImageElement.prototype, 'naturalHeight');
  for (const name of ['data-crossing', 'data-turning', 'data-turn-to', 'data-room'])
    root().removeAttribute(name);
  root().style.removeProperty('--seam');
  root().style.removeProperty('--ease-turn');
});

/** The stage as the page lays it: 400 × 300, the plate filling its upper 240. */
let stage = { width: 400, height: 300 };
/** WebGL and a 2D canvas as the crossing finds them, over that stage under a head 48 tall. */
function withWebGL() {
  const context = fakeWebGL();
  const flat = fake2d();
  stage = { width: 400, height: 300 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl'
      ? context.gl
      : type === '2d'
        ? flat.context
        : null) as typeof HTMLCanvasElement.prototype.getContext);
  const box = (left: number, top: number, width: number, height: number) =>
    ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('.site-header, .site-header *')) return box(0, 0, stage.width, 48);
    if (this.matches('.art-media')) return box(0, 48, stage.width, 240);
    if (this.matches('.strip, .strip *')) return box(0, 288, stage.width, stage.height - 240);
    return box(0, 48, stage.width, stage.height);
  });
  return { ...context, grounds: flat.painted };
}
/** Past the idle moment at which the crossing is prepared. */
async function prepared() {
  await act(async () => vi.advanceTimersByTime(500));
  await act(async () => {});
  await act(async () => {});
}

describe('the crossing in the order the work was made', () => {
  it('reads the room’s colours as channels, computed or written', () => {
    expect(rgb('rgb(239, 233, 221)')).toEqual([239 / 255, 233 / 255, 221 / 255]);
    expect(rgb('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0]);
    expect(rgb(' #f1ebdf ')).toEqual([241 / 255, 235 / 255, 223 / 255]);
    expect(rgb('color(display-p3 1 1 1)')).toEqual([0, 0, 0]);
  });

  it('binds both of the curated work’s maps, so the crossing is offered there', () => {
    expect(ink.arrival?.src).toMatch(/^\/art\/arrival\/31-ink-[a-f0-9]{16}\.webp$/);
    expect(light.arrival?.src).toMatch(/^\/art\/arrival\/31-light-[a-f0-9]{16}\.webp$/);
  });

  it('keeps the straight seam where this browser has no WebGL, and never holds a Turn', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const images = vi.spyOn(HTMLImageElement.prototype, 'src', 'set');
    render(<Viewer enabled />);
    // Prepared at idle; without requestIdleCallback, a moment after the plate settles.
    await act(async () => vi.advanceTimersByTime(500));
    expect(context).toHaveBeenCalledWith('webgl', expect.anything());
    expect(root().hasAttribute('data-crossing')).toBe(false);
    // Neither map nor still was asked for: there is nothing to paint them with.
    expect(images).not.toHaveBeenCalled();
    const asking = screen.getByRole('button', { name: 'Turn' });
    fireEvent.click(asking);
    await act(async () => vi.advanceTimersByTime(0));
    expect(asking).toHaveAttribute('data-answered');
    expect(root().hasAttribute('data-crossing')).toBe(false);
  });

  it('prepares nothing where the Turn is instant', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<Viewer enabled={false} />);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(context).not.toHaveBeenCalled();
    expect(root().hasAttribute('data-crossing')).toBe(false);
    // A Turn asks, and is answered at once.
    const asking = screen.getByRole('button', { name: 'Turn' });
    fireEvent.click(asking);
    await act(async () => vi.advanceTimersByTime(0));
    expect(asking).toHaveAttribute('data-answered');
  });

  it('lays a sheet for each ground over the stage and the head above it, before any Turn', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    // Each pixel is written as computed, so a still painted at either end is its own.
    expect(webgl.calls).toContain('disable');
    // Two sheets, each a grid over 400 × (48 of head + 300 of stage + the spare beneath).
    const sheets = webgl.uploads.filter(([width, height]) => width > 1 && height > 1);
    expect(sheets).toHaveLength(2);
    const [cols, rows] = sheets[0];
    expect(sheets[1]).toEqual([cols, rows]);
    // A texel of the 48-wide map is 400 / 48 pixels here, and a cell is as large.
    expect(cols).toBe(48);
    expect(rows).toBe(Math.ceil((48 + 300 + 96) / (400 / 48)));
  });

  it('comes back after a pause: the context is kept, only what the crossing made is released', async () => {
    const webgl = withWebGL();
    const { rerender } = render(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    rerender(<Viewer enabled={false} />);
    expect(root().hasAttribute('data-crossing')).toBe(false);
    expect(webgl.calls).toContain('deleteProgram');
    expect(webgl.calls).toContain('deleteTexture');
    expect(webgl.calls).not.toContain('loseContext');
    rerender(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(webgl.calls.filter((call) => call === 'linkProgram')).toHaveLength(2);
  });

  it('stands down when the browser takes the context, and returns when it gives it back', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled />);
    await prepared();
    const canvas = container.querySelector('canvas[data-crossing]')!;
    await turn(50);
    paint();
    expect(canvas).toHaveAttribute('data-active');
    webgl.lose();
    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => {
      canvas.dispatchEvent(lost);
    });
    // Restoration is asked for, and the straight seam takes the Turn at once.
    expect(lost.defaultPrevented).toBe(true);
    expect(root().hasAttribute('data-crossing')).toBe(false);
    expect(canvas).not.toHaveAttribute('data-active');
    expect(container.querySelector('[data-sheet-active]')).toBeNull();
    paint();
    expect(canvas).not.toHaveAttribute('data-active');
    await turn(null);
    // A Turn asks while the context is gone: it is answered at once, and nothing is cached.
    const asking = screen.getByRole('button', { name: 'Turn' });
    fireEvent.click(asking);
    await act(async () => vi.advanceTimersByTime(0));
    expect(asking).toHaveAttribute('data-answered');
    expect(root().hasAttribute('data-crossing')).toBe(false);
    webgl.restore();
    await act(async () => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    });
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(webgl.calls.filter((call) => call === 'linkProgram')).toHaveLength(2);
  });

  it('paints a Turn only if it could be painted when the Turn began', async () => {
    withWebGL();
    const { container } = render(<Viewer enabled />);
    const canvas = container.querySelector('canvas[data-crossing]')!;
    // A Turn under way before the crossing is ready stays the straight seam's to its end.
    await turn(80);
    await prepared();
    paint();
    paint();
    expect(canvas).not.toHaveAttribute('data-active');
    await turn(null);
    paint();
    // The next Turn is the crossing's, painted on every frame until it ends.
    await turn(60);
    paint();
    expect(canvas).toHaveAttribute('data-active');
    expect(frames).toHaveLength(1);
    await turn(null);
    paint();
    expect(canvas).not.toHaveAttribute('data-active');
    expect(frames).toHaveLength(0);
  });

  it('paints every Turn by the one sheet: the word, a finger and the Overture alike', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled />);
    await prepared();
    const stageNode = container.querySelector('[data-stage]')!;
    const head = container.querySelector('.site-header')!;
    for (const mode of ['time', 'drag', 'overture'] as const) {
      await turn(50, mode);
      paint();
      // Toward the night, in Light's order, with the front part of the way across.
      expect(webgl.floats.get('uTowardNight')).toBe(1);
      expect(webgl.ints.get('uSheet')).toBe(2);
      const share = webgl.floats.get('uShare')!;
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
      const [first, span] = webgl.pairs.get('uSpan')!;
      expect(webgl.floats.get('uFront')).toBeGreaterThan(first);
      expect(webgl.floats.get('uFront')).toBeLessThan(first + span * 2);
      expect(webgl.floats.get('uEdge')).toBeGreaterThan(0);
      expect(webgl.floats.get('uTrail')).toBeGreaterThan(webgl.floats.get('uEdge')!);
      // The stage and the head wear the sheet while it is painted, and the head has its ground.
      expect(stageNode).toHaveAttribute('data-sheet-active');
      expect(head).toHaveAttribute('data-sheet-active');
      expect(webgl.grounds.length).toBeGreaterThan(0);
      await turn(null);
      paint();
      expect(stageNode).not.toHaveAttribute('data-sheet-active');
      expect(head).not.toHaveAttribute('data-sheet-active');
      expect(root()).not.toHaveAttribute('data-sheet-page');
    }
  });

  it('tells the painter where the work lies and how the canvas falls on the sheet', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    await turn(50);
    paint();
    // The canvas is the stage, 400 × 300; the work is its upper 240.
    expect(webgl.pairs.get('uCanvas')).toEqual([400, 300]);
    expect(webgl.quads.get('uArt')).toEqual([0, 0, 1, 0.8]);
    webgl.triples
      .get('uPaper')!
      .forEach((value, c) => expect(value).toBeCloseTo([239, 233, 221][c] / 255, 6));
    // One cell of the sheet is 400 / 48 pixels, and the sheet begins a head's height above the stage.
    const cell = 400 / 48;
    const [scaleX, scaleY, fromX, fromY] = webgl.quads.get('uGrid')!;
    expect(scaleX).toBeCloseTo(1 / cell, 9);
    expect(scaleY).toBeCloseTo(1 / cell, 9);
    expect(fromX).toBeCloseTo(0, 9);
    expect(fromY).toBeCloseTo(48 / cell, 9);
  });

  it('gives every word the type of the ground beneath it, and takes it back', async () => {
    withWebGL();
    const { container } = render(<Viewer enabled />);
    await prepared();
    await turn(50);
    paint();
    // The head's word and the strips' words stand on one ground or the other.
    const collection = screen.getByRole('link', { name: 'Collection' });
    expect(collection.getAttribute('data-sheet')).toMatch(/^(paper|night)$/);
    const strips = container.querySelectorAll('.strip [data-sheet]');
    expect(strips.length).toBe(2);
    // The two strips' words share one place: only one of them shows.
    expect(container.querySelectorAll('.strip [data-sheet-out]')).toHaveLength(1);
    await turn(null);
    paint();
    expect(container.querySelector('[data-sheet], [data-sheet-out], [data-sheet-fill]')).toBeNull();
  });

  it('paints the published stills themselves at either end of a Turn', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    await turn(100);
    paint();
    expect(webgl.floats.get('uShare')).toBe(0);
    await act(async () => root().style.setProperty('--seam', '0%'));
    paint();
    expect(webgl.floats.get('uShare')).toBe(1);
  });

  it('paces a Turn by time evenly, through the seam’s slow ends, and a finger’s by the finger', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    root().style.setProperty('--ease-turn', 'cubic-bezier(0.76, 0, 0.24, 1)');
    // A quarter of the travel, on a curve that starts slowly, is a good deal more of the time.
    await turn(75);
    paint();
    const clock = invertEasing(cubicBezier(0.76, 0, 0.24, 1));
    expect(webgl.floats.get('uShare')).toBeCloseTo(clock(0.25), 6);
    expect(webgl.floats.get('uShare')).toBeGreaterThan(0.35);
    await turn(null);
    paint();
    // Under a finger the seam is where the finger is: a quarter of the travel is a quarter.
    await turn(75, 'drag');
    paint();
    expect(webgl.floats.get('uShare')).toBeCloseTo(0.25, 6);
  });

  it('paints the wing’s night as soon as it is ready, in Light’s order', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled wing={40} />);
    await prepared();
    paint();
    expect(container.querySelector('canvas[data-crossing]')).toHaveAttribute('data-active');
    expect(webgl.floats.get('uTowardNight')).toBe(1);
    expect(webgl.floats.get('uShare')).toBeCloseTo(0.6, 6);
  });

  it('retraces Light’s order back to Ink under the wing, and holds each Turn’s order to its end', async () => {
    const webgl = withWebGL();
    // From Light back to an Ink that rests partly under the wing's night: Light's order.
    const { rerender } = render(<Viewer enabled expression="light" wing={50} />);
    await prepared();
    await turn(20);
    paint();
    expect(webgl.floats.get('uTowardNight')).toBe(1);
    await turn(null);
    paint();
    // From Light back to a whole Ink: Ink's order, through the commit and its last beat.
    rerender(<Viewer enabled expression="light" wing={100} />);
    await turn(30);
    paint();
    expect(webgl.floats.get('uTowardNight')).toBe(0);
    expect(webgl.ints.get('uSheet')).toBe(3);
    rerender(<Viewer enabled expression="ink" wing={100} />);
    paint();
    expect(webgl.floats.get('uTowardNight')).toBe(0);
  });

  it('lays the departing film over its still as the page does, at the film’s own opacity', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled />);
    // The Ink film, a few seconds along, which the page fades in over the still and out again.
    const film = document.createElement('video');
    Object.defineProperties(film, {
      readyState: { value: HTMLMediaElement.HAVE_ENOUGH_DATA },
      currentTime: { value: 3.2 },
      ended: { value: false, configurable: true },
    });
    container.querySelector('[data-layer="ink"] .art-media')!.append(film);
    await prepared();
    await turn(30);
    const shown = () => webgl.pairs.get('uFrameFor');
    film.style.opacity = '0';
    paint();
    expect(shown()).toEqual([0, 0]);
    // A film that begins to fade in mid-Turn comes in as gradually as it does on the page.
    film.style.opacity = '0.4';
    paint();
    expect(shown()).toEqual([0.4, 0]);
    film.style.opacity = '1';
    paint();
    expect(shown()).toEqual([1, 0]);
    // A film that has ended rests on its last frame, which is the still.
    Object.defineProperty(film, 'ended', { value: true });
    paint();
    expect(shown()).toEqual([0, 0]);
  });

  it('asks for new sheets when the stage changes, and paints again only once they are laid', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled wing={40} />);
    await prepared();
    paint();
    const canvas = container.querySelector('canvas[data-crossing]')!;
    expect(canvas).toHaveAttribute('data-active');
    const laid = () => webgl.uploads.filter(([width, height]) => width > 1 && height > 1).length;
    expect(laid()).toBe(2);
    // The strip grows a line: within the sheet's spare, so the same sheets serve.
    stage = { width: 400, height: 330 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    paint();
    expect(canvas).toHaveAttribute('data-active');
    expect(laid()).toBe(2);
    // The window narrows: the sheets no longer fit, so the frame is not painted with them.
    stage = { width: 320, height: 300 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    paint();
    // New ones come, and the wing's rest is drawn again.
    await act(async () => {});
    paint();
    expect(laid()).toBe(4);
    expect(canvas).toHaveAttribute('data-active');
    expect(webgl.pairs.get('uCanvas')).toEqual([320, 300]);
  });

  it('a Turn that asked after the viewer left marks nothing and builds nothing', async () => {
    const webgl = withWebGL();
    let release = () => {};
    decode = () => new Promise<void>((resolve) => (release = resolve));
    const { unmount } = render(<Viewer enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn' }));
    unmount();
    await act(async () => {
      release();
    });
    await act(async () => vi.advanceTimersByTime(500));
    expect(root().hasAttribute('data-crossing')).toBe(false);
    expect(webgl.calls).not.toContain('createProgram');
  });

  it('prepares at idle, and cancels its idle start the way a browser demands', async () => {
    withWebGL();
    /** A browser refuses its schedulers with any receiver but the window. */
    const strict = <A extends unknown[], R>(body: (...args: A) => R) =>
      function (this: unknown, ...args: A) {
        if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
        return body(...args);
      };
    const idles: IdleRequestCallback[] = [];
    const cancelled: number[] = [];
    vi.stubGlobal(
      'requestIdleCallback',
      strict((callback: IdleRequestCallback) => idles.push(callback)),
    );
    vi.stubGlobal(
      'cancelIdleCallback',
      strict((handle: number) => {
        cancelled.push(handle);
      }),
    );
    const { unmount } = render(<Viewer enabled />);
    expect(idles).toHaveLength(1);
    await act(async () => idles[0]({ didTimeout: false, timeRemaining: () => 50 }));
    await act(async () => {});
    await act(async () => {});
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(() => unmount()).not.toThrow();
    expect(cancelled).toEqual([1]);
    expect(root().hasAttribute('data-crossing')).toBe(false);
  });

  it('draws a still more than twice the work’s width down to it before the canvas reads it', async () => {
    withWebGL();
    // The rungs as the browser decodes them: the full still, then the one drawn down, each let go.
    const made: { width: number; height: number; close: () => void }[] = [];
    const bitmaps = vi.fn(async (_source: unknown, options?: ImageBitmapOptions) => {
      const bitmap = {
        width: options?.resizeWidth ?? 1920,
        height: options?.resizeHeight ?? 1241,
        close: vi.fn(),
      };
      made.push(bitmap);
      return bitmap as unknown as ImageBitmap;
    });
    vi.stubGlobal('createImageBitmap', bitmaps);
    render(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    // The work lies 400 pixels wide: each 1920 still is drawn down to it, finely, and the full
    // one let go once the smaller is made.
    const fitted = bitmaps.mock.calls.filter(([, options]) => options);
    expect(fitted).toHaveLength(2);
    for (const [, options] of fitted)
      expect(options).toEqual({ resizeWidth: 400, resizeHeight: 259, resizeQuality: 'high' });
    const full = made.filter((bitmap) => bitmap.width === 1920);
    expect(full).toHaveLength(2);
    for (const bitmap of full) expect(bitmap.close).toHaveBeenCalled();
  });

  it('reads a still under twice the work’s width as it is', async () => {
    withWebGL();
    const bitmaps = vi.fn<(source: unknown, options?: ImageBitmapOptions) => Promise<ImageBitmap>>(
      async () => ({ width: 700, height: 452, close: vi.fn() }) as unknown as ImageBitmap,
    );
    vi.stubGlobal('createImageBitmap', bitmaps);
    render(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(bitmaps.mock.calls.every(([, options]) => options === undefined)).toBe(true);
  });
});
