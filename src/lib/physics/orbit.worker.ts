import {
  compare,
  compareFate,
  deriveFate,
  rederive,
  type Comparison,
  type DerivedFate,
  type OrbitGeneration,
  type Progress,
  type PublishedFate,
  type PublishedPhysics,
  type Rederivation,
} from './orbit';

/**
 * The orbit section's worker: a second of arithmetic off the main thread. It re-derives one
 * work's orbit from its seed, compares it with the published record, and hands the drawing
 * samples back by transfer. Asked for the fate as well, it then runs on past the window to the
 * record's horizon, compares the fate, and hands back the bodies at the window's end and just
 * before an ejection, from which a page performs After the frame.
 */
export interface OrbitRequest {
  generation: OrbitGeneration;
  published: PublishedPhysics;
  stride: number;
  /** The published fate to run on to, and how many steps before an ejection to keep the bodies. */
  fate?: { published: PublishedFate; lead: number };
}

export type OrbitReply =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; result: Rederivation; comparisons: Comparison[] }
  | { type: 'fate'; fate: DerivedFate; comparison: Comparison }
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
    const { windowStart } = result;
    scope.postMessage({ type: 'done', result, comparisons: compare(data.published, result) }, [
      result.samples.positions.buffer,
      result.samples.separations.buffer,
    ]);
    if (!data.fate) return;
    const { published, lead } = data.fate;
    const fate = deriveFate(
      {
        masses: result.masses,
        dt: data.generation.dt,
        positions: windowStart.positions,
        velocities: windowStart.velocities,
      },
      {
        steps: data.generation.steps,
        threshold: published.escapeThreshold,
        horizonSteps: published.horizonSteps,
        lead,
      },
    );
    const transfer: Transferable[] = [
      fate.windowEnd.positions.buffer,
      fate.windowEnd.velocities.buffer,
    ];
    if (fate.approach)
      transfer.push(fate.approach.positions.buffer, fate.approach.velocities.buffer);
    scope.postMessage({ type: 'fate', fate, comparison: compareFate(published, fate) }, transfer);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
