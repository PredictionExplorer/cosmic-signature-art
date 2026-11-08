import { plateSpace, type PlateSpace } from './samples';
import type { PlateFrame, WindowStart } from '@/lib/physics/framing';

/**
 * First Light's worker: a window replayed from its verified first state and sampled in plate
 * space (samples.ts), off the main thread, then handed back by transfer.
 */
export interface SamplesRequest {
  start: WindowStart;
  frame: PlateFrame;
  stride: number;
}

export type SamplesReply =
  { type: 'done'; space: PlateSpace } | { type: 'failed'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SamplesRequest>) => void) | null;
  postMessage(message: SamplesReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const space = plateSpace(data.start, data.frame, data.stride);
    scope.postMessage({ type: 'done', space }, [
      space.points.buffer,
      space.drift.buffer,
      space.steps.buffer,
    ]);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
