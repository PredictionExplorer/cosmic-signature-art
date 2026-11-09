import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performedOrbits } from '@/lib/art/orbit-windows';
import type { OrreryReply, OrreryRequest } from '@/lib/physics/orrery';
import { Orrery, type OrreryCycle } from './orrery';

const motion = vi.hoisted(() => ({ paused: false, reducedMotion: false, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const [a, b, c] = performedOrbits([0, 31, 40]);
const work = (orbit: typeof a, plate = true) => ({
  id: orbit.id,
  numeral: `№\u00a0${String(orbit.id).padStart(3, '0')}`,
  href: `/art/${orbit.id}`,
  label: `№\u00a0${String(orbit.id).padStart(3, '0')} · its orbit, performed`,
  window: orbit.window,
  hues: orbit.bodyHues,
  plate: plate ? `https://example.test/${orbit.id}.webp` : undefined,
});
const cycles: OrreryCycle[] = [
  { cycle: 0, heading: 'Cycle 0 · June 2026', works: [work(a), work(b)] },
  { cycle: 1, heading: 'Cycle 1 · July 2026', works: [work(c, false)] },
];

let observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
let workers: FakeWorker[] = [];
/** The page's animation frames, waiting until the test draws one. */
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function drawFrame() {
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach((callback) => callback(0)));
}
class FakeWorker {
  onmessage: ((event: MessageEvent<OrreryReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: { message: OrreryRequest; transfer: Transferable[] }[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(message: OrreryRequest, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: OrreryReply) {
    act(() => this.onmessage?.({ data: message } as MessageEvent<OrreryReply>));
  }
}
const ofType = <T extends OrreryRequest['type']>(type: T) =>
  workers[0].posted
    .map(({ message }) => message)
    .filter((message): message is Extract<OrreryRequest, { type: T }> => message.type === type);

function Page() {
  return (
    <Orrery
      cycles={cycles}
      title="The Orrery"
      line="Every orbit, at once."
      note="Computed as you watch."
      still="Drawn whole."
      fallback="Stills instead."
    />
  );
}

beforeEach(() => {
  observers = [];
  workers = [];
  Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'playing' });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      targets: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, targets: this.targets });
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('Worker', FakeWorker);
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
});

/** A browser that hands canvases to workers. */
function offscreen() {
  Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
    configurable: true,
    value: function (this: HTMLCanvasElement) {
      return { width: this.width, height: this.height } as unknown as OffscreenCanvas;
    },
  });
}

describe('the Orrery', () => {
  it('hangs every orbit by cycle, each numeral a link to its work', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Orrery' })).toBeInTheDocument();
    const first = screen.getByRole('region', { name: 'Cycle 0 · June 2026' });
    const links = within(first).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      '№\u00a0000 · its orbit, performed',
      '№\u00a0031 · its orbit, performed',
    ]);
    expect(links[1]).toHaveAttribute('href', '/art/31');
    expect(screen.getByRole('region', { name: 'Cycle 1 · July 2026' })).toBeInTheDocument();
  });

  it('shows every work’s Light still where a browser cannot hand canvases to a worker', () => {
    const { container } = render(<Page />);
    expect(container.querySelector('section')).toHaveAttribute('data-mode', 'plates');
    expect(screen.getByRole('status')).toHaveTextContent('Stills instead.');
    expect(workers).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/0.webp');
  });

  it('hands one worker a canvas per orbit, in view or not, and the motion preference', () => {
    offscreen();
    const { container, unmount } = render(<Page />);
    expect(container.querySelector('section')).toHaveAttribute('data-mode', 'performing');
    expect(workers).toHaveLength(1);
    const [cells] = ofType('cells');
    expect(cells.moving).toBe(true);
    expect(cells.cells.map((cell) => cell.id)).toEqual([0, 31, 40]);
    expect(cells.cells[1].window).toBe(b.window);
    expect(workers[0].posted[0].transfer).toHaveLength(3);
    expect(container.querySelectorAll('canvas[aria-hidden="true"]')).toHaveLength(3);
    // In view and out of it, by stage.
    const visibility = observers.find((observer) => observer.targets.length === 3)!;
    act(() =>
      visibility.callback(
        [
          {
            target: visibility.targets[1],
            isIntersecting: true,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    expect(ofType('visible')).toEqual([{ type: 'visible', id: 31, visible: true }]);
    // A still preference is passed on, and a cell drawn whole says so on its stage.
    motion.paused = true;
    render(<Page />, { container });
    expect(ofType('moving').at(-1)).toEqual({ type: 'moving', moving: false });
    expect(screen.getByRole('status')).toHaveTextContent('Drawn whole.');
    workers[0].reply({ type: 'drawn', id: 31 });
    expect(container.querySelector('[data-stage="31"]')).toHaveAttribute('data-drawn');
    unmount();
    expect(workers[0].terminated).toBe(true);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('draws at the screen’s own density, three canvas pixels to a CSS pixel at most', () => {
    offscreen();
    const density = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    const screenOf = (ratio: number) =>
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ratio });
    // A phone's cell, two to a row.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 170,
      height: 110,
    } as DOMRect);
    try {
      // A phone at three: its trails are drawn at its own density, not scaled up from two.
      screenOf(3);
      const phone = render(<Page />);
      expect(ofType('cells')[0].ratio).toBe(3);
      const canvas = phone.container.querySelector('canvas')!;
      expect([canvas.width, canvas.height]).toEqual([510, 330]);
      phone.unmount();
      // Denser screens are drawn at three; a desk's own density is kept as it is.
      for (const [screen, drawn] of [
        [4, 3],
        [2, 2],
        [1.5, 1.5],
      ]) {
        workers = [];
        screenOf(screen);
        const { unmount } = render(<Page />);
        expect(ofType('cells')[0].ratio).toBe(drawn);
        unmount();
      }
    } finally {
      if (density) Object.defineProperty(window, 'devicePixelRatio', density);
      else Reflect.deleteProperty(window, 'devicePixelRatio');
    }
  });

  it('lends the worker the page’s frames, one at a time, and none once it is gone', () => {
    offscreen();
    const { container, unmount } = render(<Page />);
    const asked = () => ofType('frame').length;
    // The cells are handed over; the worker is asked for a frame on the page's next.
    expect(asked()).toBe(0);
    drawFrame();
    expect(asked()).toBe(1);
    // Unanswered, it is asked for nothing more, however many frames the page draws.
    drawFrame();
    drawFrame();
    expect(asked()).toBe(1);
    workers[0].reply({ type: 'framed', more: true });
    drawFrame();
    expect(asked()).toBe(2);
    // With nothing to draw it rests, until a cell comes into view.
    workers[0].reply({ type: 'framed', more: false });
    drawFrame();
    expect(asked()).toBe(2);
    const visibility = observers.find((observer) => observer.targets.length === 3)!;
    act(() =>
      visibility.callback(
        [
          { target: visibility.targets[0], isIntersecting: true },
        ] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
    drawFrame();
    expect(asked()).toBe(3);
    // A change of motion wakes it too, though its answer came before it knew.
    motion.paused = true;
    render(<Page />, { container });
    workers[0].reply({ type: 'framed', more: false });
    drawFrame();
    expect(asked()).toBe(4);
    // Gone, it leaves no frame waiting.
    workers[0].reply({ type: 'framed', more: true });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('shows every work’s still when the worker fails or cannot draw', () => {
    offscreen();
    const { container } = render(<Page />);
    act(() => workers[0].onerror?.({} as ErrorEvent));
    expect(container.querySelector('section')).toHaveAttribute('data-mode', 'plates');
    expect(workers[0].terminated).toBe(true);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Stills instead.');
    expect(container.querySelectorAll('img')).toHaveLength(2);
    cleanup();
    workers = [];
    const again = render(<Page />);
    workers[0].reply({ type: 'failed' });
    expect(again.container.querySelector('section')).toHaveAttribute('data-mode', 'plates');
  });

  it('takes every cell out of view while the page is hidden, and back as it was', () => {
    offscreen();
    render(<Page />);
    const visibility = observers.find((observer) => observer.targets.length === 3)!;
    act(() =>
      visibility.callback(
        [
          { target: visibility.targets[0], isIntersecting: true },
        ] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ofType('visible').slice(-3)).toEqual([
      { type: 'visible', id: 0, visible: false },
      { type: 'visible', id: 31, visible: false },
      { type: 'visible', id: 40, visible: false },
    ]);
    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ofType('visible').slice(-3)).toEqual([
      { type: 'visible', id: 0, visible: true },
      { type: 'visible', id: 31, visible: false },
      { type: 'visible', id: 40, visible: false },
    ]);
  });

  it('lets no cell stand drawn whole once motion changes', () => {
    offscreen();
    motion.paused = true;
    const { container } = render(<Page />);
    workers[0].reply({ type: 'drawn', id: 31 });
    expect(container.querySelector('[data-stage="31"]')).toHaveAttribute('data-drawn');
    motion.paused = false;
    render(<Page />, { container });
    expect(container.querySelector('[data-drawn]')).toBeNull();
    expect(ofType('moving').at(-1)).toEqual({ type: 'moving', moving: true });
  });

  it('loads a work’s still only when it is pointed at or focused, then keeps it', () => {
    offscreen();
    const { container } = render(<Page />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    const link = screen.getByRole('link', { name: '№\u00a0031 · its orbit, performed' });
    // A finger landing changes nothing under the tap, so the tap enters the work at once.
    fireEvent.pointerEnter(link, { pointerType: 'touch' });
    expect(link.querySelector('img')).toBeNull();
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.test/31.webp');
    fireEvent.focus(screen.getByRole('link', { name: '№\u00a0000 · its orbit, performed' }));
    expect(container.querySelectorAll('img')).toHaveLength(2);
    // A work the publisher gave no preview has none to show.
    fireEvent.focus(screen.getByRole('link', { name: '№\u00a0040 · its orbit, performed' }));
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });
});
