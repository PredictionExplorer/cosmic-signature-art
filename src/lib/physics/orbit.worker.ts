import {
  compare,
  rederive,
  type Comparison,
  type OrbitGeneration,
  type Progress,
  type PublishedPhysics,
  type Rederivation,
} from './orbit';

/**
 * The orbit section's worker: a second of arithmetic off the main thread. It re-derives one
 * work's orbit from its seed, compares it with the published record, and hands the drawing
 * samples back by transfer.
 */
export interface OrbitRequest {
  generation: OrbitGeneration;
  published: PublishedPhysics;
  stride: number;
}

export type OrbitReply =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; result: Rederivation; comparisons: Comparison[] }
  | { type: 'failed'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OrbitRequest>) => void) | null;
  postMessage(message: OrbitReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const result = rederive(data.generation, {
      stride: data.stride,
      onProgress: (progress) => scope.postMessage({ type: 'progress', progress }),
    });
    scope.postMessage({ type: 'done', result, comparisons: compare(data.published, result) }, [
      result.samples.positions.buffer,
      result.samples.separations.buffer,
    ]);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
