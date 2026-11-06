import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filmOrbit } from '@/lib/art/orbit-windows';
import type { FilmOrbit, FilmScore } from '@/lib/physics/film-score';
import type { ScoreReply, ScoreRequest } from '@/lib/physics/score.worker';
import { forgetFilmScores, useFilmScore } from './film-score-store';

let workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<ScoreReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: ScoreRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: ScoreRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: ScoreReply) {
    act(() => this.onmessage?.({ data: message } as MessageEvent<ScoreReply>));
  }
}

const orbit = filmOrbit(31)!;
const other = filmOrbit(60)!;
const score = { steps: orbit.window.steps, count: 1 } as FilmScore;

/** What the hook returned, render by render. */
let seen: (FilmScore | null)[] = [];
function Probe({ orbit, wanted }: { orbit?: FilmOrbit; wanted: boolean }) {
  seen.push(useFilmScore(orbit, wanted));
  return null;
}
const last = () => seen.at(-1);

beforeEach(() => {
  workers = [];
  seen = [];
  forgetFilmScores();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the scores measured in a visit', () => {
  it('measures nothing until a score is wanted, then once, off the main thread', () => {
    const { rerender } = render(<Probe orbit={orbit} wanted={false} />);
    expect(workers).toHaveLength(0);
    expect(last()).toBeNull();
    rerender(<Probe orbit={orbit} wanted />);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([{ window: orbit.window }]);
    expect(last()).toBeNull();
    workers[0].reply({ type: 'done', score });
    expect(last()).toBe(score);
    expect(workers[0].terminated).toBe(true);
  });

  it('keeps a measured score for the visit, wanted or not, and for every viewer of the work', () => {
    const first = render(<Probe orbit={orbit} wanted />);
    workers[0].reply({ type: 'done', score });
    first.unmount();
    seen = [];
    render(<Probe orbit={orbit} wanted={false} />);
    expect(last()).toBe(score);
    render(<Probe orbit={orbit} wanted />);
    expect(workers).toHaveLength(1);
    // Another work's score is its own.
    render(<Probe orbit={other} wanted />);
    expect(workers).toHaveLength(2);
    expect(last()).toBeNull();
  });

  it('stops measuring when no one waits any longer, and starts afresh when wanted again', () => {
    const { rerender } = render(<Probe orbit={orbit} wanted />);
    rerender(<Probe orbit={orbit} wanted={false} />);
    expect(workers[0].terminated).toBe(false);
    act(() => {
      vi.runAllTimers();
    });
    expect(workers[0].terminated).toBe(true);
    // A late reply from the stopped worker changes nothing.
    workers[0].reply({ type: 'done', score });
    expect(last()).toBeNull();
    rerender(<Probe orbit={orbit} wanted />);
    expect(workers).toHaveLength(2);
    workers[1].reply({ type: 'done', score });
    expect(last()).toBe(score);
  });

  it('keeps one worker through Strict Mode’s second mount, and two viewers share it', () => {
    render(
      <StrictMode>
        <Probe orbit={orbit} wanted />
        <Probe orbit={orbit} wanted />
      </StrictMode>,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(false);
    workers[0].reply({ type: 'done', score });
    expect(seen.slice(-2)).toEqual([score, score]);
  });

  it('leaves the film its plain time line where the score cannot be measured', () => {
    const failing = render(<Probe orbit={orbit} wanted />);
    workers[0].reply({ type: 'failed', message: 'no' });
    expect(last()).toBeNull();
    failing.unmount();
    render(<Probe orbit={orbit} wanted />);
    // Measured once and failed: not tried again in this visit.
    expect(workers).toHaveLength(1);

    render(<Probe orbit={other} wanted />);
    act(() => workers[1].onerror?.());
    expect(workers[1].terminated).toBe(true);
    expect(last()).toBeNull();
  });

  it('wants no worker where there is none, or no orbit to measure', () => {
    render(<Probe wanted />);
    expect(workers).toHaveLength(0);
    expect(last()).toBeNull();
    vi.stubGlobal('Worker', undefined);
    render(<Probe orbit={orbit} wanted />);
    expect(last()).toBeNull();
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    render(<Probe orbit={other} wanted />);
    expect(last()).toBeNull();
  });
});
