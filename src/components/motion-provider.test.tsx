import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preferenceKey = 'cosmic-art-motion-v1';

function mockReducedMotion(initial: boolean) {
  let matches = initial;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const query: MediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: ((_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener) listeners.add(listener);
    }) as MediaQueryList['addEventListener'],
    removeEventListener: ((_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener) listeners.delete(listener);
    }) as MediaQueryList['removeEventListener'],
    dispatchEvent: () => true,
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query));
  return {
    change(value: boolean) {
      matches = value;
      const event = Object.assign(new Event('change'), { matches, media: query.media });
      for (const listener of listeners) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    },
    listenerCount: () => listeners.size,
  };
}

/** Reset only the provider's session store, keeping React's renderer instance shared. */
async function renderFreshProvider() {
  vi.resetModules();
  vi.doMock('react', () => React);
  const { MotionProvider, useMotion } = await import('./motion-provider');
  function Controls() {
    const { paused, reducedMotion, toggle } = useMotion();
    return (
      <>
        <button type="button" onClick={toggle} aria-pressed={paused}>
          {paused ? 'Resume motion' : 'Pause motion'}
        </button>
        <span data-testid="system-preference">{reducedMotion ? 'reduced' : 'full'}</span>
      </>
    );
  }
  return render(
    <MotionProvider>
      <Controls />
    </MotionProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('motion preference', () => {
  it('starts paused when the system requests reduced motion', async () => {
    mockReducedMotion(true);
    const { container } = await renderFreshProvider();
    expect(screen.getByRole('button', { name: 'Resume motion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.firstElementChild).toHaveClass('motion-paused');
  });

  it('allows motion by default when the system has no reduction preference', async () => {
    mockReducedMotion(false);
    await renderFreshProvider();
    expect(screen.getByRole('button', { name: 'Pause motion' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('responds to system preference changes until the visitor makes an explicit choice', async () => {
    const preference = mockReducedMotion(false);
    await renderFreshProvider();
    act(() => preference.change(true));
    expect(screen.getByRole('button', { name: 'Resume motion' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume motion' }));
    expect(screen.getByRole('button', { name: 'Pause motion' })).toBeInTheDocument();
    act(() => preference.change(false));
    act(() => preference.change(true));
    expect(screen.getByRole('button', { name: 'Pause motion' })).toBeInTheDocument();
  });

  it('persists the chosen pause state and restores it on a new page session store', async () => {
    mockReducedMotion(false);
    const initial = await renderFreshProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Pause motion' }));
    expect(sessionStorage.getItem(preferenceKey)).toBe('paused');
    initial.unmount();
    await renderFreshProvider();
    expect(screen.getByRole('button', { name: 'Resume motion' })).toBeInTheDocument();
  });

  it('respects a previously explicit play choice even when reduced motion is preferred', async () => {
    mockReducedMotion(true);
    sessionStorage.setItem(preferenceKey, 'playing');
    await renderFreshProvider();
    expect(screen.getByRole('button', { name: 'Pause motion' })).toBeInTheDocument();
    expect(screen.getByTestId('system-preference')).toHaveTextContent('reduced');
  });

  it('keeps system reduction current even when ambient playback is explicitly enabled', async () => {
    const preference = mockReducedMotion(false);
    sessionStorage.setItem(preferenceKey, 'playing');
    await renderFreshProvider();
    expect(screen.getByTestId('system-preference')).toHaveTextContent('full');
    act(() => preference.change(true));
    expect(screen.getByTestId('system-preference')).toHaveTextContent('reduced');
    expect(screen.getByRole('button', { name: 'Pause motion' })).toBeInTheDocument();
    act(() => preference.change(false));
    expect(screen.getByTestId('system-preference')).toHaveTextContent('full');
  });

  it('ignores malformed saved preferences and follows the system', async () => {
    mockReducedMotion(true);
    sessionStorage.setItem(preferenceKey, 'false');
    await renderFreshProvider();
    expect(screen.getByRole('button', { name: 'Resume motion' })).toBeInTheDocument();
  });

  it('keeps controls functional when browser storage is unavailable', async () => {
    mockReducedMotion(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await renderFreshProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Resume motion' }));
    expect(screen.getByRole('button', { name: 'Pause motion' })).toBeInTheDocument();
  });

  it('unsubscribes from system changes after the provider is removed', async () => {
    const preference = mockReducedMotion(false);
    const view = await renderFreshProvider();
    expect(preference.listenerCount()).toBe(1);
    view.unmount();
    expect(preference.listenerCount()).toBe(0);
  });
});

describe('theatre', () => {
  async function freshModule() {
    vi.resetModules();
    vi.doMock('react', () => React);
    return import('./motion-provider');
  }

  it('starts playing and reflects a hush on the site wrapper and to its readers', async () => {
    mockReducedMotion(false);
    const { MotionProvider, useMotion, setTheatre } = await freshModule();
    function Probe() {
      const { theatre } = useMotion();
      return <span data-testid="theatre">{theatre}</span>;
    }
    const { container } = render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    const site = container.firstElementChild!;
    expect(site).toHaveAttribute('data-theatre', 'playing');
    expect(screen.getByTestId('theatre')).toHaveTextContent('playing');
    act(() => setTheatre('hushed'));
    expect(site).toHaveAttribute('data-theatre', 'hushed');
    expect(screen.getByTestId('theatre')).toHaveTextContent('hushed');
    act(() => setTheatre('hushed'));
    expect(site).toHaveAttribute('data-theatre', 'hushed');
    act(() => setTheatre('playing'));
    expect(site).toHaveAttribute('data-theatre', 'playing');
    expect(screen.getByTestId('theatre')).toHaveTextContent('playing');
  });

  it('leaves the motion preference untouched when the theatre hushes', async () => {
    mockReducedMotion(false);
    const { MotionProvider, useMotion, setTheatre } = await freshModule();
    function Probe() {
      const { paused, theatre } = useMotion();
      return (
        <span data-testid="state">
          {paused ? 'paused' : 'playing'}/{theatre}
        </span>
      );
    }
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    act(() => setTheatre('hushed'));
    expect(screen.getByTestId('state')).toHaveTextContent('playing/hushed');
    expect(sessionStorage.getItem(preferenceKey)).toBeNull();
  });

  it('renders the server snapshot as playing whatever the client state is', async () => {
    mockReducedMotion(false);
    const { MotionProvider, setTheatre } = await freshModule();
    const { renderToString } = await import('react-dom/server');
    setTheatre('hushed');
    const html = renderToString(
      <MotionProvider>
        <span />
      </MotionProvider>,
    );
    expect(html).toContain('data-theatre="playing"');
    expect(html).toContain('motion-paused');
  });
});

describe('hydration', () => {
  const runtimeGlobals = ['$RB', '$RC', '$RT', '$RV'];
  let root: { unmount: () => void } | undefined;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = undefined;
    document.body.replaceChildren();
    for (const name of runtimeGlobals) Reflect.deleteProperty(globalThis, name);
  });

  /**
   * React streams a large boundary behind its fallback and reveals it on an animation frame,
   * which WebKit often grants only after hydration. Were a context above it to change when the
   * preference resolves, React would give up hydrating the waiting boundary and render it again
   * on the client, discarding the server's nodes.
   */
  it('lets a streamed boundary that waits for its reveal hydrate in place', async () => {
    mockReducedMotion(false);
    vi.resetModules();
    vi.doMock('react', () => React);
    const { MotionProvider } = await import('./motion-provider');
    const { renderToReadableStream } = await import('react-dom/server');
    const { hydrateRoot } = await import('react-dom/client');
    function Room() {
      const [presses, setPresses] = React.useState(0);
      return (
        <main>
          <button type="button" onClick={() => setPresses(presses + 1)}>
            {presses}
          </button>
          <p>{'A recorded three-body orbit, rendered as light and as ink. '.repeat(12)}</p>
        </main>
      );
    }
    // A route component stands between the two, as the router's segments do on the site; a
    // context change reaches a waiting boundary through a parent that bails out of rendering.
    function Route() {
      return (
        <React.Suspense fallback={<p>Cosmic Signature</p>}>
          <Room />
        </React.Suspense>
      );
    }
    const page = (
      <MotionProvider>
        <Route />
      </MotionProvider>
    );
    // A boundary larger than the progressive chunk is sent after its fallback, as on the site.
    const stream = await renderToReadableStream(page, { progressiveChunkSize: 1 });
    await stream.allReady;
    const template = document.createElement('template');
    template.innerHTML = await new Response(stream).text();
    const container = document.createElement('div');
    container.append(template.content.firstElementChild!);
    const scripts = [...template.content.querySelectorAll('script')].map((script) => script.text);
    template.content.querySelectorAll('script').forEach((script) => script.remove());
    document.body.append(container, template.content);
    const streamed = document.querySelector('[hidden] > main');
    expect(streamed).not.toBeNull();

    // React's own runtime marks the boundary as queued and asks for a frame to reveal it.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    for (const script of scripts) new Function(script)();
    await act(async () => {
      root = hydrateRoot(container, page);
    });
    // Hydration has settled on the visitor's motion; the boundary still waits, untouched.
    expect(container.firstElementChild).not.toHaveClass('motion-paused');
    expect(container.querySelector('main')).toBeNull();
    expect(streamed!.isConnected).toBe(true);

    await act(async () => {
      while (frames.length) frames.shift()!(performance.now());
    });
    expect(container.querySelector('main')).toBe(streamed);
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(streamed!.querySelector('button')).toHaveTextContent('1');
  });
});
