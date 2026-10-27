import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { Loupe, type LoupeView } from './loupe';

/*
  The loupe under the hand: jsdom lays nothing out, so the viewport is given a fixed
  1440 × 900 rectangle and the still's transform is read back from the element's style.
*/
const ink = getCuratedArtwork(31)!.media.find((media) => media.id === 'ink')!;
const windows = [
  { x: 960, y: 320, width: 1152, height: 736, share: 0.4 },
  { x: 2000, y: 1200, width: 1152, height: 736, share: 0.2 },
];
const viewport = { width: 1440, height: 900 };

function pose(image: HTMLElement) {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
    image.style.transform,
  )!;
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const size = this.hasAttribute('data-loupe') ? viewport : { width: 0, height: 0 };
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      ...size,
    } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
});

function renderLoupe(initialWindow = 0) {
  const views: LoupeView[] = [];
  render(
    <Loupe
      media={ink}
      windows={windows}
      initialWindow={initialWindow}
      label="Detail"
      onView={(view) => views.push(view)}
    />,
  );
  const group = screen.getByRole('group', { name: 'Detail' });
  const image = screen.getByRole('img', { name: 'Detail' });
  return { group, image, views };
}

describe('the loupe under the hand', () => {
  it('opens on the first window at native scale and reports the visible artwork pixels', () => {
    const { image, views } = renderLoupe();
    expect(pose(image).scale).toBe(1);
    // The window's centre (1536, 688) sits at the viewport's centre (720, 450).
    expect(pose(image).x).toBeCloseTo(720 - 1536, 3);
    expect(pose(image).y).toBeCloseTo(450 - 688, 3);
    const last = views.at(-1)!;
    expect(last.ratio).toBe(1);
    expect([last.x0, last.y0, last.x1, last.y1]).toEqual([816, 238, 2256, 1138]);
  });

  it('opens on the whole plate when asked, fitted and centred', () => {
    const { image, group } = renderLoupe(-1);
    const fitted = pose(image);
    expect(fitted.scale).toBeCloseTo(900 / 2234, 6);
    expect(fitted.x).toBeCloseTo((1440 - 3456 * fitted.scale) / 2, 3);
    expect(group).toHaveAttribute('data-scale', 'fit');
  });

  it('pans with the pointer and never past the plate’s edge', () => {
    const { group, image } = renderLoupe();
    const before = pose(image);
    fireEvent.pointerDown(group, { pointerId: 1, button: 0, clientX: 700, clientY: 400 });
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 600, clientY: 350 });
    expect(pose(image).x).toBeCloseTo(before.x - 100, 3);
    expect(pose(image).y).toBeCloseTo(before.y - 50, 3);
    // Dragging far to the right would show the wall; the plate pins to the edge instead.
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 5000, clientY: 350 });
    expect(pose(image).x).toBe(0);
    fireEvent.pointerUp(group, { pointerId: 1, clientX: 5000, clientY: 350 });
  });

  it('zooms about the wheel and the keys within fit and native', () => {
    const { group, image } = renderLoupe();
    fireEvent.wheel(group, { deltaY: -500, clientX: 720, clientY: 450 });
    expect(pose(image).scale).toBe(1);
    fireEvent.wheel(group, { deltaY: 400, clientX: 720, clientY: 450 });
    expect(pose(image).scale).toBeLessThan(1);
    expect(group).toHaveAttribute('data-scale', 'between');
    fireEvent.wheel(group, { deltaY: 100000, clientX: 720, clientY: 450 });
    expect(pose(image).scale).toBeCloseTo(900 / 2234, 6);
    expect(group).toHaveAttribute('data-scale', 'fit');
    fireEvent.keyDown(group, { key: '+' });
    expect(pose(image).scale).toBeCloseTo((900 / 2234) * 1.25, 6);
    fireEvent.keyDown(group, { key: '-' });
    expect(pose(image).scale).toBeCloseTo(900 / 2234, 6);
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    // A fitted plate is centred; a key cannot move it off centre.
    expect(pose(image).x).toBeCloseTo((1440 - 3456 * (900 / 2234)) / 2, 3);
  });

  it('steps a double tap from the whole plate to 2×, then native, then back', () => {
    const { group, image } = renderLoupe(-1);
    // At 1440 × 900 the fit is 0.40, so ×4 would pass native: the ladder stops at 1:1.
    const fit = 900 / 2234;
    const tap = () => {
      fireEvent.pointerDown(group, { pointerId: 2, button: 0, clientX: 720, clientY: 450 });
      fireEvent.pointerUp(group, { pointerId: 2, clientX: 720, clientY: 450 });
    };
    tap();
    tap();
    expect(pose(image).scale).toBeCloseTo(fit * 2, 6);
    tap();
    tap();
    expect(pose(image).scale).toBe(1);
    tap();
    tap();
    expect(pose(image).scale).toBeCloseTo(fit, 6);
  });

  it('pinches with two pointers and keeps panning with the one that remains', () => {
    const { group, image } = renderLoupe(-1);
    const fit = 900 / 2234;
    fireEvent.pointerDown(group, { pointerId: 3, button: 0, clientX: 600, clientY: 450 });
    fireEvent.pointerDown(group, { pointerId: 4, button: 0, clientX: 800, clientY: 450 });
    fireEvent.pointerMove(group, { pointerId: 4, clientX: 1000, clientY: 450 });
    expect(pose(image).scale).toBeCloseTo(fit * 2, 6);
    fireEvent.pointerUp(group, { pointerId: 4, clientX: 1000, clientY: 450 });
    const afterPinch = pose(image);
    fireEvent.pointerMove(group, { pointerId: 3, clientX: 560, clientY: 450 });
    expect(pose(image).x).toBeCloseTo(afterPinch.x - 40, 3);
    fireEvent.pointerUp(group, { pointerId: 3, clientX: 560, clientY: 450 });
  });

  it('glides on after a flick and settles', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(16).mockReturnValue(32);
    const { group, image } = renderLoupe();
    fireEvent.pointerDown(group, { pointerId: 5, button: 0, clientX: 700, clientY: 400 });
    fireEvent.pointerMove(group, { pointerId: 5, clientX: 660, clientY: 400 });
    const beforeRelease = pose(image);
    act(() => {
      fireEvent.pointerUp(group, { pointerId: 5, clientX: 660, clientY: 400 });
    });
    // The synchronous animation frames carried the plate further than the hand did.
    expect(pose(image).x).toBeLessThan(beforeRelease.x);
  });

  it('re-opens on a newly chosen window', () => {
    const { image } = renderLoupe(0);
    const first = pose(image);
    cleanup();
    const { image: second } = renderLoupe(1);
    expect(pose(second).x).not.toBe(first.x);
  });
});
