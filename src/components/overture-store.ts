import { useSyncExternalStore } from 'react';

/**
 * Where the Overture stands, shared by the Overture (overture.tsx) and the home's plate
 * (artwork-viewer.tsx), which stands beneath it and lands it:
 * - `playing`: the black is down; the plate stands in Light beneath it, quietly.
 * - `landing`: the black has lifted over the plate; the plate crosses to the expression the
 *   home opens on, if that is not Light, and then calls the Overture done.
 * - `done`: the plate stands in its opening, at once if it is not there yet (any input ends
 *   the Overture so), and the running head arrives.
 * `null` is a visit without an Overture.
 */
export type OverturePhase = 'playing' | 'landing' | 'done';

let phase: OverturePhase | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function overturePhase(): OverturePhase | null {
  return phase;
}

/** Moves the Overture on, and tells whoever follows it. */
export function setOverturePhase(next: OverturePhase | null) {
  if (phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

export function useOverturePhase(): OverturePhase | null {
  return useSyncExternalStore(subscribe, overturePhase, () => null);
}
