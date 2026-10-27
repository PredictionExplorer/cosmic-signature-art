import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { en } from '@/lib/i18n/en';
import { ArtworkGatefold } from './artwork-gatefold';
import { stillSourceSet as sourceSet } from '@/lib/art/types';

const work = getCuratedArtwork(31)!;

describe('the gatefold', () => {
  it('hangs the Ink and Light plates at equal scale with the one caption', () => {
    const { container } = render(
      <ArtworkGatefold artwork={work} expression="ink" t={en} locale="en" />,
    );
    const section = screen.getByRole('region', {
      name: 'Plate 031, in ink and in light. One orbit.',
    });
    expect(section).toHaveAttribute('data-view', 'spread');
    const images = within(section).getAllByRole('img');
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      '№ 031 · Ink',
      '№ 031 · Light',
    ]);
    for (const image of images) {
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image).toHaveAttribute('width', '3456');
      expect(image.getAttribute('srcset')).toMatch(/3456w/);
    }
    const panels = container.querySelectorAll('figure');
    expect(panels[0]).toHaveAttribute('data-material', 'ink');
    expect(panels[1]).toHaveAttribute('data-material', 'light');
    // Each plate sits on its own measured ground.
    expect(panels[0].style.getPropertyValue('--gatefold-ground')).toMatch(/^#[0-9a-f]{6}$/);
    expect(panels[1].style.getPropertyValue('--gatefold-ground')).toBe('#000000');
  });

  it('offers the seam as a second view the keyboard can move', () => {
    const { container } = render(
      <ArtworkGatefold artwork={work} expression="light" t={en} locale="en" />,
    );
    fireEvent.click(screen.getByRole('button', { name: en.gatefoldSeam }));
    const frame = container.querySelector('[data-gatefold-seam]') as HTMLElement;
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('50%');
    const seam = screen.getByRole('slider', { name: en.gatefoldSeamLabel });
    fireEvent.change(seam, { target: { value: '30' } });
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('30%');
    expect(seam).toHaveAttribute('aria-valuetext', '30 %');
    expect(within(frame).getAllByRole('img')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: en.gatefoldSpread }));
    expect(container.querySelector('[data-gatefold-spread]')).not.toBeNull();
  });

  it('lets the hand draw the seam across the frame, and leaves the range to itself', () => {
    const { container } = render(
      <ArtworkGatefold artwork={work} expression="ink" t={en} locale="en" />,
    );
    fireEvent.click(screen.getByRole('button', { name: en.gatefoldSeam }));
    const frame = container.querySelector('[data-gatefold-seam]') as HTMLElement;
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      height: 646,
      right: 1000,
      bottom: 646,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);
    fireEvent.pointerDown(frame, { clientX: 300, pointerType: 'mouse', button: 0 });
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('30%');
    fireEvent.pointerMove(frame, { clientX: 1200 });
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('100%');
    fireEvent.pointerUp(frame);
    fireEvent.pointerMove(frame, { clientX: 500 });
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('100%');
    // A press on the range itself is the range's, not the frame's.
    const seam = screen.getByRole('slider', { name: en.gatefoldSeamLabel });
    fireEvent.pointerDown(seam, { clientX: 100, pointerType: 'mouse', button: 0 });
    expect(frame.style.getPropertyValue('--gatefold-seam')).toBe('100%');
    // The spread keeps the venue's keys quiet while it has focus; no seam line is painted.
    fireEvent.click(screen.getByRole('button', { name: en.gatefoldSpread }));
    expect(container.querySelector('[data-gatefold-spread]')).toHaveAttribute(
      'data-keys-suppressed',
      '',
    );
  });

  it('renders nothing for a work without both stills, and lists the rungs before the still', () => {
    const oneSided = { ...work, media: work.media.filter((media) => media.id === 'ink') };
    const { container } = render(
      <ArtworkGatefold artwork={oneSided} expression="ink" t={en} locale="en" />,
    );
    expect(container).toBeEmptyDOMElement();
    const ink = work.media.find((media) => media.id === 'ink')!;
    const set = sourceSet(ink)!;
    expect(set.endsWith(`${ink.still} 3456w`)).toBe(true);
    expect(sourceSet({ ...ink, still: undefined, rungs: undefined })).toBeUndefined();
  });
});
