import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Atlas } from './atlas';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { en } from '@/lib/i18n/en';
import type { ArtInterpretation } from '@/lib/art/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('./motion-provider', () => ({ useMotion: () => ({ paused: true, toggle: vi.fn() }) }));
vi.mock('./artwork-media', () => ({
  ArtworkMedia: ({
    media,
    alt,
    still,
  }: {
    media?: ArtInterpretation;
    alt: string;
    still?: boolean;
  }) => (
    <span role="img" aria-label={alt} data-source={media?.still} data-still={String(!!still)} />
  ),
}));

const works = [23, 31, 35].map((id) => getCuratedArtwork(id)!);

describe('Atlas exploration', () => {
  it('keeps the selected identity and localized destination through material changes', () => {
    render(<Atlas works={works} locale="ja" t={en} />);
    expect(screen.getByRole('heading', { name: 'Signature 31' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Signature 35' }));
    expect(screen.getByRole('heading', { name: 'Signature 35' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Enter this work' })).toHaveAttribute(
      'href',
      '/ja/art/35',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByRole('button', { name: 'Signature 35' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('img', { name: 'Signature 35 · Light' })).toHaveAttribute(
      'data-source',
      '/art/35-light.webp',
    );
    expect(screen.getByRole('link', { name: 'Enter this work' })).toHaveAttribute(
      'href',
      '/ja/art/35',
    );
    expect(works.map((work) => work.id)).toEqual([23, 31, 35]);
  });

  it('exposes every work as a keyboard-operable button and direct artwork link', () => {
    render(<Atlas works={works} locale="en" t={en} />);
    for (const work of works) {
      const selector = screen.getByRole('button', { name: `Signature ${work.id}` });
      expect(selector).not.toHaveAttribute('disabled');
      expect(within(selector).getByRole('img')).toHaveAttribute(
        'data-source',
        `/art/${work.id}-ink.webp`,
      );
      expect(screen.getByRole('link', { name: `Enter this work ${work.id}` })).toHaveAttribute(
        'href',
        `/art/${work.id}`,
      );
    }
  });

  it('rehanging changes exhibition arrangement without changing the collecting destination', () => {
    render(<Atlas works={works} locale="en" t={en} />);
    const rehang = screen.getByRole('button', { name: 'Rehang the constellation' });
    fireEvent.click(rehang);
    expect(rehang).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Enter this work' })).toHaveAttribute(
      'href',
      '/art/31',
    );
    fireEvent.click(rehang);
    expect(rehang).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets only the anchor move; its companions rest on their stills', () => {
    render(<Atlas works={works} locale="en" t={en} />);
    expect(screen.getByRole('img', { name: 'Signature 31 · Ink' })).toHaveAttribute(
      'data-still',
      'false',
    );
    for (const id of [23, 35]) {
      expect(screen.getByRole('img', { name: `Signature ${id} · Ink` })).toHaveAttribute(
        'data-still',
        'true',
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'Signature 35' }));
    expect(screen.getByRole('img', { name: 'Signature 35 · Ink' })).toHaveAttribute(
      'data-still',
      'false',
    );
    expect(screen.getByRole('img', { name: 'Signature 31 · Ink' })).toHaveAttribute(
      'data-still',
      'true',
    );
  });
});
