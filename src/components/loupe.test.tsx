import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { getCuratedArtwork } from '@/lib/art/catalog';
import {
  Loupe,
  clampPose,
  clampScale,
  fitScale,
  nativeScale,
  nextStep,
  poseFor,
  viewOf,
  zoomAbout,
  type LoupeView,
} from './loupe';
import { rungFor } from '@/lib/art/types';

const art = { width: 3456, height: 2234 };
const viewport = { width: 1440, height: 900 };

describe('the loupe’s arithmetic', () => {
  it('fits the plate to the viewport and clamps magnification at one artwork pixel per device pixel', () => {
    const fit = fitScale(viewport, art);
    expect(fit).toBeCloseTo(900 / 2234, 6);
    expect(fitScale({ width: 0, height: 900 }, art)).toBe(0);
    expect(nativeScale(fit, 2)).toBe(0.5);
    expect(nativeScale(fit, 1)).toBe(1);
    // A plate smaller than the screen cannot be magnified past its fit.
    expect(nativeScale(2, 1)).toBe(2);
    expect(clampScale(5, fit, 0.5)).toBe(0.5);
    expect(clampScale(0.1, fit, 0.5)).toBe(fit);
  });

  it('never shows the wall: a large plate pins to the edges, a small one centres', () => {
    const large = clampPose({ scale: 1, x: 100, y: -5000 }, viewport, art);
    expect(large.x).toBe(0);
    expect(large.y).toBe(900 - 2234);
    const small = clampPose({ scale: 0.1, x: 999, y: 999 }, viewport, art);
    expect(small.x).toBeCloseTo((1440 - 345.6) / 2, 6);
    expect(small.y).toBeCloseTo((900 - 223.4) / 2, 6);
  });

  it('zooms about the point under the hand and centres a detail window', () => {
    const start = { scale: 0.25, x: -100, y: -50 };
    const zoomed = zoomAbout(start, 0.5, { x: 300, y: 200 });
    // The artwork pixel under (300, 200) stays under (300, 200).
    expect((300 - zoomed.x) / zoomed.scale).toBeCloseTo((300 - start.x) / start.scale, 6);
    expect((200 - zoomed.y) / zoomed.scale).toBeCloseTo((200 - start.y) / start.scale, 6);
    const pose = poseFor({ x: 960, y: 320, width: 1152, height: 736 }, 1, viewport);
    const view = viewOf(pose, viewport, art, 1);
    expect((view.x0 + view.x1) / 2).toBe(960 + 576);
    expect((view.y0 + view.y1) / 2).toBe(320 + 368);
    expect(view.ratio).toBe(1);
    expect(viewOf({ scale: 0.25, x: 0, y: 0 }, viewport, art, 2).ratio).toBe(2);
  });

  it('steps the double tap 2×, 4×, native, then back to the whole plate', () => {
    const fit = 0.2;
    expect(nextStep(fit, fit, 1)).toBe(0.4);
    expect(nextStep(0.4, fit, 1)).toBe(0.8);
    expect(nextStep(0.8, fit, 1)).toBe(1);
    expect(nextStep(1, fit, 1)).toBe(fit);
    // A native scale below ×4 ends the ladder early.
    expect(nextStep(0.4, fit, 0.5)).toBe(0.5);
  });

  it('chooses the smallest rung wide enough, or the widest', () => {
    const rungs = [
      { src: 'a', width: 1280, height: 828, sha256: 'a', bytes: 1 },
      { src: 'b', width: 1920, height: 1242, sha256: 'b', bytes: 1 },
    ];
    expect(rungFor(rungs, 1280)?.src).toBe('a');
    expect(rungFor(rungs, 1281)?.src).toBe('b');
    expect(rungFor(rungs, 4000)?.src).toBe('b');
    expect(rungFor([], 1280)).toBeUndefined();
    expect(rungFor(undefined, 1280)).toBeUndefined();
  });
});

describe('the loupe', () => {
  const ink = getCuratedArtwork(31)!.media.find((media) => media.id === 'ink')!;
  const windows = [{ x: 960, y: 320, width: 1152, height: 736, share: 0.4 }];

  it('draws the published still itself as a focusable, labelled window', () => {
    render(<Loupe media={ink} windows={windows} label="№ 031 · Ink · Detail" />);
    const group = screen.getByRole('group', { name: '№ 031 · Ink · Detail' });
    expect(group).toHaveAttribute('tabindex', '0');
    // The group carries the name once; the image beneath it is unnamed.
    const image = group.querySelector('img')!;
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('width', '3456');
    expect(image).toHaveAttribute('src', expect.stringMatching(/\.webp$/));
    expect(image.style.transform).toMatch(/^translate\(.*\) scale\(.*\)$/);
  });

  it('paints the 1280 rung first on a narrow viewport, at the rung’s own pixel, then swaps in the still', async () => {
    const wide = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    // The full still decodes off screen; a resolved decode is the moment it takes over.
    let settle!: () => void;
    const decoded = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const NativeImage = window.Image;
    // jsdom's Image constructor hands back a plain element, so a stand-in carries decode().
    class DecodingImage {
      decoding = '';
      src = '';
      onload: (() => void) | null = null;
      decode() {
        return decoded;
      }
    }
    Object.defineProperty(window, 'Image', { configurable: true, value: DecodingImage });
    try {
      expect(ink.rungs?.length).toBeGreaterThan(0);
      const views: LoupeView[] = [];
      render(
        <Loupe
          media={ink}
          windows={[]}
          initialWindow={-1}
          label="Detail"
          onView={(view) => views.push(view)}
        />,
      );
      const group = screen.getByRole('group', { name: 'Detail' });
      const image = group.querySelector('img')!;
      expect(image).toHaveAttribute('src', ink.rungs![0].src);
      // While the rung stands in, native is the rung's pixel: the readout never claims 1:1.
      expect(group).not.toHaveAttribute('data-scale', 'native');
      await act(async () => {
        settle();
        await decoded;
      });
      expect(image).toHaveAttribute('src', ink.still);
    } finally {
      Object.defineProperty(window, 'Image', { configurable: true, value: NativeImage });
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: wide });
    }
  });

  it('describes its keys once and keeps the wheel from the page', () => {
    render(
      <Loupe media={ink} windows={windows} label="Detail" description="Arrows move the window" />,
    );
    const group = screen.getByRole('group', { name: 'Detail' });
    expect(group).toHaveAccessibleDescription('Arrows move the window');
    expect(group.querySelector('img')).toHaveAttribute('alt', '');
    // A trackpad pinch arrives as ctrl+wheel; the loupe consumes it so the page does not zoom.
    const wheel = new WheelEvent('wheel', {
      deltaY: -40,
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    group.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });
});
