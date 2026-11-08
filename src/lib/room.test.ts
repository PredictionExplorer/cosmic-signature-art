import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomFor, roomScript } from './room';
import { dayNumber, expressionOfDay } from './art/day';
import { HOME_RESOLVED_KEY, MOTION_KEY, OVERTURE_KEY, VISIT_KEY } from './storage-keys';

/** Days the venue's arithmetic answers for a pool of three: an Ink day and a Light day. */
const INK_DAY = '2026-11-06';
const LIGHT_DAY = '2026-11-05';

/** Run the inline first-paint script against a location, as the browser would. */
function paint(pathname: string, search = '', pinned = INK_DAY) {
  window.history.replaceState(null, '', `${pathname}${search}`);
  document.documentElement.removeAttribute('data-room');
  document.documentElement.removeAttribute('data-overture');
  const meta = document.querySelector('meta[name="theme-color"]') ?? document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', '');
  document.head.append(meta);
  new Function(roomScript({ poolSize: 3, pinned }))();
  return {
    room: document.documentElement.getAttribute('data-room'),
    color: meta.getAttribute('content'),
  };
}
/** A browser whose system preference for motion is `reduce` or not, as matchMedia answers. */
function preferring(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  }));
}
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-overture');
});

describe('the room by route and view', () => {
  it('opens the Spectrum wall and the Light section on night, the rest of the collection on paper', () => {
    expect(roomFor('/collection')).toBe('paper');
    expect(roomFor('/collection', '?order=spectrum')).toBe('night');
    expect(roomFor('/ja/collection', '?expression=light&q=31')).toBe('night');
    expect(roomFor('/collection', '?order=cycle')).toBe('paper');
    expect(roomFor('/art/31', '?expression=light')).toBe('paper');
    expect(roomFor('/process', '?order=spectrum')).toBe('night');
  });

  it('stands Verify an orbit on the night, its door and every work', () => {
    expect(roomFor('/verify/orbit')).toBe('night');
    expect(roomFor('/ko/verify/orbit/31')).toBe('night');
    expect(paint('/verify/orbit/31', '?expression=ink')).toEqual({
      room: 'night',
      color: '#000000',
    });
    expect(paint('/zh-HK/verify/orbit')).toEqual({ room: 'night', color: '#000000' });
    // Only the route itself: a word that merely begins the same way keeps its paper.
    expect(roomFor('/verifying')).toBe('paper');
  });

  it('paints the same answer before hydration', () => {
    expect(paint('/collection')).toEqual({ room: 'paper', color: '#f1ebdf' });
    expect(paint('/collection', '?order=spectrum')).toEqual({ room: 'night', color: '#000000' });
    expect(paint('/uk/collection', '?expression=light')).toEqual({
      room: 'night',
      color: '#000000',
    });
    expect(paint('/zh-TW/process')).toEqual({ room: 'night', color: '#000000' });
  });
});

describe('the first paint of a plate', () => {
  const NIGHT = { room: 'night', color: '#000000' };
  const PAPER = { room: 'paper', color: '#f1ebdf' };

  it('paints the ground of the expression the URL asks for', () => {
    expect(paint('/art/0', '?expression=light')).toEqual(NIGHT);
    expect(paint('/uk/art/31', '?expression=ink', LIGHT_DAY)).toEqual(PAPER);
    // A lot keeps its route's ground: its plate lends the head its tone once it is in view.
    expect(paint('/auctions/31', '?expression=light')).toEqual(PAPER);
  });

  it("else the session's remembered choice, else the day's expression", () => {
    expect(paint('/', '', INK_DAY)).toEqual(PAPER);
    expect(paint('/ja', '', LIGHT_DAY)).toEqual(NIGHT);
    expect(paint('/art/31', '', LIGHT_DAY)).toEqual(NIGHT);
    sessionStorage.setItem('cosmic-art-expression-v1', 'ink');
    expect(paint('/art/31', '', LIGHT_DAY)).toEqual(PAPER);
    expect(paint('/art/31', '?expression=light', LIGHT_DAY)).toEqual(NIGHT);
  });

  it("reads the day as the server's arithmetic does, on every day of two passes", () => {
    const start = Date.UTC(2026, 10, 1);
    for (let offset = 0; offset < 12; offset += 1) {
      const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
      const day = expressionOfDay(dayNumber(new Date(date)), 3);
      expect(paint('/', '', date).room).toBe(day === 'light' ? 'night' : 'paper');
    }
  });
});

describe('First Light’s first paint', () => {
  const overture = () => document.documentElement.getAttribute('data-overture');

  it('asks for First Light on a first visit to the home, on the day’s own ground', () => {
    preferring(false);
    // The day's plate is the first thing seen: an Ink day opens on paper, a Light day on night.
    expect(paint('/', '', INK_DAY)).toEqual({ room: 'paper', color: '#f1ebdf' });
    expect(overture()).toBe('pending');
    // First Light is the home's arrival: the plate then opens on its still.
    expect(sessionStorage.getItem(HOME_RESOLVED_KEY)).toBe('resolved');
    expect(paint('/uk', '', LIGHT_DAY).room).toBe('night');
    expect(overture()).toBe('pending');
  });

  it('never for a returning visitor, a request, a later page of the visit, Pause or reduced motion', () => {
    preferring(false);
    localStorage.setItem(OVERTURE_KEY, 'seen');
    expect(paint('/', '', INK_DAY).room).toBe('paper');
    expect(overture()).toBeNull();
    localStorage.clear();
    paint('/', '?expression=ink');
    expect(overture()).toBeNull();
    paint('/art/31');
    expect(overture()).toBeNull();
    sessionStorage.setItem(MOTION_KEY, 'paused');
    expect(paint('/', '', INK_DAY).room).toBe('paper');
    expect(overture()).toBeNull();
    sessionStorage.clear();
    preferring(true);
    paint('/', '', INK_DAY);
    expect(overture()).toBeNull();
    preferring(false);
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    paint('/', '', INK_DAY);
    expect(overture()).toBeNull();
    expect(sessionStorage.getItem(HOME_RESOLVED_KEY)).toBeNull();
  });

  it('asks for First Light on a work the visit opens on, as a shared link opens one', () => {
    preferring(false);
    paint('/art/31', '', INK_DAY);
    expect(overture()).toBe('pending');
    expect(sessionStorage.getItem(VISIT_KEY)).toBe('1');
    // The home's own arrival is the home's: a work leaves it be.
    expect(sessionStorage.getItem(HOME_RESOLVED_KEY)).toBeNull();
    // Any later page of the visit stands as it opens.
    paint('/art/32', '', INK_DAY);
    expect(overture()).toBeNull();
    // A new visit, in any language, opens on the light again.
    sessionStorage.clear();
    paint('/ja/art/31', '', INK_DAY);
    expect(overture()).toBe('pending');
    // Not where the link asks for an expression, nor for a browser that has seen it.
    sessionStorage.clear();
    paint('/art/31', '?expression=light', INK_DAY);
    expect(overture()).toBeNull();
    sessionStorage.clear();
    localStorage.setItem(OVERTURE_KEY, 'seen');
    paint('/art/31', '', INK_DAY);
    expect(overture()).toBeNull();
    // Nor beneath a work's own pages.
    localStorage.clear();
    sessionStorage.clear();
    paint('/art/31/record', '', INK_DAY);
    expect(overture()).toBeNull();
  });

  it('stands aside where storage or the preference cannot be read', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(paint('/', '', INK_DAY).room).toBe('paper');
    expect(overture()).toBeNull();
  });
});
