import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_NIGHT_PARTS, HOME_PAPER_PARTS, roomFor, roomScript } from './room';
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
    // A view is the collection's alone: the same words in another room's address do nothing.
    expect(roomFor('/statement', '?order=spectrum')).toBe('paper');
  });

  it('stands All the light and the Orrery on the night, on every screen, from the first paint', () => {
    expect(roomFor('/collection/all-the-light')).toBe('night');
    expect(roomFor('/uk/collection/orrery')).toBe('night');
    expect(paint('/collection/all-the-light')).toEqual({ room: 'night', color: '#000000' });
    expect(paint('/zh-TW/collection/orrery')).toEqual({ room: 'night', color: '#000000' });
    // The collection itself, and a name that only begins the same way, keep their paper.
    expect(roomFor('/collection')).toBe('paper');
    expect(roomFor('/collection/orrery-notes')).toBe('paper');
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
    expect(paint('/zh-TW/verify/orbit')).toEqual({ room: 'night', color: '#000000' });
  });
});

describe('the first paint of a part of the home', () => {
  const NIGHT = { room: 'night', color: '#000000' };
  const PAPER = { room: 'paper', color: '#f1ebdf' };
  /** The page opened at a part by its address: /#choice. */
  const at = (hash: string, pathname = '/', pinned = INK_DAY) =>
    paint(pathname, `#${hash}`, pinned);

  it('opens on the part’s own ground, whatever the day’s plate shows above it', () => {
    // The orbit and its Light stand on night: the cover's contents lead there on an Ink day too.
    for (const part of HOME_NIGHT_PARTS) expect(at(part), part).toEqual(NIGHT);
    // From the Ink plate on the home stands on paper, on a Light day as well.
    for (const part of HOME_PAPER_PARTS) {
      expect(at(part), part).toEqual(PAPER);
      expect(at(part, '/uk', LIGHT_DAY), part).toEqual(PAPER);
    }
    // A source's own address is in the list of sources.
    expect(at('source-12', '/ja', LIGHT_DAY)).toEqual(PAPER);
    // A part's title is addressed as the part is; the cover by its headline, the cycle by its row.
    expect(at('choice-title')).toEqual(NIGHT);
    expect(at('process-title')).toEqual(NIGHT);
    expect(at('ink-title', '/', LIGHT_DAY)).toEqual(PAPER);
    expect(at('home-cycle', '/vi', LIGHT_DAY)).toEqual(PAPER);
  });

  it('leaves the plate its own ground at an address that names no part', () => {
    // The skip link's own address, and one that names nothing: the plate is what is seen.
    for (const hash of ['main', 'nothing', 'inkling', 'source']) {
      expect(at(hash, '/', INK_DAY), hash).toEqual(PAPER);
      expect(at(hash, '/zh-TW', LIGHT_DAY), hash).toEqual(NIGHT);
    }
  });

  it('is the plate’s ground with no part named, and leaves every other page alone', () => {
    expect(paint('/', '', LIGHT_DAY)).toEqual(NIGHT);
    expect(paint('/', '', INK_DAY)).toEqual(PAPER);
    // A fragment that cannot be read is no part's address.
    expect(at('%E0%A4%A', '/', LIGHT_DAY)).toEqual(NIGHT);
    // A work's page keeps its plate's ground whatever its fragment says.
    expect(paint('/art/31', '?expression=light#ink')).toEqual(NIGHT);
    expect(paint('/collection', '#ink')).toEqual(PAPER);
  });

  it('asks for no First Light on an address that names a part', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    at('choice');
    expect(document.documentElement.getAttribute('data-overture')).toBeNull();
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
