import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { Artwork } from '@/lib/art/types';
import { en } from '@/lib/i18n/en';
import { WorkGrid } from './work-grid';

const coordinator = vi.hoisted(() => ({
  use: vi.fn(),
  intent: vi.fn(),
  clearIntent: vi.fn(),
  fail: vi.fn(),
  rest: vi.fn(),
}));
vi.mock('./collection-motion', () => ({ useCollectionMotion: coordinator.use }));
vi.mock('./motion-provider', () => ({ useMotion: () => ({ paused: true }) }));
vi.mock('./artwork-transition', () => ({
  ArtworkTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const works: Artwork[] = [31, 23, 35].map((id) => {
  const archived = getCuratedArtwork(id)!;
  return {
    ...archived,
    media: archived.media
      .filter((media) => id !== 35 || media.id === 'light')
      .map((media) => ({
        ...media,
        previewFilm:
          id === 31 && media.id === 'ink'
            ? {
                ...media.films[0],
                src: '/art/previews/31-ink.mp4',
                durationSeconds: 8,
                startSeconds: 6,
              }
            : undefined,
      })),
  };
});

function card(id: number) {
  return screen.getByRole('link', { name: new RegExp(`Signature ${id}\\b`) });
}

beforeEach(() => {
  coordinator.use.mockReset();
  coordinator.intent.mockReset();
  coordinator.clearIntent.mockReset();
  coordinator.fail.mockReset();
  coordinator.rest.mockReset();
  coordinator.use.mockReturnValue({
    gridRef: { current: null },
    activeId: null,
    intent: coordinator.intent,
    clearIntent: coordinator.clearIntent,
    fail: coordinator.fail,
    rest: coordinator.rest,
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('collection grid integration', () => {
  it('keeps ordinary selections static unless browsing motion is explicitly enabled', () => {
    const { container } = render(<WorkGrid works={works} locale="en" t={en} />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: false, ids: [31] });
    expect(container.querySelector('[data-collection-preview]')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('only grants eligibility to a verified compact Ink excerpt, never complete archive films', () => {
    const { container } = render(<WorkGrid works={works} locale="en" t={en} animated />);
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31] });
    expect(container.querySelectorAll('[data-collection-preview]')).toHaveLength(3);
    expect(card(31)).toHaveAttribute('data-preview-available', 'true');
    expect(card(23)).toHaveAttribute('data-preview-available', 'false');
    expect(card(35)).toHaveAttribute('data-preview-available', 'false');
    expect(container.querySelector('video')).toBeNull();
  });

  it('preserves the displayed expression in native localized artwork links', () => {
    render(<WorkGrid works={works} locale="ja" t={en} animated />);
    expect(card(31)).toHaveAttribute('href', '/ja/art/31');
    expect(card(23)).toHaveAttribute('href', '/ja/art/23');
    expect(card(35)).toHaveAttribute('href', '/ja/art/35?expression=light');
    fireEvent.click(screen.getByRole('button', { name: en.light }));
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: false, ids: [31] });
    for (const id of [31, 23, 35]) {
      expect(card(id)).toHaveAttribute('href', `/ja/art/${id}?expression=light`);
      expect(card(id)).toHaveAttribute('data-preview-available', 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: en.ink }));
    expect(card(31)).toHaveAttribute('href', '/ja/art/31');
    expect(coordinator.use).toHaveBeenLastCalledWith({ enabled: true, ids: [31] });
  });

  it('routes keyboard focus to the shared coordinator without replacing the artwork link', () => {
    render(<WorkGrid works={works} locale="en" t={en} animated />);
    fireEvent.focus(card(31));
    expect(coordinator.intent).toHaveBeenLastCalledWith(31, 'focus');
    fireEvent.blur(card(31));
    expect(coordinator.clearIntent).toHaveBeenLastCalledWith(31, 'focus');
    expect(card(31).tagName).toBe('A');
    expect(card(31)).not.toHaveAttribute('role', 'button');
  });

  it('labels a moving excerpt by its true place in the film, never as the work’s film', () => {
    coordinator.use.mockReturnValue({
      gridRef: { current: null },
      activeId: 31,
      intent: coordinator.intent,
      clearIntent: coordinator.clearIntent,
      fail: coordinator.fail,
      rest: coordinator.rest,
    });
    render(<WorkGrid works={works} locale="en" t={en} animated />);
    expect(card(31)).toHaveAttribute('data-motion', 'active');
    expect(card(31)).toHaveTextContent(`${en.excerpt} 00:06–00:14`);
    expect(card(31)).not.toHaveTextContent(en.mediaPreview);
    expect(card(23)).not.toHaveTextContent(en.excerpt);
  });
});
