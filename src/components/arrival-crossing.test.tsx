import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { groundColour, materialAt } from '@/lib/crossing/material';
import { cubicBezier, invertEasing } from '@/lib/crossing/timing';
import { rgb, useArrivalCrossing } from './arrival-crossing';
import { SeamController } from './turn';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const light = work.media.find((media) => media.id === 'light')!;
const root = () => document.documentElement;

/** A viewer's use of the crossing: its canvas over a plate, and a Turn that asks for it first. */
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
    <div>
      <canvas ref={canvas} />
      <div data-layer="ink">
        <div data-plate-ground="paper" style={{ backgroundColor: 'rgb(239, 233, 221)' }}>
          <div className="plate">
            <div className="art-media" />
          </div>
        </div>
      </div>
      <div data-layer="light">
        <div data-plate-ground="night" />
      </div>
      <div className="head-overlay" />
      <button
        type="button"
        onClick={(event) => {
          const button = event.currentTarget;
          void whenReady(400).then(() => button.setAttribute('data-answered', ''));
        }}
      >
        Light
      </button>
    </div>
  );
}

/**
 * A WebGL context that records what the crossing asks of it (the last value of each float and
 * float-pair uniform by name), and that the test can lose and restore.
 */
function fakeWebGL() {
  const calls: string[] = [];
  const floats = new Map<string, number>();
  const pairs = new Map<string, [number, number]>();
  const triples = new Map<string, [number, number, number]>();
  let lost = false;
  const methods: Record<string, (...args: never[]) => unknown> = {
    isContextLost: () => lost,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1f: (location: { name: string } | null, value: number) => {
      if (location) floats.set(location.name, value);
    },
    uniform2f: (location: { name: string } | null, x: number, y: number) => {
      if (location) pairs.set(location.name, [x, y]);
    },
    uniform3f: (location: { name: string } | null, x: number, y: number, z: number) => {
      if (location) triples.set(location.name, [x, y, z]);
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
    pairs,
    triples,
    lose: () => (lost = true),
    restore: () => (lost = false),
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
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    if (handle) frames[handle - 1] = () => {};
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  root().removeAttribute('data-crossing');
  root().removeAttribute('data-turning');
  root().removeAttribute('data-turn-to');
  root().style.removeProperty('--seam');
  root().style.removeProperty('--ease-turn');
});

/** WebGL as the crossing finds it, over a plate laid out at 400 × 300. */
function withWebGL() {
  const context = fakeWebGL();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl' ? context.gl : null) as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 300,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  } as DOMRect);
  return context;
}
/** Past the idle moment at which the crossing is prepared. */
async function prepared() {
  await act(async () => vi.advanceTimersByTime(500));
  await act(async () => {});
}

describe('the crossing in the order the work was made', () => {
  it('reads the room’s computed colours as channels', () => {
    expect(rgb('rgb(239, 233, 221)')).toEqual([239 / 255, 233 / 255, 221 / 255]);
    expect(rgb('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0]);
    expect(rgb('color(display-p3 1 1 1)')).toEqual([0, 0, 0]);
  });

  it('binds both of the curated work’s maps, so the crossing is offered there', () => {
    expect(ink.arrival?.src).toMatch(/^\/art\/arrival\/31-ink-[a-f0-9]{16}\.webp$/);
    expect(light.arrival?.src).toMatch(/^\/art\/arrival\/31-light-[a-f0-9]{16}\.webp$/);
  });

  it('keeps the straight seam where this browser has no WebGL, and never holds a Turn', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<Viewer enabled />);
    // Prepared at idle; without requestIdleCallback, a moment after the plate settles.
    await act(async () => vi.advanceTimersByTime(500));
    expect(context).toHaveBeenCalledWith('webgl', expect.anything());
    expect(root().hasAttribute('data-crossing')).toBe(false);
    const turn = screen.getByRole('button', { name: 'Light' });
    fireEvent.click(turn);
    await act(async () => vi.advanceTimersByTime(0));
    expect(turn).toHaveAttribute('data-answered');
    expect(root().hasAttribute('data-crossing')).toBe(false);
  });

  it('prepares nothing where the Turn is instant', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<Viewer enabled={false} />);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(context).not.toHaveBeenCalled();
    expect(root().hasAttribute('data-crossing')).toBe(false);
    // A Turn asks, and is answered at once.
    const turn = screen.getByRole('button', { name: 'Light' });
    fireEvent.click(turn);
    await act(async () => vi.advanceTimersByTime(0));
    expect(turn).toHaveAttribute('data-answered');
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
    expect(webgl.calls).not.toContain('getExtension');
    rerender(<Viewer enabled />);
    await prepared();
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(webgl.calls.filter((call) => call === 'linkProgram')).toHaveLength(2);
  });

  it('stands down when the browser takes the context, and returns when it gives it back', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled />);
    await prepared();
    const canvas = container.querySelector('canvas')!;
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
    paint();
    expect(canvas).not.toHaveAttribute('data-active');
    await turn(null);
    // A Turn asks while the context is gone: it is answered at once, and nothing is cached.
    const asking = screen.getByRole('button', { name: 'Light' });
    fireEvent.click(asking);
    await act(async () => vi.advanceTimersByTime(0));
    expect(asking).toHaveAttribute('data-answered');
    expect(root().hasAttribute('data-crossing')).toBe(false);
    webgl.restore();
    await act(async () => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    });
    await act(async () => {});
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(webgl.calls.filter((call) => call === 'linkProgram')).toHaveLength(2);
  });

  it('paints a Turn only if it was ready when the Turn began', async () => {
    withWebGL();
    const { container } = render(<Viewer enabled />);
    const canvas = container.querySelector('canvas')!;
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

  it('paints the wing’s night as soon as it is ready, in Light’s order', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled wing={40} />);
    await prepared();
    paint();
    expect(container.querySelector('canvas')).toHaveAttribute('data-active');
    expect(webgl.floats.get('uTowardNight')).toBe(1);
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
    rerender(<Viewer enabled expression="ink" wing={100} />);
    paint();
    expect(webgl.floats.get('uTowardNight')).toBe(0);
  });

  it('lays the outgoing film over its still as the page does, at the film’s own opacity', async () => {
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

  it('a Turn that asked after the viewer left marks nothing and builds nothing', async () => {
    const webgl = withWebGL();
    let release = () => {};
    decode = () => new Promise<void>((resolve) => (release = resolve));
    const { unmount } = render(<Viewer enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
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
    expect(root()).toHaveAttribute('data-crossing', 'arrival');
    expect(() => unmount()).not.toThrow();
    expect(cancelled).toEqual([1]);
    expect(root().hasAttribute('data-crossing')).toBe(false);
  });
  it('changes material on a Turn by time, and the room takes the ground on the same frame', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled />);
    await prepared();
    // Each pixel is written as the change computes it, and each order is paced over its marks:
    // here, where no still can be read back, over the whole map.
    expect(webgl.calls).toContain('disable');
    expect(webgl.pairs.get('uInkSpan')).toEqual([0, 1]);
    expect(webgl.pairs.get('uLightSpan')).toEqual([0, 1]);
    await turn(50);
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(1);
    expect(webgl.floats.get('uTowardNight')).toBe(1);
    const change = materialAt(50, 'night');
    expect(webgl.floats.get('uProgress')).toBeCloseTo(change.progress, 6);
    const ground = webgl.floats.get('uGround')!;
    expect(ground).toBeGreaterThan(0);
    expect(ground).toBeLessThan(1);
    const sheet = [239 / 255, 233 / 255, 221 / 255] as const;
    const [paperScreen, nightScreen] =
      container.querySelectorAll<HTMLElement>('[data-plate-ground]');
    const night = container.querySelector<HTMLElement>('[data-layer="light"]')!;
    const head = container.querySelector<HTMLElement>('.head-overlay')!;
    // Both screens wear the ground beneath the strip, the night's words come in by their share,
    // and the head's overlay shows as far as the ground has come toward the night.
    expect(paperScreen.style.backgroundColor).toBe(groundColour(sheet, ground));
    expect(nightScreen.style.backgroundColor).toBe(groundColour(sheet, ground));
    expect(night.style.clipPath).toBe('none');
    expect(Number(night.style.opacity)).toBeCloseTo(change.words, 6);
    expect(head.style.clipPath).toBe('none');
    expect(Number(head.style.opacity)).toBeCloseTo(1 - ground, 6);
    // The sheet's tone was read while its screen wore its own, and is kept while it wears the ground.
    paint();
    webgl.triples.get('uPaper')!.forEach((value, c) => expect(value).toBeCloseTo(sheet[c], 6));
    // The Turn ends: everything goes back, the screen's own colour included.
    await turn(null);
    paint();
    expect(paperScreen.style.backgroundColor).toBe('rgb(239, 233, 221)');
    expect(nightScreen.style.backgroundColor).toBe('');
    expect(night.style.opacity).toBe('');
    expect(night.style.clipPath).toBe('');
    expect(head.style.opacity).toBe('');
    expect(head.style.clipPath).toBe('');
  });

  it('brings the paper back in the sheet’s own tone, the head’s overlay with it', async () => {
    const webgl = withWebGL();
    const { container } = render(<Viewer enabled expression="light" />);
    await prepared();
    await turn(30, 'time', 'paper');
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(1);
    expect(webgl.floats.get('uTowardNight')).toBe(0);
    const change = materialAt(30, 'paper');
    const night = container.querySelector<HTMLElement>('[data-layer="light"]')!;
    const head = container.querySelector<HTMLElement>('.head-overlay')!;
    // The night's words leave as the paper's come in; the paper overlay is the sheet's tone.
    expect(Number(night.style.opacity)).toBeCloseTo(1 - change.words, 6);
    expect(Number(head.style.opacity)).toBeCloseTo(change.ground, 6);
    expect(head.style.backgroundColor).toBe('rgb(239, 233, 221)');
  });

  it('paints the published stills themselves at either end of a change', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    await turn(100);
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(1);
    expect(webgl.floats.get('uProgress')).toBe(0);
    await act(async () => root().style.setProperty('--seam', '0%'));
    paint();
    expect(webgl.floats.get('uProgress')).toBe(1);
  });

  it('paces the change by the Turn’s own clock, through the seam’s slow ends', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    root().style.setProperty('--ease-turn', 'cubic-bezier(0.76, 0, 0.24, 1)');
    // A quarter of the travel, on a curve that starts slowly, is a good deal more of the time.
    await turn(75);
    paint();
    const clock = invertEasing(cubicBezier(0.76, 0, 0.24, 1));
    expect(webgl.floats.get('uProgress')).toBeCloseTo(clock(0.25), 6);
    expect(webgl.floats.get('uProgress')).toBeGreaterThan(0.35);
  });

  it('keeps the pixel crossing for a finger, the Overture, and a plate under its wing', async () => {
    const webgl = withWebGL();
    const { container, rerender } = render(<Viewer enabled />);
    await prepared();
    const night = container.querySelector<HTMLElement>('[data-layer="light"]')!;
    for (const mode of ['drag', 'overture'] as const) {
      await turn(50, mode);
      paint();
      expect(webgl.floats.get('uMaterial')).toBe(0);
      expect(night.style.opacity).toBe('');
      await turn(null);
      paint();
    }
    // Inside a partly drawn wing a Turn by time meets the wing as it is drawn: pixel by pixel.
    rerender(<Viewer enabled wing={40} />);
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(0);
    await turn(40);
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(0);
    expect(night.style.opacity).toBe('');
  });

  it('holds a Turn’s material to its end, whoever takes the seam', async () => {
    const webgl = withWebGL();
    render(<Viewer enabled />);
    await prepared();
    await turn(60);
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(1);
    // A finger takes the seam mid-way: the Turn it takes goes on changing material.
    await act(async () => root().setAttribute('data-turning', 'drag'));
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(1);
    // And a finger's own Turn, begun afresh, keeps the pixel crossing.
    await turn(null);
    paint();
    await turn(70, 'drag');
    paint();
    expect(webgl.floats.get('uMaterial')).toBe(0);
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
