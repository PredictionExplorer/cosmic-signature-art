import { Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealScript } from './reveal';

const runtimeGlobals = ['$RB', '$RC', '$RT', '$RV'];
let frames: FrameRequestCallback[];

/** A page whose large boundary React sends after its fallback, with the runtime's scripts. */
async function streamedPage() {
  const stream = await renderToReadableStream(
    <div>
      <Suspense fallback={<p>Cosmic Signature</p>}>
        <main>{'A recorded three-body orbit, rendered as light and as ink. '.repeat(12)}</main>
      </Suspense>
    </div>,
    { progressiveChunkSize: 1 },
  );
  await stream.allReady;
  const template = document.createElement('template');
  template.innerHTML = await new Response(stream).text();
  const scripts = [...template.content.querySelectorAll('script')].map((script) => script.text);
  template.content.querySelectorAll('script').forEach((script) => script.remove());
  document.body.append(template.content);
  return scripts;
}
const run = (script: string) => new Function(script)();
const revealed = () =>
  !document.querySelector('[hidden] > main') && !!document.querySelector('main');

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
});
// Only timers are faked: frames stay in the test's hands.
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
/** Streams the page with real timers, then runs the scripts in the page's order on fake ones. */
async function load() {
  const scripts = await streamedPage();
  fakeTimers();
  run(revealScript);
  for (const script of scripts) run(script);
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  for (const name of runtimeGlobals) Reflect.deleteProperty(globalThis, name);
});

describe('the reveal script', () => {
  it('reveals the queued boundary when the browser grants no frame', async () => {
    await load();
    expect(revealed()).toBe(false);
    vi.advanceTimersByTime(50);
    expect(revealed()).toBe(true);
    // The frame React asked for may still come; it finds nothing left to reveal.
    for (const frame of frames.splice(0)) frame(performance.now());
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('leaves the reveal to React when a frame comes first', async () => {
    await load();
    const reveal = vi.spyOn(window as unknown as { $RV: (batch: unknown[]) => void }, '$RV');
    for (const frame of frames.splice(0)) frame(performance.now());
    vi.advanceTimersByTime(500);
    expect(revealed()).toBe(true);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('does nothing when the page streams nothing or the runtime is absent', () => {
    fakeTimers();
    run(revealScript);
    document.body.innerHTML = '<main>Cosmic Signature</main>';
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(revealed()).toBe(true);
  });
});
