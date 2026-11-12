import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePictureRoom } from './orbit-room';

/** An element laid out from `top` to `bottom` of the window. */
function laid<T extends HTMLElement>(node: T, top: number, bottom: number) {
  node.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
  return node;
}

let frames: FrameRequestCallback[] = [];
const scrolledTo = vi.fn();
/** Two frames on: when the browser has answered the change in its own way. */
const twoFramesOn = () => {
  frames.shift()?.(0);
  frames.shift()?.(0);
};

beforeEach(() => {
  frames = [];
  scrolledTo.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {};
  });
  vi.stubGlobal('scrollTo', scrolledTo);
  vi.stubGlobal('scrollY', 1_000);
  vi.stubGlobal('innerHeight', 800);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * A section whose running head is 48 px, with the picture, what stands beneath it and the
 * words laid out where the test says.
 */
function staged(
  at: { picture: [number, number]; beneath: [number, number]; words: [number, number] },
  reducedMotion = false,
) {
  const section = document.createElement('section');
  section.style.scrollMarginTop = '48px';
  document.body.append(section);
  const refs = {
    section: { current: section },
    stage: { current: laid(document.createElement('div'), ...at.picture) },
    beneath: { current: laid(document.createElement('div'), ...at.beneath) },
    wordsRow: { current: laid(document.createElement('div'), ...at.words) },
  };
  const hook = renderHook(
    ({ run }: { run: number | null }) =>
      usePictureRoom({ ...refs, pastFrame: run !== null, run, reducedMotion }),
    { initialProps: { run: null as number | null } },
  );
  return { ...hook, section, refs, room: () => hook.result.current };
}

/** The picture a screen below the head, with 170 px standing beneath it. */
const below = {
  picture: [900, 1_400],
  beneath: [1_410, 1_570],
  words: [1_520, 1_570],
} as const satisfies Parameters<typeof staged>[0];
/** All of it in view under the head. */
const inView = {
  picture: [60, 560],
  beneath: [570, 730],
  words: [680, 730],
} as const satisfies Parameters<typeof staged>[0];

describe('the picture’s room past the frame', () => {
  it('moves nothing and fits nothing when the section first stands', () => {
    const { section } = staged(below);
    expect(scrolledTo).not.toHaveBeenCalled();
    expect(section.style.getPropertyValue('--beneath-measured')).toBe('');
  });

  it('fits the plate to the room measured beneath it, past the frame only', () => {
    const { section, rerender } = staged(below);
    rerender({ run: 1 });
    // 170 px stand beneath the picture; 6 above it under the head, and 6 to spare.
    expect(section.style.getPropertyValue('--beneath-measured')).toBe('182px');
    rerender({ run: null });
    expect(section.style.getPropertyValue('--beneath-measured')).toBe('');
  });

  it('brings the picture just under the head as a performance the visitor asked for begins', () => {
    const { room, rerender } = staged(below);
    room().arrive('bring');
    rerender({ run: 1 });
    // Two frames on, measured again there, and smoothly.
    expect(scrolledTo).not.toHaveBeenCalled();
    twoFramesOn();
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_000 + 900 - 48 - 6, behavior: 'smooth' });
  });

  it('brings it at once where motion is unwelcome', () => {
    const { room, rerender } = staged(below, true);
    room().arrive('bring');
    rerender({ run: 1 });
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_846, behavior: 'instant' });
  });

  it('moves nothing when the picture and what stands beneath it are in view already', () => {
    const { room, rerender } = staged(inView);
    room().arrive('bring');
    rerender({ run: 1 });
    twoFramesOn();
    expect(scrolledTo).not.toHaveBeenCalled();
  });

  it('takes the visitor’s word once: a picture that comes back unasked moves nothing', () => {
    const { room, rerender } = staged(below, true);
    room().arrive('bring');
    rerender({ run: 1 });
    expect(scrolledTo).toHaveBeenCalledTimes(1);
    // The same picture again without a word for it (a plate turned back).
    rerender({ run: 2 });
    expect(scrolledTo).toHaveBeenCalledTimes(1);
  });

  it('ends a performance that had to wait on its picture only if the visitor is still there', () => {
    const away = staged(below, true);
    away.room().arrive('if-here');
    away.rerender({ run: 1 });
    expect(scrolledTo).not.toHaveBeenCalled();
    // Still there, with the picture partly in view: the page ends on the picture.
    const here = staged({ ...below, picture: [700, 1_200] }, true);
    here.room().arrive('if-here');
    here.rerender({ run: 1 });
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_000 + 700 - 48 - 6, behavior: 'instant' });
  });

  it('brings a picture that already stands past the frame into view when asked for again', () => {
    const { room, rerender } = staged(below, true);
    rerender({ run: 1 });
    expect(scrolledTo).not.toHaveBeenCalled();
    room().bring();
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_846, behavior: 'instant' });
  });

  it('keeps the words under the hand that pressed one, on the way back to the frame', () => {
    const { room, rerender, refs } = staged(inView);
    rerender({ run: 1 });
    room().keepWords();
    // Back at the frame the caption and the score return above the words: 120 px lower.
    laid(refs.wordsRow.current, 800, 850);
    rerender({ run: null });
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_000 + 800 - 680, behavior: 'instant' });
    // And once more two frames on, if the browser has moved them since.
    scrolledTo.mockClear();
    laid(refs.wordsRow.current, 690, 740);
    twoFramesOn();
    expect(scrolledTo).toHaveBeenCalledWith({ top: 1_000 + 690 - 680, behavior: 'instant' });
  });

  it('leaves the page be on the way back when the words were out of view, or where they were', () => {
    const offScreen = staged({ ...inView, words: [900, 950] });
    offScreen.rerender({ run: 1 });
    offScreen.room().keepWords();
    offScreen.rerender({ run: null });
    expect(scrolledTo).not.toHaveBeenCalled();
    const unmoved = staged(inView);
    unmoved.rerender({ run: 1 });
    unmoved.room().keepWords();
    unmoved.rerender({ run: null });
    twoFramesOn();
    expect(scrolledTo).not.toHaveBeenCalled();
    // Not asked to keep them (the section left the frame's far side some other way): nothing.
    const unasked = staged(inView);
    unasked.rerender({ run: 1 });
    unasked.rerender({ run: null });
    expect(scrolledTo).not.toHaveBeenCalled();
  });

  it('fits again when asked, as what stands beneath takes another height', () => {
    const { room, rerender, refs, section } = staged(below);
    rerender({ run: 1 });
    laid(refs.beneath.current, 1_410, 1_591.5);
    room().fit();
    expect(section.style.getPropertyValue('--beneath-measured')).toBe('204px');
  });
});
