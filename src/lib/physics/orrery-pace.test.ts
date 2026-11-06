import { describe, expect, it } from 'vitest';
import { OrreryPace, type FrameClock } from './orrery-pace';

/** The page's animation frames, drawn when the test says: every callback waiting runs. */
function frames() {
  const waiting = new Map<number, () => void>();
  let next = 1;
  const clock: FrameClock & { draw(): void; readonly waiting: number } = {
    request(callback) {
      waiting.set(next, callback);
      return next++;
    },
    cancel: (handle) => void waiting.delete(handle),
    draw() {
      const due = [...waiting.values()];
      waiting.clear();
      for (const callback of due) callback();
    },
    get waiting() {
      return waiting.size;
    },
  };
  return clock;
}

function paced() {
  const clock = frames();
  let asks = 0;
  const pace = new OrreryPace(() => (asks += 1), clock);
  return { clock, pace, asks: () => asks };
}

describe('the Orrery’s pace', () => {
  it('asks the worker for a frame on the page’s next frame once it has told it something', () => {
    const { clock, pace, asks } = paced();
    clock.draw();
    expect(clock.waiting).toBe(0);
    pace.wake();
    expect(asks()).toBe(0);
    clock.draw();
    expect(asks()).toBe(1);
  });

  it('never asks again while a frame is unanswered, however many frames the page draws', () => {
    const { clock, pace, asks } = paced();
    pace.wake();
    clock.draw();
    for (let k = 0; k < 10; k++) {
      pace.wake();
      clock.draw();
    }
    expect(asks()).toBe(1);
    expect(clock.waiting).toBe(0);
    // The answer is not itself a frame: the page's next one asks for the next.
    pace.answered(true);
    expect(asks()).toBe(1);
    clock.draw();
    expect(asks()).toBe(2);
  });

  it('asks once a page frame at most, so a page that draws none holds the worker where it is', () => {
    const clock = frames();
    let asks = 0;
    // A worker that answers at once, always with more to draw.
    const pace = new OrreryPace(() => {
      asks += 1;
      pace.answered(true);
    }, clock);
    pace.wake();
    for (let k = 0; k < 5; k++) clock.draw();
    expect(asks).toBe(5);
    // A page too busy to draw (a slow machine, no GPU): however much the worker is told, it is
    // asked for nothing until the page draws again, and then for one frame.
    for (let k = 0; k < 50; k++) pace.wake();
    expect(asks).toBe(5);
    expect(clock.waiting).toBe(1);
    clock.draw();
    expect(asks).toBe(6);
  });

  it('rests while the worker has nothing to draw, and asks again once it is told something', () => {
    const { clock, pace, asks } = paced();
    pace.wake();
    clock.draw();
    pace.answered(false);
    expect(clock.waiting).toBe(0);
    clock.draw();
    expect(asks()).toBe(1);
    pace.wake();
    expect(clock.waiting).toBe(1);
    clock.draw();
    expect(asks()).toBe(2);
  });

  it('keeps what the worker was told while a frame was unanswered', () => {
    const { clock, pace, asks } = paced();
    pace.wake();
    clock.draw();
    // A cell comes into view while the worker draws; its answer was given before it knew.
    pace.wake();
    pace.answered(false);
    clock.draw();
    expect(asks()).toBe(2);
  });

  it('gives back the frame it waited for once stopped, and asks for nothing after', () => {
    const { clock, pace, asks } = paced();
    pace.wake();
    expect(clock.waiting).toBe(1);
    pace.stop();
    expect(clock.waiting).toBe(0);
    pace.answered(true);
    pace.wake();
    clock.draw();
    expect(asks()).toBe(0);
  });
});
