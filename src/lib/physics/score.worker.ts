import type { FilmScore } from './film-score';
import { scoreWindow } from './score-window';
import type { OrbitWindow } from './orbit';

/**
 * The score's worker: a window measured again from its verified first state, off the main
 * thread, and handed back by transfer.
 */
export interface ScoreRequest {
  window: OrbitWindow;
}

export type ScoreReply = { type: 'done'; score: FilmScore } | { type: 'failed'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScoreRequest>) => void) | null;
  postMessage(message: ScoreReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const score = scoreWindow(data.window);
    scope.postMessage({ type: 'done', score }, [score.separations.buffer]);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
