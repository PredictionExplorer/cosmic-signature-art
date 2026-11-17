import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEAM_EVENT } from '@/lib/venue-events';
import { RoomSeams } from './room-seams';

const overrideRoom = vi.hoisted(() => vi.fn());
vi.mock('@/components/room-ground', () => ({ overrideRoom }));

/** Where each part of the page stands, as the browser would measure it, from the page's top. */
let scrolled = 0;
function part(html: string, top: number, height: number) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstElementChild as HTMLElement;
  node.getBoundingClientRect = () =>
    ({ top: top - scrolled, bottom: top - scrolled + height }) as DOMRect;
  return node;
}
/** The home: the day's plate, the cover on night, a paper chapter, and a cycle row with no ground. */
function home(expression: 'ink' | 'light') {
  const main = document.createElement('main');
  main.append(
    part(`<section data-presentation="home" data-expression="${expression}"></section>`, 0, 800),
    part('<section data-ground="night"></section>', 800, 1000),
    // A list inside a section carries a ground of its own: it is the section's that counts.
    part('<section data-ground="paper"><ul data-ground="night"></ul></section>', 1800, 1000),
    part('<section></section>', 2800, 600),
  );
  document.body.append(main);
  return main;
}
let frames: FrameRequestCallback[] = [];
const runFrames = () => act(() => frames.splice(0).forEach((frame) => frame(0)));
function scrollTo(y: number) {
  scrolled = y;
  act(() => void window.dispatchEvent(new Event('scroll')));
  runFrames();
}
const last = () => overrideRoom.mock.lastCall?.[0];

beforeEach(() => {
  scrolled = 0;
  frames = [];
  overrideRoom.mockClear();
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('the ground beneath the running head, on the home', () => {
  it('is the day’s plate’s at the top: paper under Ink, night under Light, read before the first paint', () => {
    home('ink');
    render(<RoomSeams />);
    // The first reading is made as the component mounts, with no frame waited for.
    expect(last()).toBe('paper');
    cleanup();
    document.body.replaceChildren();
    home('light');
    render(<RoomSeams />);
    expect(last()).toBe('night');
  });

  it('follows whichever part holds the middle of the screen, across the one hard seam', () => {
    home('ink');
    render(<RoomSeams />);
    scrollTo(500);
    expect(last()).toBe('night');
    scrollTo(1300);
    expect(last()).toBe('night');
    // The paper chapter takes the room as it crosses the middle, whatever a list in it says.
    scrollTo(1500);
    expect(last()).toBe('paper');
    // Past the last part that names a ground, the ground above the middle holds.
    scrollTo(2700);
    expect(last()).toBe('paper');
    scrollTo(0);
    expect(last()).toBe('paper');
  });

  it('follows a Turn on the plate, which changes the ground under the hand', () => {
    const main = home('ink');
    render(<RoomSeams />);
    expect(last()).toBe('paper');
    main.firstElementChild!.setAttribute('data-expression', 'light');
    act(() => void window.dispatchEvent(new Event(SEAM_EVENT)));
    runFrames();
    expect(last()).toBe('night');
    // And a change of the screen's size is read again.
    main.firstElementChild!.setAttribute('data-expression', 'ink');
    act(() => void window.dispatchEvent(new Event('resize')));
    runFrames();
    expect(last()).toBe('paper');
  });

  it('reads nothing while a room is open over the page, and asks for one frame however often it is told', () => {
    home('light');
    render(<RoomSeams />);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    overrideRoom.mockClear();
    scrollTo(1500);
    expect(overrideRoom).not.toHaveBeenCalled();
    dialog.remove();
    scrolled = 1500;
    act(() => {
      for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event('scroll'));
    });
    expect(frames).toHaveLength(1);
    runFrames();
    expect(overrideRoom).toHaveBeenCalledTimes(1);
    expect(last()).toBe('paper');
  });

  it('reads the page again when a room closes: a Turn made inside it changed the plate beneath', () => {
    const main = home('light');
    render(<RoomSeams />);
    expect(last()).toBe('night');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    // In the room the visitor turns the work to Ink: the plate beneath changes, unread.
    main.querySelector('[data-presentation="home"]')!.setAttribute('data-expression', 'ink');
    act(() => void window.dispatchEvent(new Event(SEAM_EVENT)));
    runFrames();
    expect(last()).toBe('night');
    // The room closes (the event does not bubble: it is heard on its way down).
    dialog.removeAttribute('open');
    act(() => void dialog.dispatchEvent(new Event('close')));
    runFrames();
    expect(last()).toBe('paper');
  });

  it('gives the room back to its route as it leaves', () => {
    home('light');
    const view = render(<RoomSeams />);
    scrollTo(100);
    act(() => void window.dispatchEvent(new Event('scroll')));
    view.unmount();
    expect(last()).toBeNull();
    expect(frames).toHaveLength(0);
    // Nothing listens after it has gone.
    overrideRoom.mockClear();
    window.dispatchEvent(new Event('scroll'));
    document.body.dispatchEvent(new Event('close'));
    expect(frames).toHaveLength(0);
    expect(overrideRoom).not.toHaveBeenCalled();
  });
});
