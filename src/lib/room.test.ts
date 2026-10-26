import { describe, expect, it } from 'vitest';
import { roomFor, roomScript } from './room';

/** Run the inline first-paint script against a location, as the browser would. */
function paint(pathname: string, search = '') {
  window.history.replaceState(null, '', `${pathname}${search}`);
  document.documentElement.removeAttribute('data-room');
  const meta = document.querySelector('meta[name="theme-color"]') ?? document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', '');
  document.head.append(meta);
  new Function(roomScript)();
  return {
    room: document.documentElement.getAttribute('data-room'),
    color: meta.getAttribute('content'),
  };
}

describe('the room by route and view', () => {
  it('opens the Spectrum wall and the Light section on night, the rest of the collection on paper', () => {
    expect(roomFor('/collection')).toBe('paper');
    expect(roomFor('/collection', '?order=spectrum')).toBe('night');
    expect(roomFor('/ja/collection', '?expression=light&q=31')).toBe('night');
    expect(roomFor('/collection', '?order=cycle')).toBe('paper');
    expect(roomFor('/art/31', '?expression=light')).toBe('paper');
    expect(roomFor('/process', '?order=spectrum')).toBe('night');
  });

  it('paints the same answer before hydration', () => {
    expect(paint('/collection')).toEqual({ room: 'paper', color: '#f1ebdf' });
    expect(paint('/collection', '?order=spectrum')).toEqual({ room: 'night', color: '#000000' });
    expect(paint('/uk/collection', '?expression=light')).toEqual({
      room: 'night',
      color: '#000000',
    });
    expect(paint('/zh-TW/process')).toEqual({ room: 'night', color: '#000000' });
    expect(paint('/art/0', '?expression=light')).toEqual({ room: 'paper', color: '#f1ebdf' });
  });
});
