import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { Hang } from './hang';

const works = [23, 31, 35].map((id) => getCuratedArtwork(id)!);

beforeAll(() => {
  // The plates watch their visibility; jsdom has no observer, and none is needed to hang them.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('a hang', () => {
  it('seeds every leaf from the work’s own still on its measured ground and links the entry', () => {
    render(<Hang works={works} locale="en" t={en} labels={{ 31: 'Orbit ribbons' }} />);
    const leaves = screen.getAllByRole('link');
    expect(leaves.map((leaf) => leaf.getAttribute('href'))).toEqual([
      '/art/23',
      '/art/31',
      '/art/35',
    ]);
    expect(leaves[1]).toHaveAccessibleName('№ 031 · Ink');
    expect(leaves[1].style.getPropertyValue('--plate-ground')).toBe('#efe9dd');
    expect(leaves.every((leaf) => leaf.dataset.state === 'even')).toBe(true);
    const stills = leaves.map((leaf) => leaf.querySelector('img.art-still')!.getAttribute('src'));
    expect(stills).toEqual(['/art/23-ink.webp', '/art/31-ink.webp', '/art/35-ink.webp']);
    expect(leaves[1]).toHaveTextContent('031');
    expect(leaves[1]).toHaveTextContent('Orbit ribbons');
  });

  it('grows the leaf under the hand or the focus and re-forms the others', () => {
    render(<Hang works={works} locale="en" t={en} />);
    const [first, second, third] = screen.getAllByRole('link');
    fireEvent.pointerEnter(second, { pointerType: 'mouse' });
    expect(second.dataset.state).toBe('chosen');
    expect(first.dataset.state).toBe('other');
    expect(third.dataset.state).toBe('other');
    fireEvent.focus(third);
    expect(third.dataset.state).toBe('chosen');
    expect(second.dataset.state).toBe('other');
    // A touch arriving over a leaf does not choose it; the tap does.
    fireEvent.pointerEnter(first, { pointerType: 'touch' });
    expect(first.dataset.state).toBe('other');
  });

  it('on touch the first tap chooses and only the second enters the work', () => {
    render(<Hang works={works} locale="en" t={en} />);
    const [first, second] = screen.getAllByRole('link');
    // A tap focuses the leaf before it clicks; that focus must not choose, or the tap would enter.
    fireEvent.pointerDown(first, { pointerType: 'touch' });
    fireEvent.focus(first);
    expect(first.dataset.state).toBe('even');
    const firstTap = fireEvent.click(first);
    expect(firstTap).toBe(false);
    expect(first.dataset.state).toBe('chosen');
    fireEvent.pointerDown(first, { pointerType: 'touch' });
    expect(fireEvent.click(first)).toBe(true);
    // The keyboard chooses by focus again once a key has been pressed.
    fireEvent.keyDown(first, { key: 'Tab' });
    fireEvent.focus(second);
    expect(second.dataset.state).toBe('chosen');
  });
});
