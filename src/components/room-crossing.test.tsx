import { StrictMode, useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtInterpretation, Expression } from '@/lib/art/types';
import { stillRequest } from './artwork-media';
import {
  RoomCrossing,
  RoomTravel,
  useRoomCrossing,
  type RoomTurn,
  type TravelRoom,
} from './room-crossing';

const work = getCuratedArtwork(31)!;
const ink = work.media.find((media) => media.id === 'ink')!;
const light = work.media.find((media) => media.id === 'light')!;
const roomStill = (media: ArtInterpretation) => stillRequest(media, { sizes: '100vw' });

/* The browser's frames, run when the test says so, each at the time the test gives it. */
let frames = new Map<number, FrameRequestCallback>();
let handles = 0;
let clock = 0;
/** Run the frames asked for, `ms` after the last ones. */
function frame(ms = 16) {
  clock += ms;
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach((callback) => callback(clock)));
}
/** Let the promises a Turn waits on resolve. */
async function settle() {
  for (let i = 0; i < 12; i++) await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  handles = 0;
  clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++handles, callback);
    return handles;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  document.body.innerHTML = '';
});

/** A room as the travel knows it, which the test can change, and what was asked of it. */
function fakeRoom() {
  const state = {
    crossing: true,
    ready: true,
    made: true,
    paints: true,
    plain: false,
    steady: true,
    leaving: false,
    expression: 'ink' as Expression,
    brings: 'still' as 'still' | 'ground',
    shown: false,
    lands: 0,
  };
  const rendered: [number, string, boolean][] = [];
  const makes: [Expression, boolean][] = [];
  const crossing = {
    render: (share: number, toward: string, bare = false) => {
      rendered.push([share, toward, bare]);
      return state.paints;
    },
    land: () => {
      state.lands += 1;
    },
  };
  const room: TravelRoom = {
    crossing: () => (state.crossing ? crossing : null),
    prepare: () => Promise.resolve(state.ready),
    make: (to, bare) => {
      makes.push([to, bare]);
      return Promise.resolve(state.made);
    },
    expression: () => state.expression,
    plain: () => state.plain,
    steady: () => state.steady,
    leaving: () => state.leaving,
    brings: () => state.brings,
    show: (on) => {
      state.shown = on;
    },
    duration: () => 2000,
  };
  return { room, state, rendered, makes };
}

describe('a Turn’s travel across the room', () => {
  it('crosses at an even pace from the press to the last corner, and lands', async () => {
    const { room, state, rendered, makes } = fakeRoom();
    const travel = new RoomTravel(room);
    expect(travel.heading()).toBeNull();
    const outcome = travel.cross('light');
    // While the Turn is being readied it is already on its way there.
    expect(travel.heading()).toBe('light');
    await settle();
    // The sheets for the room and the still the Turn brings were made first.
    expect(makes).toEqual([['light', false]]);
    // The first frame is the room as it stands, painted before the canvas is shown.
    expect(rendered).toEqual([[0, 'night', false]]);
    expect(state.shown).toBe(true);
    frame(0);
    frame(500);
    expect(rendered.at(-1)).toEqual([0.25, 'night', false]);
    frame(500);
    expect(rendered.at(-1)).toEqual([0.5, 'night', false]);
    frame(1000);
    expect(rendered.at(-1)).toEqual([1, 'night', false]);
    await expect(outcome).resolves.toBe('landed');
    // The last frame stays until the room has made the change.
    expect(state.shown).toBe(true);
    expect(state.lands).toBe(0);
    expect(frames.size).toBe(0);
    // The room shows Light: the words are the strip's own again, and the canvas waits for the work.
    expect(travel.landed('ink')).toBe(false);
    expect(travel.landed('light')).toBe(true);
    expect(state.lands).toBe(1);
    expect(state.shown).toBe(true);
    travel.clear();
    expect(state.shown).toBe(false);
    expect(travel.heading()).toBeNull();
  });

  it('turns the status bar as the front passes half-way, there and back', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#f1ebdf';
    document.head.append(meta);
    const { room } = fakeRoom();
    const travel = new RoomTravel(room);
    void travel.cross('light');
    await settle();
    frame(0);
    frame(900);
    expect(meta.content).toBe('#f1ebdf');
    frame(200);
    expect(meta.content).toBe('#000000');
    travel.callOff();
    frame(0);
    frame(300);
    expect(meta.content).toBe('#f1ebdf');
  });

  it('is undrawn where the room has no sheet, or cannot ready it, or is closing', async () => {
    for (const fault of ['crossing', 'ready', 'made', 'leaving'] as const) {
      const { room, state, rendered } = fakeRoom();
      state[fault] = fault === 'leaving';
      const travel = new RoomTravel(room);
      await expect(travel.cross('light')).resolves.toBe('undrawn');
      expect(rendered).toEqual([]);
      expect(state.shown).toBe(false);
      expect(travel.heading()).toBeNull();
    }
  });

  it('waits for a room that is still opening, then crosses it as any other', async () => {
    const { room, state, rendered, makes } = fakeRoom();
    state.steady = false;
    const travel = new RoomTravel(room);
    const outcome = travel.cross('light');
    await settle();
    // The work is still on its way from its plate: nothing can be measured, and nothing is.
    act(() => vi.advanceTimersByTime(300));
    await settle();
    expect(makes).toEqual([]);
    expect(state.shown).toBe(false);
    expect(travel.heading()).toBe('light');
    // The opening ends: the Turn is the sheet's.
    state.steady = true;
    act(() => vi.advanceTimersByTime(60));
    await settle();
    expect(makes).toEqual([['light', false]]);
    expect(state.shown).toBe(true);
    frame(0);
    frame(2000);
    await expect(outcome).resolves.toBe('landed');
    expect(rendered.at(-1)).toEqual([1, 'night', false]);
  });

  it('leaves the Turn to the stage when a room never comes to rest, and drops one taken back meanwhile', async () => {
    const stuck = fakeRoom();
    stuck.state.steady = false;
    const first = new RoomTravel(stuck.room).cross('light');
    await settle();
    for (let waited = 0; waited < 1300; waited += 50) {
      act(() => vi.advanceTimersByTime(50));
      await settle();
    }
    await expect(first).resolves.toBe('undrawn');
    expect(stuck.state.shown).toBe(false);

    const taken = fakeRoom();
    taken.state.steady = false;
    const travel = new RoomTravel(taken.room);
    const second = travel.cross('light');
    await settle();
    travel.callOff();
    act(() => vi.advanceTimersByTime(60));
    await settle();
    await expect(second).resolves.toBe('called off');
  });

  it('makes the change at once where the room shows a lens or the loupe', async () => {
    const { room, state, rendered, makes } = fakeRoom();
    state.plain = true;
    const travel = new RoomTravel(room);
    await expect(travel.cross('light')).resolves.toBe('landed');
    // Nothing was made for it, painted or shown.
    expect(makes).toEqual([]);
    expect(rendered).toEqual([]);
    expect(state.shown).toBe(false);
    expect(travel.landed('light')).toBe(false);
  });

  it('brings the bare ground where the arriving film is to begin on it', async () => {
    const { room, state, rendered, makes } = fakeRoom();
    state.brings = 'ground';
    const travel = new RoomTravel(room);
    void travel.cross('light');
    await settle();
    frame(0);
    frame(500);
    // No still is asked for, and every frame is painted bare.
    expect(makes).toEqual([['light', true]]);
    expect(rendered.every(([, , bare]) => bare)).toBe(true);
  });

  it('takes a Turn back the way it came, at the same pace', async () => {
    const { room, state, rendered } = fakeRoom();
    const travel = new RoomTravel(room);
    const outcome = travel.cross('light');
    await settle();
    frame(0);
    frame(600);
    expect(rendered.at(-1)![0]).toBeCloseTo(0.3);
    travel.callOff();
    await expect(outcome).resolves.toBe('called off');
    expect(travel.heading()).toBeNull();
    frame(0);
    frame(200);
    expect(rendered.at(-1)![0]).toBeCloseTo(0.2);
    expect(state.shown).toBe(true);
    frame(600);
    // Back where it began: the canvas goes and the words are the strip's own.
    expect(rendered.at(-1)![0]).toBe(0);
    expect(state.shown).toBe(false);
    expect(state.lands).toBe(1);
    expect(frames.size).toBe(0);
  });

  it('goes on from where its front stands when a Turn taken back is asked for again', async () => {
    const { room, rendered, makes } = fakeRoom();
    const travel = new RoomTravel(room);
    void travel.cross('light');
    await settle();
    frame(0);
    frame(1000);
    travel.callOff();
    frame(0);
    frame(400);
    expect(rendered.at(-1)![0]).toBeCloseTo(0.3);
    const again = travel.cross('light');
    expect(travel.heading()).toBe('light');
    frame(0);
    frame(400);
    expect(rendered.at(-1)![0]).toBeCloseTo(0.5);
    frame(1000);
    await expect(again).resolves.toBe('landed');
    // Nothing was made twice: the room and its stills were in hand.
    expect(makes).toHaveLength(1);
  });

  it('gives way to a newer request while it is still being readied', async () => {
    const { room, state, rendered } = fakeRoom();
    const travel = new RoomTravel(room);
    const outcome = travel.cross('light');
    travel.callOff();
    await expect(outcome).resolves.toBe('called off');
    expect(rendered).toEqual([]);
    expect(state.shown).toBe(false);
  });

  it('leaves a Turn it can no longer paint to the stage', async () => {
    const { room, state } = fakeRoom();
    const travel = new RoomTravel(room);
    const outcome = travel.cross('light');
    await settle();
    frame(0);
    frame(500);
    // The context is lost mid-way.
    state.paints = false;
    frame(100);
    await expect(outcome).resolves.toBe('undrawn');
    expect(state.shown).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('lets go of a landed Turn whose change never comes', async () => {
    const { room, state } = fakeRoom();
    const travel = new RoomTravel(room);
    const outcome = travel.cross('light');
    await settle();
    frame(0);
    frame(2000);
    await expect(outcome).resolves.toBe('landed');
    expect(state.shown).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(state.shown).toBe(false);
    expect(state.lands).toBe(1);
    expect(travel.landed('light')).toBe(false);
  });

  it('lands a Turn at once when motion is stilled, and takes it back when the room goes', async () => {
    const stilled = fakeRoom();
    const first = new RoomTravel(stilled.room);
    const landing = first.cross('light');
    await settle();
    frame(0);
    frame(500);
    first.stop(true);
    await expect(landing).resolves.toBe('landed');
    expect(stilled.state.shown).toBe(false);

    const closing = fakeRoom();
    const second = new RoomTravel(closing.room);
    const leaving = second.cross('light');
    await settle();
    frame(0);
    frame(500);
    second.stop();
    await expect(leaving).resolves.toBe('called off');
    expect(closing.state.shown).toBe(false);
    expect(frames.size).toBe(0);
  });
});

/**
 * A WebGL context that records what the painter asks of it: the last value of each uniform by
 * name, and each picture it was given.
 */
function fakeWebGL() {
  const floats = new Map<string, number>();
  const quads = new Map<string, [number, number, number, number]>();
  const pictures: unknown[] = [];
  const sheets: [number, number][] = [];
  let lost = false;
  const lose = vi.fn();
  type At = { name: string } | null;
  const methods: Record<string, (...args: never[]) => unknown> = {
    isContextLost: () => lost,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext: lose } : {}),
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1f: (at: At, value: number) => at && floats.set(at.name, value),
    uniform4f: (at: At, x: number, y: number, z: number, w: number) =>
      at && quads.set(at.name, [x, y, z, w]),
    texImage2D: (...args: unknown[]) => {
      // Nine arguments: bytes (a sheet, or a texture's first black pixel). Six: a picture.
      if (args.length === 9 && (args[3] as number) > 1)
        sheets.push([args[3] as number, args[4] as number]);
      if (args.length === 6) pictures.push(args[5]);
    },
  };
  const gl = new Proxy(methods, {
    get(target, property) {
      if (typeof property !== 'string' || property === 'then') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(property)) return 0;
      return target[property] ?? (() => ({}));
    },
  }) as unknown as WebGLRenderingContext;
  return { gl, floats, quads, pictures, sheets, lose, drop: () => (lost = true) };
}

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

/** The room's own markup, as far as the crossing reads it: its work, its two strips, its notice. */
const ROOM = `
  <img data-room-media data-box="20.3 10.2 360.4 232.6" />
  <canvas></canvas>
  <footer>
    <div data-strip="ink" data-box="0 250 400 50">
      <div data-sheet-group="sources" data-box="0 250 400 50">
        <button data-box="10 260 50 20">Still</button>
      </div>
    </div>
    <div data-strip-room="light" data-box="0 250 400 50">
      <div data-sheet-group="sources" data-box="0 250 400 50">
        <span data-line="Sweep" data-box="300 260 50 20"></span>
      </div>
    </div>
    <div data-room-said data-box="0 280 400 20"></div>
  </footer>`;

/** WebGL, a 2D canvas to read maps with, images that decode, and a room 400 × 300. */
function withRoom({ webgl = true }: { webgl?: boolean } = {}) {
  const context = fakeWebGL();
  const asked: unknown[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    type: string,
    attributes?: unknown,
  ) => {
    if (type === 'webgl') {
      asked.push(attributes);
      return webgl ? context.gl : null;
    }
    if (type !== '2d') return null;
    return {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) data[(y * width + x) * 4] = Math.min(255, x * 5);
        return { data, width, height };
      },
    };
  }) as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const said = this.getAttribute('data-box');
    if (said) return box(...(said.split(' ').map(Number) as [number, number, number, number]));
    return box(0, 0, 400, 300);
  });
  /** Each image asked for: where it comes from, and the order its attributes were set in. */
  const images: { src: string; order: string[] }[] = [];
  for (const name of ['sizes', 'srcset', 'src'] as const) {
    const real = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, name)!;
    vi.spyOn(HTMLImageElement.prototype, name, 'set').mockImplementation(function (
      this: HTMLImageElement,
      value: string,
    ) {
      let entry = images.find((image) => image === (this as unknown as { asked?: object }).asked);
      if (!entry) {
        entry = { src: '', order: [] };
        images.push(entry);
        (this as unknown as { asked?: object }).asked = entry;
      }
      entry.order.push(name);
      if (name === 'src') entry.src = value;
      real.set!.call(this, value);
    });
  }
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 48,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 32,
  });
  return { ...context, asked, images };
}
afterEach(() => {
  for (const name of ['decode', 'complete', 'naturalWidth', 'naturalHeight'])
    Reflect.deleteProperty(HTMLImageElement.prototype, name);
});

/** A room in the page, and a crossing on its canvas. */
function roomOf(onLost = () => {}) {
  const frame = document.createElement('div');
  frame.setAttribute('data-material', 'ink');
  frame.innerHTML = ROOM;
  document.body.append(frame);
  const canvas = frame.querySelector('canvas')!;
  const crossing = new RoomCrossing(canvas, () => frame, [0.9, 0.88, 0.84], onLost);
  return { frame, canvas, crossing };
}

describe('the canvas over the room', () => {
  it('cannot cross where this browser has no WebGL, and loads nothing to find that out', async () => {
    const { asked, images } = withRoom({ webgl: false });
    const { crossing } = roomOf();
    await expect(crossing.prepare(ink, light)).resolves.toBe(false);
    // It asked for a canvas it can paint through: clear where a Turn has brought nothing.
    expect(asked[0]).toMatchObject({ alpha: true, premultipliedAlpha: true });
    expect(images).toEqual([]);
    expect(crossing.ready).toBe(false);
    expect(crossing.render(0.5, 'night')).toBe(false);
  });

  it('is readied with both maps and the sheets for the room, and no still', async () => {
    const { images, sheets, pictures } = withRoom();
    const { crossing, canvas } = roomOf();
    await expect(crossing.prepare(ink, light)).resolves.toBe(true);
    expect(crossing.ready).toBe(true);
    // The two arrival maps, and nothing of an expression the room was not asked to show.
    expect(images.map((image) => image.src)).toEqual([ink.arrival!.src, light.arrival!.src]);
    expect(pictures).toEqual([]);
    // The canvas is the room's size, and a sheet was laid for each ground.
    expect([canvas.width, canvas.height]).toEqual([400, 300]);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toEqual(sheets[1]);
  });

  it('reads the still a Turn brings by the room’s own request, once', async () => {
    const { images, pictures } = withRoom();
    const { crossing } = roomOf();
    await crossing.prepare(ink, light);
    images.length = 0;
    await expect(crossing.make(light, roomStill)).resolves.toBe(true);
    const request = roomStill(light)!;
    // The layout width, then the candidates, then the source, so the browser chooses the rung
    // the room will show.
    expect(images).toEqual([{ src: request.src, order: ['sizes', 'srcset', 'src'] }]);
    expect(pictures).toHaveLength(1);
    // In hand: a second Turn the same way asks for nothing.
    await expect(crossing.make(light, roomStill)).resolves.toBe(true);
    expect(images).toHaveLength(1);
    // The other expression's still is read when a Turn brings it.
    await expect(crossing.make(ink, roomStill)).resolves.toBe(true);
    expect(images).toHaveLength(2);
    expect(pictures).toHaveLength(2);
  });

  it('needs no still for a Turn that brings the bare ground', async () => {
    const { images, pictures } = withRoom();
    const { crossing } = roomOf();
    await crossing.prepare(ink, light);
    images.length = 0;
    await expect(crossing.make(light, roomStill, true)).resolves.toBe(true);
    expect(images).toEqual([]);
    expect(pictures).toEqual([]);
  });

  it('cannot draw a Turn whose still it may not read, or has none', async () => {
    withRoom();
    const { crossing } = roomOf();
    await crossing.prepare(ink, light);
    // Served by another host: a canvas that read it could never be read again.
    await expect(
      crossing.make(light, () => ({ src: 'https://elsewhere.example/still.webp' })),
    ).resolves.toBe(false);
    await expect(crossing.make(light, () => undefined)).resolves.toBe(false);
  });

  it('paints through, with the work where the room hangs it, to a whole pixel', async () => {
    const { floats, quads } = withRoom();
    const { crossing } = roomOf();
    await crossing.prepare(ink, light);
    await crossing.make(light, roomStill);
    expect(crossing.render(0.5, 'night')).toBe(true);
    expect(floats.get('uThrough')).toBe(1);
    expect(floats.get('uBare')).toBe(0);
    expect(floats.get('uTowardNight')).toBe(1);
    expect(floats.get('uShare')).toBe(0.5);
    // The work at 20.3, 10.2, 360.4 × 232.6 of a room 400 × 300, at one canvas pixel to one.
    expect(quads.get('uArt')).toEqual([20 / 400, 10 / 300, 360 / 400, 233 / 300]);
    expect(crossing.render(0.5, 'paper', true)).toBe(true);
    expect(floats.get('uBare')).toBe(1);
    expect(floats.get('uTowardNight')).toBe(0);
  });

  it('places the work on half pixels where the screen has two to a pixel', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { quads } = withRoom();
    const { crossing, canvas } = roomOf();
    await crossing.prepare(ink, light);
    await crossing.make(light, roomStill);
    crossing.render(0.5, 'night');
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    expect(quads.get('uArt')).toEqual([20.5 / 400, 10 / 300, 360.5 / 400, 232.5 / 300]);
  });

  it('sets the strip’s words, its held words and its hairline from the same field, and gives them back', async () => {
    withRoom();
    const { crossing, frame } = roomOf();
    await crossing.prepare(ink, light);
    await crossing.make(light, roomStill);
    const set = frame.querySelector('button')!;
    const held = frame.querySelector<HTMLElement>('[data-line]')!;
    const strip = frame.querySelector<HTMLElement>('[data-strip]')!;
    // As a Turn begins nothing has turned: the strip's word stands, the held word is out.
    crossing.render(0, 'night');
    expect(frame).toHaveAttribute('data-sheet-active');
    expect(set).toHaveAttribute('data-sheet', 'paper');
    expect(set).not.toHaveAttribute('data-sheet-out');
    expect(held).toHaveAttribute('data-sheet-out');
    expect(strip.style.borderImage).toBe(
      'linear-gradient(var(--room-line-paper), var(--room-line-paper)) 1',
    );
    // Part-way, the hairline is drawn in two lines, changing where the front stands on it.
    crossing.render(0.5, 'night');
    expect(strip.style.borderImage).toMatch(
      /^linear-gradient\(to right, var\(--room-line-(night|paper)\) 0px [\d.]+px, var\(--room-line-(night|paper)\) [\d.]+px.*\) 1$/,
    );
    // Landed: every word has changed hands, in the ink of the ground the Turn brought.
    crossing.render(1, 'night');
    expect(set).toHaveAttribute('data-sheet-out');
    expect(held).toHaveAttribute('data-sheet', 'night');
    expect(held).not.toHaveAttribute('data-sheet-out');
    expect(strip.style.borderImage).toBe(
      'linear-gradient(var(--room-line-night), var(--room-line-night)) 1',
    );
    crossing.land();
    expect(frame).not.toHaveAttribute('data-sheet-active');
    expect(frame.querySelector('[data-sheet], [data-sheet-out]')).toBeNull();
    expect(strip.style.borderImage).toBe('');
  });

  it('lays new sheets when the room has changed, as it settles or as a Turn asks', async () => {
    const { sheets } = withRoom();
    const { crossing, frame } = roomOf();
    await crossing.prepare(ink, light);
    expect(sheets).toHaveLength(2);
    // The same room: nothing new is laid.
    crossing.settle();
    await settle();
    expect(sheets).toHaveLength(2);
    // The work hangs elsewhere (the strip grew a row): new sheets for it.
    frame.querySelector('img')!.setAttribute('data-box', '40 10 320 206');
    crossing.settle();
    await settle();
    expect(sheets).toHaveLength(4);
    frame.querySelector('img')!.setAttribute('data-box', '60 10 280 180');
    await expect(crossing.make(light, roomStill)).resolves.toBe(true);
    expect(sheets).toHaveLength(6);
  });

  it('cannot draw a room that shows no work', async () => {
    withRoom();
    const { crossing, frame } = roomOf();
    await crossing.prepare(ink, light);
    frame.querySelector('img')!.remove();
    await expect(crossing.make(light, roomStill)).resolves.toBe(false);
  });

  it('stands down when the browser takes its context back, and is readied again on its return', async () => {
    const { drop } = withRoom();
    const onLost = vi.fn();
    const { crossing, canvas, frame } = roomOf(onLost);
    await crossing.prepare(ink, light);
    await crossing.make(light, roomStill);
    crossing.render(0.5, 'night');
    drop();
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    // Prevented, so the browser may give the context back.
    expect(event.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(crossing.ready).toBe(false);
    expect(frame).not.toHaveAttribute('data-sheet-active');
    expect(crossing.render(0.5, 'night')).toBe(false);
    await expect(crossing.make(light, roomStill)).resolves.toBe(false);
  });

  it('builds nothing once it is disposed', async () => {
    withRoom();
    const { crossing } = roomOf();
    const readied = crossing.prepare(ink, light);
    crossing.dispose();
    await expect(readied).resolves.toBe(false);
    expect(crossing.ready).toBe(false);
  });
});

/** A room that mounts the crossing as artwork-room.tsx does. */
function Room({
  enabled = true,
  expression = 'ink',
  plain = false,
  turnRef,
}: {
  enabled?: boolean;
  expression?: Expression;
  plain?: boolean;
  turnRef: { current: RoomTurn | null };
}) {
  const frame = useRef<HTMLDivElement>(null);
  const { canvas } = useRoomCrossing({
    frame,
    ink,
    light,
    expression,
    enabled,
    plain,
    paper: '#e6e0d6',
    still: roomStill,
    steady: () => true,
    leaving: () => false,
    brings: () => 'still',
    turnRef,
  });
  return (
    <div ref={frame} data-material={expression}>
      <img data-room-media="" data-box="20 10 360 232" alt="" />
      <canvas ref={canvas} />
      <footer>
        <div data-strip={expression} data-box="0 250 400 50">
          <button type="button" data-box="10 260 50 20">
            Still
          </button>
        </div>
      </footer>
    </div>
  );
}

describe('the room’s crossing, mounted', () => {
  it('gives the viewer the room’s Turn while crossings travel, and takes it away with the room', async () => {
    withRoom();
    const turnRef = { current: null as RoomTurn | null };
    const { rerender, unmount } = render(<Room turnRef={turnRef} />);
    expect(turnRef.current).not.toBeNull();
    // Motion stilled: the Turn is instant, and no one is asked to draw it.
    rerender(<Room turnRef={turnRef} enabled={false} />);
    expect(turnRef.current).toBeNull();
    rerender(<Room turnRef={turnRef} />);
    expect(turnRef.current).not.toBeNull();
    unmount();
    expect(turnRef.current).toBeNull();
  });

  it('prepares at idle, and asks for nothing where the Turn is instant', async () => {
    const { images } = withRoom();
    const turnRef = { current: null as RoomTurn | null };
    const { unmount } = render(<Room turnRef={turnRef} enabled={false} />);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(images).toEqual([]);
    unmount();
    render(<Room turnRef={turnRef} />);
    expect(images).toEqual([]);
    await act(async () => vi.advanceTimersByTime(500));
    await settle();
    expect(images.map((image) => image.src)).toEqual([ink.arrival!.src, light.arrival!.src]);
  });

  it('draws a Turn, gives the words back as the change is made, and goes when the work is painted', async () => {
    withRoom();
    const turnRef = { current: null as RoomTurn | null };
    const { rerender, container } = render(<Room turnRef={turnRef} />);
    const canvas = container.querySelector('canvas')!;
    const frameOf = () => container.firstElementChild!;
    const outcome = turnRef.current!.cross('light');
    await settle();
    expect(canvas).toHaveAttribute('data-active');
    expect(frameOf()).toHaveAttribute('data-sheet-active');
    frame(0);
    frame(2000);
    await expect(outcome).resolves.toBe('landed');
    // The viewer makes the change: the strip's words are its own again in that same commit.
    rerender(<Room turnRef={turnRef} expression="light" />);
    expect(frameOf()).not.toHaveAttribute('data-sheet-active');
    expect(canvas).toHaveAttribute('data-active');
    // The work decodes, two frames pass, and the canvas goes.
    await settle();
    frame();
    frame();
    await settle();
    expect(canvas).not.toHaveAttribute('data-active');
  });

  it('lands a Turn at once when motion is stilled mid-way, and takes it back when the room goes', async () => {
    withRoom();
    const turnRef = { current: null as RoomTurn | null };
    const { rerender, unmount, container } = render(<Room turnRef={turnRef} />);
    const canvas = container.querySelector('canvas')!;
    const stilled = turnRef.current!.cross('light');
    await settle();
    frame(0);
    frame(500);
    rerender(<Room turnRef={turnRef} enabled={false} />);
    await expect(stilled).resolves.toBe('landed');
    expect(canvas).not.toHaveAttribute('data-active');

    rerender(<Room turnRef={turnRef} />);
    const leaving = turnRef.current!.cross('light');
    await settle();
    frame(0);
    frame(500);
    unmount();
    await expect(leaving).resolves.toBe('called off');
  });

  it('gives its context back when the room is gone', async () => {
    const { lose } = withRoom();
    const turnRef = { current: null as RoomTurn | null };
    const { rerender, unmount } = render(<Room turnRef={turnRef} />);
    await act(async () => vi.advanceTimersByTime(500));
    await settle();
    // Not while the room stands: a context lost on purpose stays lost for the same canvas.
    rerender(<Room turnRef={turnRef} enabled={false} />);
    act(() => vi.advanceTimersByTime(10));
    expect(lose).not.toHaveBeenCalled();
    unmount();
    act(() => vi.advanceTimersByTime(10));
    expect(lose).toHaveBeenCalledTimes(1);
  });

  it('keeps its context when its effects are taken down with the room still standing', async () => {
    const { lose } = withRoom();
    const turnRef = { current: null as RoomTurn | null };
    // Strict Mode takes every effect down and puts it back as the room mounts.
    const { container } = render(
      <StrictMode>
        <Room turnRef={turnRef} />
      </StrictMode>,
    );
    await act(async () => vi.advanceTimersByTime(500));
    await settle();
    expect(lose).not.toHaveBeenCalled();
    // And the room can draw a Turn.
    const outcome = turnRef.current!.cross('light');
    await settle();
    expect(container.querySelector('canvas')).toHaveAttribute('data-active');
    frame(0);
    frame(2000);
    await expect(outcome).resolves.toBe('landed');
  });
});
