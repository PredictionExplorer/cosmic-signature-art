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
import { beyondPath, type BeyondPath } from './beyond';
import { HeldPlacement, framedSamples, type FramedSamples, type PlateFrame } from './framing';
import { plateSpace, type PlateSpace } from '../first-light/samples';

/**
 * The orbit section's worker: a second of arithmetic off the main thread. It re-derives one
 * work's orbit from its seed, compares it with the published record, and hands the drawing
 * samples back by transfer. Given the work's frame, it then replays the derived window on the
 * plate, where the films put the bodies, and hands those samples back too. Asked for the fate
 * as well, it then runs on past the window to the record's horizon and compares the fate. Asked
 * for the window in depth, it samples the derived window in the generator's view space
 * (first-light/samples.ts), for the orbit in the hand. Asked for what lies past the frame, last
 * of all, since it is the longest and nothing else waits on it, it carries the orbit on from
 * the window's end and hands back its path, placed on the plate with the camera held
 * (beyond.ts), from which a page performs After the frame.
 */
export interface OrbitRequest {
  generation: OrbitGeneration;
  published: PublishedPhysics;
  stride: number;
  /** The published fate to run on to. */
  fate?: { published: PublishedFate };
  /** With the fate, the path past the window as well: `pace` is the Light film's, in steps a second. */
  beyond?: { pace: number };
  /** The window's frame on its plate (framing.ts): the bodies are placed where the films put them. */
  frame?: PlateFrame;
  /** With a frame, the derived window in depth as well, for a page that can turn it. */
  space?: boolean;
}

export type OrbitReply =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; result: Rederivation; comparisons: Comparison[] }
  /** The derived window on its plate; null when it could not be placed, and is drawn in its plane. */
  | { type: 'framed'; framed: FramedSamples | null }
  | { type: 'fate'; fate: DerivedFate; comparison: Comparison }
  /** The derived window in depth; null when it could not be sampled, and is never turned. */
  | { type: 'space'; space: PlateSpace | null }
  /**
   * The orbit past its window, on its plate; null when it could not be placed there or carried
   * on, and is not performed. The last reply of a worker asked for it.
   */
  | { type: 'beyond'; beyond: BeyondPath | null }
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
    let framed: FramedSamples | null = null;
    if (data.frame) {
      // The derived window, replayed from its own first state: what is drawn is what was derived.
      // A frame that cannot place it leaves the measurements and the fate as they are.
      try {
        framed = framedSamples(
          {
            masses: result.masses,
            dt: data.generation.dt,
            steps: data.generation.steps,
            positions: windowStart.positions,
            velocities: windowStart.velocities,
          },
          data.frame,
          data.stride,
        );
      } catch {
        framed = null;
      }
      scope.postMessage({ type: 'framed', framed }, framed ? [framed.pixels.buffer] : []);
    }
    let fate: DerivedFate | null = null;
    if (data.fate) {
      const { published } = data.fate;
      fate = deriveFate(
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
        },
      );
      // Copied, not handed over: the path past the frame is carried on from these very arrays
      // after this message, and a buffer given away is one this worker can no longer read.
      scope.postMessage({ type: 'fate', fate, comparison: compareFate(published, fate) });
    }
    if (data.frame && data.space) {
      // The same derived window, in the generator's view space before it was drawn flat. One that
      // cannot be sampled is never turned; the record and the drawing stand as they are.
      let space: PlateSpace | null = null;
      try {
        space = plateSpace(
          {
            masses: result.masses,
            dt: data.generation.dt,
            steps: data.generation.steps,
            positions: windowStart.positions,
            velocities: windowStart.velocities,
          },
          data.frame,
          data.stride,
        );
      } catch {
        space = null;
      }
      scope.postMessage(
        { type: 'space', space },
        space ? [space.points.buffer, space.drift.buffer, space.steps.buffer] : [],
      );
    }
    if (fate && data.beyond) {
      // The same physics carried on from the bodies the fate run kept at the window's end, on
      // the plate the window was placed on. A path that cannot be placed or carried on is not
      // performed; the record stands as it is.
      let beyond: BeyondPath | null = null;
      try {
        const start = {
          masses: result.masses,
          dt: data.generation.dt,
          steps: data.generation.steps,
        };
        if (data.frame && framed)
          beyond = beyondPath({
            ...start,
            fate,
            pace: data.beyond.pace,
            stride: data.stride,
            plate: new HeldPlacement(data.frame, start),
          });
      } catch {
        beyond = null;
      }
      scope.postMessage({ type: 'beyond', beyond }, beyond ? [beyond.pixels.buffer] : []);
    }
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
