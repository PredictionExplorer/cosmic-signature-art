import { twinRun, type TwinRun } from './twin';
import type { PlateFrame, WindowStart } from './framing';

/**
 * One part in a trillion's worker (twin.ts): the work and its twin followed side by side, through
 * the window and past the frame until the twin parts, off the main thread. A few seconds of
 * arithmetic at most, then handed back by transfer.
 */
export interface TwinRequest {
  start: WindowStart;
  frame: PlateFrame;
  horizon: number;
}

export type TwinReply = { type: 'done'; run: TwinRun } | { type: 'failed'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TwinRequest>) => void) | null;
  postMessage(message: TwinReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const run = twinRun(data.start, data.frame, { horizon: data.horizon });
    scope.postMessage({ type: 'done', run }, [
      run.gaps.buffer,
      run.windowEnd.positions.buffer,
      run.windowEnd.velocities.buffer,
    ]);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
