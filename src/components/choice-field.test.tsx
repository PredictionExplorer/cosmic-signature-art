import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit } from '@/lib/art/orbit-records';
import { QUICK_GATE, type Beginnings, type BeginningsChunk } from '@/lib/physics/beginnings';
import type { BeginningsReply, BeginningsRequest } from '@/lib/physics/beginnings.worker';
import { ChoiceField } from './choice-field';

const motion = vi.hoisted(() => ({ paused: true, reducedMotion: true, theatre: 'playing' }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));

const t = messages('en');
// № 023: the work the browser suite's venue day opens on; its chosen beginning is 22,083.
const orbit = workOrbit(23)!;
const generation = orbit.generation;
const field = <ChoiceField generation={generation} gate={QUICK_GATE} t={t} locale="en" />;

interface FakeImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
let observers: IntersectionObserverCallback[] = [];
let resizes: ResizeObserverCallback[] = [];
let workers: FakeWorker[] = [];
let puts: unknown[][] = [];
let images: FakeImage[] = [];
let clockNow = 0;
let box = { width: 600, height: 400 };

class FakeWorker {
  onmessage: ((event: MessageEvent<BeginningsReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: BeginningsRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: BeginningsRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: BeginningsReply) {
    act(() => this.onmessage?.({ data: message } as MessageEvent<BeginningsReply>));
  }
}

const context = {
  createImageData(width: number, height: number): FakeImage {
    const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    images.push(image);
    return image;
  },
  putImageData(...args: unknown[]) {
    puts.push(args);
  },
};
/** The exposure's opacity, pixel by pixel: what the canvas was last given to show. */
const exposure = () => {
  const image = images.at(-1);
  return image ? image.data.filter((_, i) => i % 4 === 3) : new Uint8ClampedArray();
};
const light = () => exposure().reduce((sum, alpha) => sum + alpha, 0);

beforeEach(() => {
  observers = [];
  resizes = [];
  workers = [];
  puts = [];
  images = [];
  clockNow = 0;
  box = { width: 600, height: 400 };
  Object.assign(motion, { paused: true, reducedMotion: true, theatre: 'playing' });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizes.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({ ...box, x: 0, y: 0, top: 0, left: 0, right: box.width, bottom: box.height }) as DOMRect,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function approach() {
  act(() =>
    observers[0](
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

/** 2,500 beginnings spread across the field, the chosen one where its index falls. */
function chunk(start: number, deepest = -90_000): BeginningsChunk {
  const energies = Float64Array.from(
    { length: 2_500 },
    (_, k) => -1_000 + (k / 2_500) * (deepest + 1_000),
  );
  const momenta = Float64Array.from(
    { length: 2_500 },
    (_, k) => 2_000 + ((k * 7_919) % 2_500) * 90,
  );
  const index = generation.selectedIndex - start;
  if (index >= 0 && index < 2_500) {
    energies[index] = orbit.published.totalEnergy;
    momenta[index] = orbit.published.angularMomentum;
  }
  return { start, energies, momenta, passed: new Uint8Array(2_500).fill(1) };
}
function send(start: number, deepest?: number) {
  workers[0].reply({
    type: 'chunk',
    chunk: chunk(start, deepest),
    progress: { done: start + 2_500, total: 100_000 },
  });
}
function result(overrides: Partial<Beginnings> = {}): Beginnings {
  return {
    count: 100_000,
    passed: 100_000,
    chosen: {
      index: generation.selectedIndex,
      energy: orbit.published.totalEnergy,
      angularMomentum: orbit.published.angularMomentum,
      passed: true,
      masses: [...orbit.published.masses],
      massesExact: true,
    },
    profileDraws: 23,
    attempt: 0,
    milliseconds: 612,
    ...overrides,
  };
}
function finish(overrides: Partial<Beginnings> = {}) {
  const done = result(overrides);
  workers[0].reply({ type: 'done', result: done, seconds: done.milliseconds / 1000 });
}
const label = () => screen.queryByText(`№ ${generation.selectedIndex.toLocaleString('en')}`);
const summary = (container: HTMLElement) => container.querySelector('[data-summary]');

describe('the choice, derived here', () => {
  it('says what it will derive before anything is derived, and sets its scales', () => {
    const { container } = render(field);
    expect(screen.getByRole('status')).toHaveTextContent(
      'The 100,000 beginnings are derived here when you reach them.',
    );
    expect(container.querySelector('figure')).toHaveAttribute('data-phase', 'waiting');
    expect(container.querySelector('figcaption')).toHaveTextContent(
      /^Each dot is one of the 100,000 beginnings drawn from the seed/,
    );
    expect(summary(container)).toBeEmptyDOMElement();
    const chart = container.querySelector('[aria-hidden="true"]')!;
    expect(chart).toContainElement(container.querySelector('canvas'));
    for (const tick of ['−100', '−1,000', '−10,000', '−100,000', '−1,000,000'])
      expect(chart).toHaveTextContent(tick);
    expect(chart).toHaveTextContent(t.orbitEnergy);
    expect(chart).toHaveTextContent(t.orbitMomentum);
    expect(workers).toHaveLength(0);
  });

  it('keeps the summary’s room from the start with an unseen copy of it', () => {
    const { container } = render(field);
    const room = container.querySelector('figcaption [aria-hidden="true"]');
    expect(room).toHaveTextContent(
      /^All 100,000 passed the studio’s quick gate: energy at most 10, angular momentum at least 10\./,
    );
    expect(room).toHaveTextContent(/The ringed one, number 22,083, was chosen\./);
  });

  it('derives when the figure approaches and speaks its progress at most four times a second', () => {
    render(field);
    approach();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([{ generation }]);
    expect(screen.getByRole('status')).toHaveTextContent('Deriving beginning 0 of 100,000');
    send(0);
    expect(screen.getByRole('status')).toHaveTextContent('Deriving beginning 2,500 of 100,000');
    clockNow = 100;
    send(2_500);
    expect(screen.getByRole('status')).toHaveTextContent('Deriving beginning 2,500 of 100,000');
    clockNow = 260;
    send(5_000);
    expect(screen.getByRole('status')).toHaveTextContent('Deriving beginning 7,500 of 100,000');
  });

  it('adds each chunk’s light as it arrives and rings the chosen one once it is derived', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(field);
    approach();
    send(0);
    // Fitted to its box at the display's ratio, and the light sent to the canvas.
    expect(container.querySelector('canvas')).toHaveProperty('width', 600);
    expect(images.at(-1)).toMatchObject({ width: 600, height: 400 });
    const first = light();
    expect(first).toBeGreaterThan(0);
    expect(label()).toBeNull();
    for (let start = 2_500; start <= 20_000; start += 2_500) send(start);
    expect(light()).toBeGreaterThan(first);
    // Later chunks send back only the rectangle their light fell in.
    expect(puts.at(-1)).toHaveLength(7);
    expect(label()).toBeInTheDocument();
    finish();
    expect(container.querySelector('figure')).toHaveAttribute('data-phase', 'derived');
    expect(workers[0].terminated).toBe(true);
  });

  it('holds the light back while motion is unwelcome and draws the same field once, whole', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const moving = render(field);
    approach();
    for (let start = 0; start < 25_000; start += 2_500) send(start);
    const progressive = exposure();
    moving.unmount();

    Object.assign(motion, { paused: true, reducedMotion: true });
    workers = [];
    observers = [];
    images = [];
    const { container } = render(field);
    approach();
    for (let start = 0; start < 25_000; start += 2_500) send(start);
    expect(light()).toBe(0);
    expect(label()).toBeNull();
    finish();
    // Light adds, so the field drawn at once is the field drawn as it arrived.
    expect(exposure()).toEqual(progressive);
    expect(label()).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'All 100,000 beginnings derived in this browser in 0.6 s.',
    );
    expect(summary(container)).toHaveTextContent(
      'All 100,000 passed the studio’s quick gate: energy at most 10, angular momentum at least 10. Each was then set in motion in the studio for up to 2,000,000 steps and scored, a search of up to 200,000,000,000 steps that cannot run in a browser. The ringed one, number 22,083, was chosen. Its masses, derived here, are the published record, to the last bit.',
    );
    expect(container.querySelector('figure')).toHaveAttribute('data-passed', '100000');
  });

  it('stops adding light at Pause and catches up when motion returns', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { rerender } = render(field);
    approach();
    send(0);
    const before = light();
    Object.assign(motion, { paused: true });
    rerender(<ChoiceField generation={generation} gate={QUICK_GATE} t={t} locale="en" />);
    send(2_500);
    send(5_000);
    expect(light()).toBe(before);
    Object.assign(motion, { paused: false });
    rerender(<ChoiceField generation={generation} gate={QUICK_GATE} t={t} locale="en" />);
    expect(light()).toBeGreaterThan(before);
  });

  it('holds still while the theatre is hushed', () => {
    Object.assign(motion, { paused: false, reducedMotion: false, theatre: 'hushed' });
    render(field);
    approach();
    send(0);
    expect(light()).toBe(0);
  });

  it('says how many the gate set aside, and the search the rest began', () => {
    const { container } = render(field);
    approach();
    finish({ passed: 99_873 });
    expect(summary(container)).toHaveTextContent(
      'The studio’s quick gate, energy at most 10 and angular momentum at least 10, set aside 127 of the 100,000; 99,873 passed. Each was then set in motion in the studio for up to 2,000,000 steps and scored, a search of up to 199,746,000,000 steps',
    );
  });

  it('says so when the chosen masses are not the published ones', () => {
    const { container } = render(field);
    approach();
    finish({ chosen: { ...result().chosen, massesExact: false } });
    expect(summary(container)).toHaveTextContent(t.choiceFieldMassesDiffer);
  });

  it('widens a scale by whole decades for a beginning beyond it and draws the field again', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(field);
    approach();
    send(0);
    expect(container.querySelector('[aria-hidden="true"]')).not.toHaveTextContent('−10,000,000');
    send(2_500, -5_000_000);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('−10,000,000');
    // Drawn anew: the whole exposure goes back to the canvas.
    expect(puts.at(-1)).toHaveLength(3);
  });

  it('draws the field again at a new size', () => {
    Object.assign(motion, { paused: false, reducedMotion: false });
    const { container } = render(field);
    approach();
    send(0);
    send(2_500);
    box = { width: 300, height: 300 };
    act(() => resizes[0]([], {} as ResizeObserver));
    expect(container.querySelector('canvas')).toHaveProperty('width', 300);
    expect(images.at(-1)).toMatchObject({ width: 300, height: 300 });
    expect(light()).toBeGreaterThan(0);
  });

  it('says plainly when this browser cannot derive them', () => {
    const { container } = render(field);
    approach();
    act(() => workers[0].onerror?.());
    expect(screen.getByRole('status')).toHaveTextContent(t.choiceFieldUnavailable);
    expect(container.querySelector('figure')).toHaveAttribute('data-phase', 'failed');
    expect(workers[0].terminated).toBe(true);
  });

  it('reports a failure the worker sends back', () => {
    render(field);
    approach();
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(screen.getByRole('status')).toHaveTextContent(t.choiceFieldUnavailable);
    expect(label()).toBeNull();
  });
});
