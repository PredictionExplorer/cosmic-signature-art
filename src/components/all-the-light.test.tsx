import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  numeral: `№\u00a0${String(id).padStart(3, '0')}`,
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
  hold: t.allTheLightHold,
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
  screen.getByRole('button', { name: `Show №\u00a0${String(id).padStart(3, '0')} alone` });
async function pickCycle(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await act(async () => {});
}
/** A finger on the sky, as a touch screen reports it. */
const finger = (x: number, y: number, pointerId = 1) => ({
  pointerId,
  pointerType: 'touch',
  clientX: x,
  clientY: y,
});
/** A finger comes down on the sky; the grid it asks for arrives as the test says. */
async function press(container: HTMLElement, x: number, y: number, pointerId = 1) {
  await act(async () => {
    fireEvent.pointerDown(frame(container), finger(x, y, pointerId));
  });
}
/** The finger rests long enough to be held. */
const rested = () => act(() => vi.advanceTimersByTime(300));
async function slide(container: HTMLElement, x: number, y: number, pointerId = 1) {
  await act(async () => {
    fireEvent.pointerMove(frame(container), finger(x, y, pointerId));
  });
}
async function lift(container: HTMLElement, x: number, y: number, pointerId = 1) {
  await act(async () => {
    fireEvent.pointerUp(frame(container), finger(x, y, pointerId));
  });
}
/** The invitation as a finger reads it (a pointer reads the other; the stylesheet shows one). */
const invites = () => {
  expect(readout()).toHaveTextContent(t.allTheLightHold);
  expect(readout()).toHaveTextContent(t.allTheLightPoint);
};

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
    // The invitation is written for a pointer and for a finger; the stylesheet shows the one the
    // screen's own pointer needs.
    expect(within(readout()).getByText(t.allTheLightPoint).tagName).toBe('SPAN');
    expect(within(readout()).getByText(t.allTheLightHold).tagName).toBe('SPAN');
    // The finger's invitation, its longest line, keeps its room while names stand in its place.
    expect(readout()).toHaveAttribute('data-room', t.allTheLightHold);
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
    // A finger does not hover: passing over the sky, not held there, it names nothing.
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
    expect(screen.getByRole('img', { name: '№\u00a0004 · Light' })).toBeInTheDocument();
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
    const alone = screen.getByRole('img', { name: '№\u00a0030 · Light' });
    expect(alone).toHaveAttribute('src', '/light/30.webp');
    expect(frame(container)).toHaveAttribute('data-alone');
    expect(readout()).toHaveTextContent('№ 030 alone, as its own untouched still');
    expect(screen.getByRole('link', { name: 'Go to №\u00a0030 →' })).toHaveAttribute(
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
    expect(screen.queryByRole('img', { name: '№\u00a0030 · Light' })).toBeNull();
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

  it('names under a held finger as it moves, and leaves the brightest alone as it lifts', async () => {
    const { container } = view();
    await press(container, 60, 30);
    // Resting, not yet held: nothing is said, and the page may still scroll under the finger.
    invites();
    expect(fireEvent.touchMove(frame(container))).toBe(true);
    rested();
    // Held: what lies beneath is named and lit at once, as the finger has rested already.
    expect(readout()).toHaveTextContent(
      'Through this point · № 030 · № 031 · № 032 · № 004 · № 001',
    );
    expect(lit(container)).toEqual([
      '/light/30.webp',
      '/light/31.webp',
      '/light/32.webp',
      '/light/4.webp',
      '/light/1.webp',
    ]);
    expect(frame(container)).toHaveAttribute('data-naming');
    // Its moves are the sky's now: the page does not scroll beneath it.
    expect(fireEvent.touchMove(frame(container))).toBe(false);
    // Moving, it names at once, and lights once it rests again.
    await slide(container, 390, 190);
    expect(readout()).toHaveTextContent(/^Through this point · № 030$/);
    settle();
    expect(lit(container)).toEqual(['/light/30.webp']);
    // Lifting it leaves the brightest beneath it alone, as its own still.
    await lift(container, 390, 190);
    expect(screen.getByRole('img', { name: '№ 030 · Light' })).toHaveAttribute(
      'src',
      '/light/30.webp',
    );
    expect(readout()).toHaveTextContent('№ 030 alone, as its own untouched still');
    // The lift is not a tap: no click follows it where the browser allows, and one that does
    // chooses nothing more.
    expect(fireEvent.touchEnd(frame(container))).toBe(false);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 390, clientY: 190 });
    });
    expect(frame(container)).toHaveAttribute('data-alone');
    // While one stands alone a finger holds nothing; it taps, and the tap gives the sky back.
    await press(container, 300, 150);
    rested();
    expect(readout()).toHaveTextContent('№ 030 alone, as its own untouched still');
    await lift(container, 300, 150);
    expect(fireEvent.touchEnd(frame(container))).toBe(true);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 300, clientY: 150 });
    });
    expect(frame(container)).not.toHaveAttribute('data-alone');
    invites();
  });

  it('chooses at once for a tap, and leaves a finger that moves at once to scroll', async () => {
    const { container } = view();
    // A tap is lifted before it rests: the click that follows chooses, as a pointer's does.
    await press(container, 60, 30);
    await lift(container, 60, 30);
    expect(fireEvent.touchEnd(frame(container))).toBe(true);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 60, clientY: 30 });
    });
    expect(screen.getByRole('img', { name: '№ 030 · Light' })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    // A finger may tremble as it rests and still be held …
    await press(container, 60, 30);
    await slide(container, 66, 34);
    rested();
    expect(readout()).toHaveTextContent(/^Through this point · № 030/);
    await act(async () => {
      fireEvent.pointerCancel(frame(container), finger(66, 34));
    });
    invites();
    // … but one that moves before it rests is scrolling the page: it names and chooses nothing.
    await press(container, 60, 30);
    await slide(container, 60, 45);
    rested();
    invites();
    expect(frame(container)).not.toHaveAttribute('data-naming');
    expect(fireEvent.touchMove(frame(container))).toBe(true);
    await act(async () => {
      fireEvent.pointerCancel(frame(container), finger(60, 90));
    });
    expect(frame(container)).not.toHaveAttribute('data-alone');
    invites();
  });

  it('lets the sky rest for a finger that leaves it, is taken away, or is joined', async () => {
    const { container } = view();
    await press(container, 60, 30);
    rested();
    expect(frame(container)).toHaveAttribute('data-naming');
    // Off the sky, the sky rests until the finger comes back to it.
    await slide(container, 450, 30);
    invites();
    expect(frame(container)).not.toHaveAttribute('data-naming');
    await slide(container, 60, 30);
    expect(readout()).toHaveTextContent(/^Through this point · № 030/);
    // Lifted off the sky, it chooses nothing, and the click its lift brings chooses nothing.
    await slide(container, 450, 30);
    await lift(container, 450, 30);
    await act(async () => {
      fireEvent.click(frame(container), { clientX: 450, clientY: 30 });
    });
    expect(frame(container)).not.toHaveAttribute('data-alone');
    invites();
    // A long press keeps the finger, opening no menu that would take it away …
    await press(container, 60, 30);
    rested();
    expect(fireEvent.contextMenu(frame(container))).toBe(false);
    // … and taken by the browser after all, a hold chooses nothing.
    await act(async () => {
      fireEvent.pointerCancel(frame(container), finger(60, 30));
    });
    invites();
    expect(lit(container)).toEqual([]);
    expect(fireEvent.contextMenu(frame(container))).toBe(true);
    // A second finger makes a pinch, the browser's to zoom: the first names no more, and
    // neither chooses as it lifts.
    await press(container, 60, 30);
    rested();
    await press(container, 200, 100, 2);
    invites();
    expect(fireEvent.touchMove(frame(container))).toBe(true);
    await lift(container, 60, 30);
    await lift(container, 200, 100, 2);
    expect(frame(container)).not.toHaveAttribute('data-alone');
    // A finger passing over the sky without coming down on it names nothing.
    await slide(container, 60, 30, 3);
    settle();
    expect(lit(container)).toEqual([]);
  });

  it('names under a finger held before the grid has come once it comes, and chooses then', async () => {
    decodeAtOnce = false;
    const first = view();
    await press(first.container, 60, 30);
    rested();
    // Held, with no grid yet: nothing is said about the place, not even "none".
    invites();
    await act(async () => decoding.shift()!.resolve());
    expect(readout()).toHaveTextContent(/^Through this point · № 030/);
    expect(lit(first.container)).toHaveLength(5);
    first.unmount();
    // Lifted before the grid has come, it chooses once the grid comes.
    const { container } = view();
    await press(container, 390, 190);
    rested();
    await lift(container, 390, 190);
    expect(screen.queryByRole('img', { name: '№ 030 · Light' })).toBeNull();
    await act(async () => decoding.shift()!.resolve());
    expect(screen.getByRole('img', { name: '№ 030 · Light' })).toBeInTheDocument();
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
    expect(screen.getByRole('img', { name: '№\u00a0006 · Light' })).toBeInTheDocument();
    // Where the index lies below the sky, the sky comes up to meet the choice.
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    // The choice's words leave with it; a focus on them returns to the numeral.
    const back = screen.getByRole('button', { name: t.allTheLightReturn });
    act(() => back.focus());
    fireEvent.click(back);
    expect(nine).toHaveFocus();
    expect(nine).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(nine);
    act(() => screen.getByRole('link', { name: 'Go to №\u00a0006 →' }).focus());
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(nine).toHaveFocus();
    expect(readout()).toHaveTextContent(/^№ 006$/);
    fireEvent.click(nine);
    fireEvent.click(nine);
    expect(screen.queryByRole('img', { name: '№\u00a0006 · Light' })).toBeNull();
  });

  it('gives the whole sky back in place when a hand presses the way back', () => {
    const { container } = view();
    fireEvent.click(numeral(6));
    const back = () => screen.getByRole('button', { name: t.allTheLightReturn });
    act(() => back().focus());
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    // A tap or a click counts one: the focus still returns to the numeral, but the page keeps its
    // place (on a phone the index lies far below) and the orbit is not named again.
    fireEvent.click(back(), { detail: 1 });
    expect(numeral(6)).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(lit(container)).toEqual([]);
    invites();
    // From the keyboard the focus is followed there, and names the orbit it lands on.
    fireEvent.click(numeral(6));
    act(() => back().focus());
    fireEvent.click(back());
    expect(numeral(6)).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: false });
    expect(readout()).toHaveTextContent(/^№ 006$/);
    expect(lit(container)).toEqual(['/light/6.webp']);
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
