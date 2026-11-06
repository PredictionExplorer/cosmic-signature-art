/*
  The Orrery's beat, kept by the page. Its worker draws a frame only when the page asks for one,
  and the page asks on its own animation frame, never while the last is unanswered, so the worker
  draws no faster than the page can show what it draws. A worker that kept a beat of its own went
  on handing the page frames it had no time to show: in WebKit without a GPU, a page short of time
  fell further behind with every frame, until it drew and answered nothing at all. With nothing
  to draw (no cell in view, every cell drawn whole), the page stops asking until it tells the
  worker something new.
*/

/** The animation frames the page lends its worker: the page's own, or a test's. */
export interface FrameClock {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const pageFrames: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export class OrreryPace {
  private readonly ask: () => void;
  private readonly frames: FrameClock;
  /** The animation frame the next ask waits for. */
  private waiting: number | null = null;
  /** A frame asked for and not yet answered. */
  private asked = false;
  /** The worker had more to draw when it last answered. */
  private more = false;
  /** The worker was told something since it was last asked for a frame. */
  private told = false;
  private stopped = false;

  constructor(ask: () => void, frames: FrameClock = pageFrames) {
    this.ask = ask;
    this.frames = frames;
  }

  /** The worker was told something that may give it more to draw. */
  wake() {
    this.told = true;
    this.schedule();
  }

  /** The worker drew the frame asked of it; `more` while it has more to draw. */
  answered(more: boolean) {
    this.asked = false;
    this.more = more;
    this.schedule();
  }

  /** The page is done with the worker: no frame is asked for again. */
  stop() {
    this.stopped = true;
    if (this.waiting !== null) this.frames.cancel(this.waiting);
    this.waiting = null;
  }

  private schedule() {
    if (this.stopped || this.asked || this.waiting !== null) return;
    if (!this.more && !this.told) return;
    this.waiting = this.frames.request(() => {
      this.waiting = null;
      this.asked = true;
      this.told = false;
      this.ask();
    });
  }
}
