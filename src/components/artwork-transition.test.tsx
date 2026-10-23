import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { ViewTransitionProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkTransition } from './artwork-transition';

const state = vi.hoisted(() => ({ paused: false, reducedMotion: false, transition: vi.fn() }));
vi.mock('./motion-provider', () => ({
  useMotion: () => ({ paused: state.paused, reducedMotion: state.reducedMotion }),
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: (props: ViewTransitionProps) => {
    state.transition(props);
    return props.children;
  },
}));

function transitionProps() {
  return state.transition.mock.lastCall?.[0] as ViewTransitionProps;
}

beforeEach(() => {
  state.paused = false;
  state.reducedMotion = false;
  state.transition.mockClear();
});

describe('artwork transition boundaries', () => {
  it('shares a stable identity between the preview and detail of the same expression', () => {
    const { rerender } = render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="preview">
        <span>Preview</span>
      </ArtworkTransition>,
    );
    const preview = transitionProps();
    expect(preview).toMatchObject({
      default: 'none',
      share: 'cosmic-art-shared',
      enter: 'none',
    });
    rerender(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        <span>Actual artwork</span>
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({
      name: preview.name,
      default: 'none',
      share: 'cosmic-art-shared',
      enter: 'cosmic-art-arrival',
    });
    expect(screen.getByText('Actual artwork')).toBeVisible();
  });

  it('never matches a different token or expression, including future Unicode expression names', () => {
    const { rerender } = render(
      <ArtworkTransition artworkId={0} interpretationId="ink" role="preview">
        Work
      </ArtworkTransition>,
    );
    const names = new Set([transitionProps().name]);
    for (const [id, expression] of [
      [31, 'ink'],
      [0, 'light'],
      [0, 'ink ink'],
      [0, 'ink-ink'],
      [0, '墨'],
      [0, '💫'],
    ] as const) {
      rerender(
        <ArtworkTransition artworkId={id} interpretationId={expression} role="preview">
          Work
        </ArtworkTransition>,
      );
      const { name } = transitionProps();
      expect(name).toMatch(/^cs-art-\d+-[a-z0-9-]+$/);
      expect(names.has(name)).toBe(false);
      names.add(name);
    }
  });

  it('disables all animation triggers while global motion is paused', () => {
    const view = render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(transitionProps().share).toBe('cosmic-art-shared');
    state.paused = true;
    view.rerender(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({ default: 'none', share: 'none', enter: 'none' });
    expect(screen.getByText('Artwork')).toBeVisible();
  });

  it('honors system reduced motion even when ambient playback has been explicitly enabled', () => {
    state.reducedMotion = true;
    render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({ default: 'none', share: 'none', enter: 'none' });
  });

  it('inherits the already-hydrated preference in the first detail mount commit', () => {
    render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(state.transition.mock.calls[0][0]).toMatchObject({
      share: 'cosmic-art-shared',
      enter: 'cosmic-art-arrival',
    });
  });

  it('responds to preference changes received from the persistent provider', () => {
    const view = render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    state.reducedMotion = true;
    view.rerender(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({ share: 'none', enter: 'none' });
    state.reducedMotion = false;
    view.rerender(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        Artwork
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({
      share: 'cosmic-art-shared',
      enter: 'cosmic-art-arrival',
    });
  });

  it('allows comparison mode to disable a misleading shared surface', () => {
    render(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail" disabled>
        <span>Two distinct artworks remain fully visible</span>
      </ArtworkTransition>,
    );
    expect(transitionProps()).toMatchObject({ default: 'none', share: 'none', enter: 'none' });
    expect(screen.getByText('Two distinct artworks remain fully visible')).toBeVisible();
  });

  it('renders complete server markup without requesting animation', () => {
    state.paused = true;
    state.reducedMotion = true;
    const markup = renderToString(
      <ArtworkTransition artworkId={31} interpretationId="ink" role="detail">
        <a href="/art/31">Signature 31</a>
      </ArtworkTransition>,
    );
    expect(markup).toContain('href="/art/31"');
    expect(markup).toContain('Signature 31');
    expect(transitionProps()).toMatchObject({ default: 'none', share: 'none', enter: 'none' });
  });

  it('does not intercept links, change focus semantics, or add a blocking overlay', () => {
    const click = vi.fn((event: React.MouseEvent) => {
      expect(event.defaultPrevented).toBe(false);
      // Avoid jsdom navigating after verifying that the boundary left the click untouched.
      event.preventDefault();
    });
    const { container } = render(
      <a href="/art/31" onClick={click}>
        <ArtworkTransition artworkId={31} interpretationId="ink" role="preview">
          <span role="img" aria-label="Signature 31" />
        </ArtworkTransition>
      </a>,
    );
    const link = screen.getByRole('link', { name: 'Signature 31' });
    link.focus();
    expect(link).toHaveFocus();
    fireEvent.click(link, { ctrlKey: true });
    expect(click).toHaveBeenCalledOnce();
    expect(link).toHaveAttribute('href', '/art/31');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"], [aria-hidden="true"], [inert]')).toBeNull();
  });
});
