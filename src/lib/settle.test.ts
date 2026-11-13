import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settleScript } from './settle';

/** The listeners the script left on the document, taken off again after each test. */
let added: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions][];
const run = () => new Function(settleScript)();
const loaded = (image: Element) => image.dispatchEvent(new Event('load'));

/** A plate as the server sends it: the preview, and the still that waits to be settled. */
function plate() {
  const media = document.createElement('div');
  media.className = 'art-media';
  media.innerHTML =
    '<img class="art-preview" src="data:image/webp;base64,AAAA" alt="">' +
    '<img class="art-still" src="/art/31-ink.webp" alt="№ 031 · Ink">';
  document.body.append(media);
  return {
    preview: media.querySelector<HTMLImageElement>('img.art-preview')!,
    still: media.querySelector<HTMLImageElement>('img.art-still')!,
  };
}
/** jsdom never fetches an image; this one has arrived, whole or broken. */
function completed(image: HTMLImageElement, naturalWidth: number) {
  Object.defineProperty(image, 'complete', { value: true });
  Object.defineProperty(image, 'naturalWidth', { value: naturalWidth });
}
/** The browser's decode(), settled by the test. jsdom offers none. */
function offerDecode() {
  const pending: { resolve: () => void; reject: (reason: Error) => void }[] = [];
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })),
  });
  return pending;
}

beforeEach(() => {
  added = [];
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      added.push([type, listener, options ?? false]);
      add(type, listener, options);
    },
  );
});
afterEach(() => {
  for (const [type, listener, options] of added)
    document.removeEventListener(type, listener, options);
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  document.body.replaceChildren();
});

describe('the settle script', () => {
  it('settles a still once it has loaded and decoded, with no React in the page', async () => {
    const pending = offerDecode();
    run();
    const { still } = plate();
    expect(still).not.toHaveClass('is-settled');
    loaded(still);
    // Loaded, but not yet decoded: shown now, the still could paint in strips.
    expect(pending).toHaveLength(1);
    expect(still).not.toHaveClass('is-settled');
    pending[0].resolve();
    await Promise.resolve();
    expect(still).toHaveClass('art-still', 'is-settled');
  });

  it('settles a still whose decode is refused, as the plate does', async () => {
    const pending = offerDecode();
    run();
    const { still } = plate();
    loaded(still);
    pending[0].reject(new Error('The image was replaced while it decoded.'));
    await Promise.resolve();
    expect(still).toHaveClass('is-settled');
  });

  it('settles on load where the browser offers no decode()', () => {
    run();
    const { still } = plate();
    loaded(still);
    expect(still).toHaveClass('is-settled');
  });

  it('listens in the capture phase, on the document, and only once', () => {
    run();
    expect(added).toEqual([['load', expect.any(Function), true]]);
  });

  it('leaves every other element that loads as it was', () => {
    run();
    const { preview, still } = plate();
    const card = document.createElement('img');
    card.className = 'work-card-image';
    const sheet = document.createElement('link');
    const film = document.createElement('video');
    film.className = 'art-still';
    document.body.append(card, sheet, film);
    for (const element of [preview, card, sheet, film]) {
      loaded(element);
      expect(element).not.toHaveClass('is-settled');
    }
    expect(still).not.toHaveClass('is-settled');
    // A still that failed fires `error`, never `load`, and stays clear over its preview.
    still.dispatchEvent(new Event('error'));
    expect(still).not.toHaveClass('is-settled');
  });

  it('settles the stills React mounts later, and never unsettles one', () => {
    run();
    const first = plate().still;
    loaded(first);
    const later = plate().still;
    expect(later).not.toHaveClass('is-settled');
    loaded(later);
    expect(later).toHaveClass('is-settled');
    // A still loads again when its candidates change (a constrained connection's ladder).
    loaded(first);
    expect(first.className).toBe('art-still is-settled');
  });

  it('sweeps the stills that completed before it ran, and only those', () => {
    const whole = plate().still;
    const broken = plate().still;
    const arriving = plate().still;
    completed(whole, 1386);
    completed(broken, 0);
    run();
    expect(whole).toHaveClass('is-settled');
    expect(broken).not.toHaveClass('is-settled');
    expect(arriving).not.toHaveClass('is-settled');
    loaded(arriving);
    expect(arriving).toHaveClass('is-settled');
  });

  it('is one static expression, so a policy can name it by its hash', () => {
    expect(settleScript).toMatch(/^\(function\(\)\{.*\}\)\(\)$/);
    // Nothing that could end the script element early, or that differs from one request to the next.
    expect(settleScript).not.toMatch(/<\/|<!--|\n/);
    expect(settleScript.length).toBeLessThan(512);
  });
});
