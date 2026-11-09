import { useCallback, useSyncExternalStore } from 'react';
import type { FilmOrbit, FilmScore } from '@/lib/physics/film-score';
import type { ScoreReply, ScoreRequest } from '@/lib/physics/score.worker';

/*
  The scores measured in this visit, one a work. A score is measured once, off the main thread,
  while someone waits for it; a viewer that stops waiting (the film rested, the page left)
  stops its worker, and the next viewer to want it starts afresh. A measured score is kept for
  the visit: a Turn to the other expression, or the same work opened again, draws it at once.
*/
interface Entry {
  score: FilmScore | null;
  /** The score could not be measured here; the film keeps its plain time line. */
  failed: boolean;
  worker: Worker | null;
  listeners: Set<() => void>;
  release: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<number, Entry>();

/** The worker is a module of its own; tests replace the global Worker. */
function scoreWorker(): Worker {
  return new Worker(new URL('../lib/physics/score.worker.ts', import.meta.url), { type: 'module' });
}

function entryOf(id: number): Entry {
  let entry = entries.get(id);
  if (!entry) {
    entry = { score: null, failed: false, worker: null, listeners: new Set(), release: null };
    entries.set(id, entry);
  }
  return entry;
}

function settle(entry: Entry, worker: Worker, score: FilmScore | null) {
  if (entry.worker !== worker) return;
  worker.terminate();
  entry.worker = null;
  if (score) entry.score = score;
  else entry.failed = true;
  for (const listener of entry.listeners) listener();
}

function measure(orbit: FilmOrbit, entry: Entry) {
  let worker: Worker;
  try {
    worker = scoreWorker();
  } catch {
    entry.failed = true;
    return;
  }
  entry.worker = worker;
  worker.onmessage = ({ data }: MessageEvent<ScoreReply>) =>
    settle(entry, worker, data.type === 'done' ? data.score : null);
  worker.onerror = () => settle(entry, worker, null);
  worker.postMessage({ window: orbit.window } satisfies ScoreRequest);
}

function subscribe(orbit: FilmOrbit, listener: () => void) {
  const entry = entryOf(orbit.id);
  entry.listeners.add(listener);
  if (entry.release) {
    clearTimeout(entry.release);
    entry.release = null;
  }
  if (!entry.score && !entry.failed && !entry.worker) {
    if (typeof Worker === 'undefined') entry.failed = true;
    else measure(orbit, entry);
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size || !entry.worker || entry.release) return;
    // A viewer mounted again in the same task (Strict Mode, a key change) keeps the worker.
    entry.release = setTimeout(() => {
      entry.release = null;
      if (entry.listeners.size || !entry.worker) return;
      entry.worker.terminate();
      entry.worker = null;
    }, 0);
  };
}

/** Forgets every score measured in this visit and stops any still measuring; for tests. */
export function forgetFilmScores() {
  for (const entry of entries.values()) {
    if (entry.release) clearTimeout(entry.release);
    entry.worker?.terminate();
  }
  entries.clear();
}

const noSubscription = () => () => {};
const noScore = () => null;

/**
 * A work's films' score: measured while `wanted`, and null until it is (or wherever it
 * cannot be measured). Once measured it is returned whether wanted or not.
 */
export function useFilmScore(orbit: FilmOrbit | undefined, wanted: boolean): FilmScore | null {
  const subscribeTo = useCallback(
    (listener: () => void) => (orbit && wanted ? subscribe(orbit, listener) : noSubscription()),
    [orbit, wanted],
  );
  const id = orbit?.id;
  const snapshot = useCallback(
    () => (id === undefined ? null : (entries.get(id)?.score ?? null)),
    [id],
  );
  return useSyncExternalStore(subscribeTo, snapshot, noScore);
}
