import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { AllTheLight, type LightLabels, type LightSky, type LightWork } from './all-the-light';

const lendPlateTone = vi.hoisted(() => vi.fn());
const returnPlateTone = vi.hoisted(() => vi.fn());
vi.mock('./room-ground', () => ({ lendPlateTone, returnPlateTone }));
const motion = vi.hoisted(() => ({ paused: false, reducedMotion: false, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const t = messages('en');
const work = (id: number, cycle: number): LightWork => ({
  id,
  cycle,
  numeral: `№ ${String(id).padStart(3, '0')}`,
  href: `/art/${id}?expression=light`,
  src: `/light/${id}.webp`,
  srcSet: `/light/${id}.webp 1280w`,
});
/**
 * Nine works in the order the sky was filled: six from Cycle 0 (№ 001–006), and from Cycle 1
 * № 030, № 031 and № 032.
 */
const works = [1, 2, 3, 4, 5, 6]
  .map((id) => work(id, 0))
  .concat([30, 31, 32].map((id) => work(id, 1)));
const sky = (upTo: number, option: string, count: number): LightSky => ({
  upTo,
  src: `/sky-${upTo}.webp`,
  srcSet: `/sky-${upTo}.webp 1280w`,
  width: 1280,
  height: 827,
  option,
  label: fill(t.allTheLightSky, { span: option, count }),
  alt: fill(t.allTheLightAlt, { span: option, count }),
});
const skies = [sky(0, 'Cycle 0', 6), sky(1, 'Cycle 0 to Cycle 1', 9)];
const labels: LightLabels = {
  title: t.allTheLight,
  line: fill(t.allTheLightLine, { count: 9 }),
  note: t.allTheLightNote,
  point: t.allTheLightPoint,
  through: t.allTheLightThrough,
  none: t.allTheLightNone,
  alone: t.allTheLightAlone,
  back: t.allTheLightReturn,
  visit: t.allTheLightVisit,
  showAlone: t.allTheLightShowAlone,
  cycles: t.allTheLightCycles,
  replay: t.allTheLightReplay,
  orbits: t.allTheLightOrbits,
  cycle: t.cycle,
  light: t.light,
};

/**
 * The naming grid: one tile per work, eight cells across and four down, in the sky's order.
 * Near the top left all six Cycle 0 orbits pass, № 004 brightest, and the three Cycle 1 orbits
 * pass brighter still; at the bottom right corner only № 030 shines; the middle is dark.
 */
const grid = { src: '/grid.webp', across: 9, columns: 8, rows: 4 };
function gridPixels() {
  const width = grid.across * grid.columns;
  const pixels = new Uint8ClampedArray(width * grid.rows * 4);
  const set = (tile: number, column: number, row: number, light: number) => {
    pixels[(row * width + tile * grid.columns + column) * 4] = light;
  };
  [120, 110, 100, 200, 90, 80].forEach((light, tile) => set(tile, 1, 0, light));
  [250, 240, 230].forEach((light, k) => set(6 + k, 1, 0, light));
  set(6, 7, 3, 240);
  return pixels;
}

let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] =
  [];
const scrolled = vi.fn();
/** Every image decodes when the test says so: the grid, and each sky a change waits for. */
let decoding: { src: string; resolve: () => void; reject: () => void }[] = [];
let decodeAtOnce = true;

beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  decoding = [];
  decodeAtOnce = true;
  scrolled.mockClear();
  lendPlateTone.mockClear();
  returnPlateTone.mockClear();
  Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'playing' });
  // Frames run at once: the reveal waits two of them for the choice to be laid out.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options });
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value(this: HTMLImageElement) {
      if (decodeAtOnce) return Promise.resolve();
      return new Promise<void>((resolve, reject) =>
        decoding.push({ src: this.getAttribute('src') ?? this.src, resolve, reject }),
      );
    },
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrolled,
  });
  const pixels = gridPixels();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage() {},
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  // The sky is laid out at 400 × 200: a point at (60, 30) lies by the top left light.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 200,
    width: 400,
    height: 200,
    toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

function view() {
  return render(<AllTheLight works={works} skies={skies} grid={grid} labels={labels} />);
}
const frame = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('figure > div') as HTMLElement;
const readout = () => document.querySelector('figcaption')!;
const shown = (container: HTMLElement) =>
  container.querySelector('img[data-shown]')?.getAttribute('src');
/** A pointer moves over the sky; what it names is said at once and lit once it rests. */
async function point(container: HTMLElement, x: number, y: number) {
  await act(async () => {
    fireEvent.pointerMove(frame(container), { clientX: x, clientY: y, pointerType: 'mouse' });
  });
  await act(async () => {});
}
const settle = () => act(() => vi.advanceTimersByTime(120));
const lit = (container: HTMLElement) =>
  [...frame(container).querySelectorAll('img')]
    .map((image) => image.getAttribute('src'))
    .filter((src) => src?.startsWith('/light/'));
const numeral = (id: number) =>
  screen.getByRole('button', { name: `Show № ${String(id).padStart(3, '0')} alone` });
async function pickCycle(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await act(async () => {});
}

describe('All the light', () => {
  it('shows the whole sky as a derived view, with its cycles and its index', () => {
    const { container } = view();
    expect(screen.getByRole('heading', { level: 1, name: t.allTheLight })).toBeInTheDocument();
    // Only the whole sky is asked for until another is chosen; its words come whole.
    expect(screen.getByRole('img')).toHaveAttribute('src', '/sky-1.webp');
    expect(screen.getByRole('img')).toHaveAccessibleName(skies[1].alt);
    expect(skies[1].alt).toBe(
      'All the light, Cycle 0 to Cycle 1: the Light stills of 9 works added together, white where orbits crowd and coloured at their edges. A derived view, not a work.',
    );
    expect(screen.getByText(/A derived view, not a work: the published/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cycle 0' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Cycle 0 to Cycle 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Cycle 0' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Cycle 1' })).toHaveTextContent('№ 030');
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    expect(container.querySelector('[data-outside]')).toBeNull();
  });

  it('names the brightest orbits under a point at once, and lights them once it rests', async () => {
    const { container } = view();
    fireEvent.pointerEnter(frame(container));
    await point(container, 60, 30);
    expect(readout()).toHaveTextContent(
      'Through this point · № 030 · № 031 · № 032 · № 004 · № 001',
    );
    // The stills are fetched only for a pointer that stays.
    expect(lit(container)).toEqual([]);
    settle();
    expect(lit(container)).toEqual([
      '/light/30.webp',
      '/light/31.webp',
      '/light/32.webp',
      '/light/4.webp',
      '/light/1.webp',
    ]);
    expect(frame(container)).toHaveAttribute('data-naming');
    // Where nothing passes the sky says so at once; leaving it, the invitation returns.
    await point(container, 210, 110);
    expect(readout()).toHaveTextContent(t.allTheLightNone);
    expect(frame(container)).not.toHaveAttribute('data-naming');
    fireEvent.pointerLeave(frame(container));
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    // A finger does not hover: it names by choosing.
    fireEvent.pointerMove(frame(container), { clientX: 60, clientY: 30, pointerType: 'touch' });
    settle();
    expect(lit(container)).toEqual([]);
  });

  it('names from the orbits of the sky on view, not the brightest of the whole sky', async () => {
    const { container } = view();
    await pickCycle('Cycle 0');
    expect(shown(container)).toBe('/sky-0.webp');
    // The three Cycle 1 orbits are brighter here, but they are not in the sky after Cycle 0.
    await point(container, 60, 30);
    expect(readout()).toHaveTextContent(
      'Through this point · № 004 · № 001 · № 002 · № 003 · № 005',
    );
    // № 030 alone shines at the corner, and it too is not in this sky.
    await point(container, 390, 190);
    expect(readout()).toHaveTextContent(t.allTheLightNone);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 60, clientY: 30 });
    });
    expect(screen.getByRole('img', { name: '№ 004 · Light' })).toBeInTheDocument();
  });

  it('names nothing for a pointer that left before the grid came, and asks again after a failure', async () => {
    decodeAtOnce = false;
    const { container } = view();
    await point(container, 60, 30);
    await point(container, 62, 31);
    fireEvent.pointerLeave(frame(container));
    // The grid fails: nothing is said about the place, not even "none".
    await act(async () => decoding.shift()!.reject());
    settle();
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    expect(lit(container)).toEqual([]);
    // The next approach asks for the grid again; it comes after the pointer has gone.
    await point(container, 60, 30);
    expect(decoding).toHaveLength(1);
    fireEvent.pointerLeave(frame(container));
    await act(async () => decoding.shift()!.resolve());
    settle();
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    expect(frame(container)).not.toHaveAttribute('data-naming');
    // The pointer comes back, and is named at once.
    await point(container, 60, 30);
    expect(readout()).toHaveTextContent(/^Through this point · № 030/);
  });

  it('leaves the brightest orbit under a click alone, as its own still, until Escape', async () => {
    const { container } = view();
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 60, clientY: 30 });
    });
    const alone = screen.getByRole('img', { name: '№ 030 · Light' });
    expect(alone).toHaveAttribute('src', '/light/30.webp');
    expect(frame(container)).toHaveAttribute('data-alone');
    expect(readout()).toHaveTextContent('№ 030 alone, as its own untouched still');
    expect(screen.getByRole('link', { name: 'Go to № 030 →' })).toHaveAttribute(
      'href',
      '/art/30?expression=light',
    );
    // While one stands alone, pointing names nothing.
    await point(container, 60, 30);
    settle();
    expect(lit(container)).toEqual(['/light/30.webp']);
    // An Escape a dialog over the page takes is not this page's.
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(frame(container)).toHaveAttribute('data-alone');
    dialog.remove();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('img', { name: '№ 030 · Light' })).toBeNull();
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    // A click where nothing passes chooses nothing; a click on a lone orbit returns.
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 210, clientY: 110 });
    });
    expect(readout()).toHaveTextContent(t.allTheLightNone);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 60, clientY: 30 });
    });
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 300, clientY: 150 });
    });
    expect(frame(container)).not.toHaveAttribute('data-alone');
  });

  it('dims the cycles still to come in the index, legibly', async () => {
    view();
    await pickCycle('Cycle 0');
    expect(numeral(30)).toHaveAttribute('data-outside');
    expect(numeral(4)).not.toHaveAttribute('data-outside');
    await pickCycle('Cycle 0 to Cycle 1');
    expect(numeral(30)).not.toHaveAttribute('data-outside');
  });

  it('lights an orbit from the index by name, chooses it there, and keeps the focus', () => {
    const { container } = view();
    const nine = numeral(6);
    // A finger landing on a numeral lights nothing, so its tap chooses at once.
    fireEvent.pointerEnter(nine, { pointerType: 'touch' });
    expect(lit(container)).toEqual([]);
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    fireEvent.pointerEnter(nine, { pointerType: 'mouse' });
    expect(lit(container)).toEqual(['/light/6.webp']);
    fireEvent.pointerLeave(nine);
    act(() => nine.focus());
    expect(lit(container)).toEqual(['/light/6.webp']);
    expect(readout()).toHaveTextContent(/^№ 006$/);
    act(() => nine.blur());
    expect(readout()).toHaveTextContent(t.allTheLightPoint);
    fireEvent.click(nine);
    expect(nine).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: '№ 006 · Light' })).toBeInTheDocument();
    // Where the index lies below the sky, the sky comes up to meet the choice.
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    // The choice's words leave with it; a focus on them returns to the numeral.
    const back = screen.getByRole('button', { name: t.allTheLightReturn });
    act(() => back.focus());
    fireEvent.click(back);
    expect(nine).toHaveFocus();
    expect(nine).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(nine);
    act(() => screen.getByRole('link', { name: 'Go to № 006 →' }).focus());
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(nine).toHaveFocus();
    expect(readout()).toHaveTextContent(/^№ 006$/);
    fireEvent.click(nine);
    fireEvent.click(nine);
    expect(screen.queryByRole('img', { name: '№ 006 · Light' })).toBeNull();
  });

  it('changes the sky only once the next is decoded, so it never passes through black', async () => {
    decodeAtOnce = false;
    const { container } = view();
    fireEvent.click(screen.getByRole('button', { name: 'Cycle 0' }));
    expect(screen.getByRole('button', { name: 'Cycle 0' })).toHaveAttribute('aria-pressed', 'true');
    expect(shown(container)).toBe('/sky-1.webp');
    await act(async () => decoding.shift()!.resolve());
    expect(shown(container)).toBe('/sky-0.webp');
    // A sky asked for later is shown even if an earlier one decodes after it.
    fireEvent.click(screen.getByRole('button', { name: 'Cycle 0 to Cycle 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cycle 0' }));
    const [earlier, later] = decoding.splice(0);
    await act(async () => later.resolve());
    await act(async () => earlier.resolve());
    expect(shown(container)).toBe('/sky-0.webp');
  });

  it('replays the sky cycle by cycle while motion plays, and stops for Pause', async () => {
    const { container, rerender } = view();
    fireEvent.click(screen.getByRole('button', { name: t.allTheLightReplay }));
    await act(async () => vi.advanceTimersByTime(0));
    expect(shown(container)).toBe('/sky-0.webp');
    expect(numeral(30)).toHaveAttribute('data-outside');
    await act(async () => vi.advanceTimersByTime(2400));
    expect(shown(container)).toBe('/sky-1.webp');
    expect(numeral(30)).not.toHaveAttribute('data-outside');
    // Paused mid-replay, the sky stays where it stands, and no replay is offered.
    fireEvent.click(screen.getByRole('button', { name: t.allTheLightReplay }));
    await act(async () => vi.advanceTimersByTime(0));
    motion.paused = true;
    rerender(<AllTheLight works={works} skies={skies} grid={grid} labels={labels} />);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(shown(container)).toBe('/sky-0.webp');
    expect(screen.queryByRole('button', { name: t.allTheLightReplay })).toBeNull();
  });

  it('chooses from the index without motion where motion is still', () => {
    Object.assign(motion, { reducedMotion: true });
    view();
    expect(screen.queryByRole('button', { name: t.allTheLightReplay })).toBeNull();
    fireEvent.click(numeral(4));
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' });
  });

  it('lends the running head the night while the page stands beneath it, and returns it', () => {
    const { unmount } = view();
    expect(observers[0].options?.rootMargin).toBe('-2px 0px -92% 0px');
    act(() =>
      observers[0].callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(lendPlateTone).toHaveBeenLastCalledWith(expect.any(Object), '#000000', 'night');
    const holder = lendPlateTone.mock.calls[0][0];
    act(() =>
      observers[0].callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(returnPlateTone).toHaveBeenLastCalledWith(holder);
    unmount();
    expect(returnPlateTone).toHaveBeenCalledTimes(2);
  });
});
