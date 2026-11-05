import { deriveBeginnings, type Beginnings, type BeginningsChunk } from './beginnings';
import type { OrbitGeneration } from './orbit';

/**
 * The choice's worker: a work's hundred thousand beginnings, derived off the main thread. Each
 * chunk is handed to the page by transfer as soon as it is measured, with how far the walk has
 * come, so the field fills at the pace of the arithmetic; the totals follow at the end.
 */
export interface BeginningsRequest {
  generation: OrbitGeneration;
  /** Beginnings a chunk; 2,500 unless a caller asks otherwise. */
  chunk?: number;
}

export type BeginningsReply =
  | { type: 'chunk'; chunk: BeginningsChunk; progress: { done: number; total: number } }
  | { type: 'done'; result: Beginnings; seconds: number }
  | { type: 'failed'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BeginningsRequest>) => void) | null;
  postMessage(message: BeginningsReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const total = data.generation.candidatesPerAttempt;
    const result = deriveBeginnings(data.generation, {
      chunk: data.chunk,
      onChunk: (chunk) =>
        scope.postMessage(
          { type: 'chunk', chunk, progress: { done: chunk.start + chunk.passed.length, total } },
          [chunk.energies.buffer, chunk.momenta.buffer, chunk.passed.buffer],
        ),
    });
    scope.postMessage({ type: 'done', result, seconds: result.milliseconds / 1000 });
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
