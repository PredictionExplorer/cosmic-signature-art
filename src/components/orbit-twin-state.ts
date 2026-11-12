import { useEffect, useRef, useState } from 'react';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { PlateFrame } from '@/lib/physics/framing';
import type { Rederivation } from '@/lib/physics/orbit';
import type { TwinRun } from '@/lib/physics/twin';
import type { TwinReply, TwinRequest } from '@/lib/physics/twin.worker';
import { twinWorker } from './orbit-proof';
import type { Twin, TwinPair } from './orbit-twin';

/*
  One part in a trillion, as the visitor moves through it (docs/first-light.md §15).

  The twin is followed once, off the main thread (src/lib/physics/twin.worker.ts), and what was
  found is kept: a repeat or a return performs it again without following it anew. This hook
  owns whether the twin stands on the stage, how far the pair has got as the performance last
  said, and the worker. The performance itself is the drawing's (orbit-twin.tsx).
*/
export function useTwin({
  orbit,
  steps,
  result,
  frame,
}: {
  orbit: WorkOrbit;
  steps: number;
  /** The derived window: the twin starts from its first state, one body moved. None until derived. */
  result: Rederivation | null;
  /** The work's frame, in which the twin is seen to part. None draws in the plane, with no twin. */
  frame: PlateFrame | undefined;
}) {
  /** Off the stage (null), being followed, ready to perform, or not to be had. */
  const [twin, setTwin] = useState<Twin | null>(null);
  /** Where the pair has reached, as the performance last said, and whether it has come to rest. */
  const [taken, setTaken] = useState(0);
  const [rested, setRested] = useState(false);
  /** The work and its twin as they stand, so a resize carries on from them. */
  const live = useRef<TwinPair | null>(null);
  /** The twin, once followed. */
  const found = useRef<TwinRun | null>(null);

  const following = twin?.phase === 'following';
  useEffect(() => {
    if (!following || !result || !frame) return;
    let worker: Worker;
    try {
      worker = twinWorker();
    } catch {
      queueMicrotask(() => setTwin({ phase: 'failed' }));
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<TwinReply>) => {
      worker.terminate();
      if (data.type === 'done') {
        found.current = data.run;
        setTwin({ phase: 'ready', run: data.run, repeat: 0 });
      } else setTwin({ phase: 'failed' });
    };
    worker.onerror = () => {
      worker.terminate();
      setTwin({ phase: 'failed' });
    };
    const request: TwinRequest = {
      start: {
        masses: result.masses,
        dt: orbit.generation.dt,
        steps,
        positions: result.windowStart.positions,
        velocities: result.windowStart.velocities,
      },
      frame,
      horizon: orbit.fate.horizonSteps,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [following, result, frame, orbit, steps]);

  return {
    twin,
    following,
    taken,
    rested,
    /** The twin takes the stage: followed if it is new, performed afresh if it was found. */
    go: () => {
      live.current = null;
      setRested(false);
      setTaken(steps);
      setTwin((current) =>
        found.current
          ? {
              phase: 'ready',
              run: found.current,
              repeat: current?.phase === 'ready' ? current.repeat + 1 : 0,
            }
          : { phase: 'following' },
      );
    },
    /** The twin leaves the stage. What was found of it is kept. */
    leave: () => {
      live.current = null;
      setTwin(null);
      setRested(false);
    },
    /** For the drawing alone: the pair it carries, and how it reports. */
    forDrawing: {
      live,
      /** How far the pair has got. */
      said: setTaken,
      rested: () => setRested(true),
    },
  };
}
