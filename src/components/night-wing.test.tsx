import { describe, expect, it } from 'vitest';
import { roomAtCentre, wingProgress } from './night-wing';

const rect = (top: number, height: number): DOMRect =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 1440,
    width: 1440,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const viewportHeight = 1000;
const head = 48;
const stageHeight = viewportHeight - head;

describe('the night wing', () => {
  it('measures how far the hand has drawn the night across a two-screen wing', () => {
    const wing = (top: number) => rect(top, 2 * stageHeight);
    expect(wingProgress(wing(head), stageHeight, head)).toBe(0);
    expect(wingProgress(wing(head - stageHeight / 2), stageHeight, head)).toBe(0.5);
    expect(wingProgress(wing(head - stageHeight), stageHeight, head)).toBe(1);
    expect(wingProgress(wing(head - 2 * stageHeight), stageHeight, head)).toBe(1);
    expect(wingProgress(rect(0, stageHeight), stageHeight, head)).toBe(0);
  });

  it('names the ground at the viewport centre by scroll, by the Turn, or by the hard edge', () => {
    const base = {
      expression: 'ink',
      mode: 'scroll' as const,
      scrollDriven: true,
      stageHeight,
      head,
      viewportHeight,
      fallback: null,
    };
    // Nothing of the wing under the centre: the route's own ground.
    expect(roomAtCentre({ ...base, wing: null })).toBeNull();
    expect(roomAtCentre({ ...base, wing: rect(600, 2 * stageHeight) })).toBeNull();
    expect(roomAtCentre({ ...base, wing: rect(-3000, 2 * stageHeight) })).toBeNull();
    // Scroll-driven: paper until half the travel, then night.
    expect(roomAtCentre({ ...base, wing: rect(head - 100, 2 * stageHeight) })).toBe('paper');
    expect(roomAtCentre({ ...base, wing: rect(head - stageHeight * 0.6, 2 * stageHeight) })).toBe(
      'night',
    );
    // The Turn committed Light: the stage is night wherever it stands.
    expect(roomAtCentre({ ...base, expression: 'light', wing: rect(head, 2 * stageHeight) })).toBe(
      'night',
    );
    // The hard edge: the second screen decides.
    const hard = { ...base, mode: 'hard' as const, wing: rect(-700, 2 * stageHeight) };
    expect(roomAtCentre({ ...hard, fallback: rect(252, stageHeight) })).toBe('night');
    expect(roomAtCentre({ ...hard, fallback: rect(700, stageHeight) })).toBe('paper');
    // A browser without scroll timelines falls to the hard edge even in scroll mode.
    expect(
      roomAtCentre({
        ...base,
        scrollDriven: false,
        wing: rect(-700, 2 * stageHeight),
        fallback: rect(252, stageHeight),
      }),
    ).toBe('night');
  });
});
