import { describe, expect, it } from 'vitest';
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
