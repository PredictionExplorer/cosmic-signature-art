import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { PlateSpace } from '@/lib/first-light/samples';
import type { FramedSamples, PlateFrame } from '@/lib/physics/framing';
import type { BeyondPath } from '@/lib/physics/beyond';
import type { Comparison, DerivedFate, Progress, Rederivation } from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import { orbitWorker } from './orbit-proof';

/** Every hundredth step is drawn: ten thousand points per body for a million-step window. */
export const STRIDE = 100;

export type Derivation =
  | { phase: 'deriving'; progress: Progress | null }
  | { phase: 'derived'; result: Rederivation; comparisons: Comparison[]; seconds: number }
  | { phase: 'failed' };

export type Fate =
  | { phase: 'deriving' }
  | { phase: 'derived'; fate: DerivedFate; comparison: Comparison }
  | { phase: 'failed' };

/**
 * The work's orbit, derived from its seed off the main thread once the section is near
 * (src/lib/physics/orbit.worker.ts). The replies come in order:
 *
 * 1. the measurements, compared with the published record;
 * 2. given the work's frame, the derived window placed on its plate (null when it cannot be);
 * 3. the fate;
 * 4. asked for it, with a frame, the derived window in depth, for the orbit in the hand (null
 *    when it cannot be sampled);
 * 5. the orbit's path past the window on its plate, which After the frame performs (null when
 *    it could not be placed there or carried on). Then the worker is done.
 *
 * `onBeyond` hears what became of the path past the window: the path, or null where there is
 * none to perform, a worker that failed on the way included. `pace` is the Light film's, in
 * steps a second: the worker carries an escape on for a minute of it.
 */
export function useOrbitDerivation({
  orbit,
  near,
  pace,
  frame,
  depth = false,
  onBeyond,
}: {
  orbit: WorkOrbit;
  near: boolean;
  pace: number;
  frame?: PlateFrame;
  /** Whether to sample the window in depth: only a page that can turn it asks. */
  depth?: boolean;
  onBeyond: (path: BeyondPath | null) => void;
}) {
  const [derivation, setDerivation] = useState<Derivation>({ phase: 'deriving', progress: null });
  /** The derived window on its plate, from the worker: null when it could not be placed there. */
  const [framed, setFramed] = useState<FramedSamples | null | undefined>(undefined);
  const [fate, setFate] = useState<Fate>({ phase: 'deriving' });
  /** The orbit past its window: null when it could not be carried on. */
  const [beyond, setBeyond] = useState<BeyondPath | null | undefined>(undefined);
  /** The derived window in depth: null when it was not asked for or could not be sampled. */
  const [space, setSpace] = useState<PlateSpace | null | undefined>(undefined);
  const beyondArrived = useEffectEvent((path: BeyondPath | null) => onBeyond(path));
  const sampled = depth && !!frame;

  useEffect(() => {
    if (!near || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = orbitWorker();
    } catch {
      queueMicrotask(() => {
        setDerivation({ phase: 'failed' });
        setFramed(null);
        setFate({ phase: 'failed' });
        setBeyond(null);
        setSpace(null);
        beyondArrived(null);
      });
      return;
    }
    const started = performance.now();
    // The measurements come first, then the window on its plate; the worker then runs on to
    // the fate, to the window in depth if it was asked for, and to the path past the window,
    // and is done.
    let measured = false;
    let fated = false;
    let carried = false;
    const fail = () => {
      if (!measured) setDerivation({ phase: 'failed' });
      setFramed((current) => current ?? null);
      if (!fated) setFate({ phase: 'failed' });
      setBeyond((current) => current ?? null);
      setSpace((current) => current ?? null);
      worker.terminate();
      // Whoever waits for the path is told there will be none.
      if (!carried) beyondArrived(null);
      carried = true;
    };
    worker.onmessage = ({ data }: MessageEvent<OrbitReply>) => {
      if (data.type === 'progress') setDerivation({ phase: 'deriving', progress: data.progress });
      else if (data.type === 'done') {
        measured = true;
        setDerivation({
          phase: 'derived',
          result: data.result,
          comparisons: data.comparisons,
          seconds: (performance.now() - started) / 1000,
        });
      } else if (data.type === 'framed') setFramed(data.framed);
      else if (data.type === 'fate') {
        fated = true;
        setFate({ phase: 'derived', fate: data.fate, comparison: data.comparison });
      } else if (data.type === 'space') setSpace(data.space);
      else if (data.type === 'beyond') {
        carried = true;
        setBeyond(data.beyond);
        worker.terminate();
        beyondArrived(data.beyond);
      } else fail();
    };
    worker.onerror = fail;
    const request: OrbitRequest = {
      generation: orbit.generation,
      published: orbit.published,
      stride: STRIDE,
      fate: { published: orbit.fate },
      beyond: { pace },
      ...(frame ? { frame } : {}),
      ...(sampled ? { space: true } : {}),
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [near, orbit, pace, frame, sampled]);

  return { derivation, framed, fate, beyond, space: sampled ? space : null };
}
