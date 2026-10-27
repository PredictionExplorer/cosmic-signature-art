import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Suspense, type ViewTransitionProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import type { ArtInterpretation } from '@/lib/art/types';
import { ArtworkStage, useArtworkExpression } from './artwork-stage';

const state = vi.hoisted(() => ({
  paused: false,
  reducedMotion: false,
  theatre: 'playing' as 'playing' | 'hushed',
  transition: vi.fn(),
  addTransitionType: vi.fn(),
}));
vi.mock('./motion-provider', () => ({ useMotion: () => state }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  addTransitionType: state.addTransitionType,
  ViewTransition: (props: ViewTransitionProps) => {
    state.transition(props);
    return props.children;
  },
}));

type PreparedImage = {
  src: string;
  decoding: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decode?: () => Promise<void>;
  resolve: () => void;
  reject: () => void;
  removeAttribute: ReturnType<typeof vi.fn>;
};
let images: PreparedImage[];
let supportsDecode: boolean;
const media = getCuratedArtwork(31)!.media;
const other: ArtInterpretation = { ...media[0], id: 'sculpture', still: '/art/sculpture.webp' };

beforeEach(() => {
  images = [];
  supportsDecode = true;
  state.paused = false;
  state.reducedMotion = false;
  state.theatre = 'playing';
  state.transition.mockClear();
  state.addTransitionType.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const readiness = Promise.withResolvers<void>();
        const image: PreparedImage = {
          src: '',
          decoding: '',
          onload: null,
          onerror: null,
          resolve: () => readiness.resolve(),
          reject: () => readiness.reject(new Error('Image cannot be decoded')),
          removeAttribute: vi.fn(),
        };
        if (supportsDecode) image.decode = vi.fn(() => readiness.promise);
        images.push(image);
        return image;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready(image = images.at(-1)!) {
  await act(async () => image.resolve());
}

describe('expression preparation', () => {
  it('shows the requested or Ink expression without preloading any alternative', () => {
    const ink = renderHook(() => useArtworkExpression({ media }));
    expect(ink.result.current.expression).toBe('ink');
    const light = renderHook(() => useArtworkExpression({ media, initialExpression: 'light' }));
    expect(light.result.current.expression).toBe('light');
    const unknown = renderHook(() =>
      useArtworkExpression({ media, initialExpression: 'not-published' }),
    );
    expect(unknown.result.current.expression).toBe('ink');
    expect(images).toHaveLength(0);
  });

  it('falls back to the first published expression or an empty safe stage', () => {
    const first = renderHook(() => useArtworkExpression({ media: [other] }));
    expect(first.result.current.expression).toBe('sculpture');
    const empty = renderHook(() => useArtworkExpression({ media: [] }));
    expect(empty.result.current.expression).toBe('light');
    act(() => empty.result.current.selectExpression('ink'));
    expect(images).toHaveLength(0);
  });

  it('keeps the current film visible until the selected still is decoded', async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useArtworkExpression({ media, onCommit }));
    act(() => result.current.selectExpression('light'));
    expect(result.current).toMatchObject({
      expression: 'ink',
      pendingExpression: 'light',
      failedExpression: null,
    });
    expect(images[0].src).toBe(media.find((item) => item.id === 'light')!.still);
    expect(images[0].decoding).toBe('async');
    act(() => images[0].onload?.());
    expect(result.current.expression).toBe('ink');
    await ready();
    expect(result.current).toMatchObject({
      expression: 'light',
      pendingExpression: null,
      failedExpression: null,
    });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('light');
    expect(state.addTransitionType).toHaveBeenCalledExactlyOnceWith('cosmic-expression-to-light');
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the inverse sweep for Ink and a dissolve for future expressions', async () => {
    const { result } = renderHook(() =>
      useArtworkExpression({ media: [...media, other], initialExpression: 'light' }),
    );
    act(() => result.current.selectExpression('ink'));
    await ready();
    expect(state.addTransitionType).toHaveBeenLastCalledWith('cosmic-expression-to-ink');
    act(() => result.current.selectExpression('sculpture'));
    await ready();
    expect(state.addTransitionType).toHaveBeenLastCalledWith('cosmic-expression-dissolve');
    expect(result.current.expression).toBe('sculpture');
  });

  it('keeps the current work after a decoding error and permits an explicit retry', async () => {
    const { result } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    await act(async () => images[0].reject());
    expect(result.current).toMatchObject({
      expression: 'ink',
      pendingExpression: null,
      failedExpression: 'light',
    });
    act(() => result.current.selectExpression('light'));
    expect(result.current.failedExpression).toBeNull();
    await ready();
    expect(result.current.expression).toBe('light');
  });

  it('bounds preparation to eight seconds and ignores a late decode result', async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useArtworkExpression({ media, onCommit }));
    act(() => result.current.selectExpression('light'));
    act(() => vi.advanceTimersByTime(7999));
    expect(result.current.pendingExpression).toBe('light');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toMatchObject({
      expression: 'ink',
      pendingExpression: null,
      failedExpression: 'light',
    });
    await ready();
    expect(onCommit).not.toHaveBeenCalled();
    expect(state.addTransitionType).not.toHaveBeenCalled();
    expect(result.current.expression).toBe('ink');
  });

  it('the latest selection wins even when prior downloads finish out of order', async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useArtworkExpression({ media: [...media, other], onCommit }),
    );
    act(() => result.current.selectExpression('light'));
    act(() => result.current.selectExpression('sculpture'));
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    await ready(images[1]);
    await ready(images[0]);
    expect(result.current.expression).toBe('sculpture');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('sculpture');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reselecting the current expression cancels preparation immediately', async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useArtworkExpression({ media, onCommit }));
    act(() => result.current.selectExpression('light'));
    act(() => result.current.selectExpression('ink'));
    expect(result.current.pendingExpression).toBeNull();
    await ready();
    expect(result.current.expression).toBe('ink');
    expect(onCommit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an already decoded transition whose concurrent render has not committed', async () => {
    const suspense = Promise.withResolvers<void>();
    const onCommit = vi.fn();
    let blocked = true;
    function Material({ expression }: { expression: string }) {
      if (expression === 'light' && blocked) throw suspense.promise;
      return <p data-testid="visible-expression">{expression}</p>;
    }
    function Viewer() {
      const selection = useArtworkExpression({ media, onCommit });
      return (
        <>
          <button onClick={() => selection.selectExpression('ink')}>Ink</button>
          <button onClick={() => selection.selectExpression('light')}>Light</button>
          <Material expression={selection.expression} />
        </>
      );
    }
    render(
      <Suspense fallback={<p>Preparing</p>}>
        <Viewer />
      </Suspense>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await ready();
    expect(screen.getByTestId('visible-expression')).toHaveTextContent('ink');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
    await act(async () => {
      blocked = false;
      suspense.resolve();
    });
    expect(screen.getByTestId('visible-expression')).toHaveTextContent('ink');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reports only committed changes, using the latest callback without reporting initial mount', async () => {
    const original = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(
      ({ onCommit }) => useArtworkExpression({ media, onCommit }),
      { initialProps: { onCommit: original } },
    );
    expect(original).not.toHaveBeenCalled();
    act(() => result.current.selectExpression('light'));
    rerender({ onCommit: latest });
    await ready();
    expect(original).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith('light');
    rerender({ onCommit: original });
    expect(original).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it('unknown expressions cannot interrupt a valid pending selection', async () => {
    const { result } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    act(() => result.current.selectExpression('not-published'));
    expect(result.current.pendingExpression).toBe('light');
    await ready();
    expect(result.current.expression).toBe('light');
  });

  it('a missing canonical still cannot blank out the currently displayed work', () => {
    const { result } = renderHook(() =>
      useArtworkExpression({ media: [...media, { ...other, still: undefined }] }),
    );
    act(() => result.current.selectExpression('sculpture'));
    expect(result.current).toMatchObject({
      expression: 'ink',
      pendingExpression: null,
      failedExpression: 'sculpture',
    });
    expect(images).toHaveLength(0);
  });

  it('cancels pending work when opening another presentation context', async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useArtworkExpression({ media, onCommit }));
    act(() => result.current.selectExpression('light'));
    act(() => result.current.cancelPending());
    await ready();
    expect(result.current.pendingExpression).toBeNull();
    expect(result.current.failedExpression).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('releases timers, handlers, and requested bytes when navigating away', async () => {
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() => useArtworkExpression({ media, onCommit }));
    act(() => result.current.selectExpression('light'));
    unmount();
    expect(images[0]).toMatchObject({ onload: null, onerror: null });
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(vi.getTimerCount()).toBe(0);
    await ready();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each(['paused', 'reducedMotion'] as const)(
    'still prepares the chosen image but does not animate when %s',
    async (preference) => {
      state[preference] = true;
      const { result } = renderHook(() => useArtworkExpression({ media }));
      act(() => result.current.selectExpression('light'));
      expect(result.current.expression).toBe('ink');
      await ready();
      expect(result.current.expression).toBe('light');
      expect(state.addTransitionType).not.toHaveBeenCalled();
    },
  );

  it('crosses instantly while the theatre is hushed, even if the hush began mid-preparation', async () => {
    const { result, rerender } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    state.theatre = 'hushed';
    rerender();
    await ready();
    expect(result.current.expression).toBe('light');
    expect(state.addTransitionType).not.toHaveBeenCalled();
  });

  it('honors a motion preference changed while preparation is still pending', async () => {
    const { result, rerender } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    state.reducedMotion = true;
    rerender();
    await ready();
    expect(result.current.expression).toBe('light');
    expect(state.addTransitionType).not.toHaveBeenCalled();
  });

  it('falls back to a successful load in browsers without image.decode', () => {
    supportsDecode = false;
    const { result } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    act(() => images[0].onload?.());
    expect(result.current.expression).toBe('light');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles a network failure without waiting for the preparation deadline', () => {
    const { result } = renderHook(() => useArtworkExpression({ media }));
    act(() => result.current.selectExpression('light'));
    act(() => images[0].onerror?.());
    expect(result.current.failedExpression).toBe('light');
    expect(result.current.expression).toBe('ink');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('cinematic artwork stage', () => {
  function transitionProps() {
    return state.transition.mock.lastCall?.[0] as ViewTransitionProps;
  }

  it('keeps a distinct stage identity for the inline work and immersive room', () => {
    const { container, rerender } = render(
      <ArtworkStage artworkId={31} expression="ink">
        <span>Work</span>
      </ArtworkStage>,
    );
    expect(transitionProps()).toMatchObject({
      name: 'cs-expression-31-page',
      default: 'none',
      update: {
        'cosmic-expression-to-ink': 'cosmic-expression-to-ink',
        'cosmic-expression-to-light': 'cosmic-expression-to-light',
        'cosmic-expression-dissolve': 'cosmic-expression-dissolve',
        default: 'none',
      },
    });
    expect(container.querySelector('[data-artwork-stage="page"]')).toHaveAttribute(
      'data-expression',
      'ink',
    );
    rerender(
      <ArtworkStage artworkId={31} expression="light" scope="room">
        <span>Work</span>
      </ArtworkStage>,
    );
    expect(transitionProps().name).toBe('cs-expression-31-room');
    expect(container.querySelector('[data-artwork-stage="room"]')).toHaveAttribute(
      'data-expression',
      'light',
    );
  });

  it.each(['paused', 'reducedMotion', 'hushed', 'disabled'] as const)(
    'has no cinematic updates when %s',
    (preference) => {
      if (preference === 'hushed') state.theatre = 'hushed';
      else if (preference !== 'disabled') state[preference] = true;
      render(
        <ArtworkStage artworkId={31} expression="ink" disabled={preference === 'disabled'}>
          <span>Work</span>
        </ArtworkStage>,
      );
      expect(transitionProps()).toMatchObject({ default: 'none', update: 'none' });
      expect(screen.getByText('Work')).toBeVisible();
    },
  );

  it('renders only one live player and does not clone or hide its child', () => {
    const { container } = render(
      <ArtworkStage artworkId={31} expression="ink">
        <video aria-label="Ink film" />
      </ArtworkStage>,
    );
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Ink film')).toBeVisible();
    expect(container.querySelector('[inert], [aria-hidden]')).toBeNull();
  });
});
