import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
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
        <div className="plate">
          <div className="art-media" />
        </div>
      </div>
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
/** A Turn begins on <html>, with the seam where the straight seam would paint it. */
async function turn(seam: number | null) {
  await act(async () => {
    if (seam === null) {
      root().removeAttribute('data-turning');
      root().style.removeProperty('--seam');
    } else {
      root().setAttribute('data-turning', 'time');
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
  root().style.removeProperty('--seam');
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
});
